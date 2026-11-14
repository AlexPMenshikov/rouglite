'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createSandbox, startRunAsClass } = require('./helpers/sandbox');

function startInLocation(RK, locationId, classId = 'paladin') {
  startRunAsClass(RK, classId);
  assert.equal(RK.World.travelTo(locationId), true);
}

test('weather tables follow the agreed location probabilities', () => {
  const { sandbox } = createSandbox();
  const weather = sandbox.RK.Weather;

  assert.equal(weather.choose('rain', 0), 'clear');
  assert.equal(weather.choose('rain', 0.2), 'rain');
  assert.equal(weather.choose('rain', 0.8), 'thunderstorm');
  assert.equal(weather.choose('desert', 0.59), 'clear');
  assert.equal(weather.choose('desert', 0.6), 'dustStorm');
  assert.equal(weather.choose('city', 0.6), 'rain');
  assert.equal(weather.choose('city', 0.8), 'thunderstorm');
  assert.equal(weather.choose('city', 0.9), 'dustStorm');
});

test('weather covers named surfaces and only their first dungeon floor', () => {
  const { sandbox } = createSandbox();
  const weather = sandbox.RK.Weather;

  assert.equal(weather.profileForLocation({ id: 'wilderness_forest' }), 'rain');
  assert.equal(weather.profileForLocation({
    id: 'wilderness_swamp:d1', parentId: 'wilderness_swamp', depth: 1,
  }), 'rain');
  assert.equal(weather.profileForLocation({
    id: 'wilderness_swamp:d2', parentId: 'wilderness_swamp', depth: 2,
  }), null);
  assert.equal(weather.profileForLocation({ id: 'wilderness_desert' }), 'desert');
  assert.equal(weather.profileForLocation({ id: 'dungeon_desert_ruins' }), 'desert');
  assert.equal(weather.profileForLocation({ id: 'dungeon_desert_deep' }), null);
  assert.equal(weather.profileForLocation({ id: 'city_start' }), 'city');
});

test('weather changes every 20 turns and restores per-location state', () => {
  const { sandbox } = createSandbox({ seed: 201 });
  const RK = sandbox.RK;
  startInLocation(RK, 'wilderness_forest');
  RK.GAME.weather = {
    type: 'clear',
    locationId: RK.GAME.locationId,
    nextChangeTurn: RK.GAME.turn + 20,
  };
  sandbox.RK.RNG.rand = () => 0.5;

  RK.GAME.turn += 19;
  assert.equal(RK.Weather.tick(), false);
  RK.GAME.turn += 1;
  assert.equal(RK.Weather.tick(), true);
  assert.equal(RK.GAME.weather.type, 'rain');
  assert.equal(RK.Combat.createSnapshot().game.weather.type, 'rain');

  assert.equal(RK.World.travelTo('city_start'), true);
  const citySnapshot = RK.Combat.createSnapshot();
  assert.equal(citySnapshot.world.visited.wilderness_forest.gameSnapshot.weather.type, 'rain');
  assert.equal(RK.World.travelTo('wilderness_forest'), true);
  assert.equal(RK.GAME.weather.type, 'rain');
});

test('a saved world without weather receives weather on restore', () => {
  const { sandbox: source } = createSandbox({ seed: 204 });
  startInLocation(source.RK, 'wilderness_desert');
  const snapshot = source.RK.Combat.createSnapshot();
  snapshot.game.weather = null;

  const { sandbox: restored } = createSandbox({ seed: 205 });
  restored.RK.Combat.newRun();
  assert.equal(restored.RK.Combat.applySnapshot(snapshot, 'local'), true);
  assert.ok(restored.RK.Weather.current());
  assert.equal(restored.RK.GAME.weather.locationId, 'wilderness_desert');
});

