'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, startRunAsClass, findOpenNeighbor, GAME_SCRIPTS } = require('./helpers/sandbox');

// Ввод слушает window и canvas, поэтому песочница отдаёт обе группы обработчиков.
// input.js браузерный: грузим его после игровых скриптов.

function inputSandbox() {
  const { sandbox, documentListeners, windowListeners } = createSandbox({
    scripts: [...GAME_SCRIPTS, 'input.js'],
  });
  const RK = sandbox.RK;
  RK.Render = {
    draw() { draws.push(1); },
    getCameraOffset: () => ({ x: 0, y: 0 }),
    getTileSize: () => 16,
    resizeCanvas() {},
  };
  const draws = [];
  const performed = [];
  const shown = [];
  RK.UI.perform = (action, args) => performed.push([action, ...args]);
  RK.UI.showQuestLog = () => shown.push('questlog');
  RK.UI.show = (screen) => shown.push(screen);
  const canvas = sandbox.document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 192;
  RK.Input.attach(canvas);
  return { sandbox, documentListeners, windowListeners, canvas, performed, shown, draws };
}

function keyEvent(sandbox, options) {
  return Object.assign({
    target: sandbox.document.createElement('div'),
    preventDefault() {},
  }, options);
}

function press(windowListeners, sandbox, options) {
  windowListeners.keydown(keyEvent(sandbox, options));
}

// Тайл в координаты мыши: input.js считает позицию через размер канваса и его rect.
// Ширина и высота масштабируются независимо.
function clientFor(tile, canvas, rect) {
  return {
    x: ((tile.x + 0.5) * 16) / (canvas.width / rect.width),
    y: ((tile.y + 0.5) * 16) / (canvas.height / rect.height),
  };
}

test('WASD, arrows and numpad move the hero', () => {
  const { sandbox, windowListeners, performed } = inputSandbox();
  startRunAsClass(sandbox.RK, 'paladin');

  press(windowListeners, sandbox, { code: 'KeyW' });
  press(windowListeners, sandbox, { code: 'ArrowUp' });
  press(windowListeners, sandbox, { code: 'Numpad8' });
  press(windowListeners, sandbox, { code: 'KeyS' });
  press(windowListeners, sandbox, { code: 'Numpad2' });
  press(windowListeners, sandbox, { code: 'KeyA' });
  press(windowListeners, sandbox, { code: 'Numpad4' });
  press(windowListeners, sandbox, { code: 'KeyD' });
  press(windowListeners, sandbox, { code: 'Numpad6' });
  press(windowListeners, sandbox, { code: 'Numpad7' });
  press(windowListeners, sandbox, { code: 'Numpad9' });
  press(windowListeners, sandbox, { code: 'Numpad1' });
  press(windowListeners, sandbox, { code: 'Numpad3' });

  assert.deepEqual(
    performed.map(([action, ...args]) => args),
    [[0, -1], [0, -1], [0, -1], [0, 1], [0, 1], [-1, 0], [-1, 0], [1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]],
    'каждый код клавиши переводится в направление',
  );
});

test('hotkeys map to game actions', () => {
  const { sandbox, windowListeners, performed, shown } = inputSandbox();
  startRunAsClass(sandbox.RK, 'paladin');
  shown.length = 0;

  press(windowListeners, sandbox, { code: 'Numpad5' });
  press(windowListeners, sandbox, { code: 'Period' });
  press(windowListeners, sandbox, { key: '.', code: 'KeyP' });
  press(windowListeners, sandbox, { code: 'KeyR' });
  press(windowListeners, sandbox, { code: 'KeyC' });
  press(windowListeners, sandbox, { code: 'KeyE' });
  press(windowListeners, sandbox, { code: 'KeyQ' });
  press(windowListeners, sandbox, { code: 'KeyL' });
  press(windowListeners, sandbox, { code: 'KeyF' });
  press(windowListeners, sandbox, { code: 'Digit1' });
  press(windowListeners, sandbox, { code: 'Digit2' });
  press(windowListeners, sandbox, { code: 'Digit3' });
  press(windowListeners, sandbox, { code: 'KeyJ' });

  assert.deepEqual(
    performed.map(([action, ...args]) => [action, ...args]),
    [
      ['skipTurn'],
      ['skipTurn'],
      ['skipTurn'],
      ['usePotion'],
      ['campRest'],
      ['interact', 'use'],
      ['activateClassSkill'],
      ['interact', 'pick'],
      ['interact', 'force'],
      ['activateClassSkill', 'basic'],
      ['activateClassSkill', 'advanced'],
      ['activateClassSkill', 'master'],
    ],
  );
  assert.deepEqual(shown, ['questlog']);
});

