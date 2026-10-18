'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createRenderSandbox } = require('./helpers/sandbox');

// Зум живёт в Meta: без поля zoom в дефолтах сохранённое значение терялось при
// перезапуске, и обзор молча сбрасывался в единицу. Поэтому здесь проверяется
// и чтение из сейва, и запись изменений.

const useTinyMap = (sandbox) => {
  sandbox.RK.CONFIG.COLS = 2;
  sandbox.RK.CONFIG.ROWS = 2;
};

test('zoom starts at 1 and clamps between 1 and 4', () => {
  const { sandbox } = createRenderSandbox();
  const Render = sandbox.RK.Render;

  assert.equal(Render.getZoom(), 1);

  Render.setZoom(0);
  assert.equal(Render.getZoom(), 1, 'ниже единицы зума нет');
  Render.setZoom(9);
  assert.equal(Render.getZoom(), 4, 'выше четырёх зума нет');

  Render.setZoom(2);
  assert.equal(Render.getZoom(), 2);
  Render.zoomIn();
  assert.equal(Render.getZoom(), 2.25);
  Render.zoomOut();
  assert.equal(Render.getZoom(), 2);
});

test('zoom changes the tile size and is saved to Meta', () => {
  const { sandbox, stored } = createRenderSandbox();
  const C = sandbox.RK.CONFIG;

  sandbox.RK.Render.setZoom(2.5);
  assert.equal(sandbox.RK.Render.getTileSize(), Math.round(C.TILE * 2.5));
  assert.equal(JSON.parse(stored.get(C.META_KEY)).zoom, 2.5);
});

test('a saved zoom is restored after a reload', () => {
  const { sandbox } = createRenderSandbox({ meta: { zoom: 3 } });

  assert.equal(sandbox.RK.Meta.data.zoom, 3);
  // getTileSize подтягивает зум из Meta: именно он определяет масштаб кадра.
  assert.equal(sandbox.RK.Render.getTileSize(), Math.round(sandbox.RK.CONFIG.TILE * 3));
  assert.equal(sandbox.RK.Render.getZoom(), 3, 'зум из сейва применяется при загрузке');
});

test('an out-of-range saved zoom is clamped when the map is drawn', () => {
  const { sandbox } = createRenderSandbox({ meta: { zoom: 9 } });

  assert.equal(sandbox.RK.Render.getTileSize(), Math.round(sandbox.RK.CONFIG.TILE * 4));
});

test('a bigger zoom shows fewer tiles on screen', () => {
  const { sandbox } = createRenderSandbox();
  useTinyMap(sandbox);
  const player = { id: 'player', x: 0, y: 0, hp: 10 };
  sandbox.RK.Combat = { getDrawPos: () => player };
  sandbox.RK.GAME = { player, players: [player], items: [], enemies: [], floor: 1 };
  sandbox.RK.Map = {
    w: 2,
    h: 2,
    tiles: [[1, 1], [1, 1]],
    vis: [[true, true], [true, true]],
    explored: [[true, true], [true, true]],
    decorations: [],
    doors: [],
    chests: [],
    traps: [],
    torches: [],
    zones: [],
    blood: [],
  };

  sandbox.RK.Render.setZoom(1);
  sandbox.RK.Render.draw();
  const normalCamera = sandbox.RK.Render.getCameraOffset();

  sandbox.RK.Render.setZoom(2);
  sandbox.RK.Render.draw();
  const zoomedCamera = sandbox.RK.Render.getCameraOffset();

  assert.equal(normalCamera.x, -0.5, 'при зуме 1 видно всю карту 2x2 вокруг героя');
  assert.equal(zoomedCamera.x, 0, 'при зуме 2 видно вдвое меньше клеток');
});
