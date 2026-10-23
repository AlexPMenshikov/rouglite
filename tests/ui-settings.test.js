'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, Element } = require('./helpers/sandbox');

// Настройки переключаются кликами по разметке, которую ui.init() сам находит
// (getElementById в песочнице создаёт элемент по любому id), поэтому разметку
// писать вручную не нужно — только элементы, в которые ui.js пишет.

function settingsContext() {
  const { sandbox, elements } = createSandbox({ ui: true });
  const ui = sandbox.RK.UI;
  const volumeCalls = [];
  const zoomChanges = [];
  const tilesetCalls = [];
  const statCalls = [];
  const messages = [];

  sandbox.RK.Audio = {
    getVolume() { return 0.5; },
    setVolume(value) { volumeCalls.push(value); },
    setEnabled() {},
    isEnabled() { return true; },
  };
  sandbox.RK.Render = {
    zoomIn() { zoomChanges.push('in'); },
    zoomOut() { zoomChanges.push('out'); },
    getMode: () => 'graphics',
    setMode: () => true,
    invalidateFloorLayer: () => {},
    draw() {},
  };
  sandbox.RK.Assets = {
    _enabled: true,
    enabled() { return this._enabled; },
    setEnabled(enabled, done) { this._enabled = !!enabled; tilesetCalls.push(enabled); if (done) done(null, false); },
  };
  sandbox.RK.Combat = {
    setPlayerStats(stats) { statCalls.push(stats); return true; },
  };
  return { sandbox, ui, elements, volumeCalls, zoomChanges, tilesetCalls, statCalls };
}

function labelOf(element) {
  const label = element.children.find((child) => child.className === 'btn-label');
  return label ? label.textContent : null;
}

function textOf(element) {
  return element.textContent || '';
}

test('ui.init подключает все панели настроек и не роняет игру без разметки', () => {
  const { ui } = settingsContext();
  assert.doesNotThrow(() => ui.init(), 'init не требует ручной разметки');
});

test('обычное сообщение лога скрыто, важные regex-сообщения видны', () => {
  const { ui, elements } = settingsContext();
  elements.set('log', new Element());
  elements.set('debug-log', new Element());
  for (const id of ['btn-play', 'btn-class-select-back', 'btn-class-select-start',
    'btn-host-room', 'btn-join-room', 'btn-start-coop']) {
    elements.set(id, new Element('button'));
  }
  elements.set('map-size', new Element('select'));
  elements.set('map-style', new Element('select'));
  ui.init();

  const log = elements.get('log');
  const toggle = elements.get('debug-log');

  ui.msg('Игрок пошёл на север');
  assert.equal(log.children.length, 0, 'обычное сообщение без DEBUG скрыто');

  ui.msg('Игрок достиг уровня 2');
  assert.equal(log.children.length, 1, 'важное сообщение попадает в лог сразу');

  toggle.checked = true;
  toggle.listeners.change();
  ui.msg('Игрок пошёл на восток');
  assert.equal(log.children.length, 2, 'при DEBUG обычный текст появляется');

  toggle.checked = false;
  toggle.listeners.change();
  ui.msg('Игрок пошёл на запад');
  assert.equal(log.children.length, 2, 'выключение DEBUG снова скрывает обычный текст');
});

test('ползунок громкости читает и записывает через setVolume/getVolume', () => {
  const { ui, elements, volumeCalls, messages } = settingsContext();
  const slider = new Element('input');
  slider.value = '50';
  elements.set('audio-volume', slider);
  elements.set('audio-volume-label', new Element());
  for (const id of ['btn-play', 'btn-class-select-back', 'btn-class-select-start',
    'btn-host-room', 'btn-join-room', 'btn-start-coop']) {
    elements.set(id, new Element('button'));
  }
  elements.set('map-size', new Element('select'));
  elements.set('map-style', new Element('select'));
  ui.init();

  assert.equal(slider.value, '50', 'ползунок стартует с текущей громкости');

  slider.listeners.change.call(slider);
  assert.equal(volumeCalls[volumeCalls.length - 1], 0.5, 'изменение ползунка записывает значение');

  slider.value = '80';
  slider.listeners.change.call(slider);
  assert.equal(volumeCalls[volumeCalls.length - 1], 0.8, 'новая громкость уходит в setVolume');
  assert.match(textOf(elements.get('audio-volume-label')), /Громкость: 80%/, 'подпись обновляется');
});