test('dust storm reduces non-archer vision and applies enemy combat bonuses', () => {
  const { sandbox } = createSandbox({ seed: 202 });
  const RK = sandbox.RK;
  startInLocation(RK, 'wilderness_desert');
  RK.GAME.weather = { type: 'dustStorm', locationId: RK.GAME.locationId };
  RK.GAME.player.x = 12;
  RK.GAME.player.y = 12;
  RK.Narrator.getMods = () => ({
    viewDelta: 0,
    atkBonus: 0,
    defBonus: 0,
    dmgTakenBonus: 0,
  });
  RK.Map = {
    w: 25,
    h: 25,
    tiles: Array.from({ length: 25 }, () => new Array(25).fill(1)),
    doors: [],
    chests: [],
    locationType: 'wilderness',
  };

  let visible = RK.Fov.computeVisibility(12, 12);
  assert.equal(visible[12][15], true);
  assert.equal(visible[12][16], false);
  assert.equal(RK.Weather.enemyVisionRadius(RK.CONFIG.ENEMY_VISION_RADIUS), 3);
  assert.equal(RK.Weather.enemyAttackMultiplier({ type: 'mummy' }), 1.25);

  RK.GAME.player.classId = 'archer';
  visible = RK.Fov.computeVisibility(12, 12);
  assert.equal(visible[12][19], true, 'лучник сохраняет обычный обзор');

  const target = {
    x: 12, y: 12, def: 0, classId: 'mage',
    defenseReduceTurns: 0, unstoppableTurns: 0,
  };
  const mummy = { type: 'mummy', atk: 40 };
  RK.RNG.int = () => 0;
  const stormDamage = RK.CombatHit.enemyAttackDamage(mummy, target);
  RK.GAME.weather.type = 'clear';
  const clearDamage = RK.CombatHit.enemyAttackDamage(mummy, target);
  assert.equal(stormDamage - clearDamage, 10);
});

test('rain and thunderstorm raise slime health without stacking modifiers', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const slime = { type: 'slime', hp: 70, maxHp: 100 };
  const bossSlime = { type: 'boss_slime', hp: 80, maxHp: 100 };
  RK.GAME = {
    sceneKind: 'debug',
    weather: { type: 'thunderstorm', debug: true },
    enemies: [slime, bossSlime],
  };

  RK.Weather.applyEnemyModifiers('rain');
  assert.equal(slime.maxHp, 125);
  assert.equal(bossSlime.maxHp, 125);
  assert.equal(slime.hp, 70);
  RK.Weather.applyEnemyModifiers('thunderstorm');
  assert.equal(slime.maxHp, 125);
  assert.equal(bossSlime.maxHp, 125);
  RK.Weather.applyEnemyModifiers('clear');
  assert.equal(slime.maxHp, 100);
  assert.equal(slime.hp, 70);
  assert.equal(RK.Weather.enemyAttackMultiplier({ type: 'boss_slime' }), 1.25);
});

test('debug weather advances every 30 seconds and stops with a new run', () => {
  const { sandbox } = createSandbox({ seed: 203 });
  const intervals = [];
  const cleared = [];
  sandbox.setInterval = (callback, delay) => {
    intervals.push({ callback, delay });
    return intervals.length;
  };
  sandbox.clearInterval = (id) => cleared.push(id);
  sandbox.RK.UI.screen = () => 'game';

  sandbox.RK.Debug.open();
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].delay, 30000);
  assert.equal(sandbox.RK.Weather.current(), 'clear');

  intervals[0].callback();
  assert.equal(sandbox.RK.Weather.current(), 'rain');
  intervals[0].callback();
  assert.equal(sandbox.RK.Weather.current(), 'thunderstorm');
  intervals[0].callback();
  assert.equal(sandbox.RK.Weather.current(), 'dustStorm');

  sandbox.RK.Combat.newRun();
  assert.deepEqual(cleared, [1]);
});

test('returning to the menu stops the debug weather timer', () => {
  const { sandbox } = createSandbox({ ui: true });
  let stopped = 0;
  sandbox.RK.GAME = { sceneKind: 'debug' };
  sandbox.RK.Weather = { stopDebug: () => { stopped += 1; } };

  sandbox.RK.UI.show('menu');

  assert.equal(stopped, 1);
});
