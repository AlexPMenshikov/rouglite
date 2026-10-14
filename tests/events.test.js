'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSandbox, startRunAsClass } = require('./helpers/sandbox');

function newGame() {
  const { sandbox } = createSandbox();
  const { RK } = sandbox;
  startRunAsClass(RK, 'tank');
  return RK;
}

test('события: состояние заводится на старте забега', () => {
  const RK = newGame();
  assert.ok(RK.GAME.events, 'состояние событий создано');
  assert.equal(RK.GAME.events.active, null);
});

test('события: засада спавнит врагов рядом с героем', () => {
  const RK = newGame();
  const before = RK.GAME.enemies.filter((e) => e.alive).length;
  RK.Events.force('ambush');
  const alive = RK.GAME.enemies.filter((e) => e.alive);
  assert.ok(alive.length > before, 'враги добавились');
  const p = RK.GAME.player;
  for (const e of alive.slice(before)) {
    const dist = Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y));
    assert.ok(dist >= 2 && dist <= 5, 'враг рядом, но не вплотную: ' + dist);
    assert.equal(e.alerted, true);
  }
});

test('события: золотая жила рассыпает золото', () => {
  const RK = newGame();
  const before = RK.GAME.items.length;
  RK.Events.force('goldRush');
  assert.ok(RK.GAME.items.length > before);
  const gold = RK.GAME.items.filter((it) => it.kind === 'gold');
  assert.ok(gold.length > 0);
  for (const g of gold) {
    assert.equal(g.type, 'gold');
    assert.ok(g.amt > 0);
  }
});

test('события: волна ловушек взводит ловушки на проходимых клетках', () => {
  const RK = newGame();
  const before = RK.Map.traps.length;
  RK.Events.force('trapSurge');
  assert.ok(RK.Map.traps.length > before);
  const added = RK.Map.traps.slice(before);
  for (const t of added) {
    assert.equal(t.state, 'armed');
    assert.ok(RK.MapGen.isWalkable(t.x, t.y));
  }
});

test('события: цветение жизни держит зону десять ходов', () => {
  const RK = newGame();
  RK.Events.force('regenBloom');
  assert.equal(RK.GAME.events.active.id, 'regenBloom');
  assert.ok(RK.Map.zones.find((z) => z.eventZone), 'зона регенерации добавлена');
  for (let i = 0; i < 9; i++) {
    RK.GAME.turn++;
    RK.Events.tick();
  }
  assert.equal(RK.GAME.events.active.turnsLeft, 1);
  RK.GAME.turn++;
  RK.Events.tick();
  assert.equal(RK.GAME.events.active, null);
  assert.equal(RK.Map.zones.find((z) => z.eventZone), undefined, 'зона убрана');
});

test('события: кровавая луна усиливает врагов и отпускает', () => {
  const RK = newGame();
  RK.Events.force('ambush');
  const enemy = RK.GAME.enemies.find((e) => e.alive);
  assert.ok(enemy, 'засады хватило для проверки');
  const before = enemy.atk;
  RK.Events.force('bloodMoon');
  assert.equal(enemy.atk, before + 3);
  assert.equal(enemy.eventBoosted, true);
  for (let i = 0; i < 8; i++) {
    RK.GAME.turn++;
    RK.Events.tick();
  }
  assert.equal(enemy.atk, before, 'атака вернулась');
  assert.equal(enemy.eventBoosted, false);
});

test('события: активное событие уезжает в снимке и возвращается', () => {
  const RK = newGame();
  RK.Events.force('bloodMoon');
  const snapshot = RK.Combat.createSnapshot();
  assert.equal(snapshot.game.events.active.id, 'bloodMoon');
  RK.Combat.applySnapshot(snapshot, 'local');
  assert.equal(RK.GAME.events.active.id, 'bloodMoon');
  assert.equal(RK.GAME.events.active.turnsLeft, 8);
});
