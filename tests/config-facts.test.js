'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const CONFIG = require('../js/config');
const { ACTION_RULES } = require('../server/room-manager');
const { createSandbox } = require('./helpers/sandbox');

// Правила из конфига обязаны быть полными: новый слот без спрайта или новая
// редкость без цвета молча ломают интерфейс, и ловить это приходится глазами.

test('у каждого стиля карты одинаковое число оттенков пола и стены', () => {
  const shades = CONFIG.MAP_STYLE_SHADES;
  assert.ok(shades >= 1, 'хотя бы один оттенок');

  for (const [id, style] of Object.entries(CONFIG.MAP_STYLES)) {
    assert.ok(style.label, id + ': у стиля нет названия');
    assert.equal(style.colors.length, CONFIG.MAP_STYLE_SHADES, id + ': оттенки пола');
    assert.equal(style.wallColors.length, CONFIG.MAP_STYLE_SHADES, id + ': оттенки стены');
  }
});

test('темы ярусов ссылаются на известные стили и не трогают входной ярус', () => {
  const dungeonTypes = Object.keys(CONFIG.LOCATION_GEN).filter((type) => type !== 'city');
  assert.deepEqual(Object.keys(CONFIG.DUNGEON_DEPTH_STYLES).sort(), dungeonTypes.sort(),
    'тема задана для каждого типа подземелья');

  for (const [type, styles] of Object.entries(CONFIG.DUNGEON_DEPTH_STYLES)) {
    assert.equal(styles.length, CONFIG.DUNGEON_MAX_DEPTH, type + ': тема на каждый ярус');
    assert.equal(styles[0], null, type + ': первый ярус остаётся стилем локации');
    for (const style of styles.slice(1)) {
      assert.ok(CONFIG.MAP_STYLES[style], type + ': неизвестный стиль ' + style);
    }
  }
});

test('у каждой ловушки есть название и спрайт', () => {
  for (const type of CONFIG.TRAP_TYPES) {
    assert.ok(CONFIG.TRAP_NAMES[type], 'у ловушки ' + type + ' нет названия');
    assert.ok(CONFIG.TRAP_SPRITES[type], 'у ловушки ' + type + ' нет спрайта');
  }
});

test('у каждой редкости есть цвет, порядок, множитель и название', () => {
  for (const rarity of CONFIG.RARITIES) {
    assert.ok(CONFIG.RARITY_COLORS[rarity], 'у редкости ' + rarity + ' нет цвета');
    assert.equal(typeof CONFIG.RARITY_ORDER[rarity], 'number',
      'у редкости ' + rarity + ' нет порядка');
    assert.equal(typeof CONFIG.RARITY_MULT[rarity], 'number',
      'у редкости ' + rarity + ' нет множителя');
    assert.ok(CONFIG.RARITY_NAMES[rarity], 'у редкости ' + rarity + ' нет названия');
    assert.ok(CONFIG.RARITY_NAMES_FEMININE[rarity], 'у редкости ' + rarity + ' нет названия в женском роде');
  }
});

test('у каждого слота есть название, часть тела, спрайт и тип спрайта', () => {
  for (const slot of CONFIG.SLOTS) {
    assert.ok(CONFIG.SLOT_LABELS[slot], 'у слота ' + slot + ' нет названия');
    assert.ok(CONFIG.SLOT_BODY_PARTS[slot], 'у слота ' + slot + ' нет части тела');
    assert.ok(CONFIG.SLOT_ASSETS[slot], 'у слота ' + slot + ' нет спрайта');
    assert.ok(CONFIG.SLOT_VISUAL_TYPES[slot], 'у слота ' + slot + ' нет типа спрайта');
  }
});

test('у каждого класса есть определение в игре', () => {
  const { sandbox } = createSandbox({});
  for (const classId of CONFIG.PLAYER_CLASSES) {
    assert.ok(sandbox.RK.Classes.CLASS_DEFS[classId], 'у класса ' + classId + ' нет определения');
  }
});

test('каноническое действие и его псевдонимы есть и в правиле, и в обработчике', () => {
  const { sandbox } = createSandbox({});
  const handlers = sandbox.RK.Combat.actionHandlers();

  for (const [canonical, aliases] of Object.entries(CONFIG.ACTION_ALIASES)) {
    assert.equal(typeof ACTION_RULES[canonical], 'function',
      'у действия ' + canonical + ' нет серверного правила');
    assert.equal(typeof handlers[canonical], 'function',
      'у действия ' + canonical + ' нет обработчика');
    for (const alias of aliases) {
      assert.equal(ACTION_RULES[alias], ACTION_RULES[canonical],
        alias + ' должен проверяться тем же правилом, что и ' + canonical);
      assert.equal(handlers[alias], handlers[canonical],
        alias + ' должен звать тот же обработчик, что и ' + canonical);
    }
  }
});

test('золото начисляется по правилам конфига, а не по числам в коде', () => {
  // Золото с карты умножается на этаж: на первых этажах множитель равен единице.
  assert.equal(CONFIG.goldFromFloor(5, 1), 5);
  assert.equal(CONFIG.goldFromFloor(5, 2), 5);
  assert.equal(CONFIG.goldFromFloor(5, 3), 10);
  assert.equal(CONFIG.goldFromKill(2, 3), 8);
  assert.equal(CONFIG.goldFromEvent(5, 2), 11);
  // Бросок кубика задаёт вызывающий: правило не должно его терять.
  assert.deepEqual(CONFIG.GOLD_ROLL, { floor: [5, 12], kill: [2, 6], event: [5, 12] });
});

test('урон ловушки по этажу считается по одному правилу', () => {
  // Генератор ловушек, бой и мировые события зовут одну функцию, поэтому
  // вопрос «сколько ловушка бьёт на первом этаже» имеет один ответ.
  assert.equal(CONFIG.trapDamage(1), 4);
  assert.equal(CONFIG.trapDamage(2), 5);
  assert.equal(CONFIG.trapDamage(3), 6);
  assert.equal(CONFIG.trapDamage(4), 8);
});
