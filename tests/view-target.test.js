'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// Прицел — чистый слой состояния и отрисовки: он не ходит, не стреляет и не
// меняет карту. Тесты подменяют бой, классы и обзор, чтобы проверить каждое
// условие показа линии отдельно от остальной игры.

function setup({
  spell = null,
  enemy = null,
  seen = true,
  canShoot = false,
  canReach = true,
  over = false,
  hover = { x: 5, y: 6 },
} = {}) {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'view-target.js'] });
  const RK = sandbox.RK;
  RK.GAME = { over, player: { x: 2, y: 3, pendingSpell: spell } };
  RK.hover = hover;
  RK.Map = { w: 10, h: 10 };
  RK.Scene = { seen: () => seen };
  RK.Combat = { getEnemyAt: () => enemy };
  RK.Classes = {
    canShoot: () => canShoot,
    canReachTarget: () => canReach,
  };
  return { RK, enemy };
}

function recordingContext() {
  const calls = [];
  return {
    calls,
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    setLineDash(dash) { calls.push(['dash', ...dash]); },
    beginPath() { calls.push(['beginPath']); },
    moveTo(x, y) { calls.push(['moveTo', x, y]); },
    lineTo(x, y) { calls.push(['lineTo', x, y]); },
    stroke() { calls.push(['stroke']); },
    arc(x, y, radius, start, end) { calls.push(['arc', x, y, radius, start, end]); },
  };
}

test('aim is empty without a player, a hover cell or during a finished run', () => {
  const { RK } = setup();

  assert.equal(RK.ViewTarget.aim(), null, 'обычный курсор без врага не рисует прицел');

  RK.GAME.over = true;
  assert.equal(RK.ViewTarget.aim(), null, 'после конца забега прицел не нужен');
  RK.GAME.over = false;

  RK.hover = null;
  assert.equal(RK.ViewTarget.aim(), null, 'без наведения цели нет');
  RK.hover = { x: 5, y: 6 };

  RK.GAME.player = null;
  assert.equal(RK.ViewTarget.aim(), null, 'без героя стрелять некому');
});

test('fireball aim works without an enemy and greys out an unreachable cell', () => {
  const { RK } = setup({ spell: 'fireball' });

  let state = RK.ViewTarget.aim();
  assert.ok(state, 'файрбол наводится на любую видимую клетку');
  assert.deepEqual([state.from.x, state.from.y], [2, 3]);
  assert.deepEqual([state.to.x, state.to.y], [5, 6]);
  assert.equal(state.enemy, null);
  assert.equal(state.color, '#ffb347', 'доступная цель подсвечена тёплым цветом');

  RK.Classes.canReachTarget = () => false;
  state = RK.ViewTarget.aim();
  assert.equal(state.color, '#8a8a8a', 'недоступная клетка серая');

  RK.GAME.player.pendingSpell = 'mass_fireball';
  state = RK.ViewTarget.aim();
  assert.ok(state, 'массовый файрбол использует тот же прицел');
  assert.equal(state.color, '#8a8a8a');
});

test('a normal shot needs a visible enemy, a ranged class and a clear line', () => {
  const enemy = { type: 'rat', x: 5, y: 6 };
  const { RK } = setup({ enemy, canShoot: true });

  let state = RK.ViewTarget.aim();
  assert.ok(state, 'лучник видит цель и линию');
  assert.equal(state.enemy, enemy);
  assert.equal(state.color, '#c8f0a0');
  assert.deepEqual([state.from.x, state.from.y], [2, 3]);
  assert.deepEqual([state.to.x, state.to.y], [5, 6]);

  RK.Classes.canShoot = () => false;
  assert.equal(RK.ViewTarget.aim(), null, 'ближний класс не наводит выстрел');

  RK.Classes.canShoot = () => true;
  RK.Classes.canReachTarget = () => false;
  assert.equal(RK.ViewTarget.aim(), null, 'цель вне дальности не подсвечивается');

  RK.Classes.canReachTarget = () => true;
  RK.Combat.getEnemyAt = () => null;
  assert.equal(RK.ViewTarget.aim(), null, 'без врага обычный выстрел не наводится');
});

test('the aim hides cells the hero has not seen', () => {
  const enemy = { type: 'rat' };
  const { RK } = setup({ enemy, canShoot: true, seen: false });

  assert.equal(RK.ViewTarget.aim(), null, 'невидимая клетка не цель');
  assert.equal(RK.Map.vis, undefined, 'прицел не трогает карту');

  RK.Scene.seen = () => true;
  assert.ok(RK.ViewTarget.aim());
});

test('draw paints the line and the enemy ring only when aim is active', () => {
  const enemy = { type: 'rat' };
  const { RK } = setup({ spell: 'fireball', enemy });
  const pointCalls = [];
  const point = (x, y) => {
    pointCalls.push([x, y]);
    return { x: x * 100, y: y * 100 };
  };
  const ctx = recordingContext();

  RK.ViewTarget.draw(ctx, 100, point);

  assert.deepEqual(pointCalls, [[2, 3], [5, 6]], 'линия идёт от героя к цели');
  assert.equal(ctx.strokeStyle, '#ffb347');
  assert.equal(ctx.lineWidth, 6, 'кольцо врага толще линии');
  assert.ok(ctx.globalAlpha >= 0.3 && ctx.globalAlpha <= 1, 'пульсация остаётся видимой');
  const dashes = ctx.calls.filter((call) => call[0] === 'dash');
  assert.equal(dashes.length, 2, 'линия пунктирная, наконечник и кольцо сплошные');
  assert.ok(Math.abs(dashes[0][1] - 14) < 1e-9);
  assert.equal(dashes[0][2], 10);
  assert.deepEqual(dashes[1], ['dash'], 'сплошная линия ставит пустой пунктир');
  const arcs = ctx.calls.filter((call) => call[0] === 'arc');
  assert.equal(arcs.length, 1, 'враг обведён кольцом');
  assert.deepEqual(arcs[0].slice(1, 4), [500, 600, 44]);

  // Без врага файрбол всё равно рисует линию, но кольца нет.
  RK.Combat.getEnemyAt = () => null;
  const second = recordingContext();
  RK.ViewTarget.draw(second, 100, point);
  assert.equal(second.calls.filter((call) => call[0] === 'arc').length, 0);
  assert.ok(second.calls.some((call) => call[0] === 'stroke'), 'линия остаётся');
});

test('draw does nothing when aim is off', () => {
  const { RK } = setup();
  const ctx = recordingContext();

  RK.ViewTarget.draw(ctx, 20, (x, y) => ({ x, y }));

  assert.deepEqual(ctx.calls, []);
});
