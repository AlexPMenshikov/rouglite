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

test('graphics mode swaps walk frames while the hero moves', () => {
  const { sandbox, setTime } = createRenderSandbox();
  useTinyMap(sandbox);
  const player = { id: 'player', x: 0, y: 0, hp: 10, asset: 'playerPaladin' };
  const assetDraws = [];
  sandbox.RK.Assets = {
    draw(_ctx, name) {
      assetDraws.push(name);
      return true;
    },
    drawFloorTile() {},
    floorGrayAmount() { return 0; },
  };
  sandbox.RK.Effects = { draw() {} };
  sandbox.RK.Items = { RARITY_COLORS: { common: '#fff' } };
  sandbox.RK.Entities = { DEFS: {} };
  let pos = { x: 0.4, y: 0.2 };
  sandbox.RK.Combat = { getDrawPos: () => pos };
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

  setTime(0);
  sandbox.RK.Render.draw();
  assert.ok(assetDraws.includes('playerPaladin_walk1'), 'first walk frame');

  assetDraws.length = 0;
  setTime(150);
  sandbox.RK.Render.draw();
  assert.ok(assetDraws.includes('playerPaladin_walk2'), 'second walk frame');

  pos = { x: 0, y: 0 };
  assetDraws.length = 0;
  setTime(300);
  sandbox.RK.Render.draw();
  assert.ok(assetDraws.includes('playerPaladin'), 'idle hero uses the base sprite');
  assert.ok(!assetDraws.some((name) => name.indexOf('_walk') >= 0), 'no walk frame at rest');
});

// Палитра пола выбирается по режиму: в мире — тинт стиля локации,
// в legacy-этажах — палитра по номеру этажа. Оба пути проверяются на одном кадре.
test('палитра пола идёт от стиля локации, а на этаже — от номера этажа', () => {
  const { sandbox } = createRenderSandbox();
  useTinyMap(sandbox);
  const fills = [];
  const create = sandbox.document.createElement.bind(sandbox.document);
  sandbox.document.createElement = (tag) => {
    const element = create(tag);
    // Offscreen-канвас пола красится один раз: его fillStyle и есть палитра.
    element.getContext = () => new Proxy({}, {
      get(target, property) {
        if (property === 'canvas') return null;
        if (property === 'createRadialGradient' || property === 'createLinearGradient') {
          return () => ({ addColorStop() {} });
        }
        if (property in target) return target[property];
        return () => {};
      },
      set(target, property, value) {
        if (property === 'fillStyle') fills.push(value);
        target[property] = value;
        return true;
      },
    });
    return element;
  };

  const player = { id: 'player', x: 0, y: 0, hp: 10 };
  sandbox.RK.Combat = { getDrawPos: () => player };
  sandbox.RK.GAME = { player, players: [player], items: [], enemies: [], floor: 1 };
  const plainMap = () => ({
    w: 2,
    h: 2,
    tiles: [[1, 1], [1, 1]],
    floorTypes: [[0, 0], [0, 0]],
    wallTypes: [[0, 0], [0, 0]],
    regions: [[0, 0], [0, 0]],
    vis: [[true, true], [true, true]],
    explored: [[true, true], [true, true]],
    decorations: [],
    doors: [],
    chests: [],
    traps: [],
    torches: [],
    zones: [],
    blood: [],
  });

  sandbox.RK.Map = Object.assign(plainMap(), {
    style: 'desert', locationType: 'desert', regionStyles: ['desert', 'ruins'],
  });
  sandbox.RK.Render.draw();
  assert.ok(fills.includes('rgba(150,124,84,0.16)'), 'локация берёт тинт своего стиля');

  fills.length = 0;
  sandbox.RK.GAME.floor = 5;
  sandbox.RK.Map = Object.assign(plainMap(), {
    style: 'stone', locationType: null, regionStyles: [],
  });
  sandbox.RK.Render.draw();
  assert.ok(fills.includes('rgba(130,70,118,0.16)'), 'этаж берёт палитру по номеру этажа');
});

