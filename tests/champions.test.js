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