const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// Раньше здесь вручную поддерживался копии CONFIG, который разошёлся с
// js/config.js (COLS 60 против 32, BLOOD_MAX 50 против 180), и код склеивался
// через eval. Теперь используется общий харнес с настоящим конфигом.
function createMapContext() {
  const { sandbox } = createSandbox();
  return { RK: sandbox.RK, sandbox };
}

function getLakeCells(map) {
  const cells = [];
  if (!map || !map.decorations) return cells;
  for (let i = 0; i < map.decorations.length; i++) {
    const d = map.decorations[i];
    if (d && d.asset === 'decorLake') {
      cells.push({ x: d.x, y: d.y });
    }
  }
  return cells;
}

function getStreamCells(map) {
  const cells = [];
  if (!map || !map.decorations) return cells;
  for (let i = 0; i < map.decorations.length; i++) {
    const d = map.decorations[i];
    if (d && d.asset === 'decorStream') {
      cells.push({ x: d.x, y: d.y, flowIndex: d.flowIndex });
    }
  }
  cells.sort((a, b) => {
    if (a.flowIndex === b.flowIndex) {
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    }
    return a.flowIndex - b.flowIndex;
  });
  return cells;
}

function isConnected4(cells) {
  if (cells.length === 0) return true;
  const mapSet = {};
  for (let i = 0; i < cells.length; i++) {
    mapSet[cells[i].x + ',' + cells[i].y] = true;
  }
  const start = cells[0];
  const visited = {};
  const queue = [start];
  visited[start.x + ',' + start.y] = true;
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (let d = 0; d < dirs.length; d++) {
      const k = (cur.x + dirs[d][0]) + ',' + (cur.y + dirs[d][1]);
      if (mapSet[k] && !visited[k]) {
        visited[k] = true;
        queue.push({ x: cur.x + dirs[d][0], y: cur.y + dirs[d][1] });
      }
    }
  }
  return Object.keys(visited).length === cells.length;
}

function isChainConnected(cells) {
  if (cells.length <= 1) return true;
  for (let i = 1; i < cells.length; i++) {
    const a = cells[i - 1];
    const b = cells[i];
    const dist = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    if (dist > 2) return false;
  }
  return true;
}

describe('Water and streams generation', () => {
  test('lake cells form a single connected region (4-connect)', () => {
    const { RK } = createMapContext();
    const g1 = RK.MapGen.generate(1, 12345, 60, 40, 'stone');
    const lakes = getLakeCells(g1);
    assert.ok(lakes.length > 0);
    assert.ok(isConnected4(lakes));
  });

  test('stream is a connected chain (adjacent/nearby)', () => {
    const { RK } = createMapContext();
    const g = RK.MapGen.generate(2, 54321, 60, 40, 'stone');
    const stream = getStreamCells(g);
    assert.ok(stream.length > 0);
    assert.ok(isChainConnected(stream));
  });

  test('deterministic for same seed', () => {
    const { RK: RK1 } = createMapContext();
    const { RK: RK2 } = createMapContext();
    const g1 = RK1.MapGen.generate(5, 99999, 60, 40, 'cave');
    const g2 = RK2.MapGen.generate(5, 99999, 60, 40, 'cave');
    const lakes1 = getLakeCells(g1).map((c) => c.x + ',' + c.y).sort();
    const lakes2 = getLakeCells(g2).map((c) => c.x + ',' + c.y).sort();
    assert.deepEqual(lakes1, lakes2);
    const s1 = getStreamCells(g1).map((c) => c.x + ',' + c.y + ':' + c.flowIndex).sort();
    const s2 = getStreamCells(g2).map((c) => c.x + ',' + c.y + ':' + c.flowIndex).sort();
    assert.deepEqual(s1, s2);
  });

  test('different seeds can produce different water layout', () => {
    const { RK: RK1 } = createMapContext();
    const { RK: RK2 } = createMapContext();
    const g1 = RK1.MapGen.generate(1, 11111, 60, 40, 'stone');
    const g2 = RK2.MapGen.generate(1, 22222, 60, 40, 'stone');
    const lakes1 = getLakeCells(g1).map((c) => c.x + ',' + c.y).sort().join('|');
    const lakes2 = getLakeCells(g2).map((c) => c.x + ',' + c.y).sort().join('|');
    const s1 = getStreamCells(g1).map((c) => c.x + ',' + c.y).sort().join('|');
    const s2 = getStreamCells(g2).map((c) => c.x + ',' + c.y).sort().join('|');
    assert.ok(!(lakes1 === lakes2 && s1 === s2));
  });

  test('water placed on floor tiles only', () => {
    const { RK } = createMapContext();
    const g = RK.MapGen.generate(3, 77777, 60, 40, 'stone');
    const lakes = getLakeCells(g);
    const stream = getStreamCells(g);
    for (const cell of lakes) assert.equal(g.tiles[cell.y][cell.x], 1);
    for (const cell of stream) assert.equal(g.tiles[cell.y][cell.x], 1);
  });
});
