'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createSandbox } = require('./helpers/sandbox');

function cityRun(seed = 101) {
  const { sandbox } = createSandbox({ seed });
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'medium', style: 'stone' });
  return RK;
}

function npcOf(RK, kind) {
  return RK.GAME.npcs.find((npc) => npc.kind === kind) || null;
}

/** Клетка рядом с NPC, на которой может стоять герой. */
function standNear(RK, npc) {
  const neighbors = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const tile = neighbors
    .map(([dx, dy]) => ({ x: npc.x + dx, y: npc.y + dy }))
    .find((point) => RK.MapGen.isMapWalkable(RK.Map, point.x, point.y));
  assert.ok(tile, 'у NPC есть клетка, с которой можно говорить');
  RK.GAME.player.x = tile.x;
  RK.GAME.player.y = tile.y;
  return tile;
}

test('city builds streets, houses and gates that are all reachable', () => {
  const RK = cityRun();
  const map = RK.Map;

  assert.equal(RK.World.current().type, 'city');
  assert.equal(map.stair, null, 'в городе нет этажей');
  assert.equal(map.chests.length, 0, 'город без сундуков');
  assert.equal(map.zones.length, 0, 'в городе нет боевых зон');
  assert.ok(map.exits.every((exit) => RK.MapGen.isMapWalkable(map, exit.x, exit.y)));
  assert.ok(map.exits.every((exit) => RK.MapGen.findPathOnMap(
    map, map.spawn.x, map.spawn.y, exit.x, exit.y, null,
  )), 'до каждых ворот можно дойти');

  const kinds = new Set(map.buildings.map((building) => building.kind));
  for (const kind of ['market', 'forge', 'guardhouse', 'temple', 'tavern']) {
    assert.ok(kinds.has(kind), 'в городе есть ' + kind);
  }
  for (const building of map.buildings) {
    const door = map.doors.find((entry) => entry.x === building.door.x && entry.y === building.door.y);
    assert.ok(door, 'у здания ' + building.kind + ' есть дверь');
    assert.equal(door.state, 'open', 'дверь города открыта: закрытая отрезала бы NPC');
    assert.ok(RK.MapGen.findPathOnMap(map, map.spawn.x, map.spawn.y, building.cx, building.cy, null),
      'в здание ' + building.kind + ' можно зайти');
    assert.equal(map.tiles[building.cy][building.cx], 1);
  }
});

test('city layout is repeatable for the same seed', () => {
  const RK = cityRun();
  const exits = RK.World.getLocation('city_start').exits;
  const build = (seed) => RK.MapGen.generateLocation('city', 1, seed, 48, 34, 'stone', exits);

  const first = build(912);
  const second = build(912);
  const other = build(913);
  assert.equal(JSON.stringify(first.buildings), JSON.stringify(second.buildings),
    'один seed даёт один и тот же город');
  assert.equal(JSON.stringify(other.tiles), JSON.stringify(first.tiles),
    'планировка от seed не зависит: меняются только названия кварталов');
  assert.notEqual(JSON.stringify(other.buildings), JSON.stringify(first.buildings),
    'разные seed переставляют дома по назначению');
});

test('every NPC kind stands in its own house and is reachable from the square', () => {
  const RK = cityRun(102);
  assert.deepEqual(RK.GAME.npcs.map((npc) => npc.kind), RK.CONFIG.NPC_KINDS,
    'в городе стоят все NPC из конфига');

  for (const npc of RK.GAME.npcs) {
    const building = RK.MapGen.getBuilding(RK.Map, RK.Npc.def(npc.kind).building);
    assert.ok(building, 'для ' + npc.kind + ' есть здание');
    assert.equal(RK.Map.tiles[npc.y][npc.x], 1, 'NPC стоит на полу');
    assert.ok(RK.MapGen.findPathOnMap(RK.Map, RK.Map.spawn.x, RK.Map.spawn.y, npc.x, npc.y, null),
      'до ' + npc.kind + ' можно дойти');
    assert.ok(npc.x >= building.x && npc.x < building.x + building.w &&
      npc.y >= building.y && npc.y < building.y + building.h, 'NPC стоит внутри своего дома');
  }
  const tiles = new Set(RK.GAME.npcs.map((npc) => npc.x + ',' + npc.y));
  assert.equal(tiles.size, RK.GAME.npcs.length, 'NPC не стоят друг на друге');
});

test('dialogue shows the line of an NPC and its offer', () => {
  const RK = cityRun(103);

  const guard = RK.Npc.dialogue(npcOf(RK, 'guard'));
  assert.equal(guard.name, 'Капитан стражи Рова');
  assert.ok(guard.text.length > 0);
  assert.equal(guard.offer.kind, 'kill', 'капитан просит перебить лесных тварей');

  const priest = RK.Npc.dialogue(npcOf(RK, 'priest'));
  assert.equal(priest.offer.kind, 'visit', 'жрица просит сходить в склеп');
  assert.equal(priest.offer.type, 'dungeon_crypt', 'цель задания — локация графа мира');

  const scholar = RK.Npc.dialogue(npcOf(RK, 'scholar'));
  assert.equal(scholar.offer, null, 'летописец заданий не даёт');
  assert.equal(RK.Npc.dialogue({ kind: '__proto__' }), null, 'чужой вид NPC молча отбрасывается');
});

