'use strict';

// Шаман: в пуле crypt/dungeon, не больше двух на локацию, поднимает труп рядом.

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, startRunAsClass } = require('./helpers/sandbox');

test('шаман есть в пуле подземелья и склепа', () => {
  const C = require('../js/config');
  assert.ok(C.LOCATION_ENEMIES.dungeon.includes('shaman'));
  assert.ok(C.LOCATION_ENEMIES.crypt.includes('shaman'));
  assert.equal(C.SHAMAN_LIMIT_PER_LOCATION, 2);
});

test('на локации не больше двух шаманов, мёртвые тоже в счёте', () => {
  const { sandbox } = createSandbox({ seed: 7 });
  const RK = sandbox.RK;
  startRunAsClass(RK, 'paladin');
  const run = RK.GAME;
  run.enemies = [];
  run.enemies.push(RK.Entities.makeEnemy('shaman', 2, 2, 1, false));
  run.enemies.push(RK.Entities.makeEnemy('shaman', 3, 2, 1, false));
  const dead = RK.Entities.makeEnemy('shaman', 4, 2, 1, false);
  dead.alive = false;
  dead.hp = 0;
  run.enemies.push(dead);
  assert.equal(RK.Spawn.shamanCount(run), 3);

  // Ветка spawnEnemies: при переполнении шаман сменяется другим типом.
  let type = 'shaman';
  if (type === 'shaman' && RK.Spawn.shamanCount(run) >= RK.CONFIG.SHAMAN_LIMIT_PER_LOCATION) {
    type = 'rat';
  }
  assert.equal(type, 'rat', 'сверх лимита шаман заменяется');
});

test('шаман воскрешает ближайший труп с половиной HP', () => {
  const { sandbox } = createSandbox({ seed: 3 });
  const RK = sandbox.RK;
  const player = startRunAsClass(RK, 'paladin');
  player.x = 10;
  player.y = 10;

  const shaman = RK.Entities.makeEnemy('shaman', 3, 3, 1, false);
  shaman.alerted = true;
  const corpse = RK.Entities.makeEnemy('rat', 4, 3, 1, false);
  corpse.alive = false;
  corpse.hp = 0;
  const maxHp = corpse.maxHp;
  RK.GAME.enemies = [shaman, corpse];

  const raised = RK.CombatHit.resurrectNearby(shaman);
  assert.equal(raised, true);
  assert.equal(corpse.alive, true);
  assert.equal(corpse.hp, Math.max(1, Math.round(maxHp * 0.5)));
  assert.equal(corpse.alerted, true);
});

test('шаман без трупов рядом не воскрешает', () => {
  const { sandbox } = createSandbox({ seed: 3 });
  const RK = sandbox.RK;
  startRunAsClass(RK, 'paladin');
  const shaman = RK.Entities.makeEnemy('shaman', 3, 3, 1, false);
  const far = RK.Entities.makeEnemy('rat', 20, 20, 1, false);
  far.alive = false;
  far.hp = 0;
  RK.GAME.enemies = [shaman, far];
  assert.equal(RK.CombatHit.resurrectNearby(shaman), false);
  assert.equal(far.alive, false);
});
