'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSandbox, startRunAsClass, findOpenNeighbor, placeAdjacentEnemy } = require('./helpers/sandbox');

function newGame() {
  const { sandbox } = createSandbox();
  const { RK } = sandbox;
  startRunAsClass(RK, 'paladin');
  RK.GAME.player.backpack = RK.GAME.player.backpack || [];
  RK.GAME.player.backpack.push(RK.Items.spawnFood(0, 0, 'bread'));
  return RK;
}

test('кемпинг: состояние заводится на старте забега', () => {
  const RK = newGame();
  assert.ok(RK.GAME.camp, 'состояние лагеря создано');
  assert.equal(RK.GAME.camp.active, false);
  assert.equal(RK.GAME.camp.turns, 0);
});

test('кемпинг: вход разводит костёр, повторный вход гасит', () => {
  const RK = newGame();
  assert.equal(RK.Camp.rest(), true);
  assert.equal(RK.GAME.camp.active, true);
  assert.equal(RK.Camp.rest(), true, 'повторный вызов — выход');
  assert.equal(RK.GAME.camp.active, false);
});

test('кемпинг: тик лечит партию и не превышает максимум', () => {
  const RK = newGame();
  const p = RK.GAME.player;
  p.hp = 50;
  RK.Camp.rest();
  for (let i = 0; i < 3; i++) RK.Camp.tick();
  assert.equal(p.hp, 62, 'лечение +4 за тик');
  for (let i = 0; i < 30 && p.hp < p.maxHp; i++) RK.Camp.tick();
  assert.equal(p.hp, p.maxHp, 'лечение упирается в максимум');
  assert.equal(RK.GAME.camp.healedAll, true, 'отмечено полное восстановление');
});

test('кемпинг: вне лагеря тик не лечит', () => {
  const RK = newGame();
  const p = RK.GAME.player;
  p.hp = 50;
  RK.Camp.tick();
  assert.equal(p.hp, 50);
});

test('кемпинг: вход запрещён, пока враг в радиусе', () => {
  const RK = newGame();
  placeAdjacentEnemy(RK, 'rat');
  assert.equal(RK.Camp.rest(), false);
  assert.equal(RK.GAME.camp.active, false);
});

test('кемпинг: враг подошёл во время отдыха — лагерь прерван', () => {
  const RK = newGame();
  RK.Camp.rest();
  placeAdjacentEnemy(RK, 'rat');
  RK.Camp.tick();
  assert.equal(RK.GAME.camp.active, false);
});

test('кемпинг: движение гасит лагерь', () => {
  const RK = newGame();
  RK.Camp.rest();
  const [dx, dy] = findOpenNeighbor(RK);
  RK.Combat.tryStep(dx, dy);
  assert.equal(RK.GAME.camp.active, false);
});

test('кемпинг: пропуск хода оставляет лагерь', () => {
  const RK = newGame();
  RK.Camp.rest();
  RK.Combat.skipTurn();
  assert.equal(RK.GAME.camp.active, true);
});

test('кемпинг: состояние уезжает в снимке и возвращается', () => {
  const RK = newGame();
  RK.Camp.rest();
  const snapshot = RK.Combat.createSnapshot();
  assert.equal(snapshot.game.camp.active, true);
  RK.Camp.leave();
  assert.equal(RK.GAME.camp.active, false);
  RK.Combat.applySnapshot(snapshot, 'local');
  assert.equal(RK.GAME.camp.active, true);
  assert.equal(RK.GAME.camp.turns, 0);
});

test('кемпинг: campRest проходит через боевые действия', () => {
  const RK = newGame();
  RK.Combat.performAction('local', 'campRest', []);
  assert.equal(RK.GAME.camp.active, true);
  assert.ok(RK.GAME.turn > 0, 'вход в лагерь тратит ход');
  RK.Combat.performAction('local', 'campRest', []);
  assert.equal(RK.GAME.camp.active, false);
});
