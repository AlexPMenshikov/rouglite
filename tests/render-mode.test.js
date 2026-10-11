const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

function createRenderContext(savedMeta) {
  const stored = new Map();
  if (savedMeta) stored.set('rogalite_meta_v1', JSON.stringify(savedMeta));
  const glyphs = [];
  const dashOffsets = [];
  let time = 0;
  const gradient = { addColorStop() {} };
  const canvasContext = new Proxy({
    fillRect() {},
    fill() {},
    fillText(glyph) { glyphs.push(glyph); },
    save() {},
    restore() {},
    translate() {},
    createRadialGradient() { return gradient; },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    stroke() {
      if (this.getLineDash().length) dashOffsets.push(this.lineDashOffset);
    },
    setLineDash(lines) { this.currentLineDash = lines; },
    getLineDash() { return this.currentLineDash || []; },
  }, {
    get(target, property) {
      return property in target ? target[property] : () => {};
    },
  });
  const canvas = {
    width: 64,
    height: 64,
    getContext() { return canvasContext; },
  };
  const document = {
    getElementById(id) { return id === 'game' ? canvas : null; },
    createElement() { return canvas; },
  };
  const sandbox = {
    document,
    localStorage: {
      getItem(key) { return stored.has(key) ? stored.get(key) : null; },
      setItem(key, value) { stored.set(key, value); },
    },
    performance: { now: () => time },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  for (const file of ['config.js', 'meta.js', 'render.js']) {
    const source = fs.readFileSync(path.join(projectRoot, 'js', file), 'utf8');
    vm.runInContext(source, sandbox, { filename: file });
  }
  sandbox.RK.Meta.load();
  sandbox.RK.CONFIG.COLS = 2;
  sandbox.RK.CONFIG.ROWS = 2;
  sandbox.RK.Assets = {};
  sandbox.RK.Effects = { draw() {} };
  return { sandbox, stored, glyphs, dashOffsets, setTime(value) { time = value; } };
}

test('display mode defaults to graphics and rejects invalid saved values', () => {
  const { sandbox: defaults } = createRenderContext();
  assert.equal(defaults.RK.Render.getMode(), 'graphics');
  assert.equal(defaults.RK.Render.setMode('vector'), false);
  assert.equal(defaults.RK.Render.getMode(), 'graphics');
  const { sandbox: invalidPreference } = createRenderContext({ renderMode: 'vector' });
  assert.equal(invalidPreference.RK.Render.getMode(), 'graphics');
});

test('display mode loads the saved ASCII choice and saves changes', () => {
  const { sandbox, stored } = createRenderContext({ renderMode: 'ascii' });
  assert.equal(sandbox.RK.Render.getMode(), 'ascii');
  assert.equal(sandbox.RK.Render.setMode('graphics'), true);
  assert.equal(JSON.parse(stored.get('rogalite_meta_v1')).renderMode, 'graphics');
});

test('ASCII mode draws terrain and visible game objects as glyphs', () => {
  const { sandbox, glyphs } = createRenderContext();
  const player = { id: 'player', x: 0, y: 0, hp: 10 };
  const map = {
    w: 2,
    h: 2,
    tiles: [[1, 0], [1, 1]],
    vis: [[true, true], [true, false]],
    explored: [[true, true], [true, true]],
    doors: [],
    chests: [],
    traps: [],
    torches: [],
  };
  sandbox.RK.Map = map;
  sandbox.RK.GAME = {
    player,
    players: [player],
    items: [{ kind: 'gold', type: 'gold', x: 0, y: 1 }],
    enemies: [
      { type: 'rat', x: 1, y: 0, alive: true },
      { type: 'demon', x: 1, y: 1, alive: true },
    ],
  };
  sandbox.RK.Combat = { getDrawPos: () => player };
  sandbox.RK.Network = { focusPlayer: () => player };
  sandbox.RK.Render.setMode('ascii');
  assert.ok(glyphs.includes('#'));
  assert.ok(glyphs.includes('.'));
  assert.ok(glyphs.includes('$'));
  assert.ok(glyphs.includes('r'));
  assert.ok(glyphs.includes('@'));
  assert.ok(!glyphs.includes('D'));
});

test('trap descriptions are shown only while the trap tile is visible', () => {
  const { sandbox } = createRenderContext();
  sandbox.RK.GAME = { enemies: [], items: [] };
  sandbox.RK.Map = {
    w: 2,
    h: 1,
    vis: [[true, false]],
    traps: [
      { x: 0, y: 0, type: 'flame', state: 'armed' },
      { x: 1, y: 0, type: 'needle', state: 'armed' },
    ],
    doors: [],
    chests: [],
  };

  assert.equal(
    sandbox.RK.Render.getHoverInfo({ x: 0, y: 0 }),
    'Огненная ловушка\nНажмите L, чтобы обезвредить',
  );
  assert.equal(sandbox.RK.Render.getHoverInfo({ x: 1, y: 0 }), '');

  sandbox.RK.Map.traps[0].state = 'disarmed';
  assert.equal(
    sandbox.RK.Render.getHoverInfo({ x: 0, y: 0 }),
    'Огненная ловушка\nОбезврежена',
  );
  sandbox.RK.Map.traps[0].state = 'triggered';
  assert.equal(
    sandbox.RK.Render.getHoverInfo({ x: 0, y: 0 }),
    'Огненная ловушка\nУже сработала',
  );
});

test('graphics mode draws explored lakes and animated streams beneath the player', () => {
  const { sandbox, dashOffsets, setTime } = createRenderContext();
  const player = { id: 'player', x: 0, y: 0, hp: 10 };
  const assetDraws = [];
  sandbox.RK.Assets = {
    draw(_ctx, name, x, y) {
      assetDraws.push({ name, x, y });
      return true;
    },
    drawFloorTile() {},
    floorGrayAmount() { return 0; },
  };
  sandbox.RK.Effects = { draw() {} };
  sandbox.RK.Items = { RARITY_COLORS: { common: '#fff' } };
  sandbox.RK.Entities = { DEFS: {} };
  sandbox.RK.Combat = { getDrawPos: () => player };
  sandbox.RK.Network = { focusPlayer: () => player };
  sandbox.RK.GAME = {
    player,
    players: [player],
    items: [],
    enemies: [],
    floor: 1,
  };
  sandbox.RK.Map = {
    w: 2,
    h: 2,
    tiles: [[1, 1], [1, 1]],
    vis: [[true, false], [false, false]],
    explored: [[true, true], [true, false]],
    decorations: [
      { x: 0, y: 0, asset: 'decorStone' },
      { x: 1, y: 0, asset: 'decorLake' },
      { x: 0, y: 1, asset: 'decorStream', flowIndex: 0 },
      { x: 1, y: 1, asset: 'decorStream', flowIndex: 1 },
    ],
    doors: [],
    chests: [],
    traps: [],
    torches: [],
    zones: [],
    blood: [],
    stair: { x: 1, y: 1, asset: 'stairs' },
  };

  sandbox.RK.Render.draw();
  const firstFlowOffset = dashOffsets[dashOffsets.length - 1];
  setTime(1000);
  sandbox.RK.Render.draw();

  assert.deepEqual(
    assetDraws.filter(({ name }) => name.startsWith('decor')).map(({ name }) => name),
    ['decorStone', 'decorStone'],
  );
  assert.ok(dashOffsets.length >= 2, 'the explored stream should draw an animated current');
  assert.notEqual(dashOffsets[dashOffsets.length - 1], firstFlowOffset);
  assert.ok(
    assetDraws.findIndex(({ name }) => name === 'decorStone') <
      assetDraws.findIndex(({ name }) => name === 'player'),
  );
});
