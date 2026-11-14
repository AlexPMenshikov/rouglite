const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// Экраны NPC собираются из состояния забега и описаний из js/npc.js:
// отдельный игровой контекст для этого не нужен.
function createUI(npcs) {
  const { sandbox, elements } = createSandbox({ ui: true });
  sandbox.RK.GAME = { player: { gold: 10 }, npcs, quests: [] };
  return { ui: sandbox.RK.UI, elements, sandbox };
}

function guardNpc(overrides = {}) {
  return Object.assign({
    id: 'guard',
    kind: 'guard',
    x: 5,
    y: 5,
    offer: {
      type: 'skeleton',
      kind: 'kill',
      enemyTypes: ['skeleton'],
      target: 3,
      progress: 0,
      reward: 60,
      description: 'Очистить лес от 2 скелетов',
    },
    accepted: false,
  }, overrides);
}

test('the talk screen shows the NPC name and dialogue choices', () => {
  const { ui, elements } = createUI([guardNpc()]);

  ui.showNpc('guard');

  assert.equal(elements.get('talk-title').textContent, 'Капитан стражи Рова');
  assert.match(elements.get('talk-text').textContent, /кости/);
  const actions = elements.get('talk-actions').children;
  assert.ok(actions.length >= 2, 'есть выборы диалога');
  assert.equal(actions[0].tagName, 'BUTTON');
});

test('dialogue choice triggers acceptQuest action', () => {
  const npc = guardNpc();
  const { ui, elements, sandbox } = createUI([npc]);
  const accepted = [];
  let atOffer = false;
  sandbox.RK.Combat = {
    acceptQuest: (id) => { accepted.push(id); return true; },
    dialogueChoice: (npcId, idx) => {
      // Первый клик: «Я помогу» → переход к узлу предложения.
      // Второй клик: «Взять задание» (idx=0 на новом узле) → acceptQuest.
      if (atOffer) {
        sandbox.RK.Combat.acceptQuest(npcId);
        return true;
      }
      atOffer = true;
      return true;
    },
  };

  ui.showNpc('guard');
  elements.get('talk-actions').children[0].listeners.click();
  elements.get('talk-actions').children[0].listeners.click();

  assert.deepEqual(accepted, ['guard'], 'задание берётся у того, с кем говорили');
});

test('a taken offer shows the closing dialogue node', () => {
  const taken = guardNpc({ offer: null, accepted: true });
  const { ui, elements } = createUI([taken]);

  ui.showNpc('guard');

  assert.match(elements.get('talk-text').textContent, /Город спокоен/);
  const actions = elements.get('talk-actions').children;
  assert.ok(actions.length >= 1, 'есть кнопки диалога');
});

test('an unknown NPC id shows an empty line instead of failing', () => {
  const { ui, elements } = createUI([guardNpc()]);

  ui.showNpc('__proto__');

  assert.equal(elements.get('talk-text').textContent, 'Здесь никого нет.');
  assert.equal(elements.get('talk-actions').children.length, 0);
});

test('blacksmith offers compatible recipe actions and dispatches the selected recipe', () => {
  const { ui, elements, sandbox } = createUI([]);
  const RK = sandbox.RK;
  const item = {
    name: 'Тестовый клинок',
    slot: 'weapon',
    baseStats: { atk: 3 },
    stats: { atk: 3 },
    upgradeLevel: RK.CONFIG.UPGRADE_MAX,
  };
  RK.GAME.player.equipment = { weapon: item };
  RK.GAME.player.backpack = [];
  let materials = 1;
  RK.Items = {
    craftingRecipes: () => ({
      ember: { id: 'ember', name: 'Огненная кромка', materialId: 'ember', cost: 2 },
    }),
    canEnchantItem: (target, recipeId) => target === item && recipeId === 'ember',
    getUpgradeCost: () => 10,
  };
  RK.Inventory = {
    countCraftingMaterials: () => materials,
  };
  const selected = [];
  RK.Combat = {
    craftEquipment: (...args) => { selected.push(args); },
  };

  ui.show('blacksmith');
  let row = elements.get('blacksmith-list').children[0];
  let craftButton = row.children.find((child) => child.tagName === 'BUTTON');
  assert.equal(craftButton.disabled, true, 'недостаток материалов отключает кнопку');
  assert.match(craftButton.textContent, /Зачаровать: Огненная кромка — 1\/2/);

  materials = 2;
  ui.renderBlacksmithScreen();
  row = elements.get('blacksmith-list').children[0];
  craftButton = row.children.find((child) => child.tagName === 'BUTTON');
  assert.equal(craftButton.disabled, false);
  craftButton.listeners.click();
  assert.deepEqual(selected, [['weapon', 'ember']]);
});
