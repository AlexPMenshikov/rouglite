'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createRenderSandbox } = require('./helpers/sandbox');

// Изометрия: сетка сворачивается в ромб, порядок отрисовки — по глубине.
// Вид проверяется через канвас: что и в каком порядке нарисовано.

const TILE = 40;

/** Песочница с канвасом, который запоминает вызовы отрисовки. */
function isoSandbox() {
  const { sandbox } = createRenderSandbox();
  const calls = [];
  const wallSprite = { width: 64, height: 64, marker: 'wall' };
  const context = new Proxy({
    canvas: { width: 1920, height: 1056 },
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
  }, {
    get(target, property) {
      if (property === 'canvas') return target.canvas;
      if (property === 'drawImage') {
        return (sprite, ...rest) => calls.push({ kind: 'image', sprite, rest });
      }
      if (property in target) return target[property];
      return () => {};
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
  sandbox.RK.Assets = {
    draw(_ctx, name) {
      calls.push({ kind: 'sprite', name });
      return true;
    },
    drawIso(_ctx, sprite) {
      calls.push({ kind: 'iso', sprite });
      return true;
    },
    isoFloor() { return null; },
    isoWall() { return wallSprite; },
    floorGrayAmount() { return 0; },
    drawFloorTile() {},
  };
  sandbox.RK.Effects = { draw() {} };
  sandbox.RK.Items = { RARITY_COLORS: { common: '#fff' } };
  sandbox.RK.Entities = { DEFS: {} };
  return { sandbox, calls, wallSprite };
}

/** Карта из нулей и единиц: 1 — пол, 0 — стена. */
function makeMap(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const tiles = rows.map((row) => row.split('').map((ch) => (ch === '#' ? 0 : 1)));
  const vis = tiles.map((row) => row.map(() => true));
  return {
    w,
    h,
    tiles,
    vis,
    explored: vis.map((row) => row.slice()),
    decorations: [],
    doors: [],
    chests: [],
    traps: [],
    torches: [],
    zones: [],
    blood: [],
    pois: [],
    exits: [],
  };
}

function setupScene(sandbox, map, player, enemies) {
  sandbox.RK.Combat = { getDrawPos: () => player };
  sandbox.RK.GAME = {
    player,
    players: [player],
    items: [],
    enemies: enemies || [],
    npcs: [],
    floor: 1,
  };
  sandbox.RK.Map = map;
}

test('изометрия переводит клетку в экран и обратно без потерь', () => {
  const { sandbox } = isoSandbox();
  const map = makeMap([
    '#####',
    '#...#',
    '#...#',
    '#...#',
    '#####',
  ]);
  const player = { id: 'player', x: 2, y: 2, hp: 10 };
  setupScene(sandbox, map, player);
  sandbox.RK.Render.setMode('iso');
  sandbox.RK.Render.draw();

  const view = sandbox.RK.Views.iso;
  view.setup({ zoom: 1, scale: 1, width: 1920, height: 1056 });
  view.setCamera(player);

  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const point = view.point(x + 0.5, y + 0.5);
      const tile = view.pick(point.x, point.y);
      assert.equal(tile.x, x, `клетка ${x},${y} ищется по своей точке`);
      assert.equal(tile.y, y);
    }
  }
});

test('изометрия показывает клетку под курсором', () => {
  const { sandbox } = isoSandbox();
  const map = makeMap([
    '#####',
    '#...#',
    '#...#',
    '#####',
  ]);
  const player = { id: 'player', x: 1, y: 1, hp: 10 };
  setupScene(sandbox, map, player);
  sandbox.RK.Render.setMode('iso');
  sandbox.RK.Render.draw();

  const view = sandbox.RK.Views.iso;
  view.setup({ zoom: 1, scale: 1, width: 1920, height: 1056 });
  view.setCamera(player);
  const point = view.point(3.5, 2.5);

  const picked = sandbox.RK.Render.pickTile(point.x, point.y);
  assert.equal(picked.x, 3);
  assert.equal(picked.y, 2);
  assert.equal(sandbox.RK.Render.pickTile(-500, -500), null, 'вне карты клетки нет');
});

test('стена закрывает того, кто за ней, но не того, кто перед ней', () => {
  const { sandbox, calls, wallSprite } = isoSandbox();
  // Стена в клетке (1, 1); клетка (0, 1) — за стеной, (2, 1) — перед ней.
  // Стена тут одна, поэтому её кадр в списке вызовов узнаётся однозначно.
  const map = makeMap([
    '.......',
    '.#.....',
    '.......',
  ]);
  const player = { id: 'player', x: 0, y: 0, hp: 10 };
  const behind = { id: 'behind', type: 'slime', alive: true, x: 0, y: 1, hp: 5, maxHp: 5, atk: 1 };
  const inFront = { id: 'front', type: 'slime', alive: true, x: 2, y: 1, hp: 5, maxHp: 5, atk: 1 };
  setupScene(sandbox, map, player, [behind, inFront]);
  sandbox.RK.Render.setMode('iso');
  sandbox.RK.Render.draw();

  const wallAt = calls.findIndex((call) => call.kind === 'iso' && call.sprite === wallSprite);
  const behindAt = calls.findIndex((call) => call.kind === 'sprite' && call.name === 'slime');
  const frontAt = calls.findIndex((call, index) => index > behindAt && call.kind === 'sprite' && call.name === 'slime');

  assert.ok(wallAt >= 0, 'стена нарисована');
  assert.ok(behindAt >= 0, 'враг за стеной нарисован');
  assert.ok(frontAt > behindAt, 'врагов двое');
  assert.ok(wallAt > behindAt, 'стена закрывает того, кто за ней');
  assert.ok(frontAt > wallAt, 'тот, кто перед стеной, виден поверх неё');
});

test('изометрический вид рисует карту и не падает', () => {
  const { sandbox, calls } = isoSandbox();
  const map = makeMap([
    '#########',
    '#..#..#.#',
    '#..#..#.#',
    '#.......#',
    '#########',
  ]);
  const player = { id: 'player', x: 1, y: 1, hp: 10 };
  setupScene(sandbox, map, player, []);
  sandbox.RK.Render.setMode('iso');

  assert.doesNotThrow(() => sandbox.RK.Render.draw());
  assert.ok(calls.length > 0, 'кадр что-то нарисовал');
});

test('выбранный вид изометрии переживает сохранение настройки', () => {
  const { sandbox, stored } = createRenderSandbox();
  assert.equal(sandbox.RK.Render.getMode(), 'graphics');
  assert.equal(sandbox.RK.Render.setMode('iso'), true);
  assert.equal(sandbox.RK.Render.getMode(), 'iso');
  assert.equal(JSON.parse(stored.get(sandbox.RK.CONFIG.META_KEY)).renderMode, 'iso');

  const { sandbox: restored } = createRenderSandbox({ meta: { renderMode: 'iso' } });
  assert.equal(restored.RK.Render.getMode(), 'iso', 'сохранённый вид восстановился');
});

test('в списке видов есть изометрия, а чужой вид не принимается', () => {
  const { sandbox } = createRenderSandbox();
  assert.equal(sandbox.RK.Render.modes().join(','), 'graphics,ascii,iso');
  assert.equal(sandbox.RK.Render.setMode('vector'), false);
  assert.equal(sandbox.RK.Render.getMode(), 'graphics');
});
