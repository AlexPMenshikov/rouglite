const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, startRunAsClass } = require('./helpers/sandbox');

// Автопроход по клику и плавное движение всей партии — правила, которые легко
// сломать незаметно: без них игра просто идёт «как получится», и это видно
// только в сетевой игре, где лаг от чужих шагов трудно отличить от своего.

/**
 * Клетка на расстоянии `distance` от героя, до которой реально доходит путь.
 * Проверяется тем же предикатом занятости, что и в бою: иначе цель может
 * оказаться за врагом, и маршрут закончится у соседней клетки.
 */
function reachableTarget(RK, distance) {
  const p = RK.GAME.player;
  const occupied = (x, y) =>
    RK.Combat.getEnemyAt(x, y) != null ||
    RK.GAME.players.some((player) => player.id !== p.id && player.hp > 0 && player.x === x && player.y === y);
  for (let d = distance; d >= 2; d--) {
    for (const [dx, dy] of [[d, 0], [0, -d], [0, d], [-d, 0]]) {
      const target = { x: p.x + dx, y: p.y + dy };
      if (!RK.MapGen.isWalkable(target.x, target.y) || occupied(target.x, target.y)) continue;
      const path = RK.MapGen.findPath(p.x, p.y, target.x, target.y, occupied);
      if (path && path.length) return { target, steps: path.length };
    }
  }
  throw new Error('reachableTarget: рядом с героем нет проходимого маршрута');
}

/**
 * Клетка вплотную к герою, занятая живым врагом и видимая с его места.
 * `avoid` — клетки, которые враг занимать не должен, иначе он перекроет
 * маршрут и проверка измеряла бы уже другое правило.
 */
function placeVisibleEnemy(RK, avoid = []) {
  const p = RK.GAME.player;
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    const x = p.x + dx;
    const y = p.y + dy;
    if (avoid.some((cell) => cell.x === x && cell.y === y)) continue;
    if (!RK.MapGen.isWalkable(x, y)) continue;
    if (RK.Combat.getEnemyAt(x, y)) continue;
    const enemy = RK.Entities.makeEnemy('slime', x, y, RK.GAME.floor, false);
    // Враг не должен убить героя посреди проверки маршрута.
    enemy.atk = 0;
    enemy.hp = 9999;
    enemy.maxHp = 9999;
    RK.GAME.enemies.push(enemy);
    RK.Fov.compute(p.x, p.y);
    return enemy;
  }
  throw new Error('placeVisibleEnemy: нет свободной соседней клетки');
}

/** Прокручивает анимации шага до конца. */
function settleWalk(RK) {
  let guard = 0;
  while (RK.Combat.busy() && guard++ < 1000) RK.Combat.tickWalk(1e6);
}

function position(RK, player) {
  const pos = RK.Combat.getDrawPos(player);
  return [pos.x, pos.y];
}

test('a click on the floor walks the whole way instead of a single step', () => {
  const { sandbox } = createSandbox({ seed: 11 });
  const RK = sandbox.RK;
  startRunAsClass(RK, 'paladin');
  RK.GAME.enemies = [];
  RK.Fov.compute(RK.GAME.player.x, RK.GAME.player.y);
  const { target, steps } = reachableTarget(RK, 6);

  assert.equal(RK.Combat.playerAction(target.x, target.y), true);
  assert.equal(RK.Combat.isAutoWalking(), true, 'клик по полу запускает автопроход');
  settleWalk(RK);

  assert.deepEqual([RK.GAME.player.x, RK.GAME.player.y], [target.x, target.y],
    'герой доходит до клетки, по которой кликнули');
  assert.equal(RK.GAME.turn, steps, 'маршрут тратит по ходу на каждую клетку');
  assert.equal(RK.Combat.isAutoWalking(), false, 'в цель автопроход не продолжается');
});

test('a click on a diagonal neighbour is one diagonal step, not an autowalk', () => {
  const { sandbox } = createSandbox({ seed: 11 });
  const RK = sandbox.RK;
  startRunAsClass(RK, 'paladin');
  RK.GAME.enemies = [];
  const p = RK.GAME.player;

  // Свободная диагональная клетка без объектов: по такой клик должен стать шагом.
  let target = null;
  for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = p.x + dx;
    const y = p.y + dy;
    if (!RK.MapGen.isWalkable(x, y)) continue;
    if (RK.MapGen.getDoorAt(x, y) || RK.MapGen.getChestAt(x, y) || RK.MapGen.getTrapAt(x, y)) continue;
    if ((RK.GAME.npcs || []).some((npc) => npc.x === x && npc.y === y)) continue;
    if (RK.Map.stair && RK.Map.stair.x === x && RK.Map.stair.y === y) continue;
    target = { x, y, dx, dy };
    break;
  }
  assert.ok(target, 'нужна свободная диагональная клетка рядом с героем');

  const turnBefore = RK.GAME.turn;
  assert.equal(RK.Combat.playerAction(target.x, target.y), true);
  assert.equal(RK.Combat.isAutoWalking(), false, 'шаг на соседнюю клетку не запускает автопроход');
  settleWalk(RK);

  assert.deepEqual([RK.GAME.player.x, RK.GAME.player.y], [target.x, target.y],
    'герой встаёт на диагональную клетку одним шагом');
  assert.equal(RK.GAME.turn, turnBefore + 1, 'диагональ стоит один ход');
  assert.deepEqual([RK.GAME.player.facingX, RK.GAME.player.facingY], [target.dx, target.dy],
    'взгляд повёрнут по диагонали шага');
});

