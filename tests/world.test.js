'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createSandbox, projectRoot } = require('./helpers/sandbox');

function createWorldRun(seed = 41) {
  const { sandbox } = createSandbox({ seed });
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'medium', style: 'stone' });
  return RK;
}

/** Доводит автопроход до конца: шаг занимает несколько тиков. */
function settle(RK) {
  let guard = 0;
  while (RK.Combat.busy() && guard++ < 5000) RK.Combat.tickWalk(1e6);
}

test('world starts in city with connected exits and valid traversal', () => {
  const RK = createWorldRun();
  assert.equal(RK.CONFIG.ENABLE_WORLD, true);
  assert.equal(RK.World.current().id, 'city_start');
  assert.equal(RK.Map.locationType, 'city');
  assert.equal(RK.GAME.enemies.length, 0);
  assert.ok(RK.Map.exits.every((exit) => RK.MapGen.isWalkable(exit.x, exit.y)));
  assert.ok(RK.Map.exits.every((exit) => RK.MapGen.findPath(
    RK.Map.spawn.x, RK.Map.spawn.y, exit.x, exit.y, null,
  )));

  assert.equal(RK.World.travel('invalid'), false);
  assert.equal(RK.World.travel('gate_north'), true);
  assert.equal(RK.World.current().id, 'wilderness_forest');
  assert.equal(RK.GAME.enemies.length > 0, true);
  assert.equal(RK.Map.pois.length, 3);
  assert.ok(RK.Map.roads.length > 0);
  assert.ok(RK.Map.pois.every((poi) => RK.MapGen.findPath(
    RK.Map.spawn.x, RK.Map.spawn.y, poi.x, poi.y, null,
  )));
  assert.equal(RK.World.travel('cave_entrance'), true);
  assert.equal(RK.World.current().id, 'dungeon_crypt');
  assert.equal(RK.GAME.floor, 1);
  assert.equal(RK.Map.locationType, 'crypt');
});

test('an exit that cannot be reached is dropped instead of shown as an empty gate', () => {
  const RK = createWorldRun(79);
  const forest = RK.World.getLocation('wilderness_forest');
  const originalWalkable = RK.MapGen.isMapWalkable;
  // Ни один выход не достижим: генератор не должен падать, а на карте не должно
  // остаться врат, клик по которым никуда не ведёт.
  RK.MapGen.isMapWalkable = function () { return false; };
  try {
    const map = RK.World.generateLocation(forest);
    assert.equal(map.exits.length, 0, 'недостижимые выходы не попадают на карту');
  } finally {
    RK.MapGen.isMapWalkable = originalWalkable;
  }
});

test('a click on a gate walks the hero there and changes the location', () => {
  const RK = createWorldRun(43);
  const gate = RK.Map.exits.find((exit) => exit.id === 'gate_north');
  assert.ok(gate, 'в городе есть северные ворота');
  assert.notEqual(RK.World.current().id, 'wilderness_forest');

  assert.equal(RK.Combat.playerAction(gate.x, gate.y), true, 'клик по воротам принят');
  settle(RK);

  assert.equal(RK.World.current().id, 'wilderness_forest', 'герой дошёл и перешёл');
});

test('a click on the gate the hero stands on travels at once', () => {
  const RK = createWorldRun(45);
  assert.equal(RK.World.travel('gate_north'), true);
  // Партия встаёт на входные ворота новой локации: клик по ним должен уводить дальше.
  const back = RK.Map.exits.find((exit) => exit.id === 'gate_south');
  assert.equal(RK.GAME.player.x, back.x);
  assert.equal(RK.GAME.player.y, back.y);

  assert.equal(RK.Combat.playerAction(back.x, back.y), true);
  assert.equal(RK.World.current().id, 'city_start', 'переход сработал без шага');
});

test('a click on a floor stair goes down a floor', () => {
  const { sandbox } = createSandbox({ seed: 44 });
  const RK = sandbox.RK;
  RK.CONFIG.ENABLE_WORLD = false;
  RK.Combat.newRun({ size: 'medium', style: 'stone' });
  const stair = RK.Map.stair;
  assert.ok(stair, 'на этаже есть лестница');
  // Автопроход останавливается, если в поле зрения появился враг,
  // поэтому маршрут без помех проверяется на пустом этаже.
  RK.GAME.enemies = [];

  assert.equal(RK.Combat.playerAction(stair.x, stair.y), true);
  settle(RK);

  assert.equal(RK.GAME.floor, 2, 'герой спустился на этаж 2');
});

