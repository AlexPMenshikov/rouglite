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
