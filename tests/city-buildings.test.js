'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');
const CONFIG = require('../js/config');

// Каждый NPC стоит в своём здании, а здания раздаются кварталам по порядку.
// Если зданий не хватило, NPC просто не появлялся — и торговец или гильдия
// становились недостижимы. Проверка идёт по многим seed: город каждый раз
// раскладывается иначе.

const CITY_BUILDINGS = ['market', 'forge', 'guardhouse', 'temple', 'tavern', 'guild'];

function cityWithSeed(seed) {
  const { sandbox } = createSandbox({ seed });
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'medium', style: 'stone' });
  return RK;
}

test('every city has a building for every service', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const RK = cityWithSeed(1000 + seed);
    const kinds = new Set(RK.Map.buildings.map((building) => building.kind));

    for (const kind of CITY_BUILDINGS) {
      assert.ok(kinds.has(kind), `seed ${seed}: в городе есть здание ${kind}`);
    }
  }
});

test('every npc of the city appears', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const RK = cityWithSeed(2000 + seed);
    const kinds = new Set(RK.GAME.npcs.map((npc) => npc.kind));

    for (const kind of CONFIG.NPC_KINDS) {
      assert.ok(kinds.has(kind), `seed ${seed}: в городе есть ${kind}`);
    }
  }
});
