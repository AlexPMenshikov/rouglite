'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createNetworkSandbox, MockWebSocket } = require('./helpers/sandbox');

// Сеть шлёт JSON по сокету: тест перехватывает send и разыгрывает ответы сервера.
// Сессия живёт в localStorage под ключом rouglite.lan.session.

const sent = [];
MockWebSocket.prototype.send = function (data) {
  sent.push(data);
};

const SESSION_KEY = 'rouglite.lan.session';

function saveSession(sandbox, session = { room: 'ABC123', token: 'token-1', name: 'Игрок' }) {
  sandbox.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function openLastSocket() {
  const socket = MockWebSocket.lastConnection;
  socket.emit('open');
  return socket;
}

test('reconnect sends the saved session to the server', () => {
  const { sandbox } = createNetworkSandbox();
  saveSession(sandbox);

  sandbox.RK.Network.reconnect();
  openLastSocket();

  const request = JSON.parse(sent[0]);
  assert.equal(request.type, 'reconnect');
  assert.equal(request.room, 'ABC123');
  assert.equal(request.token, 'token-1');
});

test('reconnect without a saved session does not open a socket', () => {
  MockWebSocket.lastConnection = undefined;
  const { sandbox } = createNetworkSandbox();

  sandbox.RK.Network.reconnect();

  assert.equal(MockWebSocket.lastConnection, undefined);
});

test('a broken saved session is dropped', () => {
  MockWebSocket.lastConnection = undefined;
  const { sandbox } = createNetworkSandbox();
  sandbox.localStorage.setItem(SESSION_KEY, '{битый json');

  sandbox.RK.Network.reconnect();

  assert.equal(sandbox.localStorage.getItem(SESSION_KEY), null, 'мусор не должен переживать перезапуск');
  assert.equal(MockWebSocket.lastConnection, undefined);
});

test('fatal reconnect errors forget the session, ordinary ones do not', () => {
  const fatal = createNetworkSandbox();
  saveSession(fatal.sandbox);
  fatal.sandbox.RK.Network.reconnect();
  const socket = openLastSocket();

  socket.emit('message', { data: JSON.stringify({ type: 'error', code: 'bad-token', message: 'Токен не найден' }) });

  assert.equal(fatal.sandbox.localStorage.getItem(SESSION_KEY), null, 'неисправимая сессия удаляется');
  assert.equal(fatal.sandbox.RK.Network.room(), '', 'комната очищена');

  const recoverable = createNetworkSandbox();
  saveSession(recoverable.sandbox);
  recoverable.sandbox.RK.Network.reconnect();
  const secondSocket = openLastSocket();

  secondSocket.emit('message', { data: JSON.stringify({ type: 'error', code: 'busy', message: 'Занято' }) });

  assert.equal(
    recoverable.sandbox.localStorage.getItem(SESSION_KEY) !== null,
    true,
    'сессию, которую можно восстановить, не трогаем',
  );
});

test('joinRoom continues a saved session of the same room and joins a new one', () => {
  const same = createNetworkSandbox();
  saveSession(same.sandbox);
  sent.length = 0;

  same.sandbox.RK.Network.joinRoom('abc123', 'Игрок');
  openLastSocket();
  assert.equal(JSON.parse(sent[0]).type, 'reconnect', 'код комнаты сравнивается без учёта регистра');

  const other = createNetworkSandbox();
  saveSession(other.sandbox, { room: 'ZZZ999', token: 'token-2', name: 'Игрок' });
  sent.length = 0;

  other.sandbox.RK.Network.joinRoom('ABC123', 'Игрок');
  openLastSocket();
  const request = JSON.parse(sent[0]);
  assert.equal(request.type, 'join');
  assert.equal(request.room, 'ABC123');
});
