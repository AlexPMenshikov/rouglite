'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const CONFIG = require('../js/config');
const { createSandbox } = require('./helpers/sandbox');

// Предметы на полу рисуются спрайтом. Если у предмета нет картинки, он молча
// исчезает: остаётся только кольцо редкости. Тест ловит такой предмет по
// имени файла, а не глазами в игре.

const SPRITES_DIR = path.join(__dirname, '..', 'assets', 'sprites');

function hasSprite(name) {
  return fs.existsSync(path.join(SPRITES_DIR, name + '.png'));
}

/** Песочница с правилами вещей, сценой и видами. */
function itemSandbox() {
  return createSandbox({
    scripts: ['config.js', 'content-data.js', 'rng.js', 'items.js', 'scene.js', 'view.js'],
  });
}

/** Все спрайты, которые игрок может встретить на полу. */
function itemSpriteNames(sandbox) {
  const names = new Set();
  const add = (name) => { if (name) names.add(name); };
  Object.values(CONFIG.SLOT_ASSETS).forEach(add);
  Object.values(CONFIG.TRAP_SPRITES).forEach(add);
  Object.values(CONFIG.FOODS).forEach((food) => add(food.asset));
  Object.keys(CONFIG.MAGE_ARMOR_KINDS).forEach(add);
  CONFIG.MAGE_WEAPON_KINDS.forEach(add);
  CONFIG.MELEE_KINDS.forEach(add);
  ['sword', 'bow', 'crossbow', 'shield', 'shieldSmall', 'shieldLarge', 'key', 'potion', 'gold', 'bandage', 'splint'].forEach(add);
  Object.values(sandbox.RK.Items.CRAFTING_MATERIALS).forEach((material) => add(material.asset));
  return names;
}

test('у каждого предмета, который можно поднять, есть картинка', () => {
  const { sandbox } = itemSandbox();

  const missing = [...itemSpriteNames(sandbox)].filter((name) => !hasSprite(name));

  assert.deepEqual(missing, [], 'у этих предметов нет файла в assets/sprites');
});

test('у каждого материала свой спрайт, иначе на полу их не различить', () => {
  const { sandbox } = itemSandbox();
  const materials = sandbox.RK.Items.CRAFTING_MATERIALS;
  const assets = Object.values(materials).map((material) => material.asset);

  assert.equal(new Set(assets).size, assets.length, 'спрайты материалов не повторяются');
  for (const material of Object.values(materials)) {
    assert.ok(hasSprite(material.asset), material.id + ': нет файла ' + material.asset + '.png');
    const item = sandbox.RK.Items.spawnCraftingMaterial(material.id, 0, 0);
    assert.equal(item.asset, material.asset, material.id + ': предмет берёт свой спрайт');
    assert.equal(item.color, material.color, material.id + ': цвет остаётся цветом материала');
  }
});

test('у ловушки в рюкзаке есть картинка того же типа, что у взведённой', () => {
  const { sandbox } = itemSandbox();

  for (const type of CONFIG.TRAP_TYPES) {
    const item = sandbox.RK.Items.spawnTrapItem({ type, damage: 5 }, 0, 0);
    assert.equal(item.asset, CONFIG.TRAP_SPRITES[type], type + ': спрайт совпадает с типом');
    assert.ok(hasSprite(item.asset), type + ': нет файла ' + item.asset + '.png');
  }
});

test('шлем надевается и рисуется шлемом, а не лысой головой', () => {
  assert.equal(CONFIG.SLOT_ASSETS.head, 'helmet');
  assert.equal(CONFIG.SLOT_VISUAL_TYPES.head, 'helmet');
  assert.ok(hasSprite('helmet'), 'нет файла helmet.png');
  assert.equal(hasSprite('head'), false, 'спрайт головы больше не нужен');
});

test('сцена отдаёт виду уровень улучшения и зачарование', () => {
  const { sandbox } = itemSandbox();
  const visible = [[true, true, true, true], [true, true, true, true], [true, true, true, true], [true, true, true, true]];
  const map = {
    w: 4, h: 4,
    tiles: [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]],
    vis: visible,
    explored: visible.map((row) => row.slice()),
    decorations: [], doors: [], chests: [], traps: [], torches: [], zones: [], blood: [], pois: [], exits: [],
  };
  const item = sandbox.RK.Items.generateLootItem(1, 1, 1);
  item.upgradeLevel = 2;
  item.enchantId = 'ember';
  const game = { player: { x: 1, y: 1 }, items: [item], enemies: [], npcs: [], floor: 1 };

  const scene = sandbox.RK.Scene.build(map, game);

  assert.equal(scene.items.length, 1);
  assert.equal(scene.items[0].upgradeLevel, 2);
  assert.equal(scene.items[0].enchantId, 'ember');
});

test('предмет стоит опорой на центре клетки, а рамка спрайта не важна', () => {
  const { sandbox } = itemSandbox();
  // Рамка содержимого: у предмета своя высота внутри картинки 256×256.
  sandbox.RK.Assets = {
    sprite: () => ({ width: 256, height: 256 }),
    spriteBox: () => ({ x0: 60, y0: 20, x1: 196, y1: 236 }),
  };

  const rect = sandbox.RK.View.itemRect('sword', 100, 200, 64, 'ground');

  assert.ok(rect, 'прямоугольник предмета посчитан');
  assert.ok(Math.abs(rect.y + rect.h - 200) < 0.01, 'низ содержимого — на центре клетки');
  assert.ok(Math.abs(rect.x + rect.w / 2 - 100) < 0.01, 'содержимое стоит по центру клетки');
  assert.ok(rect.h <= 64, 'предмет не выше отведённого ему места');

  const centered = sandbox.RK.View.itemRect('sword', 100, 200, 64, 'center');
  assert.ok(Math.abs(centered.y + centered.h / 2 - 200) < 0.01, 'в клетке предмет стоит по центру');
});

test('цвет подкраски — цвет вещи: у добычи редкость, у материала сам материал', () => {
  const { sandbox } = itemSandbox();

  const loot = sandbox.RK.Items.generateLootItem(1, 1, 1);
  loot.rarity = 'legendary';
  loot.color = CONFIG.RARITY_COLORS.legendary;
  assert.equal(sandbox.RK.View.itemTintColor(loot), CONFIG.RARITY_COLORS.legendary);

  const material = sandbox.RK.Items.spawnCraftingMaterial('vitality', 0, 0);
  assert.equal(sandbox.RK.View.itemTintColor(material), material.color, 'у материала свой цвет');

  const common = sandbox.RK.Items.generateLootItem(1, 1, 1);
  common.rarity = 'common';
  assert.equal(sandbox.RK.View.itemTintColor(common), null, 'обычная добыча не подкрашивается');
});
