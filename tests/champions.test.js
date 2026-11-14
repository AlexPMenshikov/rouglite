'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSandbox } = require('./helpers/sandbox');

test('champion spawn is deterministic for one seed', () => {
  const { sandbox: a } = createSandbox({ seed: 45 });
  const { sandbox: b } = createSandbox({ seed: 45 });
  a.RK.CONFIG.ENABLE_WORLD = false;
  b.RK.CONFIG.ENABLE_WORLD = false;
  a.RK.Combat.newRun({ size: 'medium', style: 'stone' });
  b.RK.Combat.newRun({ size: 'medium', style: 'stone' });
  const championsA = a.RK.GAME.enemies.filter((e) => e.isChampion);
  const championsB = b.RK.GAME.enemies.filter((e) => e.isChampion);
  assert.equal(championsA.length, championsB.length);
  assert.equal(
    JSON.stringify(championsA.map((e) => e.affixes.concat(e.name))),
    JSON.stringify(championsB.map((e) => e.affixes.concat(e.name))),
  );
  assert.ok(championsA.every((e) => Array.isArray(e.affixes) && e.affixes.length >= 1));
});

test('champion fields survive a network snapshot round trip', () => {
  const { sandbox } = createSandbox({ seed: 7 });
  const RK = sandbox.RK;
  RK.CONFIG.ENABLE_WORLD = false;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  const champion = RK.Entities.makeEnemy('rat', 1, 1, 4, false, true);
  champion.phaseDone = false;
  RK.GAME.enemies = [champion];
  const beforeAffixes = champion.affixes.slice();
  const beforeName = champion.name;
  const beforePhase = champion.phase;

  const snapshot = RK.Combat.createSnapshot();
  assert.ok(snapshot, 'snapshot created');
  const player = RK.GAME.player;
  const restored = RK.Combat.applySnapshot(snapshot, player.id);
  assert.equal(restored, true);

  const restoredChampion = RK.GAME.enemies.find((enemy) => enemy && enemy.isChampion);
  assert.ok(restoredChampion, 'champion restored');
  assert.deepEqual(restoredChampion.affixes, beforeAffixes);
  assert.equal(restoredChampion.name, beforeName);
  assert.equal(restoredChampion.phase, beforePhase);
  assert.equal(restoredChampion.isChampion, true);

  // One-shot phase is preserved by the snapshot and applies only once.
  RK.Combat.triggerChampionPhase(restoredChampion);
  const hpAfterPhase = restoredChampion.hp;
  RK.Combat.triggerChampionPhase(restoredChampion);
  assert.equal(restoredChampion.hp, hpAfterPhase);
});

test('enemy tactics prefer wounded targets and keep bosses from rushing into melee', () => {
  const { sandbox } = createSandbox({ seed: 11 });
  const RK = sandbox.RK;
  RK.CONFIG.ENABLE_WORLD = false;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });

  const wounded = {
    id: 'wounded',
    name: 'Израненный',
    x: RK.GAME.player.x + 2,
    y: RK.GAME.player.y,
    hp: 8,
    maxHp: 30,
    alive: true,
    classId: 'paladin',
  };
  const sturdy = {
    id: 'sturdy',
    name: 'Крепкий',
    x: RK.GAME.player.x + 1,
    y: RK.GAME.player.y,
    hp: 24,
    maxHp: 30,
    alive: true,
    classId: 'berserker',
  };
  const boss = RK.Entities.makeBoss(RK.GAME.player.x - 1, RK.GAME.player.y, 1, 'boss_brute');
  boss.behavior = 'boss';
  boss.hp = 20;
  boss.maxHp = 80;
  boss.alerted = true;
  boss.alive = true;

  const target = RK.CombatHit.chooseEnemyTarget(boss, [wounded, sturdy]);
  assert.equal(target.id, 'wounded');

  RK.GAME.player.hp = 2;
  RK.GAME.player.maxHp = 30;
  RK.GAME.player.alive = true;

  const step = RK.CombatHit.pickEnemyStep(boss, RK.GAME.player);
  assert.ok(step, 'enemy step generated');
  assert.ok(Math.abs(step.x - RK.GAME.player.x) + Math.abs(step.y - RK.GAME.player.y) >= 2);
  assert.ok(step.x !== boss.x || step.y !== boss.y);
});