test('an enemy already in sight does not cancel the autowalk', () => {
  const { sandbox } = createSandbox({ seed: 11 });
  const RK = sandbox.RK;
  startRunAsClass(RK, 'paladin');
  const { target, steps } = reachableTarget(RK, 6);
  assert.ok(steps > 1, 'для проверки нужен маршрут длиннее одного шага');
  const path = RK.MapGen.findPath(RK.GAME.player.x, RK.GAME.player.y, target.x, target.y, null);
  // Враг встаёт сбоку от маршрута: он виден, но не перекрывает первые клетки.
  const enemy = placeVisibleEnemy(RK, path.slice(0, 3));
  assert.equal(RK.Map.vis[enemy.y][enemy.x], true, 'враг должен быть виден в момент клика');

  RK.Combat.playerAction(target.x, target.y);
  RK.Combat.tickWalk(1e6);

  assert.equal(RK.Combat.isAutoWalking(), true,
    'враг, видимый до клика, не отменяет маршрут на первом же шаге');
  assert.deepEqual([RK.GAME.player.x, RK.GAME.player.y], [path[0].x, path[0].y],
    'герой продолжает идти, а не стоит на месте');
});

test('the autowalk stops as soon as a new enemy comes into sight', () => {
  const { sandbox } = createSandbox({ seed: 11 });
  const RK = sandbox.RK;
  startRunAsClass(RK, 'paladin');
  RK.GAME.enemies = [];
  RK.Fov.compute(RK.GAME.player.x, RK.GAME.player.y);
  const { target, steps } = reachableTarget(RK, 12);
  assert.ok(steps > 2, 'для проверки нужен маршрут длиннее двух клеток');

  RK.Combat.playerAction(target.x, target.y);

  let ticks = 0;
  while (RK.Combat.busy() && ticks++ < 1000) {
    RK.Combat.tickWalk(1e6);
    // На втором шаге в поле зрения появляется враг, которого в начале не было.
    if (ticks === 2) placeVisibleEnemy(RK);
  }

  assert.equal(RK.Combat.isAutoWalking(), false, 'появление врага прерывает автопроход');
  assert.notDeepEqual([RK.GAME.player.x, RK.GAME.player.y], [target.x, target.y],
    'герой не доходит до цели через поле боя');
});

test('every party member is drawn between tiles, not snapped to the snapshot cell', () => {
  const { sandbox } = createSandbox({ seed: 11 });
  const RK = sandbox.RK;
  startRunAsClass(RK, 'paladin');
  RK.Combat.addNetworkPlayer('guest', 'Гость', 'berserker');
  const from = { x: RK.GAME.player.x, y: RK.GAME.player.y };
  const guestStart = RK.GAME.players.find((p) => p.id === 'guest');
  const guestFrom = { x: guestStart.x, y: guestStart.y };

  // Снимок из сети: сосед сдвинулся на клетку, свой герой остался на месте.
  const snapshot = RK.Combat.createSnapshot();
  snapshot.game.players.find((player) => player.id === 'guest').x = guestFrom.x + 1;
  RK.Combat.applySnapshot(snapshot, RK.GAME.player.id);

  const guest = RK.GAME.players.find((player) => player.id === 'guest');
  assert.deepEqual(position(RK, guest), [guestFrom.x, guestFrom.y],
    'сосед рисуется в прежней клетке, пока идёт шаг');
  assert.deepEqual([guest.x, guest.y], [guestFrom.x + 1, guestFrom.y],
    'в снимке сосед уже на новой клетке');
  assert.deepEqual([RK.GAME.player.x, RK.GAME.player.y], [from.x, from.y],
    'свой герой в этом снимке не двигался');

  // Пока идёт анимация соседа, кадры ещё нужны, но ход игрока не занят.
  assert.equal(RK.Combat.busy(), false, 'анимация соседа не блокирует ход своего героя');
  assert.equal(RK.Combat.tickWalk(0), true, 'сосед ещё анимируется');
  RK.Combat.tickWalk(1e6);
  assert.equal(RK.Combat.tickWalk(1e6), false, 'после шага анимаций не остаётся');
  assert.deepEqual(position(RK, guest), [guestFrom.x + 1, guestFrom.y]);
});

test('a snapshot keeps animating when the hero walks too', () => {
  const { sandbox } = createSandbox({ seed: 11 });
  const RK = sandbox.RK;
  startRunAsClass(RK, 'paladin');
  const from = { x: RK.GAME.player.x, y: RK.GAME.player.y };

  const snapshot = RK.Combat.createSnapshot();
  snapshot.game.players[0].x = from.x + 1;
  RK.Combat.applySnapshot(snapshot, 'local');

  assert.equal(RK.Combat.busy(), true, 'шаг героя анимируется, а не телепортирует');
  assert.deepEqual([RK.Combat.getDrawPos().x, RK.Combat.getDrawPos().y], [from.x, from.y],
    'герой рисуется в прежней клетке до конца шага');
  RK.Combat.tickWalk(1e6);
  assert.deepEqual([RK.Combat.getDrawPos().x, RK.Combat.getDrawPos().y], [from.x + 1, from.y]);
});