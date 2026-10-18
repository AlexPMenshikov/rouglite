'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, Element } = require('./helpers/sandbox');

// Экран сохранений читает список из RK.World, удаляет через clearRun и продолжает
// забег через loadRun + applySnapshot: проверяем маршрут клика, а не оформление.

function savesContext(saves = []) {
  const { sandbox, elements } = createSandbox({ ui: true });
  const ui = sandbox.RK.UI;
  const cleared = [];
  const loaded = [];
  let available = saves.slice();
  sandbox.RK.World = {
    listSaves: () => available.slice(),
    clearRun: (id) => {
      cleared.push(id);
      available = available.filter((save) => save.id !== id);
    },
    loadRun: (id) => {
      loaded.push(id);
      return { id, snapshot: true };
    },
    hasSavedRun: () => available.length > 0,
  };
  sandbox.RK.Combat = { applySnapshot: () => true };
  sandbox.RK.Network = { disconnect() {}, playerId: () => 'local' };
  return { sandbox, ui, elements, cleared, loaded };
}

test('saves screen names an empty list instead of leaving it blank', () => {
  const { ui, elements } = savesContext([]);

  ui.show('saves');

  assert.equal(ui.screen(), 'saves');
  assert.match(elements.get('saves-list').textContent, /Сохранений нет/);
});

test('saves screen lists runs with levels and continues the chosen one', () => {
  const saves = [
    { id: 'run_1', playerName: 'Герой', level: 3 },
    { id: 'run_2', playerName: 'Второй', level: 7 },
  ];
  const { ui, elements, loaded } = savesContext(saves);

  ui.show('saves');

  const rows = elements.get('saves-list').children;
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /Герой — ур\. 3/);
  assert.match(rows[1].textContent, /Второй — ур\. 7/);

  const loadButton = rows[0].children[1];
  const deleteButton = rows[0].children[2];
  assert.equal(loadButton.textContent, 'Продолжить');
  assert.equal(deleteButton.textContent, 'Удалить');

  loadButton.listeners.click();
  assert.deepEqual(loaded, ['run_1']);
  assert.equal(ui.screen(), 'game', 'продолжение открывает игровой экран');
});

test('Удалить drops the saved run and redraws the list', () => {
  const { ui, elements, cleared } = savesContext([{ id: 'run_1', playerName: 'Герой', level: 3 }]);

  ui.show('saves');
  const deleteButton = elements.get('saves-list').children[0].children[2];
  deleteButton.listeners.click();

  assert.deepEqual(cleared, ['run_1'], 'удаление приходит с id сохранения');
  assert.match(elements.get('saves-list').textContent, /Сохранений нет/, 'список перерисован после удаления');
});

test('refresh leaves non-game screens alone', () => {
  const { sandbox, ui, elements } = savesContext();
  const draws = [];
  sandbox.RK.Render.draw = () => draws.push(1);

  ui.refresh();
  assert.equal(draws.length, 0, 'вне игрового экрана HUD не перерисовывается');

  sandbox.RK.GAME = {
    player: { x: 0, y: 0, hp: 10, maxHp: 20, level: 2, atk: 5, def: 3, xp: 0, gold: 5, backpack: [], name: 'Герой', classId: 'paladin' },
    floor: 1,
    locationMode: false,
    turn: 0,
  };
  sandbox.RK.Combat = {
    getZoneMods: () => ({ atkBonus: 0, defBonus: 0 }),
    getZoneAt: () => null,
  };
  ui.show('game');

  assert.equal(draws.length, 1, 'на игровом экране HUD обновляется');
  assert.match(elements.get('stat-hp').textContent, /10\/20/);
});
