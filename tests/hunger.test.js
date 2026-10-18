'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, startRunAsClass } = require('./helpers/sandbox');

// Голод тикает каждый ход и на нуле отнимает здоровье и характеристики. Если
// decayHunger перестанет вызываться, партия просто перестанет слабеть — это
// заметно только по логам, поэтому проверяем числа, а не сообщение.

function setUpRun(RK) {
  RK.CONFIG.ENABLE_WORLD = false;
  startRunAsClass(RK, 'paladin');
  RK.GAME.enemies = [];
}

test('every turn costs hunger and zero hunger drains health', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  setUpRun(RK);
  const player = RK.GAME.player;

  assert.equal(player.hunger, RK.CONFIG.FOOD_MAX_HUNGER, 'герой начинает сытым');
  assert.equal(player.maxHunger, RK.CONFIG.FOOD_MAX_HUNGER);
  RK.Combat.skipTurn();
  assert.equal(player.hunger, RK.CONFIG.FOOD_MAX_HUNGER - RK.CONFIG.FOOD_DECAY_PER_TURN);

  player.hunger = 0.1;
  const hp = player.hp;
  const messages = [];
  RK.UI.msg = (text) => messages.push(text);
  RK.Combat.skipTurn();

  assert.equal(player.hunger, 0, 'голод не уходит в минус');
  assert.equal(player.hp, hp - RK.CONFIG.HUNGER_STARVING_HP_LOSS, 'истощённый герой теряет здоровье');
  assert.ok(messages.some((text) => /Голод/.test(text)));
});

test('hunger penalties lower attack and defense in two stages', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  setUpRun(RK);
  const player = RK.GAME.player;
  const atk = player.atk;
  const def = player.def;

  player.hunger = RK.CONFIG.HUNGER_OK_THRESHOLD;
  RK.Combat.recomputePlayerStats();
  assert.equal(player.atk, atk, 'при сытости штрафов нет');

  player.hunger = RK.CONFIG.HUNGER_HUNGRY_THRESHOLD;
  RK.Combat.recomputePlayerStats();
  assert.equal(player.atk, atk - RK.CONFIG.HUNGER_HUNGRY_ATK_PENALTY, 'голодный бьёт слабее');
  assert.equal(player.def, def, 'защита страдает только при истощении');

  player.hunger = 0;
  RK.Combat.recomputePlayerStats();
  assert.equal(player.atk, atk - RK.CONFIG.HUNGER_STARVING_ATK_PENALTY, 'истощение сильнее голода');
  assert.equal(player.def, def - RK.CONFIG.HUNGER_STARVING_DEF_PENALTY);
});

test('the dead do not starve and a member without hunger data starts full', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  setUpRun(RK);
  RK.Combat.addNetworkPlayer('guest-1', 'Гость');
  const guest = RK.GAME.players.find((player) => player.id === 'guest-1');

  // Павший герой не слабеет от голода.
  guest.hp = 0;
  guest.hunger = 10;
  RK.Combat.skipTurn();
  assert.equal(guest.hunger, 10, 'голод павшего не тикает');

  // Герой из старого снимка без полей голода получает их из CONFIG.
  guest.hp = guest.maxHp;
  delete guest.hunger;
  delete guest.maxHunger;
  RK.Combat.setActivePlayer(guest.id);
  RK.Combat.skipTurn();
  const guestAfter = RK.GAME.players.find((player) => player.id === 'guest-1');
  assert.equal(guestAfter.maxHunger, RK.CONFIG.FOOD_MAX_HUNGER);
  assert.equal(guestAfter.hunger, RK.CONFIG.FOOD_MAX_HUNGER - RK.CONFIG.FOOD_DECAY_PER_TURN);
});
