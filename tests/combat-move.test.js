'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, findOpenNeighbor } = require('./helpers/sandbox');

// Движение проверяется напрямую: анимация шага, занятость хода и один ход за
// клетку — инварианты, которые через клики видны только косвенно.

function moveRun(seed = 11) {
  const { sandbox } = createSandbox({ seed });
  const RK = sandbox.RK;
  RK.CONFIG.ENABLE_WORLD = false;
  RK.Meta.data.selectedClass = 'paladin';
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  RK.GAME.enemies = [];
  RK.GAME.items = [];
  RK.Map.traps = [];
  return { sandbox, RK };
}

test('a step interpolates smoothly and finishes once with its callback', () => {
  const { sandbox, RK } = moveRun();
  const player = RK.GAME.player;
  const done = [];
  const from = { x: player.x, y: player.y };

  RK.CombatMove.startStep(player, from.x, from.y, from.x + 1, from.y, () => done.push('step'));

  assert.equal(RK.CombatMove.busy(), true, 'свой шаг занимает ход');
  assert.deepEqual([RK.CombatMove.getDrawPos(player).x, RK.CombatMove.getDrawPos(player).y],
    [from.x, from.y], 'в начале шага герой ещё в старой клетке');

  sandbox.performance.now = () => RK.CONFIG.WALK_MS / 2;
  const middle = RK.CombatMove.getDrawPos(player);
  assert.ok(middle.x > from.x && middle.x < from.x + 1, 'середина шага сглажена');
  assert.equal(middle.y, from.y);

  assert.equal(RK.CombatMove.tickWalk(RK.CONFIG.WALK_MS), false, 'шаг завершён, других нет');
  assert.deepEqual(done, ['step']);
  assert.equal(RK.CombatMove.stepsDone(), 1);
  assert.equal(RK.CombatMove.stepOf(player), null);
});

test('party animation does not block the local turn and finishes together', () => {
  const { RK } = moveRun();
  const player = RK.GAME.player;
  assert.equal(RK.Combat.addNetworkPlayer('guest', 'Гость', 'berserker'), true);
  const guest = RK.GAME.players.find((member) => member.id === 'guest');
  const done = [];
  const before = RK.CombatMove.stepsDone();

  RK.CombatMove.startStep(player, player.x, player.y, player.x + 1, player.y, () => done.push('local'));
  RK.CombatMove.startStep(guest, guest.x, guest.y, guest.x + 1, guest.y, () => done.push('guest'));

  assert.equal(RK.CombatMove.busy(), true);
  assert.equal(RK.CombatMove.tickWalk(0), true, 'шаги ещё идут');
  assert.equal(RK.CombatMove.tickWalk(RK.CONFIG.WALK_MS), false);
  assert.deepEqual(done.sort(), ['guest', 'local']);
  assert.equal(RK.CombatMove.stepsDone(), before + 2);
});

test('tryStep starts a step, blocks a second one and advances the turn on landing', () => {
  const { RK } = moveRun();
  const player = RK.GAME.player;
  const [dx, dy] = findOpenNeighbor(RK);
  const start = { x: player.x, y: player.y };
  const turn = RK.GAME.turn;

  assert.equal(RK.CombatMove.tryStep(dx, dy), true);
  assert.deepEqual([player.x, player.y], [start.x, start.y], 'до конца шага клетка не меняется');
  assert.equal(RK.GAME.turn, turn, 'ход не тратится на старте анимации');
  assert.deepEqual([player.facingX, player.facingY], [dx, dy]);
  assert.equal(RK.CombatMove.tryStep(-dx, -dy), false, 'во время шага второй не начинается');

  assert.equal(RK.CombatMove.tickWalk(1e6), false);
  assert.deepEqual([player.x, player.y], [start.x + dx, start.y + dy]);
  assert.equal(RK.GAME.turn, turn + 1, 'шаг тратит ровно один ход');
});

test('a zero step waits a turn without animating', () => {
  const { RK } = moveRun();
  const turn = RK.GAME.turn;
  const done = RK.CombatMove.stepsDone();

  assert.equal(RK.CombatMove.tryStep(0, 0), true);

  assert.equal(RK.GAME.turn, turn + 1);
  assert.equal(RK.CombatMove.stepsDone(), done, 'ожидание не рисует переход');
  assert.equal(RK.CombatMove.busy(), false);
});

