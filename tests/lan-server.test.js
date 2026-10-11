const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { RoomManager, MAX_PLAYERS } = require('../server/room-manager');
const { createLanServer } = require('../server');

class MockSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.messages = [];
  }

  send(data) {
    this.messages.push(JSON.parse(data));
  }

  close() {
    this.readyState = 3;
    this.emit('close');
  }

  request(message) {
    this.emit('message', Buffer.from(JSON.stringify(message)));
  }

  last(type) {
    return this.messages.filter((message) => message.type === type).at(-1);
  }
}

function connect(manager) {
  const socket = new MockSocket();
  manager.handleConnection(socket);
  return socket;
}

test('room protocol routes actions, keeps disconnected heroes and restores reconnect tokens', () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: '<Host>' });
  const created = host.last('room-created');
  assert.equal(created.players[0].name, 'Host');

  const guest = connect(manager);
  guest.request({ type: 'join', room: created.room, name: 'Guest', classId: 'berserker' });
  const joined = guest.last('joined');
  assert.equal(joined.state, null);
  assert.equal(host.last('player-joined').player.classId, 'berserker');
  assert.equal(joined.players.length, 2);

  guest.request({ type: 'chat', text: 'Hello team' });
  assert.equal(host.last('chat').playerId, joined.playerId);
  assert.equal(host.last('chat').name, 'Guest');
  assert.equal(host.last('chat').text, 'Hello team');
  assert.equal(guest.last('chat').text, 'Hello team');

  guest.request({ type: 'chat', text: '   ' });
  assert.equal(guest.messages.filter((message) => message.type === 'chat').length, 1);

  guest.request({ type: 'action', action: 'tryStep', args: [1, 0] });
  assert.equal(host.last('action').playerId, joined.playerId);
  assert.equal(host.last('action').action, 'tryStep');
  host.request({ type: 'notice', notice: 'merchant', playerId: joined.playerId });
  assert.equal(guest.last('notice').notice, 'merchant');

  const state = { game: { turn: 4 }, map: { w: 32 } };
  host.request({ type: 'state', state });
  assert.deepEqual(guest.last('state').state, state);

  guest.emit('close');
  assert.equal(host.last('player-disconnected').playerId, joined.playerId);
  assert.equal(host.last('players').players[1].connected, false);

  const sameNameReconnect = connect(manager);
  sameNameReconnect.request({
    type: 'join',
    room: created.room,
    name: 'Guest',
  });
  assert.equal(sameNameReconnect.last('joined').playerId, joined.playerId);
  assert.deepEqual(sameNameReconnect.last('joined').state, state);

  const restored = connect(manager);
  restored.request({
    type: 'reconnect',
    room: created.room,
    token: joined.token,
    name: 'Guest',
  });
  assert.equal(restored.last('joined').playerId, joined.playerId);
  assert.deepEqual(restored.last('joined').state, state);

  const takeover = connect(manager);
  takeover.request({
    type: 'reconnect',
    room: created.room,
    token: joined.token,
    name: 'Guest',
  });
  assert.equal(takeover.last('joined').playerId, joined.playerId);
  assert.equal(host.last('players').players[1].connected, true);
});

test('room protocol enforces the player limit and rejects malformed actions', () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const { room } = host.last('room-created');
  const guests = [];

  for (let i = 1; i < MAX_PLAYERS; i++) {
    const guest = connect(manager);
    guest.request({ type: 'join', room, name: 'Guest' + i });
    guests.push(guest);
  }
  const extra = connect(manager);
  extra.request({ type: 'join', room, name: 'Extra' });
  assert.match(extra.last('error').message, /максимальное число/);

  guests[0].request({ type: 'action', action: 'constructor', args: [] });
  assert.match(guests[0].last('error').message, /Недопустимое/);
  guests[0].request({ type: 'action', action: 'tryStep', args: [5, 0] });
  assert.match(guests[0].last('error').message, /Недопустимое/);
  for (let i = 0; i < 6; i++) guests[0].request({ type: 'chat', text: 'spam' });
  assert.equal(guests[0].last('chat-error').type, 'chat-error');
  for (let i = 0; i < 9; i++) {
    guests[0].request({ type: 'action', action: 'skipTurn', args: [] });
  }
  assert.match(guests[0].last('error').message, /Слишком много/);
  guests.forEach((guest) => guest.emit('close'));
});

test('LAN server serves the game, protects project files and accepts WebSocket rooms', async (t) => {
  const app = createLanServer();
  const address = await app.listen(0, '127.0.0.1');
  const base = 'http://127.0.0.1:' + address.port;
  let client;
  t.after(async () => {
    if (client) client.terminate();
    for (const connection of app.webSocketServer.clients) connection.terminate();
    await app.close();
  });

  const html = await fetch(base + '/');
  assert.equal(html.status, 200);
  assert.match(await html.text(), /ЛОКАЛЬНАЯ КООПЕРАТИВНАЯ ИГРА/);
  assert.equal((await fetch(base + '/css/style.css')).status, 200);
  assert.equal((await fetch(base + '/plan.md')).status, 400);
  assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);

  const { WebSocket } = require('ws');
  client = new WebSocket('ws://127.0.0.1:' + address.port + '/ws');
  await new Promise((resolve, reject) => {
    client.once('open', resolve);
    client.once('error', reject);
  });
  const response = new Promise((resolve) => {
    client.once('message', (data) => resolve(JSON.parse(data.toString())));
  });
  client.send(JSON.stringify({ type: 'create', name: 'Local' }));
  assert.equal((await response).type, 'room-created');
});
