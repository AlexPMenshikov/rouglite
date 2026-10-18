'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, startRunAsClass } = require('./helpers/sandbox');

// Финал забега и автосохранение: числа и порядок вызовов важнее текста экрана,
// поэтому проверяем пол, результат, банк и факт записи.

function setUpRun() {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  RK.CONFIG.ENABLE_WORLD = false;
  const player = startRunAsClass(RK, 'paladin');
  RK.GAME.enemies = [];
  RK.World.clearRun = () => {};
  RK.UI.over = () => {};
  return { sandbox, RK, player };
}

function standOnStairs(RK, player) {
  player.x = RK.Map.stair.x;
  player.y = RK.Map.stair.y;
  return RK.Map.stair;
}

test('the stairs descend one floor and announce it', () => {
  const { RK, player } = setUpRun();
  const stair = standOnStairs(RK, player);
  const messages = [];
  RK.UI.msg = (text) => messages.push(text);

  RK.Combat.playerAction(stair.x, stair.y);

  assert.equal(RK.GAME.floor, 2);
  assert.ok(messages.some((text) => /спускаетесь на этаж 2/.test(text)), 'спуск сообщается игроку');
});

test('the stairs at MAX_FLOOR finish the run as a victory', () => {
  const { RK, player } = setUpRun();
  const stair = standOnStairs(RK, player);
  RK.GAME.floor = RK.CONFIG.MAX_FLOOR;
  const over = [];
  RK.UI.over = (...args) => over.push(args);
  const cleared = [];
  RK.World.clearRun = () => cleared.push(1);

  RK.Combat.playerAction(stair.x, stair.y);

  assert.equal(RK.GAME.over, true);
  assert.equal(RK.GAME.result, 'victory');
  assert.equal(cleared.length, 1, 'сохранение забега больше не нужно');
  assert.equal(over[0][0], true, 'экран финала сообщает победу');
  assert.equal(over[0][1], RK.CONFIG.MAX_FLOOR);
});

test('zero health ends the run as a defeat', () => {
  const { RK, player } = setUpRun();
  const over = [];
  RK.UI.over = (...args) => over.push(args);
  const cleared = [];
  RK.World.clearRun = () => cleared.push(1);

  RK.Combat.setPlayerStats({ hp: 0, maxHp: player.maxHp, atk: player.atk, def: player.def });

  assert.equal(RK.GAME.over, true);
  assert.equal(RK.GAME.result, 'defeat');
  assert.equal(over[0][0], false, 'экран финала сообщает поражение');
  assert.equal(cleared.length, 1);
});

test('the bank receives the gold of the whole party with luck applied', () => {
  const { RK, player } = setUpRun();
  RK.Combat.addNetworkPlayer('guest-1', 'Гость');
  const guest = RK.GAME.players.find((member) => member.id === 'guest-1');
  player.gold = 40;
  guest.gold = 60;
  RK.Meta.data.luck = 1;

  const banked = [];
  RK.Meta.addBank = (value) => banked.push(value);

  RK.Combat.setPlayerStats({ hp: 0, maxHp: player.maxHp, atk: player.atk, def: player.def });

  const expected = Math.floor(40 * 1.15) + Math.floor(60 * 1.15);
  assert.equal(banked.length, 1);
  assert.equal(banked[0], expected, 'золото каждого героя уходит в банк с учётом удачи');
});

test('autosave happens every SAVE_EVERY_TURNS and never in a network room', () => {
  const { RK } = setUpRun();
  let saves = 0;
  RK.World.saveRun = () => { saves += 1; return true; };

  RK.GAME.turn = RK.CONFIG.SAVE_EVERY_TURNS - 1;
  RK.Combat.skipTurn();
  assert.equal(RK.GAME.turn, RK.CONFIG.SAVE_EVERY_TURNS);
  assert.equal(saves, 1, 'круговой ход сохраняется');

  RK.GAME.turn = RK.CONFIG.SAVE_EVERY_TURNS + 10;
  RK.Combat.skipTurn();
  assert.equal(saves, 1, 'не по расписанию запись не идёт');

  RK.GAME.turn = RK.CONFIG.SAVE_EVERY_TURNS * 2 - 1;
  RK.Network = { inRoom: () => true };
  RK.Combat.skipTurn();
  assert.equal(saves, 1, 'в сетевой комнате состояние считает сервер');
});
