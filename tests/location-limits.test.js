'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');
const CONFIG = require('../js/config');

// Локация не должна вылезать за пределы карты: сервер отвергает клетки вне
// MAP_LIMITS, и герой в такой локации не смог бы сделать шаг.

function worldRun(seed = 707) {
  const { sandbox } = createSandbox({ seed });
  sandbox.RK.Combat.newRun({ size: 'medium', style: 'stone' });
  return sandbox.RK;
}

test('every location fits into the map limits', () => {
  const RK = worldRun();

  for (const loc of RK.World.listLocations()) {
    assert.ok(loc.gen.width <= CONFIG.MAP_LIMITS.maxWidth,
      `${loc.id}: ширина ${loc.gen.width} в пределах карты`);
    assert.ok(loc.gen.height <= CONFIG.MAP_LIMITS.maxHeight,
      `${loc.id}: высота ${loc.gen.height} в пределах карты`);
  }
});

test('the server accepts the cells of every location', () => {
  const RK = worldRun();
  const { ACTION_RULES } = require('../server/room-manager');
  const rule = ACTION_RULES.playerAction;

  assert.ok(rule, 'правило шага на месте');

  for (const loc of RK.World.listLocations()) {
    const x = loc.gen.width - 1;
    const y = loc.gen.height - 1;
    assert.equal(rule([x, y]), true,
      `${loc.id}: сервер принимает клетку ${x}×${y}`);
  }
});
