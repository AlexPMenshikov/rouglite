'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');
const CONFIG = require('../js/config');

// Локация не должна вылезать за пределы карты: сервер отвергает клетки вне
// MAP_LIMITS, и герой в такой локации не смог бы сделать шаг.

function worldRun(seed = 707) {
  const { sandbox } = createSandbox({ seed });
  sandbox.RK.Combat.newRun();
  return sandbox.RK;
}

test('every location uses the fixed 64×64 map size', () => {
  const RK = worldRun();

  for (const loc of RK.World.listLocations()) {
    assert.equal(loc.style && CONFIG.MAP_STYLES[loc.style] !== undefined, true,
      `${loc.id}: стиль задан свойством локации`);
    RK.World.travelTo(loc.id);
    assert.equal(RK.Map.w, CONFIG.MAP_WIDTH, `${loc.id}: ширина фиксирована`);
    assert.equal(RK.Map.h, CONFIG.MAP_HEIGHT, `${loc.id}: высота фиксирована`);
  }
});

test('the server accepts the cells of every location', () => {
  const RK = worldRun();
  const { ACTION_RULES } = require('../server/room-manager');
  const rule = ACTION_RULES.playerAction;

  assert.ok(rule, 'правило шага на месте');

  for (const loc of RK.World.listLocations()) {
    const x = CONFIG.MAP_WIDTH - 1;
    const y = CONFIG.MAP_HEIGHT - 1;
    assert.equal(rule([x, y]), true,
      `${loc.id}: сервер принимает клетку ${x}×${y}`);
    assert.equal(rule([CONFIG.MAP_WIDTH, y]), false, `${loc.id}: x за краем отклонён`);
    assert.equal(rule([x, CONFIG.MAP_HEIGHT]), false, `${loc.id}: y за краем отклонён`);
  }
});
