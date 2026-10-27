'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// целевой API RK.CombatSnapshot нет в таблице действий; проверяем его напрямую,
// чтобы регрессия malformed снимков оставалась видимой без сети.

function createSnapshotModule() {
  const { sandbox } = createSandbox({ seed: 123 });
  return { sandbox, RK: sandbox.RK };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('restoreMap decodes matrices without a manifest and gives empty grids', () => {
  const { RK } = createSnapshotModule();
  const restored = RK.CombatSnapshot.restoreMap(
    { w: 3, h: 1, style: 'stone', matrices: { tiles: [[1, 3]] } },
    undefined,
  );

  assert.equal(JSON.stringify(plain(restored.tiles)), JSON.stringify([[1, 1, 1]]));
  assert.equal(restored.w, 3);
  assert.equal(restored.h, 1);
  assert.equal(JSON.stringify(plain(restored.vis)), JSON.stringify([[false, false, false]]));
  assert.equal(JSON.stringify(plain(restored.explored)), JSON.stringify([[false, false, false]]));
  assert.equal('matrices' in restored, false);
});

test('restoreMap copies selected map-state fields from a snapshot', () => {
  const { RK } = createSnapshotModule();
  const restored = RK.CombatSnapshot.restoreMap(
    { w: 2, h: 1, matrices: { tiles: [[1, 2]] } },
    { blood: [{ x: 1, y: 0 }], doors: [{ x: 0, y: 0, state: 'open' }] },
  );

  assert.equal(JSON.stringify(plain(restored.tiles)), JSON.stringify([[1, 1]]));
  assert.deepEqual(plain(restored.blood), [{ x: 1, y: 0 }]);
  assert.deepEqual(plain(restored.doors), [{ x: 0, y: 0, state: 'open' }]);
});

test('restoreMap rejects a null map state and a matrix of the wrong size', () => {
  const { RK } = createSnapshotModule();

  assert.equal(RK.CombatSnapshot.restoreMap(
    { w: 2, h: 1, matrices: { tiles: [[1, 2]] } },
    null,
  ), null);

  assert.equal(RK.CombatSnapshot.restoreMap(
    { w: 3, h: 1, matrices: { tiles: [[1, 2]] } },
    {},
  ), null);
});