test('Escape opens the menu only in the debug room', () => {
  const { sandbox, windowListeners, shown } = inputSandbox();
  startRunAsClass(sandbox.RK, 'paladin');
  shown.length = 0;

  press(windowListeners, sandbox, { code: 'Escape' });
  assert.deepEqual(shown, [], 'в обычной игре Esc ничего не делает');

  sandbox.RK.GAME.sceneKind = 'debug';
  press(windowListeners, sandbox, { code: 'Escape' });
  assert.deepEqual(shown, ['menu']);
});

test('keys are ignored on an input field and on a hidden game screen', () => {
  const { sandbox, windowListeners, performed } = inputSandbox();
  startRunAsClass(sandbox.RK, 'paladin');

  press(windowListeners, sandbox, { code: 'KeyW', target: sandbox.document.createElement('input') });
  assert.deepEqual(performed, [], 'в поле ввода ход не отправляется');

  sandbox.document.getElementById('screen-game').classList.add('hidden');
  press(windowListeners, sandbox, { code: 'KeyW' });
  assert.deepEqual(performed, [], 'на скрытом экране ход не отправляется');
});

test('mouse hover marks the tile under the cursor and the path to it', () => {
  const { sandbox, canvas, draws } = inputSandbox();
  const player = startRunAsClass(sandbox.RK, 'paladin');
  const neighbor = findOpenNeighbor(sandbox.RK);
  const tile = { x: player.x + neighbor[0], y: player.y + neighbor[1] };
  const client = clientFor(tile, canvas, canvas.getBoundingClientRect());
  const drawsBefore = draws.length;

  canvas.listeners.mousemove({ clientX: client.x, clientY: client.y });

  assert.equal(sandbox.RK.hover.x, tile.x);
  assert.equal(sandbox.RK.hover.y, tile.y);
  assert.equal(sandbox.RK.hoverPath.length, 1, 'соседняя клетка — один шаг');
  assert.equal(sandbox.RK.hoverPath[0].x, tile.x);
  assert.equal(sandbox.RK.hoverPath[0].y, tile.y);
  assert.equal(sandbox.RK.hoverPointer.x, client.x);
  assert.equal(sandbox.RK.hoverPointer.y, client.y);
  assert.ok(draws.length > drawsBefore, 'отрисовка обновляется на движение мыши');

  canvas.listeners.mouseleave();
  assert.equal(sandbox.RK.hover, null);
  assert.equal(sandbox.RK.hoverPath, null);
});

test('click walks to a walkable tile and casts a spell when one is armed', () => {
  const { sandbox, canvas, performed } = inputSandbox();
  const player = startRunAsClass(sandbox.RK, 'paladin');
  const neighbor = findOpenNeighbor(sandbox.RK);
  const target = { x: player.x + neighbor[0], y: player.y + neighbor[1] };
  const client = clientFor(target, canvas, canvas.getBoundingClientRect());

  canvas.listeners.click({ clientX: client.x, clientY: client.y });
  assert.deepEqual(performed, [['playerAction', target.x, target.y]]);

  performed.length = 0;
  player.pendingSpell = 'fireball';
  canvas.listeners.click({ clientX: client.x, clientY: client.y });
  assert.deepEqual(performed, [['castMageSpell', 'fireball', target.x, target.y]]);
});

test('click on a wall or outside the map is ignored', () => {
  const { sandbox, canvas, performed } = inputSandbox();
  startRunAsClass(sandbox.RK, 'paladin');

  canvas.listeners.click({ clientX: -50, clientY: -50 });
  assert.deepEqual(performed, [], 'вне карты клика нет');

  const wall = findWall(sandbox.RK);
  const client = clientFor(wall, canvas, canvas.getBoundingClientRect());
  canvas.listeners.click({ clientX: client.x, clientY: client.y });
  assert.deepEqual(performed, [], 'стена не проходима');
});

test('clicks are blocked when the run is over', () => {
  const { sandbox, canvas, performed } = inputSandbox();
  const player = startRunAsClass(sandbox.RK, 'paladin');
  sandbox.RK.GAME.over = true;
  const neighbor = findOpenNeighbor(sandbox.RK);
  const target = { x: player.x + neighbor[0], y: player.y + neighbor[1] };
  const client = clientFor(target, canvas, canvas.getBoundingClientRect());

  canvas.listeners.click({ clientX: client.x, clientY: client.y });
  assert.deepEqual(performed, [], 'финальный экран не принимает ходы');
});

function findWall(RK) {
  for (let y = 0; y < RK.Map.h; y += 1) {
    for (let x = 0; x < RK.Map.w; x += 1) {
      if (RK.Map.tiles[y][x] !== 1) return { x, y };
    }
  }
  throw new Error('findWall: в карте нет стены');
}
