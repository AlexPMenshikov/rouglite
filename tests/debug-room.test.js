'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// Комната отладки — фикстура: она расставляет все объекты игры одним вызовом.
// Проверяем, что расстановка полная и что герой берёт класс и имя из меты/сети.

function debugContext() {
  const { sandbox } = createSandbox();
  return sandbox;
}

test('debug room fills the map with every kind of fixture', () => {
  const sandbox = debugContext();
  sandbox.RK.Debug.open();
  const M = sandbox.RK.GAME;
  const g = sandbox.RK.Map;

  assert.equal(M.sceneKind, 'debug');
  assert.equal(g.tiles.length, M.mapHeight);
  assert.ok(g.tiles.every((row) => row.every((tile) => tile === 1)), 'карта полностью проходима');
  assert.equal(M.player.x, g.spawn.x);
  assert.equal(M.player.y, g.spawn.y);

  assert.equal(g.doors.length, 5, 'все состояния дверей');
  assert.equal(g.chests.length, 4, 'все состояния сундуков');
  assert.equal(g.traps.length, 5, 'все состояния ловушек');

  const enemyTypes = new Set(M.enemies.map((enemy) => enemy.type));
  for (const type of sandbox.RK.CONFIG.BASE_ENEMY_TYPES) {
    assert.ok(M.enemies.some((enemy) => enemy.type === type && !enemy.enhanced), `обычный ${type} на месте`);
    assert.ok(M.enemies.some((enemy) => enemy.type === type && enemy.enhanced), `усиленный ${type} на месте`);
  }
  for (const type of sandbox.RK.Entities.BOSS_TYPES) assert.ok(enemyTypes.has(type), `босс ${type} на месте`);
  const secretBoss = M.enemies.find((enemy) => enemy.legendaryBoss);
  assert.ok(secretBoss, 'секретный босс Храма Солнца добавлен');
  assert.equal(secretBoss.name, 'Солнцеликий хранитель');
  assert.equal(secretBoss.legendaryRewardId, 'sun_crown');
  assert.ok(M.enemies.every((enemy) => !enemy.alerted), 'враги не ходят и не атакуют');
  assert.ok(M.enemies.every((enemy) => enemy.x >= 0 && enemy.x < g.w && enemy.y >= 0 && enemy.y < g.h),
    'все враги стоят внутри карты');
  assert.ok(M.items.every((item) => item.x >= 0 && item.x < g.w && item.y >= 0 && item.y < g.h),
    'все предметы стоят внутри карты');
  const placed = M.enemies.concat(M.items, M.npcs);
  assert.equal(new Set(placed.map((entity) => entity.x + ',' + entity.y)).size, placed.length,
    'враги, предметы и NPC не занимают одну клетку');
  assert.ok(placed.every((entity) =>
    entity.x >= 0 && entity.x < g.w && entity.y >= 0 && entity.y < g.h),
  'все враги, предметы и NPC стоят внутри карты');
  const fixedTiles = [g.spawn, g.stair].concat(
    g.doors, g.chests, g.traps, g.torches,
    g.decorations.filter((item) => item.furniture),
  ).filter(Boolean);
  const fixedPositions = new Set(fixedTiles.map((object) => object.x + ',' + object.y));
  assert.ok(placed.every((entity) => !fixedPositions.has(entity.x + ',' + entity.y)),
    'фикстуры не перекрывают врагов, предметы и NPC');
  for (const group of [M.enemies, M.items, M.npcs]) {
    const quadrants = new Set(group.map((entity) =>
      (entity.x < g.w / 2 ? 'w' : 'e') + (entity.y < g.h / 2 ? 'n' : 's')));
    assert.ok(quadrants.size >= 3, 'каждая группа объектов распределена по карте');
  }

  assert.ok(M.items.some((item) => item.kind === 'gold'));
  assert.ok(M.items.some((item) => item.kind === 'potion'));
  assert.ok(M.items.some((item) => item.kind === 'key'));
  assert.ok(M.items.some((item) => item.slot), 'предметы снаряжения расставлены');

  assert.ok(M.npcs.length >= 6, 'рядом есть NPC');
  assert.ok(g.explored[0][0], 'карта раскрыта целиком');
});

test('debug hero takes the class and name from meta and network', () => {
  const sandbox = debugContext();
  sandbox.RK.Meta.data.selectedClass = 'mage';
  sandbox.RK.Meta.data.playerName = 'Тестировщик';
  sandbox.RK.Network = { playerId: () => 'net-7' };

  sandbox.RK.Debug.open();
  const player = sandbox.RK.GAME.player;

  assert.equal(player.classId, 'mage');
  assert.equal(player.name, 'Тестировщик');
  assert.equal(player.id, 'net-7');
});