test('enemy groups focus on a target already engaged by an ally', () => {
  const { sandbox } = createSandbox({ seed: 12 });
  const RK = sandbox.RK;
  RK.CONFIG.ENABLE_WORLD = false;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  const player = RK.GAME.player;
  const target = {
    id: 'focus',
    x: player.x + 2,
    y: player.y,
    hp: 20,
    maxHp: 30,
    alive: true,
    classId: 'mage',
  };
  const alternate = {
    id: 'alternate',
    x: player.x,
    y: player.y + 2,
    hp: 20,
    maxHp: 30,
    alive: true,
    classId: 'mage',
  };
  const leader = RK.Entities.makeEnemy('skeleton', player.x - 2, player.y, 1);
  const ally = RK.Entities.makeEnemy('rat', player.x - 1, player.y, 1);
  RK.Map.zones = [];
  ally.alerted = true;
  ally.targetId = target.id;
  RK.GAME.enemies = [leader, ally];

  assert.equal(RK.CombatHit.enemyTacticalRole(leader), 'attacker');
  assert.equal(RK.CombatHit.enemyTacticalRole(RK.Entities.makeEnemy(
    'boss_brute', player.x - 3, player.y, 1,
  )), 'leader');
  assert.equal(RK.CombatHit.enemyTacticalRole(RK.Entities.makeEnemy(
    'archer', player.x - 3, player.y, 1,
  )), 'support');
  assert.equal(RK.CombatHit.chooseEnemyTarget(leader, [target, alternate]).id, target.id);

  ally.alerted = false;
  RK.Map.zones = [{ type: 'attack', x: target.x, y: target.y, radius: 1 }];
  assert.equal(RK.CombatHit.chooseEnemyTarget(leader, [target, alternate]).id, alternate.id);
});

test('bosses enter a timed phase with a distinct attack pattern and zone', () => {
  const { sandbox } = createSandbox({ seed: 13 });
  const RK = sandbox.RK;
  RK.CONFIG.ENABLE_WORLD = false;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  RK.Map.zones = [];

  const boss = RK.Entities.makeBoss(RK.GAME.player.x + 3, RK.GAME.player.y, 1, 'boss_brute');
  boss.hp = 40;
  boss.maxHp = 100;
  boss.atk = 10;
  boss.def = 2;
  RK.GAME.enemies = [boss];

  RK.CombatHit.triggerBossPhase(boss);
  assert.equal(boss.phase, 1);
  assert.equal(boss.phaseStyle, 'assault');
  assert.equal(boss.phaseRange, 2);
  assert.equal(boss.atk, 13);
  assert.equal(boss.def, 3);
  assert.equal(boss.phaseTurns, 3);
  assert.equal(RK.Map.zones.length, 1);
  assert.equal(RK.Map.zones[0].type, 'weakDefense');

  const rangedBoss = RK.Entities.makeBoss(
    RK.GAME.player.x + 4, RK.GAME.player.y, 1, 'boss_archer',
  );
  rangedBoss.hp = 40;
  rangedBoss.maxHp = 100;
  RK.CombatHit.triggerBossPhase(rangedBoss);
  assert.equal(rangedBoss.phaseStyle, 'volley');
  assert.equal(rangedBoss.phaseRange, rangedBoss.range + 2);

  const snapshot = RK.Combat.createSnapshot();
  const { sandbox: restored } = createSandbox({ seed: 14 });
  restored.RK.Combat.newRun({ size: 'compact', style: 'stone' });
  assert.equal(restored.RK.Combat.applySnapshot(snapshot, RK.GAME.player.id), true);
  const restoredBoss = restored.RK.GAME.enemies.find((enemy) => enemy.type === 'boss_brute');
  assert.equal(restoredBoss.phaseTurns, 3);
  assert.equal(restoredBoss.phaseStyle, 'assault');
  assert.ok(restored.RK.Map.zones.some((zone) => zone.bossPhaseId === restoredBoss.phaseZoneId));

  const phaseZoneId = restoredBoss.phaseZoneId;
  restored.RK.CombatHit.tickBossPhase(restoredBoss);
  restored.RK.CombatHit.tickBossPhase(restoredBoss);
  assert.ok(restored.RK.Map.zones.some((zone) => zone.bossPhaseId === phaseZoneId));
  restored.RK.CombatHit.tickBossPhase(restoredBoss);
  assert.equal(restored.RK.Map.zones.some((zone) => zone.bossPhaseId === phaseZoneId), false);
  assert.equal(restoredBoss.phaseZoneId, null);

  const primary = RK.GAME.player;
  const teammate = Object.assign({}, primary, {
    id: 'guest',
    name: 'Союзник',
    x: primary.x,
    y: primary.y + 1,
  });
  RK.GAME.players = [primary, teammate];
  const volleyBoss = RK.Entities.makeBoss(primary.x - 6, primary.y, 1, 'boss_archer');
  volleyBoss.alerted = true;
  volleyBoss.phaseStyle = 'volley';
  volleyBoss.phaseRange = 7;
  RK.GAME.enemies = [volleyBoss];
  const primaryHp = primary.hp;
  const teammateHp = teammate.hp;
  const lineOk = RK.Fov.lineOk;
  RK.Fov.lineOk = function () { return true; };
  try {
    RK.CombatHit.enemyAct(volleyBoss);
  } finally {
    RK.Fov.lineOk = lineOk;
  }
  assert.ok(primary.hp < primaryHp, 'the selected target is hit');
  assert.ok(teammate.hp < teammateHp, 'the volley also hits a nearby party member');
});