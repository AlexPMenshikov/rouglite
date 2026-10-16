'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, startRunAsClass } = require('./helpers/sandbox');

function startMageRun(RK) {
  const player = startRunAsClass(RK, 'mage');
  RK.GAME.enemies = [];
  player.level = 10;
  RK.Combat.recomputePlayerStats();
  return player;
}

function nearbyEnemy(RK, player, dx, dy) {
  const enemy = RK.Entities.makeEnemy('rat', player.x + dx, player.y + dy, RK.GAME.floor);
  RK.GAME.enemies.push(enemy);
  return enemy;
}

test('mage has three skills with levels 1/5/10', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const skills = RK.Skills.skillsFor('mage');
  assert.equal(skills.length, 3);
  assert.equal(skills[0].id, 'fireball');
  assert.equal(skills[0].level, 1);
  assert.equal(skills[1].id, 'mass_fireball');
  assert.equal(skills[1].level, 5);
  assert.equal(skills[2].id, 'homing_lightning');
  assert.equal(skills[2].level, 10);
});

test('fireball arms on activation and casts on a clicked enemy', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startMageRun(RK);
  assert.equal(RK.Combat.activateClassSkill('fireball'), true);
  assert.equal(player.pendingSpell, 'fireball');
  assert.equal(player.fireballReady, true);
  assert.ok(player.skillCooldowns.fireball > 0);

  const enemy = nearbyEnemy(RK, player, 1, 0);
  const hpBefore = enemy.hp;
  assert.equal(RK.Combat.castMageSpell('fireball', enemy.x, enemy.y), true);
  assert.equal(player.pendingSpell, null);
  assert.equal(player.fireballReady, false);
  assert.ok(enemy.hp < hpBefore || enemy.hp <= 0);
  assert.ok(enemy.burningTurns > 0 || (enemy.statuses && enemy.statuses.burning));
});

test('mass fireball arms on activation and damages enemies around the clicked tile', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startMageRun(RK);
  const enemy = nearbyEnemy(RK, player, 2, 0);
  const hpBefore = enemy.hp;
  assert.equal(RK.Combat.activateClassSkill('mass_fireball'), true);
  assert.equal(player.pendingSpell, 'mass_fireball');
  assert.equal(player.massFireballReady, true);
  assert.equal(RK.Combat.castMageSpell('mass_fireball', enemy.x, enemy.y), true);
  assert.equal(player.pendingSpell, null);
  assert.equal(player.massFireballReady, false);
  assert.ok(enemy.hp < hpBefore || enemy.hp <= 0);
  assert.ok((enemy.burningTurns > 0) || (enemy.statuses && enemy.statuses.burning));
});

test('homing lightning strikes visible enemies automatically', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startMageRun(RK);
  const enemy = nearbyEnemy(RK, player, 1, 0);
  const hpBefore = enemy.hp;
  assert.equal(RK.Combat.activateClassSkill('homing_lightning'), true);
  assert.ok(enemy.hp < hpBefore || enemy.hp <= 0);
});

test('mage magic does not bypass cooldown', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startMageRun(RK);
  assert.equal(RK.Combat.activateClassSkill('fireball'), true);
  assert.equal(RK.Combat.activateClassSkill('fireball'), false);
  const cd = player.skillCooldowns.fireball;
  assert.ok(cd > 0);
  RK.Combat.skipTurn();
  assert.equal(player.skillCooldowns.fireball, cd - 1);
});