// Битый снимок не роняет запекание пола: неизвестный стиль зала берёт стиль
// карты, а индекс палитры вне диапазона — нулевой оттенок.
test('битый стиль зала и индекс палитры не роняют запекание пола', () => {
  const { sandbox } = createRenderSandbox();
  useTinyMap(sandbox);
  const calls = [];
  sandbox.RK.Assets.drawFloorTile = (_ctx, _floor, tile, _visible, _explored, _dx, _dy, _size, styleId, shade) => {
    calls.push({ tile, styleId, shade });
  };

  const player = { id: 'player', x: 0, y: 0, hp: 10 };
  sandbox.RK.Combat = { getDrawPos: () => player };
  sandbox.RK.GAME = { player, players: [player], items: [], enemies: [], floor: 1 };
  sandbox.RK.Map = {
    w: 2,
    h: 2,
    style: 'stone',
    locationType: 'ruins',
    tiles: [[1, 0], [1, 1]],
    floorTypes: [[99, 99], [99, 99]],
    wallTypes: [[99, 99], [99, 99]],
    regions: [[1, 1], [1, 1]],
    regionStyles: ['чужой стиль', '__proto__'],
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

  assert.doesNotThrow(() => sandbox.RK.Render.draw());
  assert.ok(calls.length > 0, 'пол запечён');
  for (const call of calls) {
    assert.equal(call.styleId, 'stone', 'битый стиль зала откатывается к стилю карты');
    assert.equal(call.shade, 0, 'внеиндексный оттенок палитры откатывается к нулевому');
  }
});

// Чёткость отрисовки растит канвас и тайл, но обзор остаётся прежним:
// камера считается в клетках от размера карты, а не от пикселей.
test('чёткость отрисовки увеличивает канвас, не меняя обзор', () => {
  const { sandbox, stored } = createRenderSandbox();
  const C = sandbox.RK.CONFIG;
  const canvas = sandbox.document.getElementById('game');
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

  sandbox.RK.Render.resizeCanvas();
  assert.equal(canvas.width, C.TILE * C.COLS, 'обычная чёткость рисует один пиксель на пиксель');
  assert.equal(canvas.height, C.TILE * C.ROWS);
  sandbox.RK.Render.draw();
  const camera = sandbox.RK.Render.getCameraOffset();

  assert.equal(sandbox.RK.Render.setResolutionScale(2), true);
  assert.equal(sandbox.RK.Render.resolutionScale(), 2);
  assert.equal(canvas.width, C.TILE * C.COLS * 2, 'канвас вырос вдвое');
  assert.equal(canvas.height, C.TILE * C.ROWS * 2);
  assert.equal(sandbox.RK.Render.getTileSize(), Math.round(C.TILE * 2), 'тайл вырос вместе с канвасом');
  const sharpCamera = sandbox.RK.Render.getCameraOffset();
  assert.equal(sharpCamera.x, camera.x, 'сдвиг камеры не изменился');
  assert.equal(sharpCamera.y, camera.y, 'сдвиг камеры не изменился');
  assert.equal(JSON.parse(stored.get(C.META_KEY)).resolutionScale, 2, 'пресет сохранён в Meta');
});

test('чёткость отрисовки применяет сохранённый пресет и отвергает чужой', () => {
  const { sandbox } = createRenderSandbox({ meta: { resolutionScale: 1.5 } });
  assert.equal(sandbox.RK.Render.resolutionScale(), 1.5, 'сохранённый пресет применён');
  assert.equal(sandbox.RK.Render.setResolutionScale(7), false, 'чужого пресета нет');
  assert.equal(sandbox.RK.Render.resolutionScale(), 1.5, 'отказ не сбивает выбранный пресет');
  assert.equal(sandbox.RK.Render.resolutionScales().join(','), '1,1.5,2');

  // Битое значение из чужого сейва не ломает отрисовку: считается обычная чёткость.
  const { sandbox: invalid } = createRenderSandbox({ meta: { resolutionScale: 7 } });
  assert.equal(invalid.RK.Render.resolutionScale(), 1);
});
