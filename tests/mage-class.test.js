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

test('mage weapons drop from common loot and the mage can wear them', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startMageRun(RK);
  const mageKinds = RK.CONFIG.MAGE_WEAPON_KINDS;
  const seen = new Set();
  let orbs = 0;
  for (let i = 0; i < 900; i++) {
    const item = RK.Items.generateLootItem(3, 0, 0, false, false);
    if (item.slot === 'offhand' && item.weaponKind === RK.CONFIG.MAGE_ORB_KIND) orbs++;
    if (item.slot !== 'weapon' || mageKinds.indexOf(item.weaponKind) < 0) continue;
    seen.add(item.weaponKind);
    assert.equal(item.weaponType, 'melee', 'магическое оружие — ближний бой');
    assert.equal(item.asset, item.weaponKind, 'у каждого вида свой спрайт');
    assert.equal(RK.Classes.equipRestriction(player, item), '', 'маг может взять ' + item.name);
  }
  assert.deepEqual([...seen].sort(), [...mageKinds].sort(), 'выпадают все виды магического оружия');
  assert.ok(orbs > 0, 'магический шар тоже попадается');
});

test('mage wears only cloaks and magic weapons, and the orb boosts spells', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startMageRun(RK);

  const orb = { slot: 'offhand', weaponKind: 'magicOrb', name: 'Магический Шар' };
  const shield = { slot: 'offhand', name: 'Щит' };
  const bow = { slot: 'weapon', weaponType: 'bow', name: 'Лук' };
  const sword = { slot: 'weapon', weaponType: 'melee', weaponKind: 'sword', name: 'Меч' };
  const cloak = { slot: 'armor', type: 'cloak', name: 'Плащ' };
  const plate = { slot: 'armor', type: 'armor', name: 'Кираса' };

  assert.equal(RK.Classes.equipRestriction(player, orb), '');
  assert.match(RK.Classes.equipRestriction(player, shield), /щит/);
  assert.match(RK.Classes.equipRestriction(player, bow), /луком и арбалетом/);
  assert.match(RK.Classes.equipRestriction(player, sword), /мечи и копья/);
  assert.equal(RK.Classes.equipRestriction(player, cloak), '');
  assert.match(RK.Classes.equipRestriction(player, plate), /броню/);

  // Шар в offhand добавляет урон заклинаниям.
  const enemy = nearbyEnemy(RK, player, 1, 0);
  const hpBefore = enemy.hp;
  player.equipment.offhand = { ...orb, stats: { spellPower: 10, element: 'fire' } };
  assert.equal(RK.Combat.activateClassSkill('fireball'), true);
  assert.equal(RK.Combat.castMageSpell('fireball', enemy.x, enemy.y), true);
  const dealt = hpBefore - enemy.hp;
  assert.ok(dealt >= 20 - (enemy.def || 0), 'орб добавляет 10 урона при element=fire: ' + dealt);
});