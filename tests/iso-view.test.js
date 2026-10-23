'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createRenderSandbox } = require('./helpers/sandbox');

// Изометрия: сетка сворачивается в ромб, порядок отрисовки — по глубине.
// Вид проверяется через канвас: что и в каком порядке нарисовано.

const TILE = 40;

/** Песочница с канвасом, который запоминает вызовы отрисовки. */
function isoSandbox() {
  const { sandbox, calls: canvasCalls } = createRenderSandbox();
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
    draw(_ctx, name, ...args) {
      calls.push({ kind: 'sprite', name, args });
      return true;
    },
    drawIso(_ctx, sprite, ...args) {
      calls.push({ kind: 'iso', sprite, args });
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
  return { sandbox, calls, canvasCalls, wallSprite };
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

test('партия рисуется по плавной позиции шага, а не по клетке', () => {
  const { sandbox, calls } = isoSandbox();
  const map = makeMap([
    '#######',
    '#.....#',
    '#.....#',
    '#.....#',
    '#######',
  ]);
  const player = { id: 'hero', x: 1, y: 1, hp: 10, asset: 'player' };
  const mate = { id: 'mate', x: 4, y: 2, hp: 10, asset: 'playerPaladin', name: 'Спутник' };
  const matePos = { x: 3.3, y: 2.4 };
  // Сцена берёт плавную позицию у каждого актёра отдельно.
  sandbox.RK.Combat = {
    getDrawPos: (actor) => {
      if (!actor) return { x: player.x, y: player.y };
      return actor.id === 'mate' ? matePos : { x: actor.x, y: actor.y };
    },
  };
  sandbox.RK.GAME = {
    player,
    players: [player, mate],
    items: [],
    enemies: [],
    npcs: [],
    floor: 1,
  };
  sandbox.RK.Map = map;
  sandbox.RK.Render.setMode('iso');
  sandbox.RK.Render.draw();

  const view = sandbox.RK.Views.iso;
  view.setup({ zoom: 1, scale: 1, width: 192, height: 192, angle: 0 });
  view.setCamera(player);
  const width = view.tileSize(1, 1);
  const expected = view.point(matePos.x + 0.5, matePos.y + 0.5);
  const drawn = calls.find((call) => call.kind === 'sprite' && call.name === 'playerPaladin');

  assert.ok(drawn, 'спутник нарисован');
  assert.ok(Math.abs(drawn.args[0] + width * 0.45 - expected.x) < 0.01, 'x берётся из pos');
  assert.ok(Math.abs(drawn.args[1] + width * 0.9 - expected.y) < 0.01, 'y берётся из pos');
});

test('у соседних стен внутренние грани не рисуются', () => {
  const { sandbox, canvasCalls } = isoSandbox();
  const map = makeMap([
    '.....',
    '.....',
    '.....',
  ]);
  map.tiles[1][1] = 0;
  map.tiles[1][2] = 0;
  const player = { id: 'player', x: 0, y: 0, hp: 10 };
  setupScene(sandbox, map, player, []);

  const view = sandbox.RK.Views.iso;
  const ctx = sandbox.document.getElementById('game').getContext('2d');
  const scene = sandbox.RK.Scene.build(map, sandbox.RK.GAME);

  for (const angle of [0, 45, 90, 135, 180, 225, 270, 315]) {
    view.setup({ zoom: 1, scale: 1, width: 1920, height: 1056, angle });
    view.setCamera(player);
    canvasCalls.length = 0;
    view.drawScene(ctx, scene, 64, 0);
    const faces = canvasCalls.filter(([name]) => name === 'createLinearGradient').length;
    assert.equal(faces, 3, `при угле ${angle} видны три внешние грани из четырёх`);
  }
});

test('под билбордом есть мягкая контактная тень', () => {
  const { sandbox, canvasCalls } = isoSandbox();
  const map = makeMap([
    '###',
    '#.#',
    '###',
  ]);
  const player = { id: 'player', x: 1, y: 1, hp: 10 };
  setupScene(sandbox, map, player, []);
  const view = sandbox.RK.Views.iso;
  const ctx = sandbox.document.getElementById('game').getContext('2d');
  const hero = { x: 1, y: 1, pos: { x: 1.2, y: 1.3 }, asset: 'player', facingX: 0, facingY: 0 };
  const scene = {
    map,
    lakes: [],
    streams: [],
    decor: [],
    blood: [],
    zones: [],
    torches: [],
    pois: [],
    exits: [],
    doors: [],
    traps: [],
    chests: [],
    npcs: [],
    stair: null,
    items: [],
    enemies: [],
    party: [],
    hero,
  };
  view.setup({ zoom: 1, scale: 1, width: 1920, height: 1056, angle: 0 });
  view.setCamera(player);
  canvasCalls.length = 0;
  view.drawScene(ctx, scene, 64, 0);

  const scaleAt = canvasCalls.findIndex(([name, x, y]) => name === 'scale' && x === 1 && y === 0.5);
  assert.ok(scaleAt >= 0, 'тень сжата вдвое по вертикали, как земля');
  const radialAt = canvasCalls.findIndex(([name], index) => index > scaleAt && name === 'createRadialGradient');
  assert.ok(radialAt > scaleAt, 'тень мягкая, через радиальный градиент');
  const translate = canvasCalls.slice(0, scaleAt).reverse().find(([name]) => name === 'translate');
  const expected = view.point(hero.pos.x + 0.5, hero.pos.y + 0.5);
  assert.ok(translate, 'тень стоит под ногами');
  assert.ok(Math.abs(translate[1] - expected.x) < 0.01);
  assert.ok(Math.abs(translate[2] - expected.y) < 0.01);
});

test('темнота локации берётся из пресета, а город всегда светлый', () => {
  const { sandbox } = createRenderSandbox();
  const ambientFor = sandbox.RK.View.ambientFor;

  assert.equal(ambientFor(null), sandbox.RK.CONFIG.TORCH.AMBIENT);
  assert.equal(ambientFor({ locationType: 'dungeon' }), 0.46);
  assert.equal(ambientFor({ locationType: 'crypt' }), 0.58);
  assert.equal(ambientFor({ locationType: 'city' }), 0, 'в городе всегда видно');
  assert.ok(Math.abs(ambientFor({ locationType: 'unknown', style: 'stone' }) - 0.58) < 1e-9, 'без пресета работает стиль');
});

