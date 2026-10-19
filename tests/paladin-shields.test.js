'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, startRunAsClass, placeAdjacentEnemy } = require('./helpers/sandbox');

// Паладин — переименованный танк: старые сейвы и клиенты шлют 'tank'.
test('paladin is the registered class and tank is only an alias', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  assert.deepEqual([...RK.CONFIG.PLAYER_CLASSES], ['paladin', 'berserker', 'archer', 'mage']);
  assert.equal(RK.Classes.CLASS_DEFS.paladin.name, 'Паладин');
  assert.equal(RK.Classes.normalizeClassId('tank'), 'paladin');
  assert.equal(RK.Classes.normalizeClassId('paladin'), 'paladin');
  assert.equal(RK.Classes.getClassDef('tank').id, 'paladin');
  assert.equal(RK.Skills.skillsFor('tank')[0].name, 'Святой отклик');
});

test('an old save with tank migrates to paladin', () => {
  const storage = new Map();
  storage.set('rogalite_meta_v1', JSON.stringify({ classes: { tank: true }, selectedClass: 'tank' }));
  const { sandbox } = createSandbox({ storage });
  sandbox.RK.Meta.load();
  assert.equal(sandbox.RK.Meta.data.classes.paladin, true);
  assert.equal(sandbox.RK.Meta.data.classes.tank, undefined);
  assert.equal(sandbox.RK.Meta.data.selectedClass, 'paladin');
});

test('the offhand slot is part of the shared slot table', () => {
  const { sandbox } = createSandbox();
  const C = sandbox.RK.CONFIG;
  assert.ok(C.SLOTS.includes('offhand'));
  assert.equal(C.SLOT_LABELS.offhand, 'Вторая рука');
  assert.equal(C.SLOT_BODY_PARTS.offhand, 'во вторую руку');
  assert.equal(C.SLOT_ASSETS.offhand, 'shield');
  assert.equal(C.SLOT_VISUAL_TYPES.offhand, 'shield');
});

function shieldItem(name, def, hp) {
  return {
    kind: 'loot', slot: 'offhand', shieldType: 'normal', type: 'shield', asset: 'shield',
    name, rarity: 'common', color: '#c8c4d8', summary: `+${def} DEF, +${hp} HP`,
    value: 10, upgradeLevel: 0,
    stats: { atk: 0, def, hp, heal: 0, luck: 0 },
    baseStats: { atk: 0, def, hp, heal: 0, luck: 0 },
  };
}

function axeItem(name, atk) {
  return {
    kind: 'loot', slot: 'weapon', weaponType: 'melee', weaponKind: 'axe', type: 'axe', asset: 'axe',
    name, rarity: 'common', color: '#c8c4d8', summary: `+${atk} ATK`,
    value: 10, upgradeLevel: 0,
    stats: { atk, def: 0, hp: 0, heal: 0, luck: 0 },
    baseStats: { atk, def: 0, hp: 0, heal: 0, luck: 0 },
  };
}

function swordItem(name, atk) {
  return {
    kind: 'loot', slot: 'weapon', weaponType: 'melee', weaponKind: 'sword', type: 'sword', asset: 'sword',
    name, rarity: 'common', color: '#c8c4d8', summary: `+${atk} ATK`,
    value: 10, upgradeLevel: 0,
    stats: { atk, def: 0, hp: 0, heal: 0, luck: 0 },
    baseStats: { atk, def: 0, hp: 0, heal: 0, luck: 0 },
  };
}

function bowItem(name, atk) {
  return {
    kind: 'loot', slot: 'weapon', weaponType: 'bow', twoHanded: true, type: 'bow', asset: 'bow',
    name, rarity: 'common', color: '#c8c4d8', summary: `+${atk} ATK`,
    value: 10, upgradeLevel: 0,
    stats: { atk, def: 0, hp: 0, heal: 0, luck: 0 },
    baseStats: { atk, def: 0, hp: 0, heal: 0, luck: 0 },
  };
}

