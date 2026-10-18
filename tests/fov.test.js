'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, startRunAsClass } = require('./helpers/sandbox');

// Обзор считается по карте и правилам рассказчика, поэтому карта здесь своя:
// открытая, с известными стенами, дверями и сундуками.

function emptyMap(size = 17) {
  const tiles = [];
  for (let y = 0; y < size; y += 1) tiles.push(new Array(size).fill(1));
  return {
    w: size,
    h: size,
    tiles,
    doors: [],
    chests: [],
    explored: tiles.map((row) => row.map(() => false)),
    vis: tiles.map((row) => row.map(() => false)),
  };
}

function fovSandbox() {
  const { sandbox } = createSandbox();
  startRunAsClass(sandbox.RK, 'paladin');
  const map = emptyMap();
  sandbox.RK.Map = map;
  return { sandbox, map };
}

test('visibility covers the view radius and stops at walls', () => {
  const { sandbox } = fovSandbox();
  const visible = sandbox.RK.Fov.computeVisibility(5, 5);

  assert.equal(visible[5][5], true, 'клетка героя видна');
  assert.equal(visible[5][5 + sandbox.RK.CONFIG.VIEW_RADIUS], true, 'дальняя клетка в радиусе видна');
  assert.equal(visible[5][5 + sandbox.RK.CONFIG.VIEW_RADIUS + 1], false, 'за радиусом темно');
  assert.equal(visible[16][16], false, 'дальний угол за радиусом тёмный');

  sandbox.RK.Map.tiles[5][7] = 0;
  const blocked = sandbox.RK.Fov.computeVisibility(5, 5);
  assert.equal(blocked[5][9], false, 'стена закрывает обзор за собой');
});

test('closed doors and chests block sight, open ones do not', () => {
  const { sandbox } = fovSandbox();
  sandbox.RK.Map.doors = [{ x: 7, y: 5, state: 'closed' }];
  sandbox.RK.Map.chests = [{ x: 7, y: 7, state: 'locked' }];

  const blocked = sandbox.RK.Fov.computeVisibility(5, 5);
  assert.equal(blocked[5][9], false, 'закрытая дверь непрозрачна');
  assert.equal(blocked[9][9], false, 'закрытый сундук непрозрачен');

  sandbox.RK.Map.doors[0].state = 'open';
  sandbox.RK.Map.chests[0].state = 'open';
  const clear = sandbox.RK.Fov.computeVisibility(5, 5);
  assert.equal(clear[5][9], true, 'открытая дверь прозрачна');
  assert.equal(clear[9][9], true, 'открытый сундук прозрачен');
});

test('lineOk refuses lines leaving the map', () => {
  const { sandbox } = fovSandbox();
  assert.equal(sandbox.RK.Fov.lineOk(5, 5, 20, 5), false);
  assert.equal(sandbox.RK.Fov.lineOk(5, 5, 5, 5), true, 'точка на себя — пустая линия');
});

test('compute marks visible cells as explored and keeps the rest', () => {
  const { sandbox } = fovSandbox();
  sandbox.RK.Fov.compute(5, 5);

  assert.equal(sandbox.RK.Map.explored[5][5], true);
  assert.equal(sandbox.RK.Map.explored[5][5 + sandbox.RK.CONFIG.VIEW_RADIUS + 1], false);

  sandbox.RK.Fov.compute(0, 0);
  assert.equal(sandbox.RK.Map.explored[0][0], true);
  assert.equal(sandbox.RK.Map.explored[5][5], true, 'уже исследованное не стирается');
});

test('a narrator twist can shrink the view, but not below three cells', () => {
  const { sandbox } = fovSandbox();
  const rng = { randValue: 0.3, chanceValue: true };
  sandbox.RK.RNG = { rand: () => rng.randValue, chance: () => rng.chanceValue };
  sandbox.RK.GAME.turn = 0;
  sandbox.RK.Narrator.onEvent('turnEnd');

  const visible = sandbox.RK.Fov.computeVisibility(5, 5);
  assert.equal(visible[5][5 + 4], true, 'радиус 4 ещё виден');
  assert.equal(visible[5][5 + 5], false, 'радиус 5 уже вне тумана');
});
