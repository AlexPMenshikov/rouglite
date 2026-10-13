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