test('a quest is accepted only next to its giver', () => {
  const RK = cityRun(104);
  const guard = npcOf(RK, 'guard');
  const questCount = RK.GAME.quests.length;

  RK.GAME.player.x = RK.Map.spawn.x;
  RK.GAME.player.y = RK.Map.spawn.y;
  assert.equal(RK.Combat.acceptQuest('guard'), false, 'на площади задание не берут');
  assert.equal(RK.GAME.quests.length, questCount);

  assert.equal(RK.Combat.acceptQuest('__proto__'), false, 'чужой вид NPC не проходит');
  assert.equal(RK.Combat.acceptQuest('scholar'), false, 'у летописца нет предложения');

  standNear(RK, guard);
  assert.equal(RK.Combat.acceptQuest('guard'), true);
  assert.equal(RK.GAME.quests.length, questCount + 1);
  assert.equal(guard.offer, null, 'предложение ушло в задания');
  assert.equal(guard.accepted, true);
  assert.equal(RK.Npc.dialogue(guard).text, RK.Npc.def('guard').lines.done, 'после задания реплика меняется');
});

test('a travel quest closes on the way to the named location', () => {
  const RK = cityRun(105);
  standNear(RK, npcOf(RK, 'priest'));
  assert.equal(RK.Combat.acceptQuest('priest'), true);
  const quest = RK.GAME.quests[RK.GAME.quests.length - 1];
  const goldBefore = RK.GAME.player.gold;

  RK.World.travel('gate_north');
  assert.notEqual(quest.completed, true, 'лес — не та локация, что просили');
  assert.equal(RK.World.current().id, 'wilderness_forest');

  RK.World.travel('cave_entrance');
  assert.equal(RK.World.current().id, 'dungeon_crypt');
  assert.equal(quest.completed, true, 'переход в склеп закрыл задание');
  assert.equal(RK.GAME.player.gold, goldBefore + quest.reward, 'награда выдана герою');
});

test('npcs and their offers survive the snapshot round trip', () => {
  const RK = cityRun(106);
  standNear(RK, npcOf(RK, 'merchant'));
  assert.equal(RK.Combat.acceptQuest('merchant'), true);

  const snapshot = RK.Combat.createSnapshot();
  const { sandbox } = createSandbox({ seed: 107 });
  const target = sandbox.RK;
  target.Combat.newRun({ size: 'medium', style: 'stone' });
  assert.equal(target.Combat.applySnapshot(snapshot, 'local'), true);

  // Снимок пересекает границу контекстов, поэтому сравниваем содержимое,
  // а не объекты разных песочниц.
  assert.equal(JSON.stringify(target.GAME.npcs), JSON.stringify(RK.GAME.npcs),
    'клиент видит тех же NPC с их состоянием');
  assert.equal(target.GAME.npcs.find((npc) => npc.kind === 'merchant').offer, null,
    'принятое предложение не вернулось');
  assert.equal(target.GAME.npcs.find((npc) => npc.kind === 'guard').offer.kind, 'kill',
    'непринятое предложение доехало');
});

test('turnInQuestAtGuild advances collect/escort quests at the guild guard NPC', () => {
  const RK = cityRun(110);
  const guard = npcOf(RK, 'ancient_guard');

  // Герой не рядом с Древним стражем — действие отклоняется
  assert.equal(RK.Combat.turnInQuestAtGuild(), false,
    'герой далеко от гильдии');

  standNear(RK, guard);
  assert.equal(RK.Combat.turnInQuestAtGuild(), false,
    'нет активного задания на сдачу');

  // Создаём тестовое задание типа escort
  const quest = { kind: 'escort', description: 'Принести меч гильдии', reward: 100 };
  RK.GAME.quests.push(quest);
  const goldBefore = RK.GAME.player.gold;
  const repBefore = RK.Faction.getReputation().reputation;

  assert.equal(RK.Combat.turnInQuestAtGuild(), true,
    'задание escort сдано в гильдию');
  assert.equal(guard.accepted, true,
    'предложение у древнего стража сброшено');
  assert.equal(quest.completed, true, 'задание закрыто');
  assert.equal(RK.GAME.player.gold, goldBefore + 100, 'награда выдана');
  assert.equal(RK.Faction.getReputation().reputation, repBefore + 10, 'репутация выросла');
});

test('a run saved before the npc list gets its city repopulated', () => {
  const RK = cityRun(108);
  const snapshot = RK.Combat.createSnapshot();
  delete snapshot.game.npcs;

  const { sandbox } = createSandbox({ seed: 109 });
  const target = sandbox.RK;
  target.Combat.newRun({ size: 'medium', style: 'stone' });
  assert.equal(target.Combat.applySnapshot(snapshot, 'local'), true);
  assert.equal(target.GAME.npcs.map((npc) => npc.kind).join(','),
    RK.CONFIG.NPC_KINDS.join(','), 'NPC расставлены по зданиям заново');
});