test('returning to a location restores its map, enemies, items and player state', () => {
  const RK = createWorldRun();
  RK.World.travel('gate_north');
  const forest = RK.Map;
  const originalGate = { x: forest.exits[0].x, y: forest.exits[0].y };
  const expectedEnemyCount = RK.GAME.enemies.length - 1;
  const cleared = { x: forest.spawn.x, y: forest.spawn.y };
  forest.tiles[cleared.y][cleared.x] = 0;
  RK.GAME.enemies = RK.GAME.enemies.slice(1);
  RK.GAME.items = [{ x: cleared.x, y: cleared.y, type: 'gold', amt: 11 }];

  RK.World.travel('gate_south');
  assert.equal(RK.World.current().id, 'city_start');
  assert.equal(RK.World.travel('gate_north'), true);
  assert.notEqual(RK.Map, forest);
  assert.equal(RK.Map.tiles[cleared.y][cleared.x], 0);
  assert.equal(RK.GAME.enemies.length, expectedEnemyCount);
  assert.equal(RK.GAME.items[0].amt, 11);
  assert.deepEqual([RK.GAME.player.x, RK.GAME.player.y], [originalGate.x, originalGate.y]);
});

test('location snapshots preserve the connected graph for network clients', () => {
  const source = createWorldRun(90);
  source.World.travel('gate_north');
  const snapshot = source.Combat.createSnapshot();
  assert.equal(snapshot.world.current, 'wilderness_forest');
  assert.ok(snapshot.world.visited.city_start.mapSnapshot);

  const { sandbox } = createSandbox({ seed: 91 });
  const target = sandbox.RK;
  target.Combat.newRun({ size: 'medium', style: 'stone' });
  assert.equal(target.Combat.applySnapshot(snapshot, 'local'), true);
  assert.equal(target.World.current().id, 'wilderness_forest');
  assert.equal(target.GAME.locationMode, true);

  const invalid = structuredClone(snapshot);
  invalid.world.current = '__proto__';
  assert.equal(target.Combat.applySnapshot(invalid, 'local'), false);
});

// Карта текущей локации едет в снимке полем map, а не в world.visited: снимок
// уходит на каждый шаг, и вторая копия карты удвоила бы сообщение. Запись
// текущей локации пересобирается из присланной карты — иначе возврат сюда
// восстановил бы локацию без врагов и предметов.
test('snapshot carries the current map once and the client rebuilds its record', () => {
  const source = createWorldRun(64);
  const cityState = source.Combat.createSnapshot();
  assert.equal(cityState.world.current, 'city_start');
  assert.equal(cityState.world.visited.city_start.mapSnapshot, undefined);

  const { sandbox } = createSandbox({ seed: 65 });
  const target = sandbox.RK;
  target.Combat.newRun({ size: 'medium', style: 'stone' });
  assert.equal(target.Combat.applySnapshot(cityState, 'local'), true);
  assert.ok(target.World.getState().visited.city_start.mapSnapshot,
    'запись текущей локации пересобрана из снимка');

  // Клиент не сможет уехать из города без мира: без RK.World переход не начинается.
  source.World.travel('gate_north');
  const forestState = source.Combat.createSnapshot();
  assert.equal(target.Combat.applySnapshot(forestState, 'local'), true);
  const forestEnemyCount = forestState.game.enemies.length;
  assert.ok(forestEnemyCount > 0);
  assert.equal(target.GAME.enemies.length, forestEnemyCount);

  assert.equal(target.Combat.applySnapshot(cityState, 'local'), true);
  assert.equal(target.World.current().id, 'city_start');
  assert.equal(target.Combat.applySnapshot(forestState, 'local'), true);
  assert.equal(target.GAME.enemies.length, forestEnemyCount,
    'возврат в локацию восстанавливает её состояние');
});

test('map matrices survive the snapshot round trip and a broken one is rejected', () => {
  const { sandbox } = createSandbox({ seed: 71 });
  const RK = sandbox.RK;
  const map = RK.MapGen.generateLocation('city', 1, 313, 48, 34, 'stone');
  const expected = JSON.stringify([map.tiles, map.floorTypes, map.regions, map.explored]);

  const encoded = RK.MapGen.encodeMatrices(map);
  assert.ok(encoded.tiles.length > 0, 'матрицы упакованы парами [значение, длина]');

  const decoded = RK.MapGen.decodeMatrices(encoded, map.w, map.h);
  assert.equal(JSON.stringify([decoded.tiles, decoded.floorTypes, decoded.regions, decoded.explored]),
    expected, 'распаковка обязана вернуть карту бит в бит');

  // Битый снимок не доверен: чужая ширина, не та высота или непарная серия
  // должны отвергаться, а не рисовать карту с дырами.
  assert.equal(RK.MapGen.decodeMatrices(encoded, map.w + 1, map.h), null);
  assert.equal(RK.MapGen.decodeMatrices(encoded, map.w, map.h - 1), null);
  assert.equal(RK.MapGen.decodeMatrices({ tiles: [[1, 2, 1]] }, map.w, 1), null);
  assert.equal(RK.MapGen.decodeMatrices({ tiles: [[1, -5]] }, map.w, 1), null);
  assert.equal(RK.MapGen.decodeMatrices({ tiles: [['стена', 3]] }, map.w, 1), null);
});

