'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// Проверяется замена экипировки: снятая вещь обязана лечь в рюкзак,
// иначе она пропадает и в рюкзаке, и на полу.
function startRun() {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  RK.CONFIG.ENABLE_WORLD = false;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  const player = RK.GAME.player;
  player.equipment.weapon = null;
  player.equipment.offhand = null;
  player.backpack = [];
  return { RK, player };
}

function gear(slot, name, stats) {
  return { kind: 'loot', slot, name, value: 10, stats: stats || {} };
}

test('a replaced item moves into the backpack instead of disappearing', () => {
  const { RK, player } = startRun();
  const oldWeapon = gear('weapon', 'Старый меч', { atk: 2 });
  oldWeapon.equipped = true;
  player.equipment.weapon = oldWeapon;
  const newWeapon = gear('weapon', 'Новый меч', { atk: 5 });
  player.backpack.push(newWeapon);

  assert.equal(RK.Combat.useInventoryItem(0), true);

  assert.equal(player.equipment.weapon, newWeapon, 'новый предмет надет');
  assert.deepEqual(player.backpack, [oldWeapon], 'снятый предмет вернулся в рюкзак');
  assert.equal(oldWeapon.equipped, false);
  assert.equal(RK.GAME.items.some((item) => item === oldWeapon), false, 'предмет не выброшен на пол');
});

test('a two-handed replacement keeps both old hand items in the backpack', () => {
  const { RK, player } = startRun();
  const blade = gear('weapon', 'Клинок', { atk: 3 });
  const shield = gear('offhand', 'Щит', { def: 2 });
  blade.equipped = true;
  shield.equipped = true;
  player.equipment.weapon = blade;
  player.equipment.offhand = shield;
  const twoHanded = gear('weapon', 'Двуручник', { atk: 6 });
  twoHanded.twoHanded = true;
  player.backpack.push(twoHanded);

  assert.equal(RK.Combat.useInventoryItem(0), true);

  assert.equal(player.equipment.weapon, twoHanded);
  assert.equal(player.equipment.offhand, twoHanded);
  assert.deepEqual(player.backpack, [blade, shield], 'обе старые вещи остались в рюкзаке');
});
