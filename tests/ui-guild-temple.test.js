'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

function createGuildContext(overrides = {}) {
  const { sandbox, elements } = createSandbox({ ui: true });
  const RK = sandbox.RK;
  RK.GAME = {
    player: { gold: 10, hp: 5, maxHp: 20, atk: 10 },
    npcs: [],
    quests: [],
  };
  RK.GAME.npcs = [guardNpc(overrides)];
  return { ui: RK.UI, elements, sandbox, RK };
}

function guardNpc(overrides = {}) {
  return Object.assign({
    id: 'ancient_guard',
    kind: 'ancient_guard',
    x: 6,
    y: 6,
    offer: {
      type: 'skeleton',
      kind: 'kill',
      enemyTypes: ['skeleton'],
      target: 2,
      progress: 0,
      reward: 60,
      description: 'Очистить руины от 2 скелетов',
    },
    accepted: false,
  }, overrides);
}

/** Кнопки внутри строки доски гильдии. */
function buttonsOf(row) {
  return row.children.filter((child) => child.tagName === 'BUTTON');
}

test('guild screen shows reputation and the quests of the guild guard', () => {
  const { ui, elements, RK } = createGuildContext();
  RK.GAME.quests.push({
    id: 'ancient_guard#2', giver: 'ancient_guard', kind: 'kill',
    description: 'Принести меч гильдии', progress: 1, target: 3,
  });
  RK.GAME.quests.push({
    id: 'guard#3', giver: 'guard', kind: 'kill',
    description: 'Чужое задание', progress: 1, target: 3,
  });

  ui.show('guild');

  assert.match(elements.get('guild-reputation').textContent, /50/);
  const rows = elements.get('guild-quest-list').children;
  assert.match(rows[0].textContent, /Принести меч гильдии/);
  assert.match(rows[0].textContent, /1\/3/);
  assert.equal(buttonsOf(rows[0]).length, 0, 'невыполненное задание не сдаётся кнопкой');
  assert.doesNotMatch(rows[1].textContent, /Чужое задание/,
    'гильдия ведёт только дела Древнего стража');
});

test('guild turn-in button calls the quest log action with the quest id', () => {
  const { ui, elements, RK } = createGuildContext({ offer: null });
  const called = [];
  RK.Combat = { turnInQuestAny: (questId) => { called.push(questId); return true; } };
  RK.GAME.quests.push({
    id: 'ancient_guard#2', giver: 'ancient_guard', kind: 'collect',
    description: 'Собрать предметы', progress: 2, target: 2,
  });

  ui.show('guild');
  const rows = elements.get('guild-quest-list').children;
  assert.equal(buttonsOf(rows[0]).length, 1, 'выполненное задание сдаётся кнопкой');
  buttonsOf(rows[0])[0].listeners.click();

  assert.deepEqual(called, ['ancient_guard#2']);
});

test('the guild desk offers the guard quest and takes it', () => {
  const { ui, elements, RK } = createGuildContext();
  const accepted = [];
  RK.Combat = { acceptQuest: (id) => { accepted.push(id); return true; } };

  ui.show('guild');

  const rows = elements.get('guild-quest-list').children;
  const offerRow = rows[rows.length - 1];
  assert.match(offerRow.textContent, /Очистить руины от 2 скелетов/, 'предложение стража на доске');
  const button = buttonsOf(offerRow)[0];
  assert.ok(button, 'у предложения есть кнопка');
  button.listeners.click();

  assert.deepEqual(accepted, ['ancient_guard']);
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