'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createRenderSandbox, createSandbox, Element } = require('./helpers/sandbox');

// Поворот камеры живёт рядом с зумом: угол хранится в Meta, а вид сетки в
// изометрии поворачивается вместе с ним. Восемь положений по 45°. Остальные
// виды не поворачиваются: окно обзора у них не квадратное.

test('угол поворота камеры меняется по кругу и сохраняется', () => {
  const { sandbox, stored } = createRenderSandbox();
  const Render = sandbox.RK.Render;

  assert.equal(Render.getCameraAngle(), 0, 'изначально камера смотрит прямо');

  Render.rotateCamera(45);
  assert.equal(Render.getCameraAngle(), 45, 'поворот вправо добавляет восьмую оборота');
  Render.rotateCamera(-45);
  assert.equal(Render.getCameraAngle(), 0, 'поворот влево возвращает обратно');
  Render.rotateCamera(-45);
  assert.equal(Render.getCameraAngle(), 315, 'угол не уходит в минус');

  Render.setCameraAngle(30);
  assert.equal(Render.getCameraAngle(), 45, 'угол округляется к ближайшей восьмой');
  Render.setCameraAngle(100);
  assert.equal(Render.getCameraAngle(), 90);
  Render.setCameraAngle(200);
  assert.equal(Render.getCameraAngle(), 180);

  assert.equal(JSON.parse(stored.get(sandbox.RK.CONFIG.META_KEY)).cameraAngle, 180);
});

test('между положениями камера доворачивается плавно', () => {
  const { sandbox, setTime } = createRenderSandbox();
  const Render = sandbox.RK.Render;

  setTime(0);
  Render.setCameraAngle(90);
  assert.equal(Render.getCameraViewAngle(), 0, 'переход начался со старого угла');
  assert.equal(Render.isAnimating(), true);

  setTime(160);
  const middle = Render.getCameraViewAngle();
  assert.ok(middle > 0 && middle < 90, 'в середине перехода угол промежуточный');
  assert.equal(Render.isAnimating(), true);

  setTime(4000);
  assert.equal(Render.getCameraViewAngle(), 90, 'переход заканчивается новым углом');
  assert.equal(Render.isAnimating(), false);
});

test('сохранённый угол переживает перезапуск', () => {
  const { sandbox } = createRenderSandbox({ meta: { cameraAngle: 90 } });

  assert.equal(sandbox.RK.Meta.data.cameraAngle, 90);
  assert.equal(sandbox.RK.Render.getCameraAngle(), 90, 'угол из сейва применяется при загрузке');
});

test('сохранённый чужой угол округляется к ближайшей восьмой', () => {
  const { sandbox } = createRenderSandbox({ meta: { cameraAngle: 200 } });

  assert.equal(sandbox.RK.Render.getCameraAngle(), 180);
});

/** Песочница с канвасом, который запоминает вызовы отрисовки. */
function isoSandbox() {
  const { sandbox, setTime } = createRenderSandbox();
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
  return { sandbox, calls, wallSprite, setTime };
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

test('изометрия ищет клетку по своей точке при любом угле', () => {
  const { sandbox, setTime } = isoSandbox();
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

  for (const angle of [0, 45, 90, 135, 180, 225, 270, 315]) {
    sandbox.RK.Render.setCameraAngle(angle);
    setTime(1000 + angle);
    sandbox.RK.Render.draw();

    const view = sandbox.RK.Views.iso;
    view.setup({ zoom: 1, scale: 1, width: 1920, height: 1056, angle });
    view.setCamera(player);

    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const point = view.point(x + 0.5, y + 0.5);
        const tile = view.pick(point.x, point.y);
        assert.equal(tile.x, x, `при угле ${angle} клетка ${x},${y} ищется по своей точке`);
        assert.equal(tile.y, y);
      }
    }
  }
});

test('поворот меняет, кто перед кем: у стены меняется передний сосед', () => {
  const { sandbox, calls, wallSprite, setTime } = isoSandbox();
  // Стена в клетке (1, 1). Соседи (1, 0) и (1, 2) меняются местами при повороте:
  // глубина клетки считается по другой оси сетки.
  const map = makeMap([
    '.......',
    '.......',
    '.......',
  ]);
  map.tiles[1][1] = 0;
  const player = { id: 'player', x: 0, y: 0, hp: 10 };
  const above = { id: 'above', type: 'slime', asset: 'slime', alive: true, x: 1, y: 0, hp: 5, maxHp: 5, atk: 1 };
  const below = { id: 'below', type: 'rat', asset: 'rat', alive: true, x: 1, y: 2, hp: 5, maxHp: 5, atk: 1 };
  setupScene(sandbox, map, player, [above, below]);
  sandbox.RK.Render.setMode('iso');

  const order = () => {
    calls.length = 0;
    sandbox.RK.Render.draw();
    const at = (kind, sprite) => calls.findIndex((call) => call.kind === kind && call.sprite === sprite);
    const named = (name) => calls.findIndex((call) => call.kind === 'sprite' && call.name === name);
    return { wallAt: at('iso', wallSprite), aboveAt: named('slime'), belowAt: named('rat') };
  };

  const straight = order();
  assert.ok(straight.aboveAt < straight.wallAt, 'без поворота верхний сосед за стеной');
  assert.ok(straight.belowAt > straight.wallAt, 'нижний сосед перед стеной');

  sandbox.RK.Render.setCameraAngle(90);
  setTime(1000);
  const turned = order();
  assert.ok(turned.belowAt < turned.wallAt, 'после поворота нижний сосед оказался за стеной');
  assert.ok(turned.aboveAt > turned.wallAt, 'после поворота верхний сосед оказался перед стеной');
});

test('кнопки поворота зовут рендер, а в чужом виде объясняют, где поворот работает', () => {
  const { sandbox, elements } = createSandbox({ ui: true });
  const calls = [];
  sandbox.RK.Render = {
    rotateCamera(delta) { calls.push(delta); },
    supportsRotation: () => true,
    getCameraAngle: () => 0,
    getMode: () => 'iso',
    draw() {},
    hasVisibleBoss: () => false,
    getCameraOffset: () => ({ x: 0, y: 0 }),
  };
  elements.set('btn-rotate-left', new Element('button'));
  elements.set('btn-rotate-right', new Element('button'));
  sandbox.RK.UI.init();

  elements.get('btn-rotate-left').listeners.click();
  elements.get('btn-rotate-right').listeners.click();

  assert.deepEqual(calls, [-45, 45], 'левая кнопка крутит влево, правая — вправо');

  // Вид без поворота: кнопка не крутит камеру, а говорит, где она работает.
  calls.length = 0;
  const messages = [];
  sandbox.RK.UI.msg = (text) => messages.push(text);
  sandbox.RK.Render.supportsRotation = () => false;

  elements.get('btn-rotate-left').listeners.click();

  assert.deepEqual(calls, [], 'в чужом виде камера не крутится');
  assert.equal(messages.length, 1, 'игрок получает объяснение');
  assert.match(messages[0], /изометр/);
});
