'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, Element } = require('./helpers/sandbox');

function createLootContext(items) {
  const { sandbox, elements } = createSandbox({ ui: true });
  sandbox.RK.GAME = { lootWindow: { items } };
  return { ui: sandbox.RK.UI, elements };
}

function hidden(element) {
  return element.className.split(/\s+/).includes('hidden');
}

test('the loot screen shows the items a chest put into the backpack', () => {
  const { ui, elements } = createLootContext([
    { name: 'Золото', kind: 'gold', amt: 25, asset: 'gold', rarity: 'common' },
    { name: 'Зелье лечения', kind: 'potion', summary: '+30 HP', rarity: 'common' },
    { name: 'Меч', kind: 'loot', slot: 'weapon', summary: '+5 атаки', rarity: 'rare' },
  ]);

  ui.showLoot();

  assert.equal(ui.screen(), 'loot');
  assert.equal(hidden(elements.get('screen-loot')), false, 'окно добычи показано');
  const rows = elements.get('loot-list').children;
  assert.equal(rows.length, 3);
  assert.match(rows[0].textContent, /Золото — 25 монет/);
  assert.match(rows[1].textContent, /Зелье лечения/);
  assert.match(rows[2].textContent, /Меч/);
  assert.match(elements.get('loot-hint').textContent, /убрано в рюкзак/);
});

test('an empty loot window says so instead of showing a blank panel', () => {
  const { ui, elements } = createLootContext([]);

  ui.showLoot();

  assert.match(elements.get('loot-list').textContent, /Сундук пуст/);
  assert.match(elements.get('loot-hint').textContent, /Сундук пуст/);
});

test('the loot screen closes back to the game', () => {
  const { ui, elements } = createLootContext([
    { name: 'Меч', kind: 'loot', slot: 'weapon', rarity: 'common' },
  ]);
  for (const id of ['btn-loot-close', 'btn-play', 'btn-class-select-back', 'btn-class-select-start',
    'btn-host-room', 'btn-join-room', 'btn-start-coop']) {
    elements.set(id, new Element('button'));
  }
  ui.init();
  ui.showLoot();

  elements.get('btn-loot-close').listeners.click();

  assert.equal(ui.screen(), 'game');
  assert.equal(hidden(elements.get('screen-loot')), true, 'окно добычи скрыто');
});
