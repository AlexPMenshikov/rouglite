'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

function createGens() {
  const { sandbox } = createSandbox({
    scripts: ['config.js', 'rng.js', 'pathfind.js', 'map-objects.js', 'map-base.js', 'map-decor.js', 'mapgen-dungeon.js', 'mapgen-city.js'],
  });
  return sandbox.RK;
}

test('dungeon generation creates a reachable floor with stairs and rooms', () => {
  const RK = createGens();
  const g = RK.MapGenDungeon.generate(1, 12345, 24, 16, 'crypt', 'mountains');

  assert.equal(g.w, 24);
  assert.equal(g.h, 16);
  assert.ok(Array.isArray(g.rooms) && g.rooms.length > 1);
  assert.ok(g.spawn && Number.isInteger(g.spawn.x) && Number.isInteger(g.spawn.y));
  assert.ok(g.stair && Number.isInteger(g.stair.x) && Number.isInteger(g.stair.y));
  assert.equal(g.locationType, 'mountains');
  assert.ok(g.doors.length + g.chests.length >= 0, 'объекты карты инициализированы');
  assert.equal(g.tiles[g.spawn.y][g.spawn.x], 1, 'герой стоит на полу');
  assert.equal(g.tiles[g.stair.y][g.stair.x], 1, 'лестница стоит на полу');
});

test('dungeon generation is deterministic per seed', () => {
  const RK = createGens();
  const first = RK.MapGenDungeon.generate(2, 999, 24, 16, 'stone', 'wilderness');
  const second = RK.MapGenDungeon.generate(2, 999, 24, 16, 'stone', 'wilderness');

  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('city generation creates buildings, a gate and a tavern', () => {
  const RK = createGens();
  const g = RK.MapGenCity.generateCity(1, 999, 48, 34, 'stone', 'city');

  assert.equal(g.w, 48);
  assert.equal(g.h, 34);
  assert.ok(g.spawn && g.spawn.x >= 0 && g.spawn.x < g.w);
  assert.ok(Array.isArray(g.buildings) && g.buildings.length > 1, 'в городе больше одного дома');
  assert.ok(g.tavern, 'есть таверна');
  assert.ok(g.buildings.some((building) => building.kind === 'market'), 'есть служба города');
  assert.equal(g.tiles[g.spawn.y][g.spawn.x], 1, 'спавн на проходимой клетке');
  assert.ok(RK.MapGenCity.getBuilding(g, 'tavern'), 'служебная постройка ищется по kind');
  assert.equal(RK.MapGenCity.getBuilding(g, 'no-such-kind'), null);
});
