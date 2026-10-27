'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

function createDecor() {
  const { sandbox } = createSandbox({
    scripts: ['config.js', 'rng.js', 'pathfind.js', 'map-objects.js', 'map-base.js', 'map-decor.js'],
  });
  return sandbox.RK;
}

function baseMap(width, height, style, locationType, seed) {
  const RK = createDecor();
  const g = RK.MapBase.emptyMap(0, width, height, style || 'forest', seed || 101);
  g.locationType = locationType || 'wilderness';
  if (!g.spawn) g.spawn = { x: 1, y: 1 };
  if (g.stair === null) g.stair = { x: Math.max(1, width - 2), y: Math.max(1, height - 2) };
  return { RK, g };
}

test('placeDecorations marks only free floor tiles and keeps protected tiles clear', () => {
  const { RK, g } = baseMap(10, 8, 'forest', 'wilderness', 202);
  g.spawn = { x: 4, y: 3 };
  g.stair = { x: 7, y: 5 };
  const occupied = [{ x: 2, y: 2 }];
  const decorations = RK.MapDecor.placeDecorations(g, occupied);

  assert.ok(Array.isArray(decorations));
  const keys = new Set(decorations.map((item) => `${item.x},${item.y}`));
  assert.equal(keys.size, decorations.length, 'одна клетка не рисует два декора');
  for (const item of decorations) {
    assert.equal(g.tiles[item.y][item.x], 1, 'декор только на полу');
    assert.ok(RK.Pathfind.manhattan(item.x, item.y, g.spawn.x, g.spawn.y) >= 3,
      'spawn хранит радиус без декора');
    if (g.stair) {
      assert.ok(RK.Pathfind.manhattan(item.x, item.y, g.stair.x, g.stair.y) >= 2,
        'лестница не покрывается декором');
    }
    assert.equal(keys.has(`2,2`), false, 'занятая клетка остаётся свободной');
  }
});

test('placeDecorations is deterministic for the same map and seed', () => {
  const { RK: RK1, g: g1 } = baseMap(10, 8, 'forest', 'wilderness', 303);
  const { RK: RK2, g: g2 } = baseMap(10, 8, 'forest', 'wilderness', 303);
  const first = RK1.MapDecor.placeDecorations(g1, []);
  const second = RK2.MapDecor.placeDecorations(g2, []);

  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('placeDecorations does not place water decorations where the profile has no water', () => {
  const { RK, g } = baseMap(12, 9, 'stone', 'city', 404);
  const decorations = RK.MapDecor.placeDecorations(g, []);

  const assets = new Set(decorations.map((item) => item.asset));
  assert.equal(assets.has('decorLake'), false, 'городское озеро не генерируется без воды');
  assert.equal(assets.has('decorStream'), false, 'городской ручей не генерируется без воды');
});