test('кнопки зума вызывают zoomIn и zoomOut', () => {
  const { ui, elements, zoomChanges } = settingsContext();
  elements.set('btn-zoom-in', new Element('button'));
  elements.set('btn-zoom-out', new Element('button'));
  for (const id of ['btn-play', 'btn-class-select-back', 'btn-class-select-start',
    'btn-host-room', 'btn-join-room', 'btn-start-coop']) {
    elements.set(id, new Element('button'));
  }
  elements.set('map-size', new Element('select'));
  elements.set('map-style', new Element('select'));
  ui.init();

  elements.get('btn-zoom-in').listeners.click();
  elements.get('btn-zoom-in').listeners.click();
  elements.get('btn-zoom-out').listeners.click();

  assert.deepEqual(zoomChanges, ['in', 'in', 'out'], 'каждая кнопка зума дергает рендер');
});

test('переключатель тайлсета звонит в Assets.setEnabled и обновляет галочку', () => {
  const { ui, elements, tilesetCalls } = settingsContext();
  const toggle = new Element('input');
  toggle.checked = true;
  elements.set('tileset-enabled', toggle);
  elements.set('tileset-status', new Element());
  for (const id of ['btn-play', 'btn-class-select-back', 'btn-class-select-start',
    'btn-host-room', 'btn-join-room', 'btn-start-coop']) {
    elements.set(id, new Element('button'));
  }
  elements.set('map-size', new Element('select'));
  elements.set('map-style', new Element('select'));
  ui.init();

  toggle.checked = false;
  toggle.listeners.change();
  assert.deepEqual(tilesetCalls, [false], 'снятие галочки выключает тайлсет');
  assert.equal(toggle.checked, false, 'галочка сохраняет выбранное');
});

test('форма статов вызывает Combat.setPlayerStats с введёнными числами', () => {
  const { ui, elements, statCalls } = settingsContext();
  const hp = new Element('input');
  hp.value = '40';
  const maxHp = new Element('input');
  maxHp.value = '60';
  const atk = new Element('input');
  atk.value = '5';
  const def = new Element('input');
  def.value = '3';
  elements.set('debug-hp', hp);
  elements.set('debug-max-hp', maxHp);
  elements.set('debug-atk', atk);
  elements.set('debug-def', def);
  elements.set('debug-stats-form', new Element());
  for (const id of ['btn-play', 'btn-class-select-back', 'btn-class-select-start',
    'btn-host-room', 'btn-join-room', 'btn-start-coop']) {
    elements.set(id, new Element('button'));
  }
  elements.set('map-size', new Element('select'));
  elements.set('map-style', new Element('select'));
  ui.init();

  const form = elements.get('debug-stats-form');
  form.listeners.submit.call(form, { preventDefault() {} });
  const stats = statCalls[0];
  assert.equal(stats.hp, 40);
  assert.equal(stats.maxHp, 60);
  assert.equal(stats.atk, 5);
  assert.equal(stats.def, 3);
});

test('настройки показывают текущие характеристики героя', () => {
  const { ui, elements, sandbox } = settingsContext();
  const player = { hp: 12, maxHp: 30, atk: 7, def: 4 };
  sandbox.RK.GAME = { player, players: [player], over: false, turn: 0 };
  ui.init();

  ui.show('settings');

  assert.equal(elements.get('debug-hp').value, '12');
  assert.equal(elements.get('debug-max-hp').value, '30');
  assert.equal(elements.get('debug-atk').value, '7');
  assert.equal(elements.get('debug-def').value, '4');
});

test('в сетевой комнате форма отладки выключена: характеристики задаёт сервер', () => {
  const { ui, elements, sandbox } = settingsContext();
  const player = { hp: 12, maxHp: 30, atk: 7, def: 4 };
  sandbox.RK.GAME = { player, players: [player], over: false, turn: 0 };
  sandbox.RK.Network = { inRoom: () => true };
  ui.init();

  ui.show('settings');

  assert.equal(elements.get('debug-hp').disabled, true, 'поля не правятся в сетевой комнате');
  assert.equal(elements.get('btn-debug-apply').disabled, true, 'кнопка применения выключена');
  assert.match(textOf(elements.get('debug-stats-hint')), /сервер/i);
});

test('качество эффектов и тряска сохраняются в Meta', () => {
  const { ui, elements, sandbox } = settingsContext();
  ui.init();
  ui.show('settings');

  const group = elements.get('effects-quality-options');
  const off = group.children.find((button) => labelOf(button) === 'Выкл.');
  assert.ok(off, 'кнопка выключения эффектов есть');
  off.listeners.click();
  assert.equal(sandbox.RK.Meta.data.effectsQuality, 'off', 'качество записано');

  const shake = elements.get('screen-shake');
  shake.checked = false;
  shake.listeners.change.call(shake);
  assert.equal(sandbox.RK.Meta.data.screenShake, false, 'тряска записана');
  assert.equal(sandbox.localStorage.getItem(sandbox.RK.CONFIG.META_KEY).includes('"screenShake":false'), true, 'настройка ушла в localStorage');
});
