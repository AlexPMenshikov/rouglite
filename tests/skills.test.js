'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createSandbox, startRunAsClass } = require('./helpers/sandbox');

test('каждый класс имеет три навыка с уровнями 1/5/10', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const classes = RK.CONFIG.PLAYER_CLASSES;
  assert.ok(classes.length >= 3);
  for (const classId of classes) {
    const skills = RK.Skills.skillsFor(classId);
    assert.equal(skills.length, 3, classId + ': три навыка');
    assert.equal(skills[0].level, 1);
    assert.equal(skills[1].level, 5);
    assert.equal(skills[2].level, 10);
    for (const sk of skills) {
      assert.ok(sk.id, classId + ': навык без id');
      assert.ok(sk.name, classId + ': навык без имени');
      assert.ok(sk.text, classId + ': навык без описания');
      assert.ok(sk.cooldown > 0, classId + ': навык без кулдауна');
    }
  }
});

test('навык нельзя использовать до открытия уровнем', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startRunAsClass(RK, 'tank');
  player.level = 1;
  const advanced = RK.Skills.skillsFor('tank')[1];
  assert.equal(RK.Skills.isUnlocked('tank', advanced.id, player.level), false);
  assert.equal(RK.Combat.activateClassSkill(advanced.id), false);
  assert.equal((player.skillCooldowns || {})[advanced.id] || 0, 0);
});

test('базовый навык танка работает с первого уровня', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startRunAsClass(RK, 'tank');
  player.level = 1;
  const basic = RK.Skills.skillsFor('tank')[0];
  assert.equal(RK.Combat.activateClassSkill(basic.id), true);
  assert.equal(player.reflectShield, 3);
  assert.ok(player.skillCooldowns[basic.id] > 0);
});

test('кулдаун тикает каждый ход', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startRunAsClass(RK, 'tank');
  player.level = 1;
  const basic = RK.Skills.skillsFor('tank')[0];
  RK.Combat.activateClassSkill(basic.id);
  const cd = player.skillCooldowns[basic.id];
  assert.ok(cd > 0);
  RK.Combat.skipTurn();
  assert.equal(player.skillCooldowns[basic.id], cd - 1);
});

test('навык 5 уровня открывается на 5 уровне', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startRunAsClass(RK, 'berserker');
  player.level = 5;
  const advanced = RK.Skills.skillsFor('berserker')[1];
  assert.equal(RK.Skills.isUnlocked('berserker', advanced.id, player.level), true);
  assert.equal(RK.Combat.activateClassSkill(advanced.id), true);
  assert.equal(player.bloodlustTurns, 4);
});

test('навык 10 уровня открывается на 10 уровне', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startRunAsClass(RK, 'archer');
  player.level = 10;
  const master = RK.Skills.skillsFor('archer')[2];
  assert.equal(RK.Skills.isUnlocked('archer', master.id, player.level), true);
  assert.equal(RK.Combat.activateClassSkill(master.id), true);
  assert.equal(player.piercingShots, 3);
});

test('глухая стена снижает входящий урон', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startRunAsClass(RK, 'tank');
  player.level = 5;
  const wall = RK.Skills.skillsFor('tank')[1];
  RK.Combat.activateClassSkill(wall.id);
  assert.equal(player.defenseReduceTurns, 3);
  assert.equal(player.defenseReduceAmount, 2);
});

test('удар щитом оглушает соседних врагов', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startRunAsClass(RK, 'tank');
  player.level = 10;
  const bash = RK.Skills.skillsFor('tank')[2];
  RK.Combat.activateClassSkill(bash.id);
  assert.equal(player.shieldBash, true);
});

test('град стрел поражает всех видимых врагов', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startRunAsClass(RK, 'archer');
  player.level = 5;
  const volley = RK.Skills.skillsFor('archer')[1];
  assert.equal(RK.Combat.activateClassSkill(volley.id), true);
  assert.equal(player.volleyReady, true);
});

test('пронзающий выстрел пробивает врагов на линии', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startRunAsClass(RK, 'archer');
  player.level = 10;
  const piercing = RK.Skills.skillsFor('archer')[2];
  RK.Combat.activateClassSkill(piercing.id);
  assert.equal(player.piercingShots, 3);
});

test('неудержимый удваивает атаку и снижает урон', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startRunAsClass(RK, 'berserker');
  player.level = 10;
  const unstoppable = RK.Skills.skillsFor('berserker')[2];
  RK.Combat.activateClassSkill(unstoppable.id);
  assert.equal(player.unstoppableTurns, 3);
});

test('навыки сохраняются в снимке и восстанавливаются', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startRunAsClass(RK, 'tank');
  player.level = 5;
  const wall = RK.Skills.skillsFor('tank')[1];
  RK.Combat.activateClassSkill(wall.id);
  const snapshot = RK.Combat.createSnapshot();
  assert.ok(snapshot.game.player.skillCooldowns);
  assert.ok(snapshot.game.player.skillCooldowns[wall.id] > 0);
});
