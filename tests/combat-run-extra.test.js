'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// маленькая прямая проверка CombatRun: она читает партию и врагов в том виде,
// в котором её использует бой, без сетевого и интерфейсного шума.

function createRun() {
  const { sandbox } = createSandbox({ seed: 100 });
  const RK = sandbox.RK;
  RK.CONFIG.ENABLE_WORLD = false;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  RK.GAME.enemies = [];
  return { RK };
}

test('party contains the local hero and network additions', () => {
  const { RK } = createRun();
  const player = RK.GAME.player;

  assert.equal(RK.CombatRun.party().length, 1);
  assert.equal(RK.CombatRun.party()[0], player);
  assert.equal(RK.CombatRun.getPartyPlayerAt(player.x, player.y, null), player);

  assert.equal(RK.CombatRun.addNetworkPlayer('guest', 'Гость', 'berserker'), true);
  assert.equal(RK.CombatRun.party().length, 2);
  assert.equal(RK.CombatRun.party().some((member) => member.id === 'guest'), true);

  const guest = RK.GAME.players.find((member) => member.id === 'guest');
  assert.equal(RK.CombatRun.getPartyPlayerAt(guest.x, guest.y, 'local'), guest);
  assert.equal(RK.CombatRun.getPartyPlayerAt(guest.x, guest.y, 'guest'), null);

  assert.equal(RK.CombatRun.removeNetworkPlayer('guest'), true);
  assert.equal(RK.CombatRun.party().length, 1);
});

test('enemy lookup ignores dead enemies and hidden movement data hosts', () => {
  const { RK } = createRun();
  const alive = RK.Entities.makeEnemy('rat', RK.GAME.player.x + 1, RK.GAME.player.y, RK.GAME.floor);
  const dead = RK.Entities.makeEnemy('rat', RK.GAME.player.x + 2, RK.GAME.player.y, RK.GAME.floor);
  alive.hp = 5;
  dead.hp = 0;
  dead.alive = false;
  RK.GAME.enemies = [alive, dead];

  assert.equal(RK.CombatRun.getEnemyAt(alive.x, alive.y), alive);
  assert.equal(RK.CombatRun.getEnemyAt(dead.x, dead.y), null, 'труп не держит клетку');
  RK.GAME.enemies[1].hp = 5;
  RK.GAME.enemies[1].alive = false;
  assert.equal(RK.CombatRun.getEnemyAt(dead.x, dead.y), null, 'alive=false тоже снимает блокировку');
});

test('setActivePlayer switches focus inside the party', () => {
  const { RK } = createRun();
  assert.equal(RK.CombatRun.addNetworkPlayer('guest', 'Гость', 'archer'), true);

  assert.equal(RK.CombatRun.setActivePlayer('guest'), true);
  assert.equal(RK.GAME.player.id, 'guest');
  assert.equal(RK.CombatRun.setActivePlayer('missing'), false);
  assert.equal(RK.GAME.player.id, 'guest');

  RK.CombatRun.setActivePlayer(RK.GAME.players[0].id);
  assert.notEqual(RK.GAME.player.id, 'guest');
});
