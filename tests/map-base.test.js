'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// MapBase даёт общую начальную форму карты и случайность по seed. Проверяем,
// что генераторы начинают с полной нулевой сетки, а не с размерами по умолчанию
// в разные стороны.

function createBase() {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'rng.js', 'pathfind.js', 'map-base.js'] });
  return sandbox.RK;
}

test('emptyMap allocates the requested grid and leaves every matrix zero', () => {
  const RK = createBase();
  const g = RK.MapBase.emptyMap(7, 4, 3, 'ruins', 42);

  assert.equal(g.w, 4);
  assert.equal(g.h, 3);
  assert.equal(g.style, 'ruins');
  assert.equal(g.seed, 42);
  assert.equal(g.tiles.length, 3);
  assert.equal(g.tiles[0].length, 4);
  assert.equal(g.floorTypes[1].length, 4);
  assert.equal(g.regions[1][2], 0);
  assert.equal(g.wallTypes[1][2], 0);
  assert.equal(g.explored[1][2], false);
  assert.equal(g.vis[1][2], false);
  assert.equal(g.doors.length, 0);
  assert.equal(g.chests.length, 0);
  assert.equal(g.traps.length, 0);
  assert.equal(g.stair, null);
  assert.equal(g.spawn, null);
  assert.equal(g.rooms.length, 0);
  assert.equal(g.blood, undefined, 'боль и телепортация карты не лежат в базовой сетке');
});

test('emptyMap uses the configured fallback size without arguments', () => {
  const RK = createBase();
  const g = RK.MapBase.emptyMap(1);

  assert.equal(g.w, RK.CONFIG.MAP_WIDTH);
  assert.equal(g.h, RK.CONFIG.MAP_HEIGHT);
  assert.equal(g.tiles.length, RK.CONFIG.MAP_HEIGHT);
});

test('locationProfile chooses the requested profile, otherwise the default', () => {
  const RK = createBase();
  const city = RK.MapBase.locationProfile('city');
  const unknown = RK.MapBase.locationProfile('does-not-exist');
  const empty = RK.MapBase.locationProfile(null);

  assert.equal(city.water, false, 'город строится без воды');
  assert.equal(city.decorDensity > unknown.decorDensity, false);
  assert.deepEqual(JSON.parse(JSON.stringify(unknown)), JSON.parse(JSON.stringify(RK.CONFIG.DEFAULT_LOCATION_GEN)));
  assert.deepEqual(JSON.parse(JSON.stringify(empty)), JSON.parse(JSON.stringify(RK.CONFIG.DEFAULT_LOCATION_GEN)));
  assert.ok(Array.isArray(city.decor), 'декорации профиля — массив');
});

test('seededRandom is deterministic only for the same seed and salt', () => {
  const RK = createBase();
  const first = RK.MapBase.seededRandom(12345, 777);
  const same = RK.MapBase.seededRandom(12345, 777);
  const otherSalt = RK.MapBase.seededRandom(12345, 778);

  const firstValues = Array.from({ length: 5 }, () => first());
  const sameValues = Array.from({ length: 5 }, () => same());
  const otherValues = Array.from({ length: 5 }, () => otherSalt());

  assert.deepEqual(JSON.parse(JSON.stringify(firstValues)), JSON.parse(JSON.stringify(sameValues)));
  assert.notDeepEqual(JSON.parse(JSON.stringify(firstValues)), JSON.parse(JSON.stringify(otherValues)));
  for (const value of firstValues) {
    assert.ok(value >= 0 && value < 1, 'случайность в диапазоне [0,1)');
  }
});

test('depthStyle keeps the first floor and applies themes deeper', () => {
  const RK = createBase();

  assert.equal(RK.MapBase.depthStyle('mountains', 1, 'mountain'), 'mountain', 'входной ярус — стиль локации');
  assert.equal(RK.MapBase.depthStyle('mountains', 3, 'mountain'), 'magma', 'глубже берётся тема');
  assert.equal(RK.MapBase.depthStyle('mountains', 4, 'mountain'), 'ice');
  assert.equal(RK.MapBase.depthStyle('unknown', 2, 'stone'), 'stone', 'без темы остаётся базовый стиль');
  assert.equal(RK.MapBase.depthStyle('mountains', 99, 'mountain'), 'mountain', 'за пределом глубины — базовый стиль');
});

