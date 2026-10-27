'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// Модуль пути общий для боя, автопрохода и расстановки выходов. Тесты зовут
// его напрямую: через публичные обёртки видно только итоговую клетку, а не
// правила обхода стен, закрытых дверей и занятых клеток.

function createPathfind() {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'rng.js', 'map-codec.js', 'pathfind.js'] });
  return sandbox.RK;
}

function blankMap(width = 7, height = 7) {
  return {
    w: width,
    h: height,
    tiles: Array.from({ length: height }, () => new Array(width).fill(1)),
    doors: [],
    chests: [],
    traps: [],
    spawn: { x: -1, y: -1 },
    stair: { x: -1, y: -1 },
  };
}

function assertOrthogonalPath(path, map) {
  for (let i = 0; i < path.length; i++) {
    const cell = path[i];
    assert.equal(map.tiles[cell.y][cell.x], 1, `шаг ведёт по полу: ${cell.x},${cell.y}`);
    if (i === 0) continue;
    const prev = path[i - 1];
    assert.equal(Math.abs(prev.x - cell.x) + Math.abs(prev.y - cell.y), 1,
      'соседние шаги пути стоят рядом без разрывов');
  }
}

test('findPathOnMap returns the shortest detour around a wall', () => {
  const RK = createPathfind();
  const map = blankMap(5, 5);
  map.tiles[0][2] = 0;

  const path = RK.Pathfind.findPathOnMap(map, 0, 0, 4, 0, null);

  assert.equal(path.length, 6, 'обход стены длиннее прямой на две клетки');
  assert.deepEqual([path[0].x, path[0].y], [1, 0]);
  assert.deepEqual([path.at(-1).x, path.at(-1).y], [4, 0]);
  assert.ok(!path.some((cell) => cell.x === 2 && cell.y === 0), 'стена не входит в путь');
  assertOrthogonalPath(path, map);
});

test('findPathOnMap rejects unreachable targets instead of returning a broken path', () => {
  const RK = createPathfind();
  const map = blankMap(5, 5);
  map.tiles[0][2] = 0;
  map.tiles[1][2] = 0;
  map.tiles[2][2] = 0;
  map.tiles[3][2] = 0;
  map.tiles[4][2] = 0;

  assert.equal(RK.Pathfind.findPathOnMap(map, 0, 0, 4, 0, null), null,
    'цель за сплошной стеной недостижима');
  assert.equal(RK.Pathfind.findPathOnMap(map, 0, 0, -1, 0, null), null, 'старт за картой');
  assert.equal(RK.Pathfind.findPathOnMap(map, 0, 0, 5, 0, null), null, 'цель за картой');
  assert.equal(RK.Pathfind.findPathOnMap(null, 0, 0, 0, 0, null), null, 'без карты пути нет');
  assert.equal(RK.Pathfind.findPathOnMap(map, 0, 0, 1, 1, () => true), null,
    'занятая цель отбрасывается');
  assert.equal(RK.Pathfind.findPathOnMap(map, 0, 0, 0, 0, null).length, 0,
    'путь в ту же клетку пуст');
});

test('closed doors and chests block the path while open and broken ones pass', () => {
  const RK = createPathfind();
  const map = blankMap(5, 1);
  const door = { x: 2, y: 0, state: 'closed' };
  map.doors.push(door);

  assert.equal(RK.Pathfind.findPathOnMap(map, 0, 0, 4, 0, null), null, 'закрытая дверь перекрывает проход');
  door.state = 'open';
  assert.equal(RK.Pathfind.findPathOnMap(map, 0, 0, 4, 0, null).length, 4, 'открытая дверь проходима');
  door.state = 'broken';
  assert.equal(RK.Pathfind.findPathOnMap(map, 0, 0, 4, 0, null).length, 4, 'выбитая дверь проходима');

  const chestMap = blankMap(5, 1);
  const chest = { x: 2, y: 0, state: 'locked' };
  chestMap.chests.push(chest);
  assert.equal(RK.Pathfind.findPathOnMap(chestMap, 0, 0, 4, 0, null), null, 'запертый сундук перекрывает проход');
  chest.state = 'open';
  assert.equal(RK.Pathfind.findPathOnMap(chestMap, 0, 0, 4, 0, null).length, 4, 'открытый сундук проходим');
});

test('isMapWalkable checks bounds, floor and object state', () => {
  const RK = createPathfind();
  const map = blankMap(3, 3);
  map.tiles[1][1] = 0;
  map.doors.push({ x: 2, y: 1, state: 'closed' });
  map.chests.push({ x: 1, y: 2, state: 'open' });

  assert.equal(RK.Pathfind.isMapWalkable(map, 0, 0), true);
  assert.equal(RK.Pathfind.isMapWalkable(map, 1, 1), false, 'стена непроходима');
  assert.equal(RK.Pathfind.isMapWalkable(map, -1, 0), false, 'край карты слева');
  assert.equal(RK.Pathfind.isMapWalkable(map, 3, 0), false, 'край карты справа');
  assert.equal(RK.Pathfind.isMapWalkable(map, 0, 3), false, 'край карты снизу');
  assert.equal(RK.Pathfind.isMapWalkable(map, 2, 1), false, 'закрытая дверь непроходима');
  assert.equal(RK.Pathfind.isMapWalkable(map, 1, 2), true, 'открытый сундук не мешает');
  assert.equal(RK.Pathfind.isMapWalkable(null, 0, 0), false, 'без карты клетка непроходима');
});

