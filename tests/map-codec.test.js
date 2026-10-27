'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// Кодек жмёт матрицы карты в снимке. Ошибка в длинах строк не видна на глаз:
// клиент получает карту другой ширины и рисует клетки за границей. Поэтому
// тесты проверяют и удачный круг, и каждый отказ разбора.

function createCodec() {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'map-codec.js'] });
  return sandbox.RK.MapCodec;
}

// Объекты из vm имеют чужие прототипы: сравниваем через обычный JSON.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('encodeMatrix collapses equal runs and decodeMatrix restores the grid', () => {
  const codec = createCodec();
  const matrix = [
    [1, 1, 0, 0, 0],
    [2, 1, 2, 1, 2],
  ];

  const encoded = codec.encodeMatrix(matrix);

  assert.deepEqual(plain(encoded), [
    [1, 2, 0, 3],
    [2, 1, 1, 1, 2, 1, 1, 1, 2, 1],
  ]);
  assert.deepEqual(plain(codec.decodeMatrix(encoded, 5, 2)), matrix);
});

test('the codec keeps boolean matrices such as explored', () => {
  const codec = createCodec();
  const explored = [
    [true, true, false],
    [false, true, false],
  ];

  const encoded = codec.encodeMatrix(explored);

  assert.deepEqual(plain(encoded), [
    [true, 2, false, 1],
    [false, 1, true, 1, false, 1],
  ]);
  assert.deepEqual(plain(codec.decodeMatrix(encoded, 3, 2)), explored);
});

test('decodeMatrix rejects rows that do not fill the declared size', () => {
  const codec = createCodec();

  assert.equal(codec.decodeMatrix([[1, 2, 0]], 5, 1), null, 'строка короче ширины');
  assert.equal(codec.decodeMatrix([[1, 4]], 5, 1), null, 'строка длиннее ширины');
  assert.equal(codec.decodeMatrix([[1, 2], [0, 3]], 5, 1), null, 'лишняя строка');
  assert.equal(codec.decodeMatrix([[1, 5]], 5, 2), null, 'не хватает строки');
  assert.equal(codec.decodeMatrix([[1, 2, 0]], 3, 1), null, 'нечётное число полей');
});

test('decodeMatrix rejects broken runs instead of inventing cells', () => {
  const codec = createCodec();

  assert.equal(codec.decodeMatrix([[1, 0]], 0, 1), null, 'нулевая длина серии');
  assert.equal(codec.decodeMatrix([[1, -1]], -1, 1), null, 'отрицательная длина серии');
  assert.equal(codec.decodeMatrix([[1, 1.5]], 1, 1), null, 'дробная длина серии');
  assert.equal(codec.decodeMatrix([[1, '2']], 2, 1), null, 'длина строкой');
  assert.equal(codec.decodeMatrix([['x', 1]], 1, 1), null, 'значение не число и не boolean');
  assert.equal(codec.decodeMatrix([[null, 1]], 1, 1), null, 'null не значение клетки');
  assert.equal(codec.decodeMatrix(null, 1, 1), null, 'матрицы нет');
  assert.equal(codec.decodeMatrix('1,1', 1, 1), null, 'матрица не массив');
});

test('encodeMatrices packs only matrix fields and decodeMatrices restores them', () => {
  const codec = createCodec();
  const map = {
    tiles: [[1, 1, 0]],
    floorTypes: [[2, 2, 2]],
    regions: [[0, 0, 0]],
    explored: [[true, false, false]],
    blood: [{ x: 1, y: 1 }],
  };

  const encoded = codec.encodeMatrices(map);

  assert.deepEqual(plain(Object.keys(encoded).sort()), [...codec.MATRIX_FIELDS].sort());
  assert.equal('blood' in encoded, false, 'состояние игры едет отдельно от матриц');
  assert.deepEqual(plain(codec.decodeMatrices(encoded, 3, 1)), {
    tiles: map.tiles,
    floorTypes: map.floorTypes,
    regions: map.regions,
    explored: map.explored,
  });
});

test('decodeMatrices rejects the whole snapshot when one matrix is corrupt', () => {
  const codec = createCodec();

  assert.deepEqual(plain(codec.decodeMatrices({}, 1, 1)), {}, 'пустой набор допустим');
  assert.deepEqual(plain(codec.decodeMatrices({ tiles: [[1, 1]] }, 1, 1)), { tiles: [[1]] },
    'отсутствующие поля не считаются ошибкой');
  assert.equal(codec.decodeMatrices(null, 1, 1), null);
  assert.equal(codec.decodeMatrices('matrix', 1, 1), null);
  assert.equal(codec.decodeMatrices({ tiles: [[1, 2]] }, 3, 1), null,
    'битая матрица отменяет весь снимок, а не подменяется частичной');
  assert.equal(codec.decodeMatrices({ tiles: [[1, 1]], explored: [[true, 3]] }, 2, 1), null,
    'битая explored тоже отменяет снимок');
});
