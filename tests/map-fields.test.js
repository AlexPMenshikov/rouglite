'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// Карта делится на три части: матрицы (сжимаются), состояние игры (едет на
// каждый шаг) и геометрия (едет один раз на локацию). Новое поле карты обязано
// попасть в один из списков, иначе оно молча потерялось бы в снимке.

function worldRun(seed = 909) {
  const { sandbox } = createSandbox({ seed });
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'medium', style: 'stone' });
  return RK;
}

function mapKeysOfEveryLocation(RK) {
  const keys = new Set();
  const collect = () => Object.keys(RK.Map).forEach((key) => keys.add(key));
  collect();
  RK.World.travel('gate_north');
  collect();
  RK.World.travel('cave_entrance');
  collect();
  RK.World.travel('stairs_down');
  collect();
  return keys;
}

test('every map field is classified: matrix, game state or geometry', () => {
  const RK = worldRun();
  const known = new Set([
    ...RK.MapGen.MATRIX_FIELDS,
    ...RK.MapGen.MAP_STATE_FIELDS,
    ...RK.MapGen.MAP_STATIC_FIELDS,
    'vis', // обзор не едет в снимок: клиент считает его сам
  ]);

  for (const key of mapKeysOfEveryLocation(RK)) {
    assert.ok(known.has(key), `${key}: поле карты классифицировано`);
  }
});

test('the snapshot splits the map into the geometry and the game state', () => {
  const RK = worldRun();
  const snapshot = RK.Combat.createSnapshot();

  assert.ok(snapshot.mapState.explored, 'исследованное едет в состоянии игры');
  for (const field of RK.MapGen.MAP_STATE_FIELDS) {
    assert.ok(field in snapshot.mapState, `${field}: поле едет в состоянии игры`);
    assert.ok(!(field in snapshot.map), `${field}: поля нет в неизменной части`);
  }
  for (const field of RK.MapGen.MATRIX_FIELDS) {
    assert.ok(!(field in snapshot.map), `${field}: матрица уехала в сжатые matrices`);
  }
});

test('the game state list holds only fields that really change', () => {
  const RK = worldRun();
  const before = JSON.stringify(RK.Combat.createSnapshot().mapState);

  RK.Map.blood.push({ x: 1, y: 1 });
  RK.Map.traps.push({ x: 2, y: 2, kind: 'spike', state: 'armed' });

  const after = JSON.stringify(RK.Combat.createSnapshot().mapState);
  assert.notEqual(before, after, 'изменение состояния игры меняет снимок');
});
