'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, startRunAsClass } = require('./helpers/sandbox');

// Конечности живут отдельно от общего HP: травмы выдают пороги, кровотечение
// снимает общее HP, а смерть возможна только по общему HP.
function createLimbsSandbox() {
  const { sandbox } = createSandbox({ seed: 41 });
  return { sandbox, RK: sandbox.RK };
}

function player(RK) {
  RK.Meta.data.selectedClass = 'paladin';
  return RK.Entities.createPlayer(5, 5);
}

function pinZone(RK, zoneId) {
  const original = RK.RNG.pick;
  RK.RNG.pick = () => zoneId;
  return () => { RK.RNG.pick = original; };
}

test('anatomy gives limbs to humanoids and beasts but not to slime, ghost or golem', () => {
  const { RK } = createLimbsSandbox();

  const hero = player(RK);
  assert.equal(hero.anatomy, 'humanoid');
  assert.deepEqual(Object.keys(hero.limbs.zones).sort(), ['arms', 'chest', 'head', 'legs']);
  assert.equal(hero.limbs.zones.head.maxHp, Math.ceil(hero.maxHp * RK.CONFIG.LIMBS.HP_SHARE.head));

  const rat = RK.Entities.makeEnemy('rat', 1, 1, 1);
  assert.equal(rat.anatomy, 'beast');
  assert.equal(RK.Limbs.zoneName(rat.limbs.anatomy, 'arms'), 'Передние лапы');
  assert.equal(rat.limbs.zones.chest.maxHp, Math.ceil(rat.maxHp * 0.45));

  for (const type of ['slime', 'ghost', 'golem']) {
    const enemy = RK.Entities.makeEnemy(type, 1, 1, 1);
    assert.equal(enemy.anatomy, 'none', type + ': без конечностей');
    assert.equal(enemy.limbs, null);
  }
  for (const type of ['skeleton', 'boss_bone', 'boss_witch']) {
    assert.equal(RK.Entities.makeEnemy(type, 1, 1, 1).anatomy, 'humanoid', type + ': гуманоид');
  }
  assert.equal(RK.Entities.makeEnemy('boss_rat', 1, 1, 1).anatomy, 'beast');
  assert.equal(RK.Entities.makeEnemy('boss_slime', 1, 1, 1).anatomy, 'none');
});

test('a physical hit damages total HP only indirectly and marks limb thresholds', () => {
  const { RK } = createLimbsSandbox();
  const hero = player(RK);
  const restore = pinZone(RK, 'head');
  try {
    const head = hero.limbs.zones.head;

    RK.Limbs.takeHit(hero, 1);
    assert.equal(head.hp, head.maxHp - 1, 'лёгкий удар бьёт зону, а не общее HP');
    assert.equal(hero.hp, hero.maxHp, 'общее HP меняет только бой');
    assert.equal(head.bleeding, 0);

    head.hp = Math.floor(head.maxHp * 0.4);
    RK.Limbs.takeHit(hero, 1);
    assert.equal(head.bleeding, 1, 'HP ниже половины даёт малое кровотечение');

    const fresh = player(RK);
    // Урон зоны — 70% от общего, поэтому полный maxHp зоны гарантированно
    // перекрывает порог большого кровотечения в 35%.
    RK.Limbs.takeHit(fresh, fresh.limbs.zones.head.maxHp);
    assert.equal(fresh.limbs.zones.head.bleeding, 2, 'сильный удар даёт большое кровотечение');

    const smashed = player(RK);
    smashed.limbs.zones.head.hp = 2;
    RK.Limbs.takeHit(smashed, 10);
    assert.equal(smashed.limbs.zones.head.hp, 0);
    assert.equal(smashed.limbs.zones.head.fracture, true, 'ноль HP зоны ставит перелом');
    assert.equal(smashed.limbs.zones.head.bleeding, 2);
    assert.ok(smashed.hp > 0, 'ноль HP конечности смертью не является');
  } finally {
    restore();
  }
});

test('fractures multiply attack, incoming damage and dodge', () => {
  const { RK } = createLimbsSandbox();
  const hero = player(RK);

  hero.limbs.zones.head.fracture = true;
  assert.equal(RK.Limbs.attackMultiplier(hero), RK.CONFIG.LIMBS.HEAD_FRACTURE_ATK);
  hero.limbs.zones.arms.fracture = true;
  assert.equal(RK.Limbs.attackMultiplier(hero),
    RK.CONFIG.LIMBS.HEAD_FRACTURE_ATK * RK.CONFIG.LIMBS.ARMS_FRACTURE_ATK,
    'штрафы перемножаются');
  hero.limbs.zones.chest.fracture = true;
  assert.equal(RK.Limbs.damageTakenMultiplier(hero), RK.CONFIG.LIMBS.CHEST_FRACTURE_TAKEN);
  hero.limbs.zones.legs.fracture = true;
  assert.equal(RK.Limbs.dodgePenalty(hero), RK.CONFIG.LIMBS.LEGS_FRACTURE_DODGE);
});

test('bleeding drains total HP and can kill the party or an enemy through context', () => {
  const { RK } = createLimbsSandbox();
  const hero = player(RK);
  hero.hp = 3;
  hero.limbs.zones.arms.bleeding = 2;
  const partyDamage = [];
  const partyContext = {
    isParty: () => true,
    onDamage: (actor, damage, cause) => partyDamage.push([damage, cause]),
  };

  assert.equal(RK.Limbs.tick(hero, partyContext), 2);
  assert.equal(hero.hp, 1);
  assert.deepEqual(partyDamage, [[2, 'От кровотечения']]);

  assert.equal(RK.Limbs.tick(hero, partyContext), 1);
  assert.equal(hero.hp, 0);

  const enemy = RK.Entities.makeEnemy('skeleton', 1, 1, 1);
  enemy.hp = 1;
  enemy.limbs.zones.legs.bleeding = 2;
  let killed = null;
  RK.Limbs.tick(enemy, { isParty: () => false, killEnemy: (actor) => { killed = actor; } });
  assert.equal(enemy.hp, 0);
  assert.equal(killed, enemy, 'смерть врага уходит в killEnemy');
});

