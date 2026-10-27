'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// Снимок ходит по сети на каждый шаг. Проверка на четырёх героях ловит то, что
// одиночный забег не видит: чужой выбор героя, общий ход и повторное сжатие
// карты не должны менять состояние между кругами.

function worldRun(seed = 4242) {
  const { sandbox } = createSandbox({ seed });
  const RK = sandbox.RK;
  RK.CONFIG.ENABLE_WORLD = false;
  RK.Combat.newRun({ size: 'medium', style: 'stone' });
  return { sandbox, RK };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function mapSnapshot(RK) {
  const fields = {};
  for (const field of RK.MapGen.MAP_STATIC_FIELDS) {
    if (field === 'w' || field === 'h') continue;
    fields[field] = RK.Map[field];
  }
  return plain(fields);
}

test('a four-player snapshot restores every client and survives repeated round trips', () => {
  const { RK } = worldRun();
  const party = [
    ['guest-1', 'Гость', 'archer'],
    ['guest-2', 'Гость 2', 'mage'],
    ['guest-3', 'Гость 3', 'berserker'],
  ];
  for (const [id, name, classId] of party) {
    assert.equal(RK.Combat.addNetworkPlayer(id, name, classId), true);
  }
  assert.equal(RK.GAME.players.length, 4);

  // Состояние игры и карты, которое обязано пережить каждый круг.
  RK.GAME.turn = 7;
  for (const member of RK.GAME.players) member.gold = 999;
  RK.Map.explored[0][0] = true;
  RK.Map.tiles[0][0] = RK.Map.tiles[0][0] === 1 ? 0 : 1;
  RK.Map.blood.push({ x: 1, y: 1, amount: 2 });
  RK.Map.traps.push({ x: 2, y: 2, type: 'spike', state: 'armed', damage: 3 });
  RK.Map.zones.push({ x: 3, y: 3, type: 'event' });
  if (RK.Map.doors.length) RK.Map.doors[0].state = 'open';
  else RK.Map.doors.push({ x: 4, y: 4, state: 'open' });
  if (RK.Map.chests.length) RK.Map.chests[0].state = 'open';
  else RK.Map.chests.push({ x: 5, y: 5, state: 'open' });

  const snapshot = plain(RK.Combat.createSnapshot());
  assert.ok(snapshot, 'снимок собран');
  assert.equal(snapshot.world, undefined, 'без мира лишнего поля нет');
  assert.equal(snapshot.map.matrices.tiles.length, RK.Map.h, 'строки карты сжаты');
  assert.ok(snapshot.mapState.explored, 'исследованное едет в состоянии игры');
  for (const field of RK.MapGen.MATRIX_FIELDS) {
    assert.equal(field in snapshot.map, false, `${field}: матрица уехала в matrices`);
  }
  for (const field of RK.MapGen.MAP_STATE_FIELDS) {
    assert.equal(field in snapshot.map, false, `${field}: состояние уехало в mapState`);
  }

  const ids = ['local', ...party.map(([id]) => id)];
  for (const id of ids) {
    const client = createSandbox({ seed: 5000 + ids.indexOf(id) }).sandbox.RK;
    let state = JSON.parse(JSON.stringify(snapshot));

    for (let round = 0; round < 3; round++) {
      assert.equal(client.Combat.applySnapshot(state, id), true, `${id}: круг ${round}`);
      assert.equal(client.GAME.player.id, id, 'клиент смотрит своим героем');
      assert.equal(client.GAME.players.length, 4);
      assert.equal(client.GAME.turn, 7);
      assert.equal(client.GAME.player.gold, 999);

      for (const field of RK.MapGen.MATRIX_FIELDS) {
        assert.equal(JSON.stringify(client.Map[field]), JSON.stringify(RK.Map[field]),
          `${id}: матрица ${field} не изменилась`);
      }
      for (const field of RK.MapGen.MAP_STATE_FIELDS) {
        assert.equal(JSON.stringify(client.Map[field]), JSON.stringify(RK.Map[field]),
          `${id}: состояние ${field} не изменилось`);
      }
      assert.equal(JSON.stringify(mapSnapshot(client)), JSON.stringify(mapSnapshot(RK)),
        'геометрия и постройки не поплыли');

      // Следующий круг идёт через снимок клиента: так проверяется и повторное
      // сжатие, и отсутствие накопления различий между сервером и клиентом.
      state = plain(client.Combat.createSnapshot());
    }
  }
});
