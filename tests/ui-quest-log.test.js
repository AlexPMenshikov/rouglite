const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// Журнал квестов рисуется из состояния забега и описаний из js/npc.js,
// поэтому игровой контекст для экрана не нужен.
function createUI(quests, npcs = []) {
  const { sandbox, elements } = createSandbox({ ui: true });
  sandbox.RK.GAME = { player: { gold: 10 }, npcs, quests };
  return { ui: sandbox.RK.UI, elements, sandbox };
}

function quest(overrides = {}) {
  return Object.assign({
    id: 'guard#2',
    giver: 'guard',
    kind: 'kill',
    type: 'skeleton',
    enemyTypes: ['skeleton'],
    target: 3,
    progress: 1,
    reward: 60,
    description: 'Очистить лес от 3 скелетов',
  }, overrides);
}

/** Экран скрыт классом hidden: без него на экране просто пусто. */
function hidden(element) {
  return element.className.split(/\s+/).includes('hidden');
}

test('the quest log opens as a visible screen', () => {
  const { ui, elements } = createUI([quest()]);

  ui.showQuestLog();

  assert.equal(ui.screen(), 'questlog');
  assert.equal(hidden(elements.get('screen-questlog')), false, 'экран журнала показан');
  assert.equal(hidden(elements.get('screen-game')), true, 'остальные экраны скрыты');
});

test('an active quest shows its progress, giver and reward', () => {
  const { ui, elements } = createUI([quest()]);

  ui.showQuestLog();

  const row = elements.get('questlog-active-list').children[0];
  assert.match(row.textContent, /Очистить лес от 3 скелетов/);
  assert.match(row.textContent, /Прогресс: 1\/3/);
  assert.match(row.textContent, /Заказчик: Капитан стражи Рова/);
  assert.match(row.textContent, /Награда: 60 золота/);
});

test('the turn-in button appears only for a finished quest and sends its id', () => {
  const unfinished = quest();
  const ready = quest({ id: 'merchant#1', giver: 'merchant', progress: 3, description: 'Убить 3 демонов' });
  const { ui, elements, sandbox } = createUI([unfinished, ready]);
  const handed = [];
  sandbox.RK.Combat = { turnInQuestAny: (id) => { handed.push(id); return true; } };

  ui.showQuestLog();

  const rows = elements.get('questlog-active-list').children;
  assert.equal(rows.length, 2);
  const buttonsOf = (row) => row.children.filter((child) => child.tagName === 'BUTTON');
  assert.equal(buttonsOf(rows[0]).length, 0, 'невыполненное задание не сдаётся кнопкой');
  const button = buttonsOf(rows[1])[0];
  assert.ok(button, 'у выполненного задания есть кнопка сдачи');
  button.listeners.click();
  assert.deepEqual(handed, ['merchant#1'], 'сдаётся ровно нажатое задание');
});

test('a closed quest moves to the completed list', () => {
  const { ui, elements } = createUI([quest({ completed: true })]);

  ui.showQuestLog();

  assert.match(elements.get('questlog-active-list').textContent, /Нет активных заданий/);
  assert.match(elements.get('questlog-completed-list').textContent, /Очистить лес от 3 скелетов/);
});

test('a run without quests shows an empty journal instead of a blank screen', () => {
  const { ui, elements } = createUI([]);

  ui.showQuestLog();

  assert.equal(hidden(elements.get('screen-questlog')), false);
  assert.match(elements.get('questlog-active-list').textContent, /Нет активных заданий/);
  assert.match(elements.get('questlog-completed-list').textContent, /Выполненных заданий пока нет/);
});