test('assignRegions uses one region for one style and several for several starts', () => {
  const RK = createBase();
  const g = RK.MapBase.emptyMap(9, 6, 6, 'stone', 9);
  g.locationType = 'ruins';
  const oneRoom = [{ x: 1, y: 1, w: 2, h: 2, cx: 2, cy: 2, region: 0 }];
  RK.MapBase.assignRegions(g, oneRoom);
  assert.deepEqual(JSON.parse(JSON.stringify(oneRoom.map((room) => room.region))), [0]);
  assert.deepEqual(JSON.parse(JSON.stringify(g.regionStyles)), ['stone']);

  const multi = RK.MapBase.emptyMap(9, 20, 10, 'forest', 9);
  multi.locationType = 'wilderness';
  multi.rooms = [
    { x: 1, y: 1, w: 4, h: 4, cx: 3, cy: 3, region: 0 },
    { x: 13, y: 1, w: 4, h: 4, cx: 15, cy: 3, region: 0 },
    { x: 7, y: 5, w: 4, h: 4, cx: 9, cy: 7, region: 0 },
  ];
  RK.MapBase.assignRegions(multi, multi.rooms);

  assert.equal(multi.regionStyles.length, 3, 'forest, fungal и cave без дубля');
  for (const room of multi.rooms) {
    assert.ok(room.region >= 0 && room.region < multi.regionStyles.length);
  }
  for (let y = 0; y < multi.h; y++) {
    for (let x = 0; x < multi.w; x++) {
      assert.ok(multi.regions[y][x] >= 0 && multi.regions[y][x] < multi.regionStyles.length);
    }
  }

  // Тема яруса может не входить в список залов профиля: база всё равно первая,
  // а всего залов не больше трёх.
  const themed = RK.MapBase.emptyMap(2, 20, 10, 'cave', 9);
  themed.locationType = 'mountains';
  themed.rooms = [
    { x: 1, y: 1, w: 4, h: 4, cx: 3, cy: 3, region: 0 },
    { x: 13, y: 1, w: 4, h: 4, cx: 15, cy: 3, region: 0 },
    { x: 7, y: 5, w: 4, h: 4, cx: 9, cy: 7, region: 0 },
  ];
  RK.MapBase.assignRegions(themed, themed.rooms);

  assert.equal(themed.regionStyles[0], 'cave', 'первый зал — тема яруса');
  assert.ok(themed.regionStyles.length <= 3, 'не больше трёх залов');
});

test('placeTorches returns a torch when a room corner can hold one', () => {
  const RK = createBase();
  const g = RK.MapBase.emptyMap(9, 8, 8, 'stone', 9);
  const room = { x: 2, y: 2, w: 4, h: 4, cx: 4, cy: 4, region: 0 };
  g.rooms = [room];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) g.tiles[y][x] = 1;
  }
  RK.RNG = { rand: () => 0.5, chance: () => true, int: () => 0 };

  const torches = RK.MapBase.placeTorches(g);

  assert.ok(Array.isArray(torches));
  assert.ok(torches.length > 0, 'хотя бы один факел появляется на подходящем углу');
  for (const torch of torches) {
    assert.equal(torch.asset, 'torch');
    assert.equal(torch.flameAsset, 'torchFlame');
    assert.ok(Number.isFinite(torch.x) && Number.isFinite(torch.y));
    assert.ok(torch.dx === 0 || Math.abs(torch.dx) === 1);
    assert.ok(torch.dy === 0 || Math.abs(torch.dy) === 1);
    assert.ok(!((torch.dx === 0 && torch.dy === 0)));
  }
});