test('a snapshot hides the walker visibility and unpacks into a playable map', () => {
  const RK = createWorldRun(72);
  const snapshot = RK.Combat.createSnapshot();
  // Обзор в снимке нет: он посчитан для того, кто ходил, а каждый клиент
  // пересчитывает видимость от своего героя (js/render.js).
  assert.equal(snapshot.map.vis, undefined);
  assert.equal(snapshot.map.tiles, undefined);
  assert.ok(snapshot.map.matrices.tiles.length > 0);

  const { sandbox } = createSandbox({ seed: 73 });
  const target = sandbox.RK;
  target.Combat.newRun({ size: 'medium', style: 'stone' });
  assert.equal(target.Combat.applySnapshot(snapshot, 'local'), true);
  assert.equal(target.Map.tiles.length, snapshot.map.h);
  assert.equal(target.Map.tiles[0].length, snapshot.map.w);
  assert.equal(target.Map.vis.length, snapshot.map.h);
  assert.equal(target.Map.vis.some((row) => row.some(Boolean)), false,
    'обзор пуст: клиент посчитает свой');

  // Распакованная карта остаётся пригодной для хода и поиска пути.
  const hero = target.GAME.player;
  assert.ok(target.MapGen.isWalkable(hero.x, hero.y), 'герой стоит на полу');
  assert.equal(target.MapGen.findPath(hero.x, hero.y, hero.x, hero.y, null).length, 0);
});

test('a run saved to localStorage resumes in the same location with the same hero', () => {
  const storage = new Map();
  const { sandbox } = createSandbox({ seed: 81, storage });
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'medium', style: 'stone' });
  assert.equal(RK.World.hasSavedRun(), false, 'до первого сохранения кнопки нет');

  assert.equal(RK.World.travel('gate_north'), true);
  RK.GAME.player.gold = 777;
  RK.GAME.player.hp -= 10;
  const forestEnemies = RK.GAME.enemies.length;
  assert.equal(RK.World.saveRun(), true);
  assert.equal(RK.World.hasSavedRun(), true);

  // Перезагрузка страницы: другой контекст, то же хранилище.
  const { sandbox: reopened } = createSandbox({ seed: 82, storage });
  const target = reopened.RK;
  const snapshot = target.World.loadRun();
  assert.ok(snapshot, 'сохранение читается');
  assert.equal(target.Combat.applySnapshot(snapshot, 'local'), true);
  assert.equal(target.World.current().id, 'wilderness_forest');
  assert.equal(target.GAME.locationMode, true);
  assert.equal(target.GAME.player.gold, 777);
  assert.equal(target.GAME.enemies.length, forestEnemies);

  // Продолженный забег обязан быть в состоянии мира, а не в legacy-режиме.
  assert.ok(Array.isArray(target.Map.tiles));
  assert.ok(target.MapGen.isWalkable(target.GAME.player.x, target.GAME.player.y));
  assert.equal(target.World.travel('gate_south'), true);
  assert.equal(target.World.current().id, 'city_start');
});

test('a broken or foreign save is ignored and the menu offers a new run', () => {
  const { sandbox } = createSandbox({ seed: 83 });
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'medium', style: 'stone' });
  const storage = sandbox.localStorage;

  // Снимок прошёл перезагрузку и правку руками: и то, и другое обязано молча
  // дать новый забег, а не уронить игру на белом экране.
  const writes = {
    'не json': '{битый',
    'не объект': '[]',
    'чужая версия': JSON.stringify({ version: 99, snapshot: RK.Combat.createSnapshot() }),
    'нет снимка': JSON.stringify({ version: RK.CONFIG.SAVE_VERSION }),
    'карта не той ширины': JSON.stringify({
      version: RK.CONFIG.SAVE_VERSION,
      snapshot: { ...RK.Combat.createSnapshot(), map: { ...RK.Combat.createSnapshot().map, w: 4096 } },
    }),
    'матрицы не той высоты': JSON.stringify({
      version: RK.CONFIG.SAVE_VERSION,
      snapshot: (() => {
        const snapshot = RK.Combat.createSnapshot();
        snapshot.map.matrices.tiles = snapshot.map.matrices.tiles.slice(1);
        return snapshot;
      })(),
    }),
    'локация не из графа': JSON.stringify({
      version: RK.CONFIG.SAVE_VERSION,
      snapshot: { ...RK.Combat.createSnapshot(), game: { ...RK.Combat.createSnapshot().game, locationId: '__proto__' } },
    }),
  };

  for (const [label, raw] of Object.entries(writes)) {
    storage.setItem(RK.CONFIG.SAVE_KEY, raw);
    assert.equal(RK.World.loadRun(), null, label + ': сохранение отвергнуто');
    assert.equal(RK.World.hasSavedRun(), false, label + ': кнопка «Продолжить» скрыта');
  }

  // Пустое хранилище — тоже не сохранение.
  storage.removeItem(RK.CONFIG.SAVE_KEY);
  assert.equal(RK.World.hasSavedRun(), false);

  // Корректная запись проходит, а финал забега её убирает.
  assert.equal(RK.World.saveRun(), true);
  assert.equal(RK.World.hasSavedRun(), true);
  RK.World.clearRun();
  assert.equal(RK.World.hasSavedRun(), false);
});

