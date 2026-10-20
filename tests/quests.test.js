'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createSandbox, findOpenNeighbor, readUiSources } = require('./helpers/sandbox');

function cityRun(seed) {
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

/** Доводит анимацию шага до конца: ход занимает несколько тиков. */
function settle(RK) {
  let guard = 0;
  while (RK.Combat.busy() && guard++ < 1000) RK.Combat.tickWalk(1e6);
}

/** Убивает врага рядом с героем настоящим ударом, а не прямым вызовом задания. */
function killAdjacent(RK, type) {
  const [dx, dy] = findOpenNeighbor(RK);
  const enemy = RK.Entities.makeEnemy(type, RK.GAME.player.x + dx, RK.GAME.player.y + dy, RK.GAME.floor);
  enemy.hp = 1;
  enemy.alerted = true;
  RK.GAME.enemies = [enemy];
  RK.Combat.setPlayerStats({
    hp: RK.GAME.player.hp,
    maxHp: RK.GAME.player.maxHp,
    atk: 100,
    def: RK.GAME.player.def,
  });
  RK.Combat.tryStep(dx, dy);
  assert.equal(enemy.alive, false, type + ' должен погибнуть');
  return enemy;
}

// Прогресс заданий считался по ссылке на «главное» задание забега, поэтому
// задания NPC — убить скелетов, сходить в склеп — не двигались никогда.
test('killing the enemy an NPC quest asks for advances that quest', () => {
  const RK = cityRun(301);
  standNear(RK, npcOf(RK, 'guard'));
  assert.equal(RK.Combat.acceptQuest('guard'), true);
  const quest = RK.GAME.quests[RK.GAME.quests.length - 1];
  assert.equal(quest.kind, 'kill');

  // Стартовое задание забега тоже бывает kill-квестом на случайного моба, поэтому
  // «чужую» цель задаём явно: иначе проверка зависела бы от выпавшего типа.
  const otherType = RK.CONFIG.BASE_ENEMY_TYPES.find((type) => type !== quest.enemyTypes[0]);
  const foreign = {
    id: 'foreign#1', giver: 'merchant', kind: 'kill', type: otherType, enemyTypes: [otherType],
    target: 3, progress: 0, reward: 10, ownerId: 'local', description: 'Убить ' + otherType,
  };
  RK.GAME.quests.push(foreign);

  killAdjacent(RK, quest.enemyTypes[0]);

  assert.equal(quest.progress, 1, 'убитый ' + quest.enemyTypes[0] + ' засчитан капитану');
  assert.equal(foreign.progress, 0, 'задание на другого моба не тронуто');
});

test('loot picked up on the floor counts towards a loot quest', () => {
  const RK = cityRun(302);
  const guard = npcOf(RK, 'guard');
  // Торговец выдаёт kill- или loot-задание, поэтому ветку лута задаём явно.
  guard.offer = {
    type: 'loot',
    kind: 'loot',
    target: 1,
    progress: 0,
    reward: 50,
    description: 'Найти 1 предмет снаряжения',
  };
  standNear(RK, guard);
  assert.equal(RK.Combat.acceptQuest('guard'), true);
  const quest = RK.GAME.quests[RK.GAME.quests.length - 1];

  const [dx, dy] = findOpenNeighbor(RK);
  const loot = RK.Items.generateLootItem(1, RK.GAME.player.x + dx, RK.GAME.player.y + dy, false);
  RK.GAME.items.push(loot);
  RK.Combat.tryStep(dx, dy);
  settle(RK);

  assert.equal(quest.progress, 1, 'подобранный лут засчитан');
});

// Диалог водился через perform() — он зовёт RK.Combat[action], а dialogueChoice
// в таблице экспортов не было: выбор ответа падал и задание взять было нельзя.
test('dialogueChoice is reachable from the single-player action table', () => {
  const RK = cityRun(303);
  const merchant = npcOf(RK, 'merchant');
  standNear(RK, merchant);
  const questsBefore = RK.GAME.quests.length;

  assert.equal(typeof RK.Combat.dialogueChoice, 'function', 'действие экспортировано');
  RK.Combat.dialogueChoice('merchant', 1);
  RK.Combat.dialogueChoice('merchant', 0);

  assert.equal(RK.GAME.quests.length, questsBefore + 1, 'задание взято через диалог');
  const quest = RK.GAME.quests[RK.GAME.quests.length - 1];
  assert.equal(quest.giver, 'merchant', 'у задания есть заказчик');
  assert.equal(merchant.offer, null, 'взятое предложение ушло в задания');
  assert.equal(merchant.accepted, true);
});

// Интерфейс зовёт RK.Combat[action] по строковому имени: действия без экспорта
// падают в TypeError при клике, и экран молча ничего не делает.
test('every action the UI commits exists on RK.Combat', () => {
  const RK = cityRun(306);
  const source = readUiSources();
  const actions = new Set();
  for (const [, name] of source.matchAll(/\b(?:commit|perform)\('([a-zA-Z]+)'/g)) actions.add(name);

  assert.ok(actions.size >= 10, 'в интерфейсе есть действия для проверки');
  for (const action of actions) {
    assert.equal(typeof RK.Combat[action], 'function', 'RK.Combat.' + action + '() не экспортирован');
    assert.equal(typeof RK.Combat.actionHandlers()[action], 'function',
      'действие ' + action + ' не объявлено для сетевой комнаты');
  }
});

test('progress earned away from town survives the way back', () => {
  const RK = cityRun(304);
  standNear(RK, npcOf(RK, 'guard'));
  assert.equal(RK.Combat.acceptQuest('guard'), true);
  const quest = RK.GAME.quests[RK.GAME.quests.length - 1];

  RK.World.travel('gate_north');
  RK.Combat.advanceQuest('kill', quest.enemyTypes[0], quest.target);
  RK.World.travel('gate_south');

  const restored = RK.GAME.quests.find((entry) => entry.id === quest.id);
  assert.ok(restored, 'задание осталось в забеге');
  assert.equal(restored.progress, quest.target, 'прогресс не откатился при возвращении');
  standNear(RK, npcOf(RK, 'guard'));
  assert.equal(RK.Combat.turnInQuest('guard'), true, 'задание сдаётся после возвращения');
});

// Экран NPC открывается по его службе: без маршрута игрок не доходил
// до гильдии, а серверная комната падала на экране таверны.
test('an NPC with a service opens its own screen', () => {
  const RK = cityRun(307);
  const guard = npcOf(RK, 'ancient_guard');
  const innkeeper = npcOf(RK, 'innkeeper');
  standNear(RK, guard);
  standNear(RK, innkeeper);
  const opened = [];
  RK.UI.showGuild = () => opened.push('guild');
  RK.UI.showTavern = () => opened.push('tavern');

  assert.equal(RK.Combat.openNpcScreen(guard), undefined, 'открытие экрана не тратит ход');
  RK.Combat.openNpcScreen(innkeeper);
  RK.Combat.openNpcScreen(npcOf(RK, 'scholar'));

  assert.deepEqual(opened, ['guild', 'tavern'], 'страж открывает гильдию, трактирщик — таверну');
});

test('every quest-giving NPC hands out a quest that can be taken and handed in', () => {
  const RK = cityRun(305);
  const givers = RK.CONFIG.NPC_KINDS
    .map((kind) => npcOf(RK, kind))
    .filter((npc) => npc && npc.offer);

  assert.ok(givers.length >= 4, 'задания дают несколько NPC');
  for (const npc of givers) {
    standNear(RK, npc);
    assert.equal(RK.Combat.acceptQuest(npc.id), true, npc.kind + ' отдал задание');
    const quest = RK.GAME.quests[RK.GAME.quests.length - 1];
    assert.equal(quest.giver, npc.id);
    assert.equal(RK.Combat.turnInQuest(npc.id), false, npc.kind + ': невыполненное не сдаётся');
    const detail = quest.kind === 'kill' ? quest.enemyTypes[0]
      : quest.kind === 'visit' ? quest.type : null;
    RK.Combat.advanceQuest(quest.kind, detail, quest.target);
    assert.equal(RK.Combat.turnInQuest(npc.id), true, npc.kind + ': выполненное сдаётся');
    assert.equal(quest.completed, true);
    const openFromNpc = RK.GAME.quests.filter((entry) =>
      entry.giver === npc.id && entry.fromOffer && !entry.completed);
    assert.equal(openFromNpc.length, 0, npc.kind + ': его работа сдана');
  }
});
