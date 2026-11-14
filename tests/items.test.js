'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');
const CONFIG = require('../js/config');

// spawnKey и summarizeStats — потребители серверной сериализации и экранов лута:
// ошибка в ключе или строке статов видна только в собранном UI, поэтому проверяем
// точные поля предмета, а не факт его существования.

test('spawnKey returns an iron key by default and keeps a custom keyId', () => {
  const { sandbox } = createSandbox();
  const Items = sandbox.RK.Items;

  const iron = Items.spawnKey(3, 7);
  assert.deepEqual(
    {
      type: iron.type,
      kind: iron.kind,
      asset: iron.asset,
      keyId: iron.keyId,
      x: iron.x,
      y: iron.y,
      count: iron.count,
    },
    { type: 'key', kind: 'key', asset: 'key', keyId: 'iron', x: 3, y: 7, count: 1 },
  );
  assert.equal(typeof iron.name, 'string');
  assert.equal(typeof iron.summary, 'string');

  assert.equal(Items.spawnKey(0, 0, 'gold').keyId, 'gold');
});

test('spawnTrapItem carries type, damage and a readable name', () => {
  const { sandbox } = createSandbox();
  const Items = sandbox.RK.Items;

  const item = Items.spawnTrapItem({ type: 'flame', damage: 9 }, 2, 4);
  assert.equal(item.kind, 'trap');
  assert.equal(item.trapType, 'flame');
  assert.equal(item.trapDamage, 9);
  assert.equal(item.name, CONFIG.TRAP_NAMES.flame);
  assert.equal(item.value, 9 * 6, 'цена ловушки растёт с уроном');

  const fallback = Items.spawnTrapItem(null, 0, 0);
  assert.equal(fallback.trapType, 'spike');
  assert.equal(fallback.trapDamage, 5);
  assert.equal(Items.trapItemDamage(null), 5, 'без данных урон не падает ниже пяти');
  assert.equal(Items.trapItemDamage({ trapDamage: 0 }), 5, 'ноль читается как «урон не задан»');
  assert.equal(Items.trapItemName(null), 'Ловушка');
  assert.equal(Items.trapItemName({ trapType: 'needle' }), CONFIG.TRAP_NAMES.needle);
});

test('summarizeStats lists only the stats a piece of loot actually grants', () => {
  const { sandbox } = createSandbox();
  const summarize = sandbox.RK.Items.summarizeStats;

  assert.equal(summarize({ atk: 0, def: 0, hp: 0, heal: 0, luck: 0 }), '');
  assert.equal(summarize({ atk: 3, def: 0, hp: 12, heal: 0, luck: 5 }), '+3 ATK, +12 HP, +5% УДАЧ');
  assert.equal(
    summarize({ atk: 1, def: 2, hp: 3, heal: 4, luck: 5 }),
    '+1 ATK, +2 DEF, +3 HP, +4 ЛЕЧ, +5% УДАЧ',
    'порядок частей фиксирован, иначе тултипы прыгали бы между предметами',
  );
});

test('crafting uses an explicit compatible recipe and consumes partial stacks', () => {
  const { sandbox } = createSandbox();
  const Items = sandbox.RK.Items;
  const Inventory = sandbox.RK.Inventory;

  const item = {
    name: 'Тестовый клинок',
    slot: 'weapon',
    baseStats: { atk: 4, def: 1, hp: 5 },
    stats: { atk: 4, def: 1, hp: 5 },
    rarity: 'rare',
    upgradeLevel: 0,
  };
  const player = { classId: 'warrior' };
  const recipe = Items.findCraftingRecipe('ember');
  assert.ok(recipe, 'recipe exists');
  assert.deepEqual(Object.keys(Items.craftingRecipes()), CONFIG.CRAFTING_RECIPE_IDS);

  const materialA = Items.spawnCraftingMaterial('ember', 0, 0);
  const materialB = Items.spawnCraftingMaterial('ember', 1, 0);
  materialB.count = 2;
  const backpack = [materialA, materialB];

  assert.equal(Items.canCraftItem(item, 'ember', player, backpack), true);
  assert.equal(Items.craftItem(item, 'ember', player, backpack), true);
  assert.equal(item.enchantId, 'ember');
  assert.equal(item.stats.atk, 6, 'enchantment adds attack');
  assert.equal(backpack.length, 1, 'unused material remains in its stack');
  assert.equal(backpack[0].count, 1);
  assert.equal(Items.canCraftItem(item, 'ember', player, backpack), false, 'already enchanted gear cannot be enchanted again');
  assert.equal(Items.findCraftingRecipe('__proto__'), null, 'recipe lookup rejects inherited keys');
  const freshItem = { ...item, enchantId: undefined, stats: { atk: 4 }, baseStats: { atk: 4 } };
  assert.equal(Items.craftItem(freshItem, 'ember', player, backpack), false, 'insufficient materials do not enchant');
  assert.equal(backpack[0].count, 1, 'failed craft does not consume materials');

  const itemWithRune = {
    name: 'Щитовой доспех',
    slot: 'armor',
    baseStats: { def: 2, hp: 3 },
    stats: { def: 2, hp: 3 },
    rarity: 'rare',
    upgradeLevel: 0,
  };
  assert.equal(Items.canEnchantItem(itemWithRune, 'ember', player), false, 'weapon recipe rejects armor');
  assert.equal(Items.canEnchantItem({ ...itemWithRune, rarity: 'common' }, 'ward', player), false,
    'recipes require at least rare equipment');
  assert.equal(Items.applyEnchantment(itemWithRune, 'ward'), true);
  assert.equal(itemWithRune.stats.def, 4);
  assert.equal(itemWithRune.summary, '+4 DEF, +6 HP');

  const swift = Items.spawnCraftingMaterial('swift', 0, 0);
  swift.count = 2;
  assert.equal(Items.canEnchantItem(itemWithRune, 'swift', player), false, 'swift recipe checks class restrictions');
  assert.equal(Inventory.countCraftingMaterials([{ ...swift, count: 0 }, swift], 'swift'), 2,
    'zero-sized stacks do not provide materials');
  assert.equal(Inventory.consumeCraftingMaterials([swift], 'swift', 0), false,
    'zero-cost consumption is rejected');
});

test('spawnItems can place crafting materials in the dungeon', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  RK.Map = { w: CONFIG.COLS, h: CONFIG.ROWS };
  let nextX = 0;
  RK.MapGen.randomFloorNear = () => ({ x: nextX++, y: 1 });
  RK.RNG.int = (min) => min;
  RK.RNG.rand = () => 0.75;

  const items = RK.Items.spawnItems(1, { x: 0, y: 0 });
  assert.equal(items.length, 3);
  assert.ok(items.every(RK.Items.isCraftingMaterial), 'material drops use the regular floor loot pipeline');
  assert.ok(items.every((item) => CONFIG.CRAFTING_RECIPE_IDS.includes(item.materialId)));
});

test('picking up crafting materials stacks them in the backpack', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const material = RK.Items.spawnCraftingMaterial('ward', 2, 3);
  const player = { x: 2, y: 3, backpack: [] };
  const run = { player, items: [material], floor: 1, locationMode: false };
  RK.Inventory.setContext({ getGame: () => run });

  RK.Inventory.handlePickup();
  RK.Inventory.addCraftingMaterialToBackpack(player.backpack, RK.Items.spawnCraftingMaterial('ward', 0, 0));

  assert.equal(run.items.length, 0, 'floor material was removed');
  assert.equal(RK.Inventory.countCraftingMaterials(player.backpack, 'ward'), 2);
  assert.equal(player.backpack.length, 1, 'matching material pickups form one stack');
});