// Пустой переход — выход, за которым нет локации: клик по таким вратам никуда
// не ведёт. Граф и карта обязаны их не показывать.
test('в графе локаций нет выходов в несуществующие локации', () => {
  const RK = createWorldRun(61);
  for (const loc of RK.World.listLocations()) {
    for (const exit of RK.World.getExits(loc.id)) {
      assert.ok(RK.World.getLocation(exit.to),
        `${loc.id}/${exit.id}: выход ведёт в несуществующую локацию ${exit.to}`);
    }
  }
});

test('выход без локации за ним не попадает на карту', () => {
  const RK = createWorldRun(62);
  const city = RK.World.getLocation('city_start');
  const broken = Object.assign({}, city, {
    exits: city.exits.concat([{
      id: 'void_gate', x: city.exits[0].x, y: city.exits[0].y, to: 'no_such_location',
      toExit: 'void_gate', label: 'Пустой переход', asset: 'stairs',
    }]),
  });
  const map = RK.World.generateLocation(broken);
  assert.equal(map.exits.some((exit) => exit.id === 'void_gate'), false,
    'врата без локации за ними не рисуются');
});

test('на карте каждой локации нет переходов, по которым нельзя уйти', () => {
  const RK = createWorldRun(63);
  for (const loc of RK.World.listLocations()) {
    const map = RK.World.generateLocation(loc);
    for (const exit of map.exits) {
      assert.ok(RK.World.getLocation(exit.to), `${loc.id}/${exit.id}: локация за выходом есть`);
      assert.ok(RK.MapGen.isMapWalkable(map, exit.x, exit.y), `${loc.id}/${exit.id}: выход проходим`);
      assert.notEqual(`${exit.x},${exit.y}`, `${map.spawn.x},${map.spawn.y}`,
        `${loc.id}/${exit.id}: выход не совпадает со спавном`);
      assert.ok(RK.MapGen.findPathOnMap(map, map.spawn.x, map.spawn.y, exit.x, exit.y, null),
        `${loc.id}/${exit.id}: до выхода есть путь от спавна`);
    }
  }
});

test('телепорт в город ставит героя в центр города', () => {
  const RK = createWorldRun(64);
  const center = { x: RK.Map.spawn.x, y: RK.Map.spawn.y };
  assert.equal(RK.World.travel('gate_north'), true);
  assert.equal(RK.World.current().id, 'wilderness_forest');

  assert.equal(RK.Combat.teleportToCity(), true);
  assert.equal(RK.World.current().id, 'city_start');
  assert.deepEqual([RK.GAME.player.x, RK.GAME.player.y], [center.x, center.y],
    'герой встаёт на спавн города, а не на координаты леса');
  assert.ok(RK.MapGen.isMapWalkable(RK.Map, RK.GAME.player.x, RK.GAME.player.y));
});

test('wilderness generator creates three reachable POIs and deterministic roads', () => {
  const { sandbox } = createSandbox({ seed: 17 });
  const RK = sandbox.RK;
  const first = RK.MapGen.generateLocation('wilderness', 1, 912, 64, 46, 'cave');
  const firstPois = JSON.stringify(first.pois);
  const firstRoads = JSON.stringify(first.roads);
  assert.equal(first.pois.length, 3);
  assert.equal(new Set(first.roads.map(({ x, y }) => `${x},${y}`)).size, first.roads.length);
  assert.ok(first.pois.every((poi) => RK.MapGen.findPathOnMap(
    first, first.spawn.x, first.spawn.y, poi.x, poi.y, null,
  )));
  const second = RK.MapGen.generateLocation('wilderness', 1, 912, 64, 46, 'cave');
  assert.equal(JSON.stringify(second.pois), firstPois);
  assert.equal(JSON.stringify(second.roads), firstRoads);
});