test('findPathNear walks to the nearest walkable cell when the target is blocked', () => {
  const RK = createPathfind();
  const map = blankMap(5, 5);
  RK.Map = map;
  map.tiles[2][2] = 0;

  // Герой стоит на втором кольце вокруг цели: путь к соседней клетке короче,
  // и старт на дальнем кольце не должен его отменять.
  const path = RK.Pathfind.findPathNear(0, 2, 2, 2, null);
  assert.ok(path, 'рядом со стеной находится проходимая цель');
  assert.deepEqual([path.at(-1).x, path.at(-1).y], [1, 2], 'цель смещается на ближайшую клетку');
  assertOrthogonalPath(path, map);

  // Если герой уже стоит на лучшей клетке рядом с целью, идти некуда.
  assert.equal(RK.Pathfind.findPathNear(1, 2, 2, 2, null).length, 0);
});

test('findPathNear respects occupancy and gives up on an isolated target', () => {
  const RK = createPathfind();
  const map = blankMap(7, 7);
  RK.Map = map;
  map.tiles[3][3] = 0;
  const occupied = (x, y) => x === 2 && y === 3;

  const path = RK.Pathfind.findPathNear(0, 3, 3, 3, occupied);
  assert.ok(path, 'обход занятой клетки возможен');
  assert.notDeepEqual([path.at(-1).x, path.at(-1).y], [2, 3], 'занятая клетка не становится целью');

  const island = blankMap(9, 9);
  island.tiles = Array.from({ length: 9 }, () => new Array(9).fill(0));
  island.tiles[1][1] = 1;
  RK.Map = island;
  assert.equal(RK.Pathfind.findPathNear(1, 1, 6, 6, null), null,
    'цель, окружённая стенами, недостижима');
});

test('randomFloorFromMap keeps the requested distance and skips stair and spawn', () => {
  const RK = createPathfind();
  const map = blankMap(7, 7);
  map.spawn = { x: 3, y: 3 };
  map.stair = { x: 4, y: 3 };
  RK.RNG.int = () => 0;
  RK.Map = map;

  const cell = RK.Pathfind.randomFloorFromMap(map, 3, 3, 2, 2);
  assert.deepEqual([cell.x, cell.y], [1, 1], 'первая подходящая клетка в квадрате радиуса');
  assert.ok(RK.Pathfind.manhattan(cell.x, cell.y, 3, 3) >= 2, 'минимальная дистанция соблюдена');
  assert.notDeepEqual([cell.x, cell.y], [map.spawn.x, map.spawn.y]);
  assert.notDeepEqual([cell.x, cell.y], [map.stair.x, map.stair.y]);

  const narrow = blankMap(3, 3);
  narrow.tiles = Array.from({ length: 3 }, () => new Array(3).fill(0));
  narrow.spawn = { x: 1, y: 1 };
  assert.equal(RK.Pathfind.randomFloorFromMap(narrow, 1, 1, 1, 0), null,
    'без свободных клеток выбора нет');
  assert.equal(RK.Pathfind.randomFloorFromMap(narrow, 1, 1, 1, 3), null,
    'минимальная дистанция больше радиуса даёт пустой набор');
});

test('snapExitToWalkable keeps a free cell and moves a blocked one to the nearest ring', () => {
  const RK = createPathfind();
  const map = blankMap(5, 5);
  map.tiles = Array.from({ length: 5 }, () => new Array(5).fill(0));
  map.tiles[2][2] = 1;

  let exit = RK.Pathfind.snapExitToWalkable(map, 2, 2);
  assert.deepEqual([exit.x, exit.y], [2, 2]);

  // Спавн и лестница не могут стать точкой выхода: они заняты переходом.
  map.spawn = { x: 2, y: 2 };
  map.tiles[2][3] = 1;
  exit = RK.Pathfind.snapExitToWalkable(map, 2, 2);
  assert.deepEqual([exit.x, exit.y], [3, 2],
    'выход уходит с клетки спавна на свободного соседа');

  // Выход за краем карты ищется по расширяющимся кольцам.
  const edge = blankMap(5, 5);
  edge.tiles = Array.from({ length: 5 }, () => new Array(5).fill(0));
  edge.tiles[4][4] = 1;
  exit = RK.Pathfind.snapExitToWalkable(edge, -1, -1);
  assert.deepEqual([exit.x, exit.y], [4, 4]);

  const none = blankMap(3, 3);
  none.tiles = Array.from({ length: 3 }, () => new Array(3).fill(0));
  none.tiles[1][1] = 1;
  none.spawn = { x: 1, y: 1 };
  assert.equal(RK.Pathfind.snapExitToWalkable(none, 1, 1), null,
    'занятая единственная клетка не становится выходом');
});
