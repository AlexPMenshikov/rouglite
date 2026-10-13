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

test('the talk screen shows the NPC name, line and quest offer', () => {
  const { ui, elements } = createUI([guardNpc()]);

  ui.showNpc('guard');

  assert.equal(elements.get('talk-title').textContent, 'Капитан стражи Рова');
  assert.match(elements.get('talk-text').textContent, /кости/);
  const actions = elements.get('talk-actions').children;
  assert.equal(actions.length, 1);
  assert.match(actions[0].children[0].textContent, /Очистить лес/);
  assert.match(actions[0].children[0].textContent, /60 золота/);
  assert.equal(actions[0].children[1].tagName, 'BUTTON');
});

test('accepting from the talk screen sends the id of the NPC in front', () => {
  const npc = guardNpc();
  const { ui, elements, sandbox } = createUI([npc]);
  const accepted = [];
  sandbox.RK.Combat = { acceptQuest: (id) => { accepted.push(id); return true; } };

  ui.showNpc('guard');
  elements.get('talk-actions').children[0].children[1].listeners.click();

  assert.deepEqual(accepted, ['guard'], 'задание берётся у того, с кем говорили');
});

test('a taken offer disappears and the NPC switches to its closing line', () => {
  const taken = guardNpc({ offer: null, accepted: true });
  const { ui, elements } = createUI([taken]);

  ui.showNpc('guard');

  assert.equal(elements.get('talk-actions').children.length, 0, 'предложения больше нет');
  assert.match(elements.get('talk-text').textContent, /Город спокоен/);
});

test('an unknown NPC id shows an empty line instead of failing', () => {
  const { ui, elements } = createUI([guardNpc()]);

  ui.showNpc('__proto__');

  assert.equal(elements.get('talk-text').textContent, 'Здесь никого нет.');
  assert.equal(elements.get('talk-actions').children.length, 0);
});