test('shields drop as offhand loot with their own sprite and stats', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const item = RK.Items.generateLootItem(3, 0, 0, false, false);
    if (item.slot !== 'offhand' || item.weaponKind === 'magicOrb') continue;
    seen.add(item.shieldType);
    assert.equal(item.type, 'shield');
    assert.equal(item.asset, { small: 'shieldSmall', normal: 'shield', large: 'shieldLarge' }[item.shieldType]);
    assert.ok(item.stats.def > 0 && item.stats.hp > 0);
  }
  assert.deepEqual([...seen].sort(), ['large', 'normal', 'small']);
});

test('the offhand slot also rolls the mage orb', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  let orbs = 0;
  for (let i = 0; i < 400; i++) {
    const item = RK.Items.generateLootItem(3, 0, 0, false, false);
    if (item.slot !== 'offhand' || item.weaponKind !== 'magicOrb') continue;
    orbs++;
    assert.equal(item.asset, 'magicOrb');
    assert.ok(item.stats.spellPower > 0, 'шар даёт бонус к заклинаниям');
    assert.ok(['fire', 'lightning'].includes(item.stats.element));
  }
  assert.ok(orbs > 0, 'магический шар должен попадаться в добыче');
});

test('only the paladin can wear a shield, and it lands in the offhand slot', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;

  const paladin = startRunAsClass(RK, 'paladin');
  paladin.backpack.push(shieldItem('Щит веры', 3, 10));
  assert.equal(RK.Combat.useInventoryItem(paladin.backpack.length - 1), true);
  assert.equal(paladin.equipment.offhand.name, 'Щит веры');
  assert.equal(paladin.equipment.weapon, null);

  const berserker = startRunAsClass(RK, 'berserker');
  berserker.backpack.push(shieldItem('Щит веры', 3, 10));
  assert.equal(RK.Combat.useInventoryItem(berserker.backpack.length - 1), false);
  assert.equal(berserker.equipment.offhand, null);
  assert.match(RK.Classes.equipRestriction(berserker, berserker.backpack[berserker.backpack.length - 1]), /не может держать щит/);

  const archer = startRunAsClass(RK, 'archer');
  archer.backpack.push(shieldItem('Щит веры', 3, 10));
  assert.equal(RK.Combat.useInventoryItem(archer.backpack.length - 1), false);
  assert.equal(archer.equipment.offhand, null);
});

test('blade kinds are class-locked: paladin takes sword and spear, berserker takes axe', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;

  const paladin = startRunAsClass(RK, 'paladin');
  paladin.backpack.push(swordItem('Меч грозы', 8));
  assert.equal(RK.Combat.useInventoryItem(paladin.backpack.length - 1), true);
  assert.equal(paladin.equipment.weapon.name, 'Меч грозы');

  paladin.backpack.push(axeItem('Топор ярости', 8));
  assert.equal(RK.Combat.useInventoryItem(paladin.backpack.length - 1), false);
  assert.match(RK.Classes.equipRestriction(paladin, paladin.backpack[paladin.backpack.length - 1]), /не может держать топор/);

  const berserker = startRunAsClass(RK, 'berserker');
  berserker.backpack.push(axeItem('Топор ярости', 8));
  assert.equal(RK.Combat.useInventoryItem(berserker.backpack.length - 1), true);
  assert.equal(berserker.equipment.weapon.name, 'Топор ярости');

  berserker.backpack.push(swordItem('Меч грозы', 8));
  assert.equal(RK.Combat.useInventoryItem(berserker.backpack.length - 1), false);
  assert.match(RK.Classes.equipRestriction(berserker, berserker.backpack[berserker.backpack.length - 1]), /мечи и копья/);
});

