const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// Панель способностей в HUD: три кнопки класса, откат в ходах и вызов навыка.
// Игровой контекст не нужен: панель читает состояние героя и дерево навыков.
function createUI(playerOverrides = {}) {
  const { sandbox, elements } = createSandbox({ ui: true });
  const player = Object.assign({
    id: 'local',
    name: 'Герой',
    classId: 'paladin',
    className: 'Паладин',
    level: 1,
    hp: 10,
    maxHp: 10,
    atk: 10,
    def: 2,
    gold: 0,
    xp: 0,
    hunger: 100,
    maxHunger: 100,
    potionHeal: 30,
    equipment: {},
    backpack: [],
    skillCooldowns: {},
    pendingSpell: null,
  }, playerOverrides);
  sandbox.RK.GAME = {
    player,
    players: [player],
    over: false,
    turn: 0,
    quests: [],
    enemies: [],
    locationMode: false,
  };
  const activated = [];
  sandbox.RK.Combat = {
    localPlayerId: () => 'local',
    getZoneMods: () => ({ atkBonus: 0, defBonus: 0 }),
    getZoneAt: () => null,
    activateClassSkill: (id) => { activated.push(id); return true; },
  };
  sandbox.RK.UI.show('game');
  return { ui: sandbox.RK.UI, elements, sandbox, player, activated };
}

function slots(elements) {
  return elements.get('hud-skills').children;
}

test('the HUD shows one button per class skill with its hotkey', () => {
  const { elements } = createUI();

  const buttons = slots(elements);
  assert.equal(buttons.length, 3);
  assert.match(buttons[0].textContent, /Святой отклик/);
  assert.match(buttons[1].textContent, /Стена веры/);
  assert.match(buttons[2].textContent, /Удар щитом/);
  assert.equal(buttons[0].children[0].children[0].textContent, '1');
  assert.equal(buttons[2].children[0].children[0].textContent, '3');
});

test('a skill above the hero level is locked', () => {
  const { elements } = createUI({ level: 1 });

  const buttons = slots(elements);
  assert.equal(buttons[0].disabled, false, 'базовый навык доступен с первого уровня');
  assert.equal(buttons[1].disabled, true, 'навык пятого уровня закрыт');
  assert.match(buttons[1].textContent, /Откроется на 5 ур\./);
  assert.equal(buttons[2].disabled, true, 'навык десятого уровня закрыт');
});

test('a cooling skill shows the remaining turns and the cooldown fill', () => {
  const { elements } = createUI({ skillCooldowns: { shield_reflect: 3 } });

  const button = slots(elements)[0];
  assert.equal(button.disabled, true);
  assert.match(button.textContent, /Перезарядка: 3 хд\./);
  // Заливка — доля отката от полного кулдауна в четыре хода.
  assert.equal(button.children[2].children[0].style.width, '75%');
});

test('a ready skill is cast from the HUD', () => {
  const { elements, activated } = createUI();

  slots(elements)[2].listeners.click();

  assert.deepEqual(activated, ['shield_bash'], 'применяется именно нажатый навык');
});

test('an armed spell asks for a target', () => {
  const { elements } = createUI({
    classId: 'mage',
    pendingSpell: 'fireball',
    skillCooldowns: { fireball: 4 },
  });

  const button = slots(elements)[0];
  assert.match(button.textContent, /Выберите цель/);
  assert.equal(button.disabled, true, 'вооружённое заклинание не применяют дважды');
});

test('another class rebuilds the panel', () => {
  const { elements, player, ui } = createUI();

  player.classId = 'mage';
  ui.refresh();

  const buttons = slots(elements);
  assert.equal(buttons.length, 3);
  assert.match(buttons[0].textContent, /Файрбол/);
});
