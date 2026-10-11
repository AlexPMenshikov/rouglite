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
  const canvasContext = {
    fillRect() {},
    fillText(glyph) { glyphs.push(glyph); },
    save() {},
    restore() {},
    translate() {},
  };
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
    performance: { now: () => 0 },
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
  return { sandbox, stored, glyphs };
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
