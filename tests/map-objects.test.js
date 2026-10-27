'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// Объекты карты — чистые указатели на массивы: двери, сундуки, ловушки, таверна.
// Тесты проверяют граничные клетки и отсутствие Map, чтобы нулевая карта не
// превращалась в упавший снимок.

function createObjects() {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'rng.js', 'map-objects.js'] });
  return sandbox.RK;
}

function makeMap(width = 5, height = 5) {
  return {
    w: width,
    h: height,
    tiles: Array.from({ length: height }, () => new Array(width).fill(1)),
    doors: [],
    chests: [],
    traps: [],
    blood: [],
    tavern: null,
  };
}

test('isInside respects map bounds, including a missing map', () => {
  const RK = createObjects();

  assert.equal(Boolean(RK.MapObjects.isInside(0, 0)), false, 'без карты границ нет');
  RK.Map = makeMap(3, 4);
  assert.equal(RK.MapObjects.isInside(0, 0), true);
  assert.equal(RK.MapObjects.isInside(2, 3), true);
  assert.equal(RK.MapObjects.isInside(3, 3), false, 'правая граница исключена');
  assert.equal(RK.MapObjects.isInside(0, 4), false, 'нижняя граница исключена');
  assert.equal(RK.MapObjects.isInside(-1, 0), false);
});

test('door, chest and trap lookups return the first matching object', () => {
  const RK = createObjects();
  const map = makeMap();
  RK.Map = map;

  assert.equal(RK.MapObjects.getDoorAt(1, 1), null);
  assert.equal(RK.MapObjects.getChestAt(1, 1), null);
  assert.equal(RK.MapObjects.getTrapAt(1, 1), null);

  const door = { x: 1, y: 1, state: 'closed' };
  const chest = { x: 2, y: 2, state: 'locked' };
  const trap = { x: 3, y: 3, type: 'spike' };
  map.doors.push({ x: 9, y: 9 }, door);
  map.chests.push(chest);
  map.traps.push(trap);

  assert.equal(RK.MapObjects.getDoorAt(1, 1), door);
  assert.equal(RK.MapObjects.getChestAt(2, 2), chest);
  assert.equal(RK.MapObjects.getTrapAt(3, 3), trap);
  assert.equal(RK.MapObjects.getDoorAt(99, 99), null, 'чужая карта не смотрится');
});

test('tavern membership treats the tavern rectangle as a half-open range', () => {
  const RK = createObjects();
  const map = makeMap();
  map.tavern = { x: 1, y: 1, w: 2, h: 3 };
  RK.Map = map;

  assert.equal(RK.MapObjects.getTavern(map), map.tavern);
  assert.equal(RK.MapObjects.isInTavern(map, 1, 1), true);
  assert.equal(RK.MapObjects.isInTavern(map, 2, 3), true, 'последние клетки принадлежат таверне');
  assert.equal(RK.MapObjects.isInTavern(map, 3, 4), false, 'правый и нижний край уже снаружи');
  assert.equal(RK.MapObjects.isInTavern(map, 0, 0), false);
  assert.equal(RK.MapObjects.isInTavern(null, 1, 1), false);
  assert.equal(RK.MapObjects.isInTavern({ tavern: null }, 1, 1), false);
});

test('addBlood adds only a floor droplet and caps the list afterward', () => {
  const RK = createObjects();
  const map = makeMap(4, 4);
  map.tiles[1][1] = 1;
  map.tiles[2][2] = 0;
  RK.Map = map;
  RK.RNG = { rand: () => 0.5, int: () => 1 };

  RK.MapObjects.addBlood(1, 1, 2);
  assert.equal(map.blood.length, 1);
  assert.equal(map.blood[0].x, 1);
  assert.equal(map.blood[0].y, 1);
  assert.ok(map.blood[0].r > 0 && map.blood[0].a > 0);
  assert.equal(map.blood[0].kind, 1);

  const before = map.blood.length;
  RK.MapObjects.addBlood(2, 2, 1);
  assert.equal(map.blood.length, before, 'капля не падает на стену');
  RK.MapObjects.addBlood(5, 5, 1);
  assert.equal(map.blood.length, before, 'за краем карты кровь не добавляется');

  RK.RNG = { rand: () => 0.5, int: () => 0 };
  RK.CONFIG.BLOOD_MAX = 2;
  map.blood = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
  RK.MapObjects.addBlood(1, 1, 0);
  assert.equal(map.blood.length, 2, 'список крови не растёт больше BLOOD_MAX');
  assert.equal(map.blood[map.blood.length - 1].x, 1);

  RK.Map = null;
  assert.doesNotThrow(() => RK.MapObjects.addBlood(0, 0, 1), 'без карты капля молча игнорируется');
});

test('default strength is one even through strength-null paths', () => {
  const RK = createObjects();
  const map = makeMap(2, 2);
  map.tiles[1][1] = 1;
  RK.Map = map;
  RK.RNG = { rand: () => 0.25, int: () => 0 };

  RK.MapObjects.addBlood(1, 1, null);

  assert.equal(map.blood.length, 1);
  assert.ok(map.blood[0].r < 1, 'сила 1 даёт маленькую каплю по формуле');
});
