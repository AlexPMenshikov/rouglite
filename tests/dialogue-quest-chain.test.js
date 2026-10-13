'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createSandbox } = require('./helpers/sandbox');

function cityRun(seed = 201) {
  const { sandbox } = createSandbox({ seed });
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'medium', style: 'stone' });
  return RK;
}

function npcOf(RK, kind) {
  return RK.GAME.npcs.find((npc) => npc.kind === kind) || null;
}

function standNear(RK, npc) {
  const neighbors = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const tile = neighbors
    .map(([dx, dy]) => ({ x: npc.x + dx, y: npc.y + dy }))
    .find((point) => RK.MapGen.isMapWalkable(RK.Map, point.x, point.y));
  assert.ok(tile, 'у NPC есть клетка, с которой можно говорить');
  RK.GAME.player.x = tile.x;
  RK.GAME.player.y = tile.y;
  return tile;
}

test('dialogue tree starts at greeting with choices', () => {
  const RK = cityRun(201);
  const merchant = npcOf(RK, 'merchant');

  const talk = RK.Npc.dialogue(merchant);
  assert.equal(talk.name, 'Странствующий торговец');
  assert.ok(talk.choices && talk.choices.length >= 2, 'есть выборы');
  assert.equal(talk.choices[0].next, 'about_city', 'первый выбор ведёт к about_city');
});

test('dialogue choice moves to next node', () => {
  const RK = cityRun(202);
  const merchant = npcOf(RK, 'merchant');
  standNear(RK, merchant);

  const firstText = RK.Npc.dialogue(merchant).text;
  const result = RK.Npc.chooseDialogue(merchant, 0);
  assert.ok(result, 'выбор обработан');
  assert.equal(result.choice.next, 'about_city');
  const secondText = RK.Npc.dialogue(merchant).text;
  assert.notEqual(secondText, firstText, 'текст сменился');
});

test('dialogueChoice action works through dispatcher', () => {
  const RK = cityRun(203);
  const merchant = npcOf(RK, 'merchant');
  standNear(RK, merchant);

  const firstText = RK.Npc.dialogue(merchant).text;
  const result = RK.Combat.performAction('local', 'dialogueChoice', ['merchant', 0]);
  assert.equal(result, true);
  const secondText = RK.Npc.dialogue(merchant).text;
  assert.notEqual(secondText, firstText, 'диалог продвинулся');
});

test('dialogue acceptQuest action takes the quest', () => {
  const RK = cityRun(204);
  const merchant = npcOf(RK, 'merchant');
  standNear(RK, merchant);
  const questCount = RK.GAME.quests.length;

  RK.Combat.performAction('local', 'dialogueChoice', ['merchant', 1]);
  RK.Combat.performAction('local', 'dialogueChoice', ['merchant', 0]);
  assert.equal(RK.GAME.quests.length, questCount + 1, 'задание принято');
});

test('quest chain: after turning in first quest, second is offered', () => {
  const RK = cityRun(205);
  const merchant = npcOf(RK, 'merchant');
  standNear(RK, merchant);

  assert.equal(RK.Combat.acceptQuest('merchant'), true);
  const firstQuest = RK.GAME.quests[RK.GAME.quests.length - 1];

  RK.Combat.turnInQuest('merchant');

  assert.ok(merchant.offer, 'второе предложение появилось');
  assert.notEqual(merchant.offer.description, firstQuest.description, 'это другое задание');
});

test('dialogue state survives snapshot round trip', () => {
  const RK = cityRun(206);
  const merchant = npcOf(RK, 'merchant');
  standNear(RK, merchant);

  RK.Npc.chooseDialogue(merchant, 0);
  const snapshot = RK.Combat.createSnapshot();

  const { sandbox } = createSandbox({ seed: 207 });
  const target = sandbox.RK;
  target.Combat.newRun({ size: 'medium', style: 'stone' });
  assert.equal(target.Combat.applySnapshot(snapshot, 'local'), true);

  const targetMerchant = target.GAME.npcs.find((npc) => npc.kind === 'merchant');
  const talk = target.Npc.dialogue(targetMerchant);
  assert.equal(talk.text, RK.Npc.dialogue(merchant).text, 'диалог восстановился');
});