test('the berserker wields an axe in each hand and the stats add up', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const berserker = startRunAsClass(RK, 'berserker');
  const base = berserker.atk;

  berserker.backpack.push(axeItem('Топор левый', 5));
  assert.equal(RK.Combat.useInventoryItem(berserker.backpack.length - 1), true);
  assert.equal(berserker.equipment.weapon.name, 'Топор левый');

  berserker.backpack.push(axeItem('Топор правый', 7));
  assert.equal(RK.Combat.useInventoryItem(berserker.backpack.length - 1), true);
  assert.equal(berserker.equipment.offhand.name, 'Топор правый');

  assert.equal(berserker.atk, base + 12, 'оба топора дают атаку');
  assert.equal(RK.Classes.targetSlotFor(berserker, berserker.equipment.offhand), 'offhand');

  // Снятие одного топора убирает только его бонус.
  RK.Combat.unequipSlot('offhand');
  assert.equal(berserker.equipment.offhand, null);
  assert.equal(berserker.atk, base + 5);
});

test('a two-handed bow fills both hands and blocks a second item', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const archer = startRunAsClass(RK, 'archer');

  archer.backpack.push(bowItem('Длинный лук', 9));
  assert.equal(RK.Combat.useInventoryItem(archer.backpack.length - 1), true);
  assert.equal(archer.equipment.weapon.name, 'Длинный лук');
  assert.equal(archer.equipment.offhand, archer.equipment.weapon, 'вторая рука — отражение лука');
  assert.equal(RK.Classes.handsFor(archer, archer.equipment.weapon).join(','), 'weapon,offhand');

  archer.backpack.push(shieldItem('Щит', 2, 5));
  assert.equal(RK.Combat.useInventoryItem(archer.backpack.length - 1), false, 'пока лук в руках, вторую руку не занять');

  // Снятие лука освобождает обе руки разом.
  RK.Combat.unequipSlot('weapon');
  assert.equal(archer.equipment.weapon, null);
  assert.equal(archer.equipment.offhand, null);
});

test('shield bash damage includes the shield defence', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const paladin = startRunAsClass(RK, 'paladin');
  paladin.level = 10;
  paladin.backpack.push(shieldItem('Щит веры', 4, 10));
  RK.Combat.useInventoryItem(paladin.backpack.length - 1);

  const { enemy } = placeAdjacentEnemy(RK, 'rat', { hp: 100000, maxHp: 100000 });
  const expected = Math.max(1, Math.floor(paladin.atk * 0.8) + 4);
  assert.equal(RK.Combat.activateClassSkill('shield_bash'), true);
  assert.equal(100000 - enemy.hp, expected);
});

test('hi-res sprite files override the atlas and draw scales them down', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'assets.js'] });
  const RK = sandbox.RK;

  class FakeImage {
    constructor() { this.width = 0; this.height = 0; this.onload = null; this.onerror = null; }
    set src(value) {
      this._src = value;
      setTimeout(() => {
        if (value.indexOf('assets/sprites/') === 0) {
          this.width = 256;
          this.height = 256;
          if (this.onload) this.onload();
        } else if (this.onerror) {
          this.onerror();
        }
      }, 0);
    }
    get src() { return this._src; }
  }
  sandbox.Image = FakeImage;

  const draws = [];
  const ctx = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    drawImage: (sprite, dx, dy, w, h) => draws.push([sprite.width, sprite.height, w, h]),
    fillRect() {},
  };

  RK.Assets.setEnabled(true, (error, loaded) => {
    assert.equal(error, null);
    assert.equal(loaded, true, 'hi-res спрайты загрузились');
    assert.equal(RK.Assets.source(), 'assets');
    assert.equal(RK.Assets.draw(ctx, 'floor', 0, 0, 32), true);
    assert.deepEqual(draws[0], [256, 256, 32, 32], 'нативный размер масштабируется к тайлу');
    assert.equal(ctx.imageSmoothingQuality, 'high', 'уменьшение — со сглаживанием');
  });
});