test('a wall step keeps the turn but still turns the hero', () => {
  const { RK } = moveRun();
  const player = RK.GAME.player;
  const [dx, dy] = findOpenNeighbor(RK);
  const turn = RK.GAME.turn;
  RK.Map.tiles[player.y + dy][player.x + dx] = 0;

  assert.equal(RK.CombatMove.tryStep(dx, dy), false);
  assert.equal(RK.GAME.turn, turn);
  assert.deepEqual([player.facingX, player.facingY], [dx, dy], 'герой смотрит в стену');
  assert.equal(RK.CombatMove.busy(), false);
});

test('facing is clamped, adjacency is Chebyshev, occupancy covers self and enemies', () => {
  const { RK } = moveRun();
  const player = RK.GAME.player;

  RK.CombatMove.setFacing(9, -4);
  assert.deepEqual([player.facingX, player.facingY], [1, -1]);
  RK.CombatMove.setFacing(0, 0);
  assert.deepEqual([player.facingX, player.facingY], [1, -1], 'нулевой вектор не сбрасывает взгляд');

  RK.GAME.player = null;
  assert.equal(RK.CombatMove.setFacing(1, 0), undefined, 'без героя поворот молчит');

  assert.equal(RK.CombatMove.adjacent({ x: 0, y: 0 }, { x: 1, y: 1 }), true);
  assert.equal(RK.CombatMove.adjacent({ x: 0, y: 0 }, { x: 2, y: 0 }), false);
  assert.equal(RK.CombatMove.adjacent({ x: 0, y: 0 }, { x: 0, y: 0 }), false);

  const enemy = RK.Entities.makeEnemy('rat', player.x + 5, player.y, RK.GAME.floor);
  RK.GAME.enemies = [enemy];
  const occupied = RK.CombatMove.makeOccupancy(player);
  assert.equal(occupied(player.x, player.y), true, 'своя клетка занята');
  assert.equal(occupied(enemy.x, enemy.y), true, 'клетка врага занята');
  assert.equal(occupied(player.x + 1, player.y), false);
});

test('a melee click on a distant enemy starts a step toward it', () => {
  const { RK } = moveRun();
  const player = RK.GAME.player;
  assert.equal(RK.Classes.canShoot(player), false, 'для проверки нужен ближний класс');

  // Цель на расстоянии, к которой ведёт путь: ищем клетку не ближе трёх шагов.
  let target = null;
  for (let distance = 6; distance >= 3 && !target; distance--) {
    for (const [dx, dy] of [[distance, 0], [0, -distance], [0, distance], [-distance, 0]]) {
      const x = player.x + dx;
      const y = player.y + dy;
      if (!RK.MapGen.isWalkable(x, y)) continue;
      if (RK.MapGen.getDoorAt(x, y) || RK.MapGen.getChestAt(x, y)) continue;
      const path = RK.MapGen.findPath(player.x, player.y, x, y, null);
      if (path && path.length >= 3) {
        target = { x, y };
        break;
      }
    }
  }
  assert.ok(target, 'нужна достижимая клетка на расстоянии');

  const enemy = RK.Entities.makeEnemy('rat', target.x, target.y, RK.GAME.floor);
  enemy.hp = 1000;
  enemy.maxHp = 1000;
  enemy.atk = 0;
  enemy.alerted = false;
  RK.GAME.enemies = [enemy];
  const route = RK.MapGen.findPathNear(
    player.x, player.y, enemy.x, enemy.y, RK.CombatMove.makeOccupancy(player));
  assert.ok(route && route.length, 'маршрут к врагу существует');

  assert.equal(typeof RK.CombatMove.tryMoveToward, 'function');
  assert.equal(RK.Combat.playerAction(enemy.x, enemy.y), true, 'клик по дальнему врагу принят');
  assert.equal(RK.Combat.busy(), true, 'герой начал шаг, а не замер');
  assert.equal(RK.GAME.player, player);
  assert.equal(RK.CombatMove.tickWalk(1e6), false);

  assert.deepEqual([player.x, player.y], [route[0].x, route[0].y],
    'первый шаг ведёт по маршруту к врагу');
});
