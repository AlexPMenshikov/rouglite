'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createSandbox, projectRoot } = require('./helpers/sandbox');

const jsDir = path.join(projectRoot, 'js');

function readSource(name) {
  return fs.readFileSync(path.join(jsDir, name), 'utf8');
}

// Потолок размера модуля: god-файлы возвращаются незаметно, а ловить их
// приходится по обзору кода. Порог выше нынешнего размера самых больших файлов,
// но заметно ниже старых трёх тысяч строк боя.
const MAX_MODULE_LINES = 2200;

function startRun() {
  const { sandbox } = createSandbox({ seed: 41 });
  sandbox.RK.Combat.newRun({ size: 'compact', style: 'stone' });
  return sandbox.RK;
}

test('логика забега живёт в отдельных модулях, а бой только ими пользуется', () => {
  const combat = readSource('combat.js');

  // Модули забрали свою логику: в бою её больше нет.
  for (const moved of [
    'function spawnEnemies(',
    'function placeChests(',
    'function useInventoryItem(',
    'function handlePickup(',
    'function advanceQuest(',
    'function acceptQuest(',
    'function performFireball(',
    'function activateClassSkill(',
  ]) {
    assert.ok(!combat.includes(moved), moved + ' больше не живёт в бою');
  }

  // Бой отдаёт модулям контекст забега: модуль о забеге не знает.
  for (const module of ['Spawn', 'Inventory', 'Quests', 'Spells', 'Statuses']) {
    assert.ok(combat.includes('RK.' + module + '.setContext(runContext);'),
      'бой передаёт контекст модулю ' + module);
  }
});

test('модули доступны снаружи и ведут себя как прежние действия боя', () => {
  const RK = startRun();

  assert.equal(typeof RK.Spawn.spawnEnemies, 'function');
  assert.equal(typeof RK.Inventory.usePotion, 'function');
  assert.equal(typeof RK.Quests.advanceQuest, 'function');
  assert.equal(typeof RK.Spells.activateClassSkill, 'function');

  // Зелье лечит и исчезает из рюкзака — как через бой.
  const player = RK.GAME.player;
  player.hp = player.maxHp - 10;
  const potion = RK.Items.spawnPotion(player.x, player.y);
  potion.heal = player.potionHeal;
  player.backpack.push(potion);
  const countPotions = () => player.backpack.reduce(
    (total, stack) => total + (stack.kind === 'potion' ? (stack.count || 1) : 0), 0);
  const before = countPotions();
  assert.equal(RK.Inventory.usePotion(player.backpack.length - 1), true);
  assert.equal(player.hp, player.maxHp, 'зелье выпито');
  assert.equal(countPotions(), before - 1, 'стакан зелья убран из рюкзака');
});

test('модуль квестов считает прогресс и сдаёт задание', () => {
  const RK = startRun();

  const quest = RK.Quests.registerQuest({
    type: 'slime',
    kind: 'kill',
    target: 2,
    progress: 0,
    reward: 10,
    description: 'Убить слизней',
  }, 'merchant', false);
  RK.GAME.quests.push(quest);
  assert.ok(quest.id, 'у задания есть идентификатор');
  assert.equal(quest.ownerId, 'local', 'владелец задания — герой, который его взял');

  RK.Quests.advanceQuest('kill', 'slime', 1);
  assert.equal(quest.progress, 1, 'прогресс засчитан');
  assert.equal(RK.Quests.questReady(quest), false, 'задание ещё не выполнено');
  RK.Quests.advanceQuest('kill', 'slime', 1);
  assert.equal(RK.Quests.questReady(quest), true, 'задание выполнено');
});

test('модуль спавна знает состав врагов этажа', () => {
  const RK = startRun();

  const pool = RK.Spawn.enemyPool(1);
  const kinds = pool.map((entry) => entry[0]);
  assert.ok(kinds.includes('slime'), 'на первом этаже есть слизни');
  assert.ok(kinds.includes('rat'), 'на первом этаже есть крысы');
  assert.ok(RK.Spawn.weightedPick(pool), 'враг выбирается из пула');
});

test('модуль спеллов считает бонус от магического шара', () => {
  const RK = startRun();
  const player = RK.GAME.player;

  const bonus = RK.Spells.spellPowerBonus(player);
  assert.equal(bonus.power, 0, 'без шара бонуса нет');
  assert.equal(bonus.element, null, 'без шара стихии нет');
});

test('ни один модуль игры не растёт в god-файл', () => {
  const files = fs.readdirSync(jsDir).filter((name) => name.endsWith('.js'));
  for (const name of files) {
    const lines = readSource(name).split('\n').length;
    assert.ok(lines <= MAX_MODULE_LINES,
      name + ': ' + lines + ' строк, потолок ' + MAX_MODULE_LINES);
  }
});
