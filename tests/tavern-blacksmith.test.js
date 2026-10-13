const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

const createContext = () => createSandbox();

// Компактная карта может не содержать комнаты достаточной площади, поэтому
// здесь берётся размер, где таверна гарантированно помещается.
test('tavern room is selected as largest non-spawn non-stair room', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'medium', style: 'stone' });
  const tavern = RK.MapGen.getTavern(RK.Map);
  assert.ok(tavern, 'tavern should exist on a map with multiple rooms');
  assert.ok(tavern.w >= 4 && tavern.h >= 4, 'tavern should be a reasonably sized room');
  assert.notEqual(tavern.roomIndex, 0, 'tavern should not be spawn room (index 0)');
});

test('isInTavern correctly identifies tavern tiles', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  const tavern = RK.MapGen.getTavern(RK.Map);
  if (tavern) {
    assert.ok(RK.MapGen.isInTavern(RK.Map, tavern.x, tavern.y), 'tavern top-left should be in tavern');
    assert.ok(RK.MapGen.isInTavern(RK.Map, tavern.x + tavern.w - 1, tavern.y + tavern.h - 1), 'tavern bottom-right should be in tavern');
    assert.ok(!RK.MapGen.isInTavern(RK.Map, RK.Map.spawn.x, RK.Map.spawn.y), 'spawn should not be in tavern');
    assert.ok(!RK.MapGen.isInTavern(RK.Map, RK.Map.stair.x, RK.Map.stair.y), 'stair should not be in tavern');
  }
});

test('enemies do not spawn inside tavern', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  const tavern = RK.MapGen.getTavern(RK.Map);
  if (tavern) {
    for (const enemy of RK.GAME.enemies) {
      assert.ok(!RK.MapGen.isInTavern(RK.Map, enemy.x, enemy.y), `enemy at ${enemy.x},${enemy.y} should not be in tavern`);
    }
  }
});

test('merchant and blacksmith placed in tavern when available', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  const tavern = RK.MapGen.getTavern(RK.Map);
  if (tavern && RK.GAME.merchant) {
    assert.ok(RK.MapGen.isInTavern(RK.Map, RK.GAME.merchant.x, RK.GAME.merchant.y), 'merchant should be in tavern');
  }
  if (tavern && RK.GAME.blacksmith) {
    assert.ok(RK.MapGen.isInTavern(RK.Map, RK.GAME.blacksmith.x, RK.GAME.blacksmith.y), 'blacksmith should be in tavern');
  }
});

test('blacksmith and merchant are on different tiles', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  if (RK.GAME.merchant && RK.GAME.blacksmith) {
    assert.ok(RK.GAME.merchant.x !== RK.GAME.blacksmith.x || RK.GAME.merchant.y !== RK.GAME.blacksmith.y, 'merchant and blacksmith should not share a tile');
  }
});

test('loot items have baseStats and upgradeLevel', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  RK.GAME.enemies = [];
  const item = RK.Items.generateLootItem(1, 0, 0, false);
  assert.ok(item.baseStats, 'item should have baseStats');
  assert.equal(item.upgradeLevel, 0, 'new item should have upgradeLevel 0');
  assert.ok(item.stats.atk === item.baseStats.atk && item.stats.def === item.baseStats.def, 'stats should match baseStats initially');
});

test('upgradeItem increases stats based on baseStats', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  const item = RK.Items.generateLootItem(1, 0, 0, false);
  const oldAtk = item.stats.atk;
  const oldDef = item.stats.def;
  const ok = RK.Items.upgradeItem(item);
  assert.equal(ok, true, 'upgrade should succeed');
  assert.equal(item.upgradeLevel, 1, 'upgradeLevel should be 1');
  assert.ok(item.stats.atk >= oldAtk, 'atk should increase');
  assert.ok(item.stats.def >= oldDef, 'def should increase');
  assert.ok(item.stats.atk === oldAtk + Math.max(1, Math.round(item.baseStats.atk * 0.15)) || item.baseStats.atk === 0, 'atk increase should match formula');
});

test('upgradeItem respects UPGRADE_MAX', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  const item = RK.Items.generateLootItem(1, 0, 0, false);
  item.upgradeLevel = RK.CONFIG.UPGRADE_MAX;
  const ok = RK.Items.upgradeItem(item);
  assert.equal(ok, false, 'upgrade should fail at max level');
});

