'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// Экран персонажа показывает четыре карточки конечностей, метки травм и кнопки
// лечения. Кнопки отправляют обычное действие useInventoryItem — без мыши по
// схеме тела и без нового сетевого действия.
function createCharacterUI() {
  const { sandbox, elements } = createSandbox({ ui: true });
  const RK = sandbox.RK;
  const calls = [];
  RK.Combat = {
    useInventoryItem(index) { calls.push(index); return true; },
  };

  const player = {
    id: 'local',
    name: 'Искатель',
    className: 'Паладин',
    classId: 'paladin',
    level: 3,
    xp: 4,
    hp: 17,
    maxHp: 30,
    atk: 7,
    def: 2,
    gold: 44,
    potionHeal: 30,
    hunger: 80,
    maxHunger: 100,
    equipment: {},
    backpack: [],
  };
  RK.Limbs.init(player);
  RK.GAME = { player, turn: 7, floor: 2, locationMode: false };
  return { sandbox, elements, RK, ui: RK.UI, player, calls };
}

function cardOf(container, zoneId) {
  return container.children.find((child) => child.getAttribute('data-zone') === zoneId);
}

test('the character screen shows basic stats, four limb cards and their injuries', () => {
  const { elements, ui, player } = createCharacterUI();
  player.limbs.zones.head.bleeding = 2;
  player.limbs.zones.head.fracture = true;
  player.limbs.zones.head.hp = 2;
  player.limbs.zones.legs.hp = 1;

  ui.init();
  ui.show('character');

  assert.equal(elements.get('stat-player-name').textContent, 'Искатель');
  assert.equal(elements.get('stat-player-level').textContent, '3');
  assert.equal(elements.get('stat-class').textContent, 'Паладин');
  assert.equal(elements.get('character-stat-hp').textContent, '17 / 30');
  assert.equal(elements.get('stat-atk').textContent, '7');
  assert.equal(elements.get('stat-gold').textContent, '44');
  assert.equal(elements.get('stat-turn').textContent, '7');

  const limbs = elements.get('character-limbs');
  assert.equal(limbs.children.length, 4, 'четыре зоны: голова, грудь, руки, ноги');
  assert.deepEqual(limbs.children.map((card) => card.getAttribute('data-zone')),
    ['head', 'chest', 'arms', 'legs']);

  const head = cardOf(limbs, 'head');
  assert.ok(head.textContent.includes('Голова'));
  assert.ok(head.textContent.includes('2 / ' + player.limbs.zones.head.maxHp));
  assert.ok(head.textContent.includes('Перелом'));
  assert.ok(head.textContent.includes('Сильное кровотечение'));
  assert.ok(head.textContent.includes('−20% атаки'));

  const legs = cardOf(limbs, 'legs');
  assert.ok(legs.children.some((child) => child.className.includes('limb-bar')));
  assert.ok(legs.textContent.includes('1 / ' + player.limbs.zones.legs.maxHp));
});

test('heal buttons use the backpack item and choose the worst injury themselves', () => {
  const { elements, ui, player, calls } = createCharacterUI();
  player.limbs.zones.arms.bleeding = 1;
  player.limbs.zones.chest.bleeding = 2;
  player.limbs.zones.legs.fracture = true;
  player.backpack.push({
    kind: 'bandage', type: 'bandage', asset: 'bandage', name: 'Бинт',
    count: 2, value: 12,
  });
  player.backpack.push({
    kind: 'splint', type: 'splint', asset: 'splint', name: 'Шина',
    count: 1, value: 20,
  });

  ui.init();
  ui.show('character');

  const bandageButton = elements.get('btn-character-bandage');
  const splintButton = elements.get('btn-character-splint');
  assert.equal(bandageButton.disabled, false, 'бинт доступен при кровотечении');
  assert.equal(splintButton.disabled, false, 'шина доступна при переломе');
  assert.ok(bandageButton.textContent.includes('×2'));

  bandageButton.listeners.click();
  assert.deepEqual(calls, [0], 'бинт отправляет useInventoryItem с индексом стопки');

  splintButton.listeners.click();
  assert.deepEqual(calls, [0, 1], 'шина отправляет индекс своей стопки');
});

test('heal buttons are disabled when there is no item or nothing to treat', () => {
  const { elements, ui, player } = createCharacterUI();
  player.backpack = [];
  player.limbs.zones.head.bleeding = 1;

  ui.init();
  ui.show('character');
  assert.equal(elements.get('btn-character-bandage').disabled, true, 'без бинтов лечить нечем');

  player.backpack.push({
    kind: 'bandage', type: 'bandage', asset: 'bandage', name: 'Бинт', count: 1, value: 12,
  });
  ui.renderCharacterScreen();
  assert.equal(elements.get('btn-character-bandage').disabled, false, 'бинт и травма есть');

  player.limbs.zones.head.bleeding = 0;
  ui.renderCharacterScreen();
  assert.equal(elements.get('btn-character-bandage').disabled, true, 'без травмы бинт не тратится');
  assert.equal(elements.get('btn-character-splint').disabled, true, 'шин без переломов нет');
});

test('the limb list follows the anatomy names of a beast', () => {
  const { elements, ui, sandbox } = createCharacterUI();
  const wolf = sandbox.RK.Entities.makeEnemy('wolf', 1, 1, 1);
  sandbox.RK.GAME.player = wolf;
  wolf.name = 'Волк';

  ui.init();
  ui.show('character');

  const limbs = elements.get('character-limbs');
  assert.ok(limbs.textContent.includes('Передние лапы'));
  assert.ok(limbs.textContent.includes('Задние лапы'));
});
