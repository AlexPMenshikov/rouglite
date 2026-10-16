'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSandbox } = require('./helpers/sandbox');

test('status apply keeps burning legacy fields in sync', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  const player = RK.GAME.player;
  RK.Statuses.apply(player, 'burning', { turns: 3, damage: 2, appliedTurn: RK.GAME.turn + 1 });
  assert.equal(player.burningTurns, 3);
  assert.equal(player.burningDamage, 2);
  assert.ok(player.statuses.burning, 'status stored');
});

test('status tick damages and removes itself', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  const player = RK.GAME.player;
  const beforeHp = player.hp;
  RK.Statuses.apply(player, 'poison', { turns: 1, damage: 2, appliedTurn: RK.GAME.turn - 1 });
  RK.Statuses.tickActor(player);
  assert.equal(player.hp, beforeHp - 2);
  assert.ok(!player.statuses.poison, 'poison removed after tick');
});

test('stun status is listed as a control effect', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  const player = RK.GAME.player;
  RK.Statuses.apply(player, 'stun', { turns: 1, appliedTurn: RK.GAME.turn + 1 });
  assert.equal(RK.Statuses.list(player).join(','), 'stun');
});