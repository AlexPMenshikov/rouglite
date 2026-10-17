'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, Element } = require('./helpers/sandbox');

function loot(name) {
  return { name, kind: 'loot', rarity: 'common', count: 1, value: 10 };
}

// Хранилище проверяется на стабе RK.Combat: экран только показывает содержимое
// и зовёт действие по индексу, а сам перенос считает движок.
function createStorageContext({ backpack = [], stored = [], far = false } = {}) {
  const { sandbox, elements } = createSandbox({ ui: true });
  const RK = sandbox.RK;
  const calls = [];
  const chest = { x: 1, y: 1, storage: true, items: stored.slice() };
  RK.GAME = {
    player: { x: 2, y: 1, gold: 10, hp: 5, maxHp: 20, atk: 10, backpack: backpack.slice() },
  };
  RK.Combat = {
    localPlayerId: () => 'local',
    nearestStorage: () => (far ? null : chest),
    // refresh() рисует HUD: без зон и модификаторов экран не обновить.
    getZoneMods: () => ({ atkBonus: 0, defBonus: 0 }),
    getZoneAt: () => null,
    storeInChest(index) {
      calls.push(['storeInChest', index]);
      chest.items.push(RK.GAME.player.backpack.splice(index, 1)[0]);
      return true;
    },
    takeFromChest(index) {
      calls.push(['takeFromChest', index]);
      RK.GAME.player.backpack.push(chest.items.splice(index, 1)[0]);
      return true;
    },
  };
  return { ui: RK.UI, elements, RK, chest, calls };
}

function rowsOf(elements, id) {
  return elements.get(id).children;
}

function buttonOf(row) {
  return row.children.find((child) => child.tagName === 'BUTTON');
}

function hidden(element) {
  return element.className.split(/\s+/).includes('hidden');
}

test('the storage screen exchanges items between the backpack and the chest', () => {
  const { ui, elements, calls } = createStorageContext({
    backpack: [loot('Меч'), loot('Зелье')],
    stored: [loot('Щит')],
  });

  ui.showStorage();

  assert.equal(ui.screen(), 'storage');
  assert.equal(hidden(elements.get('screen-storage')), false, 'экран хранилища показан');
  const backpackRows = rowsOf(elements, 'storage-backpack-list');
  assert.equal(backpackRows.length, 2);
  assert.match(backpackRows[0].textContent, /Меч/);
  assert.equal(buttonOf(backpackRows[0]).textContent, 'Положить');
  assert.equal(buttonOf(backpackRows[0]).disabled, false);

  const chestRows = rowsOf(elements, 'storage-chest-list');
  assert.equal(chestRows.length, 1);
  assert.match(chestRows[0].textContent, /Щит/);
  assert.equal(buttonOf(chestRows[0]).textContent, 'Взять');

  buttonOf(backpackRows[1]).listeners.click();
  assert.deepEqual(calls, [['storeInChest', 1]], 'положен ровно нажатый предмет');
  assert.equal(rowsOf(elements, 'storage-chest-list').length, 2, 'экран обновился после переноса');

  buttonOf(rowsOf(elements, 'storage-chest-list')[0]).listeners.click();
  assert.deepEqual(calls[1], ['takeFromChest', 0], 'взят ровно нажатый предмет');
  assert.equal(rowsOf(elements, 'storage-backpack-list').length, 2, 'вещь вернулась в рюкзак');
});

test('a hero away from the storage sees disabled buttons and a hint', () => {
  const { ui, elements } = createStorageContext({ backpack: [loot('Меч')], far: true });

  ui.showStorage();

  assert.equal(buttonOf(rowsOf(elements, 'storage-backpack-list')[0]).disabled, true,
    'вдали положить нельзя');
  assert.match(elements.get('storage-chest-list').textContent, /Рядом нет хранилища/);
});

test('an empty storage and an empty backpack are named instead of blank panels', () => {
  const { ui, elements } = createStorageContext();

  ui.showStorage();

  assert.match(elements.get('storage-backpack-list').textContent, /Рюкзак пуст/);
  assert.match(elements.get('storage-chest-list').textContent, /Хранилище пусто/);
});

test('the storage screen closes back to the game', () => {
  const { ui, elements } = createStorageContext();
  for (const id of ['btn-storage-back', 'btn-play', 'btn-class-select-back', 'btn-class-select-start',
    'btn-host-room', 'btn-join-room', 'btn-start-coop']) {
    elements.set(id, new Element('button'));
  }
  elements.set('map-size', new Element('select'));
  elements.set('map-style', new Element('select'));
  ui.init();
  ui.showStorage();

  elements.get('btn-storage-back').listeners.click();

  assert.equal(ui.screen(), 'game');
  assert.equal(hidden(elements.get('screen-storage')), true, 'экран хранилища скрыт');
});

test('the settings screen switches the render resolution', () => {
  const { sandbox, elements } = createSandbox({ ui: true });
  const ui = sandbox.RK.UI;

  ui.show('settings');

  const buttons = rowsOf(elements, 'resolution-options');
  assert.equal(buttons.length, 3, 'три пресета чёткости');
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'true', 'обычная чёткость выбрана по умолчанию');
  assert.equal(buttons[0].textContent, 'Обычная');

  buttons[2].listeners.click();

  assert.equal(sandbox.resolutionScale, 2, 'выбран максимальный пресет');
  assert.equal(ui.screen(), 'settings', 'экран настроек остаётся открытым');
  assert.equal(rowsOf(elements, 'resolution-options')[2].getAttribute('aria-pressed'), 'true',
    'выбранная кнопка помечена активной');
});
