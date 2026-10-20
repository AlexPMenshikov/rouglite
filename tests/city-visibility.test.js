'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// В городе тумана нет: видно всю карту, и видят её все — и герой в одиночной
// игре, и каждый клиент в сетевой комнате, потому что обзор клиент считает сам.

function cityRun(seed = 501) {
  const { sandbox } = createSandbox({ seed });
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'medium', style: 'stone' });
  return RK;
}

function countVisible(RK) {
  const vis = RK.Fov.computeVisibility(RK.GAME.player.x, RK.GAME.player.y);
  let count = 0;
  for (const row of vis) {
    for (const cell of row) if (cell) count++;
  }
  return count;
}

function countExplored(RK) {
  let count = 0;
  for (const row of RK.Map.explored) {
    for (const cell of row) if (cell) count++;
  }
  return count;
}

test('the city has no fog of war: the whole map is visible', () => {
  const RK = cityRun();

  assert.equal(RK.Map.locationType, 'city', 'карта города помечена типом локации');
  assert.equal(countVisible(RK), RK.Map.w * RK.Map.h, 'виден весь город');
});

test('the city counts as fully explored', () => {
  const RK = cityRun();

  RK.Fov.compute(RK.GAME.player.x, RK.GAME.player.y);

  assert.equal(countExplored(RK), RK.Map.w * RK.Map.h, 'город исследован целиком');
});

test('other locations keep the fog of war', () => {
  const RK = cityRun();

  assert.equal(RK.World.travel('gate_north'), true, 'переход в лес удался');

  assert.equal(RK.Map.locationType, 'wilderness');
  const visible = countVisible(RK);
  assert.ok(visible < RK.Map.w * RK.Map.h, 'в лесу туман остаётся');
  assert.ok(visible > 0, 'но хотя бы часть карты видна');
});

test('a client that received a city snapshot sees the whole city', () => {
  const RK = cityRun();
  const snapshot = RK.Combat.createSnapshot();

  assert.equal(snapshot.map.locationType, 'city', 'тип локации едет в снимке');

  // Другой клиент: он считает обзор от своего героя, но по общей карте.
  const { sandbox } = createSandbox({ seed: 502 });
  const client = sandbox.RK;
  assert.equal(client.Combat.applySnapshot(JSON.parse(JSON.stringify(snapshot)), 'local'), true);

  assert.equal(client.Map.locationType, 'city', 'клиент знает, что это город');
  const vis = client.Fov.computeVisibility(client.GAME.player.x, client.GAME.player.y);
  let visible = 0;
  for (const row of vis) {
    for (const cell of row) if (cell) visible++;
  }
  assert.equal(visible, client.Map.w * client.Map.h, 'клиент видит город целиком');
});
