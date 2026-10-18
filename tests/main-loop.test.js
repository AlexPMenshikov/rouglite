'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, GAME_SCRIPTS } = require('./helpers/sandbox');

// Точка входа браузера: DOMContentLoaded поднимает игру, а кадр цикла решает,
// нужна ли перерисовка. Кадры запрашиваются через requestAnimationFrame,
// поэтому тест сам запускает loop, как браузер запускает следующий кадр.

function mainSandbox() {
  const { sandbox, documentListeners } = createSandbox({ scripts: [...GAME_SCRIPTS, 'main.js'] });
  const frames = [];
  sandbox.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };
  const draws = [];
  const attached = [];
  const messages = [];
  let initCalled = 0;
  let iconsRefreshed = 0;
  let reconnected = 0;
  let assetsCallback = null;
  sandbox.RK.Render = {
    resizeCanvas() {},
    draw() { draws.push(1); },
    hasVisibleBoss: () => false,
  };
  sandbox.RK.Input = { attach(canvas) { attached.push(canvas); } };
  sandbox.RK.Assets = {
    init(callback) { assetsCallback = callback; },
    source: () => 'builtin',
    enabled: () => false,
  };
  sandbox.RK.Network = { reconnect() { reconnected += 1; } };
  sandbox.RK.UI.init = () => { initCalled += 1; };
  sandbox.RK.UI.refreshTilesetControl = (message) => messages.push(message);
  sandbox.RK.UI.refreshIcons = () => { iconsRefreshed += 1; };
  sandbox.RK.UI.show = (screen) => messages.push(screen);
  return { sandbox, documentListeners, frames, draws, attached, messages, assets: () => assetsCallback, state: () => ({ initCalled, iconsRefreshed, reconnected }) };
}

test('DOMContentLoaded builds the canvas and starts the frame loop', () => {
  const helpers = mainSandbox();
  const { sandbox, documentListeners, frames, attached, messages, state } = helpers;

  documentListeners.DOMContentLoaded();

  assert.equal(attached.length, 1);
  assert.equal(attached[0], sandbox.document.getElementById('game'), 'canvas берётся из разметки');
  assert.equal(frames.length, 1, 'цикл запрошен сразу');
  assert.equal(state().initCalled, 1);

  helpers.assets()();

  assert.equal(state().reconnected, 1, 'после спрайтов пробуем восстановить сессию');
  assert.equal(state().iconsRefreshed, 1, 'иконки кнопок перерисовываются после спрайтов');
  assert.equal(messages[0], 'Встроенные тайлы включены.');
  assert.equal(messages[1], 'menu', 'после загрузки открывается меню');
  assert.equal(helpers.draws.length, 1, 'первый кадр отрисован');
});

test('tileset message follows the loaded source and the setting', () => {
  const helpers = mainSandbox();
  helpers.documentListeners.DOMContentLoaded();
  const { sandbox, messages } = helpers;

  sandbox.RK.Assets.source = () => 'external';
  sandbox.RK.Assets.enabled = () => true;
  helpers.assets()();
  assert.equal(messages[0], 'Внешний тайлсет включён.');

  sandbox.RK.Assets.source = () => 'builtin';
  helpers.assets()();
  assert.equal(messages[2], 'Тайлсет не найден — используются встроенные тайлы.');
});

test('frame loop redraws only while something animates', () => {
  const helpers = mainSandbox();
  const { sandbox, frames, draws } = helpers;
  helpers.documentListeners.DOMContentLoaded();
  helpers.assets()();

  let effectActive = false;
  let walking = false;
  let bossVisible = false;
  sandbox.RK.Effects.active = () => effectActive;
  sandbox.RK.Combat.tickWalk = () => walking;
  sandbox.RK.Render.hasVisibleBoss = () => bossVisible;
  sandbox.RK.Map = { torches: [], traps: [], decorations: [] };
  sandbox.RK.GAME = {};
  const step = () => frames[frames.length - 1](16);

  const drawCount = () => draws.length;
  step();
  assert.equal(drawCount(), 1, 'спокойная сцена не перерисовывается');

  sandbox.RK.Map.torches = [{}];
  step();
  assert.equal(drawCount(), 2, 'факелы требуют кадра');
  sandbox.RK.Map.torches = [];

  sandbox.RK.Map.traps = [{ state: 'armed' }];
  step();
  assert.equal(drawCount(), 3, 'вооружённая ловушка анимируется');
  sandbox.RK.Map.traps = [{ state: 'disarmed' }];
  step();
  assert.equal(drawCount(), 3, 'обезвреженная ловушка статична');

  sandbox.RK.Map.decorations = [{ asset: 'decorLake' }];
  step();
  assert.equal(drawCount(), 4, 'озеро анимируется');
  sandbox.RK.Map.decorations = [{ asset: 'decorStream' }];
  step();
  assert.equal(drawCount(), 5, 'ручей анимируется');
  sandbox.RK.Map.decorations = [{ asset: 'decorStone' }];
  step();
  assert.equal(drawCount(), 5, 'камень статичен');

  bossVisible = true;
  step();
  assert.equal(drawCount(), 6, 'видимый босс требует кадра');
  bossVisible = false;

  effectActive = true;
  step();
  assert.equal(drawCount(), 7, 'активные эффекты требуют кадра');
  effectActive = false;

  walking = true;
  step();
  assert.equal(drawCount(), 8, 'анимация шага требует кадра');
  walking = false;

  step();
  assert.equal(drawCount(), 8, 'после остановки кадры больше не нужны');
});