test('whole limbs regenerate every few turns, injured limbs do not', () => {
  const { RK } = createLimbsSandbox();
  const hero = player(RK);
  hero.limbs.zones.head.hp = hero.limbs.zones.head.maxHp - 2;
  hero.limbs.zones.arms.hp = hero.limbs.zones.arms.maxHp - 1;
  hero.limbs.zones.arms.bleeding = 1;
  hero.limbs.zones.legs.fracture = true;
  const headBefore = hero.limbs.zones.head.hp;
  const armsBefore = hero.limbs.zones.arms.hp;
  const turns = RK.CONFIG.LIMBS.REGEN_TURNS;

  for (let i = 0; i < turns; i++) RK.Limbs.tick(hero, { isParty: () => true });
  assert.equal(hero.limbs.zones.head.hp, headBefore + RK.CONFIG.LIMBS.REGEN_AMOUNT);
  assert.equal(hero.limbs.zones.arms.hp, armsBefore, 'кровоточащая конечность не восстанавливается');
});

test('bandage stops the worst bleeding, splint fixes the worst fracture', () => {
  const { RK } = createLimbsSandbox();
  const hero = player(RK);
  hero.limbs.zones.arms.bleeding = 1;
  hero.limbs.zones.legs.bleeding = 2;
  hero.limbs.zones.legs.fracture = true;
  hero.limbs.zones.legs.hp = Math.floor(hero.limbs.zones.legs.maxHp * 0.2);
  const legHp = hero.limbs.zones.legs.hp;

  assert.equal(RK.Limbs.worstBleeding(hero), 'legs', 'сначала лечится сильное кровотечение');
  const bandaged = RK.Limbs.treat(hero, 'legs', 'bandage');
  assert.equal(bandaged.zone, 'legs');
  assert.ok(bandaged.healed > 0);
  assert.equal(hero.limbs.zones.legs.bleeding, 0);
  assert.equal(hero.limbs.zones.legs.hp > legHp, true);
  assert.equal(RK.Limbs.treat(hero, 'legs', 'bandage'), null, 'повторно бинтовать нечего');

  assert.equal(RK.Limbs.worstFracture(hero), 'legs');
  const splinted = RK.Limbs.treat(hero, 'legs', 'splint');
  assert.ok(splinted.healed > 0);
  assert.equal(hero.limbs.zones.legs.fracture, false);
  assert.equal(RK.Limbs.treat(hero, 'legs', 'splint'), null);
});

test('inventory uses a bandage for the worst injury and keeps the rest of the stack', () => {
  const { RK } = createLimbsSandbox();
  const hero = player(RK);
  const run = { player: hero, items: [], floor: 1, locationMode: false };
  RK.Inventory.setContext({ getGame: () => run });
  hero.backpack = [RK.Items.spawnBandage(0, 0), RK.Items.spawnBandage(0, 0)];
  hero.backpack[0].count = 2;
  hero.limbs.zones.chest.bleeding = 1;
  hero.limbs.zones.head.bleeding = 2;

  assert.equal(RK.Inventory.useInventoryItem(0), true);
  assert.equal(hero.limbs.zones.head.bleeding, 0, 'бинт берёт сильнейшее кровотечение');
  assert.equal(hero.limbs.zones.chest.bleeding, 1);
  assert.equal(hero.backpack[0].count, 1, 'один бинт из стопки израсходован');

  hero.limbs.zones.chest.bleeding = 0;
  assert.equal(RK.Inventory.useInventoryItem(0), false, 'без травмы предмет не тратится');
  assert.equal(hero.backpack[0].count, 1);
});

test('snapshot restores limbs and an old snapshot without them recovers anatomy', () => {
  const { RK } = createLimbsSandbox();
  startRunAsClass(RK, 'paladin');
  RK.GAME.enemies = [RK.Entities.makeEnemy('wolf', RK.GAME.player.x + 1, RK.GAME.player.y, 1)];
  RK.GAME.player.limbs.zones.arms.hp = 2;
  RK.GAME.player.limbs.zones.arms.bleeding = 1;
  RK.GAME.enemies[0].limbs.zones.head.fracture = true;

  const snapshot = RK.Combat.createSnapshot();
  assert.ok(snapshot);
  assert.equal(snapshot.game.player.limbs.zones.arms.hp, 2);
  assert.equal(snapshot.game.enemies[0].limbs.zones.head.fracture, true);

  // Старый снимок: поля limbs нет, а анатомия восстанавливается по типу.
  delete snapshot.game.player.limbs;
  delete snapshot.game.player.anatomy;
  delete snapshot.game.enemies[0].limbs;
  delete snapshot.game.enemies[0].anatomy;

  assert.equal(RK.Combat.applySnapshot(snapshot, snapshot.game.player.id), true);
  assert.equal(RK.GAME.player.anatomy, 'humanoid');
  assert.ok(RK.GAME.player.limbs.zones.head);
  assert.equal(RK.GAME.enemies[0].anatomy, 'beast');
  assert.equal(RK.GAME.enemies[0].limbs.zones.arms.maxHp,
    Math.ceil(RK.GAME.enemies[0].maxHp * RK.CONFIG.LIMBS.HP_SHARE.arms));
});
