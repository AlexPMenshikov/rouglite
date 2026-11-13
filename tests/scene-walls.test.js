'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createRenderSandbox } = require('./helpers/sandbox');

// Сцена решает, что видно: слой поверхности и декор стен берёт из стиля карты.
// Стиль задаёт и то, что лежит под ногами, и то, чем закрыты стены.

// Карта с каменной стеной по краю и стеной внутри.
function makeMap(style, width = 9, height = 7, innerWalls = []) {
  const tiles = [];
  const explored = [];
  const vis = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    explored[y] = [];
    vis[y] = [];
    for (let x = 0; x < width; x++) {
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      tiles[y][x] = edge ? 0 : 1;
      explored[y][x] = true;
      vis[y][x] = true;
    }
  }
  for (const [x, y] of innerWalls) tiles[y][x] = 0;
  return {
    w: width,
    h: height,
    style,
    tiles,
    explored,
    vis,
    regions: [],
    regionStyles: [],
    floorTypes: [],
    wallTypes: [],
    decorations: [],
  };
}

test('пустыня: песок ложится слоем, стены засыпает дюнами', () => {
  const { sandbox } = createRenderSandbox();
  const map = makeMap('desert');
  const scene = sandbox.RK.Scene.build(map, {});

  assert.equal(scene.ground && scene.ground.asset, 'decorSand', 'песок — слой поверхности');
  for (const cell of [[0, 0], [4, 3], [8, 6]]) {
    const decor = sandbox.RK.Scene.wallDecor(map, cell[0], cell[1]);
    assert.equal(decor, 'decorDune', 'стена ' + cell + ' — дюна');
  }
});

test('лес: стены закрывают деревья и елки, слоя поверхности нет', () => {
  const { sandbox } = createRenderSandbox();
  const map = makeMap('forest');
  const scene = sandbox.RK.Scene.build(map, {});

  assert.equal(scene.ground, null, 'в лесу нет слоя песка');
  const assets = new Set();
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const decor = sandbox.RK.Scene.wallDecor(map, x, y);
      if (decor) assets.add(decor);
    }
  }
  assert.deepEqual([...assets].sort(), ['decorPine', 'decorTree'],
    'в лесу стены закрывают деревья и елки');
});

test('декор стены выбирается одинаково для одной и той же клетки', () => {
  const { sandbox } = createRenderSandbox();
  const map = makeMap('forest');

  for (const cell of [[0, 0], [3, 2], [8, 6]]) {
    const first = sandbox.RK.Scene.wallDecor(map, cell[0], cell[1]);
    assert.equal(sandbox.RK.Scene.wallDecor(map, cell[0], cell[1]), first,
      'клетка ' + cell + ' не меняется');
  }
  const other = makeMap('forest');
  assert.equal(sandbox.RK.Scene.wallDecor(other, 3, 2), sandbox.RK.Scene.wallDecor(map, 3, 2),
    'одинаковая карта даёт одинаковый декор');
});

test('в стиле без своих стен декор не нужен', () => {
  const { sandbox } = createRenderSandbox();
  const map = makeMap('stone');

  assert.equal(sandbox.RK.Scene.wallDecor(map, 0, 0), null, 'у каменных залов стены как стены');
});