test('getUpgradeCost returns correct cost', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  const item = RK.Items.generateLootItem(1, 0, 0, false);
  const cost = RK.Items.getUpgradeCost(item);
  assert.ok(typeof cost === 'number' && cost > 0, 'cost should be positive number');
});

// Стартовое задание создавалось без поля `kind`, по которому идёт прогресс:
// первую цель забега было невозможно закрыть до посещения торговца.
test('the opening quest of a run can be completed without visiting the merchant', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  const quest = RK.GAME.quest;

  assert.ok(quest, 'a run should start with a quest');
  assert.ok(quest.kind, 'the opening quest must declare the kind advanceQuest matches on');
  assert.equal(quest.completed, undefined);
  assert.equal(quest.progress, 0);

  const isKill = quest.kind === 'kill';
  const detail = isKill ? quest.enemyTypes[0] : null;
  for (let i = 0; i < quest.target; i++) {
    RK.Combat.advanceQuest(isKill ? 'kill' : 'loot', detail, 1);
  }

  assert.equal(quest.completed, true);
});

test('advanceQuest works for kill and loot kinds', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  RK.GAME.quests = [
    { kind: 'kill', enemyTypes: ['demon', 'boss_demon'], target: 3, progress: 0, reward: 100, description: 'Kill 3 demons' },
    { kind: 'loot', target: 2, progress: 0, reward: 80, description: 'Find 2 items' },
  ];
  RK.GAME.quest = RK.GAME.quests[0];
  RK.GAME.player.gold = 0;
  RK.Combat.advanceQuest('kill', 'demon', 1);
  assert.equal(RK.GAME.quests[0].progress, 1);
  RK.Combat.advanceQuest('kill', 'demon', 2);
  assert.equal(RK.GAME.quests[0].progress, 3);
  assert.equal(RK.GAME.quests[0].completed, true);
  assert.equal(RK.GAME.player.gold, 100);
  RK.GAME.quest = RK.GAME.quests[1];
  RK.Combat.advanceQuest('loot', null, 1);
  assert.equal(RK.GAME.quests[1].progress, 1);
  RK.Combat.advanceQuest('loot', null, 1);
  assert.equal(RK.GAME.quests[1].progress, 2);
  assert.equal(RK.GAME.quests[1].completed, true);
  assert.equal(RK.GAME.player.gold, 180);
});

test('merchant offer is generated on floor start', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  assert.ok(RK.GAME.merchantOffer, 'merchant should have a quest offer');
  assert.ok(RK.GAME.merchantOffer.kind === 'kill' || RK.GAME.merchantOffer.kind === 'loot', 'offer should have valid kind');
});

test('acceptQuest adds merchant offer to quests', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  const offer = RK.GAME.merchantOffer;
  assert.ok(offer, 'merchant offer should exist');
  assert.ok(RK.GAME.merchant, 'merchant should be placed in the starting city');
  RK.GAME.player.x = RK.GAME.merchant.x;
  RK.GAME.player.y = RK.GAME.merchant.y;
  const initialQuestCount = RK.GAME.quests.length;
  RK.Combat.acceptQuest();
  assert.equal(RK.GAME.quests.length, initialQuestCount + 1, 'quest should be added');
  assert.equal(RK.GAME.merchantOffer, null, 'merchant offer should be consumed');
});

test('upgradeEquipment upgrades equipped item and updates stats', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  RK.GAME.enemies = [];
  RK.GAME.player.gold = 10000;
  // Кузнец в городе: улучшение доступно только рядом с ним.
  assert.ok(RK.GAME.blacksmith, 'blacksmith should be placed in the starting city');
  RK.GAME.player.x = RK.GAME.blacksmith.x;
  RK.GAME.player.y = RK.GAME.blacksmith.y;
  const item = RK.Items.generateLootItem(1, 0, 0, false);
  RK.GAME.player.equipment.weapon = item;
  RK.GAME.player.gearBonuses.atk += item.stats.atk;
  RK.GAME.player.gearBonuses.def += item.stats.def;
  RK.GAME.player.gearBonuses.hp += item.stats.hp;
  RK.Combat.recomputePlayerStats();
  const oldAtk = RK.GAME.player.atk;
  const ok = RK.Combat.upgradeEquipment('weapon');
  assert.equal(ok, true, 'upgrade should succeed');
  assert.ok(RK.GAME.player.atk >= oldAtk, 'player atk should increase after upgrade');
});