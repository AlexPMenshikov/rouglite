'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

function createGuildContext() {
  const { sandbox, elements } = createSandbox({ ui: true });
  const RK = sandbox.RK;
  RK.GAME = {
    player: { gold: 10, hp: 5, maxHp: 20, atk: 10 },
    npcs: [],
    quests: [],
  };
  return { ui: RK.UI, elements, sandbox, RK };
}

test('guild screen shows reputation and active quests', () => {
  const { ui, elements, RK } = createGuildContext();
  RK.GAME.quests.push({ kind: 'escort', description: 'Принести меч гильдии', progress: 1, target: 3 });

  ui.show('guild');

  assert.match(elements.get('guild-reputation').textContent, /50/);
  const rows = elements.get('guild-quest-list').children;
  assert.equal(rows.length, 1);
  assert.match(rows[0].children[0].textContent, /Принести меч гильдии/);
  assert.match(rows[0].children[0].textContent, /1\/3/);
  assert.equal(rows[0].children[1].tagName, 'BUTTON');
});

test('guild turn-in button calls the guild quest action', () => {
  const { ui, elements, RK } = createGuildContext();
  const called = [];
  RK.Combat = { turnInQuestAtGuild: (questId) => { called.push(questId); return true; } };
  RK.GAME.quests.push({ kind: 'collect', description: 'Собрать предметы', progress: 2, target: 2 });

  ui.show('guild');
  elements.get('guild-quest-list').children[0].children[1].listeners.click();

  assert.deepEqual(called, ['Собрать предметы']);
});

test('guild store lists backpack items and stores them by index', () => {
  const { ui, elements, RK } = createGuildContext();
  const stored = [];
  RK.Combat = { storeInWarehouse: (index) => { stored.push(index); return true; } };
  RK.GAME.player.backpack = [
    { name: 'Меч', slot: 'weapon', rarity: 'common', count: 1, summary: 'простой' },
  ];

  ui.showGuildStore();

  const rows = elements.get('guild-quest-list').children;
  assert.equal(rows.length, 1);
  assert.match(rows[0].children[0].textContent, /Меч/);
  rows[0].children[1].listeners.click();

  assert.deepEqual(stored, [0]);
});

test('temple heal button restores hero health', () => {
  const { ui, elements, RK } = createGuildContext();

  ui.show('temple');

  assert.match(elements.get('temple-reputation').textContent, /50/);
  const healRow = elements.get('temple-heal-row');
  assert.equal(healRow.children.length, 1);
  healRow.children[0].listeners.click();

  assert.equal(RK.GAME.player.hp, 20);
});

test('temple heal goes through combat when it is available', () => {
  const { ui, elements, RK } = createGuildContext();
  const called = [];
  RK.Combat = { templeHeal: () => { called.push(true); return true; } };

  ui.show('temple');
  elements.get('temple-heal-row').children[0].listeners.click();

  assert.deepEqual(called, [true]);
});

test('temple blessing adds ten percent attack', () => {
  const { ui, RK } = createGuildContext();

  ui.showTempleBlessing();

  assert.equal(RK.GAME.player.atk, 11);
});

test('temple blessing goes through combat when it is available', () => {
  const { ui, RK } = createGuildContext();
  const called = [];
  RK.Combat = { templeBlessing: () => { called.push(true); return true; } };

  ui.showTempleBlessing();

  assert.deepEqual(called, [true]);
});