const assert = require('node:assert/strict');
const test = require('node:test');

const { createRenderSandbox, createSandbox } = require('./helpers/sandbox');

// Рендер рисует в Canvas по размерам из CONFIG, а карта в тестах — 2x2:
// без этого размеры влияют на камеру и набор глифов.
const useTinyMap = (sandbox) => {
  sandbox.RK.CONFIG.COLS = 2;
  sandbox.RK.CONFIG.ROWS = 2;
};

// Спрайты ловушек отсутствуют во внешнем атласе KENNEY_MAP, поэтому
// ensureExtraSprites обязан их достроить: иначе при включённом PNG-тайлсете
// ловушки исчезали, а render.js не рисует для них запасного варианта.
test('every trap sprite render.js asks for is rebuilt when a tileset loads', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'assets.js'] });
  const RK = sandbox.RK;

  const trapSprites = new Set(Object.values(RK.CONFIG.TRAP_SPRITES));
  const fallbacks = new Set(RK.Assets.builtinFallbackNames());
  for (const sprite of trapSprites) {
    assert.ok(fallbacks.has(sprite), `${sprite} must be in the built-in fallback list`);
  }

  // Встроенный набор действительно содержит все спрайты ловушек.
  RK.Assets.setEnabled(false, function () {});
  const built = new Set(RK.Assets.spriteNames());
  for (const sprite of trapSprites) {
    assert.ok(built.has(sprite), `${sprite} should be created by buildBuiltin`);
  }
});

test('display mode defaults to graphics and rejects invalid saved values', () => {
  const { sandbox: defaults } = createRenderSandbox();
  assert.equal(defaults.RK.Render.getMode(), 'graphics');
  assert.equal(defaults.RK.Render.setMode('vector'), false);
  assert.equal(defaults.RK.Render.getMode(), 'graphics');
  const { sandbox: invalidPreference } = createRenderSandbox({ meta: { renderMode: 'vector' } });
  assert.equal(invalidPreference.RK.Render.getMode(), 'graphics');
});

test('display mode loads the saved ASCII choice and saves changes', () => {
  const { sandbox, stored } = createRenderSandbox({ meta: { renderMode: 'ascii' } });
  assert.equal(sandbox.RK.Render.getMode(), 'ascii');
  assert.equal(sandbox.RK.Render.setMode('graphics'), true);
  assert.equal(JSON.parse(stored.get('rogalite_meta_v1')).renderMode, 'graphics');
});

test('ASCII mode draws terrain and visible game objects as glyphs', () => {
  const { sandbox, glyphs } = createRenderSandbox();
  useTinyMap(sandbox);
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
  const { sandbox } = createRenderSandbox();
  useTinyMap(sandbox);
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
  const { sandbox, dashOffsets, setTime } = createRenderSandbox();
  useTinyMap(sandbox);
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
  assert.ok(dashOffsets.some((offset) => offset !== 0), 'the water shader animates multiple ripple and current layers');
  assert.ok(
    assetDraws.findIndex(({ name }) => name === 'decorStone') <
      assetDraws.findIndex(({ name }) => name === 'player'),
  );
});
