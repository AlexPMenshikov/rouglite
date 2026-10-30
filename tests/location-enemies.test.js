'use strict';

// Враги локаций: у каждого типа — свои обитатели (LOCATION_ENEMIES), они
// спавнятся в своих локациях и нарисованы своими спрайтами. Каждая проверка
// изолирована: своя песочница, свой seed.

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

const CONFIG = require('../js/config');

// Маршруты до локаций из графа мира (js/world.js): тест ходит тем же путём,
// что и игрок, поэтому проверяет реальный спавн, а не вызов генератора.
const ROUTES = {
  wilderness: ['gate_north'],
  desert: ['gate_east'],
  mountains: ['gate_west'],
  crypt: ['gate_north', 'cave_entrance'],
  ruins: ['gate_north', 'ruins_entrance'],
  sewers: ['gate_north', 'swamp_path', 'sewer_entrance'],
  dungeon: ['gate_west', 'cave_entrance'],
};

// seed, при котором локационный тип гарантированно на карте (проверено вручную).
const SEED_WITH_LOCAL = {
  wilderness: 1,
  desert: 1,
  mountains: 1,
  crypt: 1,
  ruins: 1,
  sewers: 42,
  dungeon: 1,
};

function spawnInLocation(seed, route) {
  const { sandbox } = createSandbox({ seed });
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'medium', style: 'stone' });
  for (const exit of route) assert.equal(RK.World.travel(exit), true, `переход ${exit} удался`);
  return RK;
}

test('каждый враг LOCATION_ENEMIES описан в DEFS и имеет уникальный символ', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const seenTypes = Object.create(null);
  const seenSymbols = Object.create(null);
  for (const [type, list] of Object.entries(CONFIG.LOCATION_ENEMIES)) {
    for (const enemyType of list) {
      const def = RK.Entities.DEFS[enemyType];
      assert.ok(def, `${type}: враг ${enemyType} есть в DEFS`);
      for (const field of ['name', 'symbol', 'color', 'asset', 'hp', 'atk', 'def', 'xp', 'behavior']) {
        assert.ok(def[field] !== undefined && def[field] !== null, `${enemyType}: поле ${field} заполнено`);
      }
      // Один тип может быть в нескольких локациях (шаман); символ — один на тип.
      if (seenTypes[enemyType]) {
        assert.equal(seenTypes[enemyType], def.symbol, `${enemyType}: символ стабилен`);
        continue;
      }
      seenTypes[enemyType] = def.symbol;
      assert.ok(!seenSymbols[def.symbol], `${enemyType}: символ ${def.symbol} уникален`);
      seenSymbols[def.symbol] = enemyType;
    }
  }
});

test('враги есть в локациях и отсутствуют в городе', () => {
  for (const type of Object.keys(CONFIG.LOCATION_TYPES)) {
    const list = CONFIG.LOCATION_ENEMIES[type];
    assert.ok(list, `${type}: список врагов есть в конфиге`);
    if (type === 'city') {
      assert.equal(list.length, 0, 'в городе врагов нет, город безопасен');
    } else {
      assert.ok(list.length > 0, `${type}: враги есть`);
    }
  }
});

test('новые спрайты строятся во встроенном наборе и переживают загрузку PNG', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'entities.js', 'assets.js'] });
  const RK = sandbox.RK;

  RK.Assets.setEnabled(false, function () {});
  const built = new Set(RK.Assets.spriteNames());
  const fallbacks = new Set(RK.Assets.builtinFallbackNames());

  for (const list of Object.values(CONFIG.LOCATION_ENEMIES)) {
    for (const enemyType of list) {
      const asset = RK.Entities.DEFS[enemyType].asset;
      assert.ok(built.has(asset), `${asset}: спрайт строится в buildBuiltin`);
      assert.ok(fallbacks.has(asset), `${asset}: спрайт в списке встроенных, не зависит от PNG`);
    }
  }
});

test('локация спавнит своих врагов', () => {
  for (const [type, route] of Object.entries(ROUTES)) {
    const localTypes = CONFIG.LOCATION_ENEMIES[type];
    const RK = spawnInLocation(SEED_WITH_LOCAL[type], route);
    const spawned = RK.GAME.enemies.map((enemy) => enemy.type);
    assert.ok(spawned.some((t) => localTypes.includes(t)),
      `${type}: на карте есть локационный враг ${localTypes}, спавн: ${spawned}`);
  }
});

test('город не спавнит врагов', () => {
  const { sandbox } = createSandbox({ seed: 5 });
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'medium', style: 'stone' });
  assert.equal(RK.GAME.enemies.length, 0, 'в городе врагов нет');
});

test('одинаковый seed даёт одинаковый состав врагов локации', () => {
  const first = spawnInLocation(11, ROUTES.wilderness).GAME.enemies.map((e) => e.type);
  const second = spawnInLocation(11, ROUTES.wilderness).GAME.enemies.map((e) => e.type);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('враг получает полный набор боевых полей от makeEnemy', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  for (const list of Object.values(CONFIG.LOCATION_ENEMIES)) {
    for (const enemyType of list) {
      const enemy = RK.Entities.makeEnemy(enemyType, 3, 3, 1, false);
      assert.equal(enemy.type, enemyType);
      assert.ok(enemy.maxHp > 0 && enemy.hp === enemy.maxHp, `${enemyType}: здоровье заполнено`);
      assert.ok(enemy.atk > 0, `${enemyType}: атака положительна`);
      assert.equal(enemy.alive, true);
      assert.equal(enemy.behavior, RK.Entities.DEFS[enemyType].behavior);
    }
  }
});
