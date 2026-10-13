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
