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

  ping() {
    this.pingCount = (this.pingCount || 0) + 1;
  }

  terminate() {
    this.readyState = 3;
    this.terminated = true;
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

// Сервер считает забег в своём процессе, поэтому снимок приходит через очередь
// задач: тест ждёт его, а не читает сокет сразу после отправки действия.
function waitForState(socket, count = 1) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 10000;
    const poll = () => {
      const states = socket.messages
        .filter((message) => message.type === 'state')
        .map((message) => message.state);
      if (states.length >= count) return resolve(states);
      if (Date.now() > deadline) return reject(new Error('снимок не пришёл'));
      setTimeout(poll, 5);
    };
    poll();
  });
}

function startRoom(manager, host, options = { size: 'compact', style: 'stone' }) {
  host.request({ type: 'start', options });
  return waitForState(host);
}

// Автопроход публикует снимок на каждый шаг, поэтому «действие кончилось» — это
// не «снимок пришёл», а «снимки перестали приходить».
function waitForSettledStates(socket, from = 0) {
  const count = () => socket.messages.filter((message) => message.type === 'state').length;
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 10000;
    let stableSince = null;
    const poll = () => {
      if (count() > from && (stableSince === null || Date.now() - stableSince > 300)) {
        return resolve(socket.messages.filter((message) => message.type === 'state').map((m) => m.state));
      }
      if (Date.now() > deadline) return reject(new Error('забег не успокоился'));
      if (count() > from && stableSince === null) stableSince = Date.now();
      setTimeout(poll, 10);
    };
    poll();
  });
}

function heroFrom(state, id) {
  return state.game.players.find((player) => player.id === id);
}

// Свободная соседняя клетка по правилам tryStep: пол, без закрытой двери,
// сундука, врага и другого участника партии.
function freeStep(state, hero) {
  const blocked = (x, y) => {
    const row = state.map.tiles[y];
    if (!row || row[x] !== 1) return true;
    if ((state.map.doors || []).some((door) => door.x === x && door.y === y &&
        door.state !== 'open' && door.state !== 'broken')) return true;
    if ((state.map.chests || []).some((chest) => chest.x === x && chest.y === y &&
        chest.state !== 'open' && chest.state !== 'broken')) return true;
    return state.game.enemies.some((enemy) => enemy.alive && enemy.x === x && enemy.y === y) ||
      state.game.players.some((player) => player.hp > 0 && player.x === x && player.y === y);
  };
  const step = [[0, 1], [1, 0], [0, -1], [-1, 0]].find(([dx, dy]) => !blocked(hero.x + dx, hero.y + dy));
  assert.ok(step, 'у героя нет свободной соседней клетки');
  return step;
}

test('room protocol keeps disconnected heroes and restores reconnect tokens', () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: '<Host>' });
  const created = host.last('room-created');
  assert.equal(created.players[0].name, 'Host');

  const guest = connect(manager);
  guest.request({ type: 'join', room: created.room, name: 'Guest', classId: 'berserker' });
  const joined = guest.last('joined');
  assert.equal(joined.state, null);
  assert.equal(joined.players.length, 2);

  guest.request({ type: 'chat', text: 'Hello team' });
  assert.equal(host.last('chat').playerId, joined.playerId);
  assert.equal(host.last('chat').name, 'Guest');
  assert.equal(host.last('chat').text, 'Hello team');
  assert.equal(guest.last('chat').text, 'Hello team');

  guest.request({ type: 'chat', text: '   ' });
  assert.equal(guest.messages.filter((message) => message.type === 'chat').length, 1);

  guest.emit('close');
  assert.equal(host.last('players').players[1].connected, false);

  // Простое подключение с тем же именем не должно забирать чужую сессию:
  // вернуть отключённого героя можно только по токену.
  const sameNameReconnect = connect(manager);
  sameNameReconnect.request({ type: 'join', room: created.room, name: 'Guest' });
  const rejoined = sameNameReconnect.last('joined');
  assert.notEqual(rejoined.playerId, joined.playerId, 'a fresh join must not reuse a hero');
  assert.notEqual(rejoined.token, joined.token);

  const impostor = connect(manager);
  impostor.request({ type: 'join', room: created.room, name: 'Impostor' });
  assert.notEqual(impostor.last('joined').playerId, joined.playerId);

  const withBadToken = connect(manager);
  withBadToken.request({ type: 'reconnect', room: created.room, token: 'wrong', name: 'Guest' });
  assert.equal(withBadToken.last('error').code, 'bad-token');
  assert.equal(withBadToken.last('joined'), undefined);

  const restored = connect(manager);
  restored.request({
    type: 'reconnect',
    room: created.room,
    token: joined.token,
    name: 'Guest',
  });
  assert.equal(restored.last('joined').playerId, joined.playerId);
});

test('heartbeat tolerates one missed pong, and send closes slow clients before buffers grow', () => {
  const manager = new RoomManager();
  manager.webSocketServer = { clients: new Set() };
  const socket = connect(manager);
  manager.webSocketServer.clients.add(socket);

  manager.startHeartbeat(5);
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 1000;
    const check = () => {
      if (socket.terminated) {
        manager.stopHeartbeat();
        return reject(new Error('terminated on first missing pong'));
      }
      if (socket.pingCount >= 2) {
        socket.emit('pong');
        socket.bufferedAmount = 2 * 1024 * 1024;
        manager.send(socket, { type: 'state' });
        manager.stopHeartbeat();
        assert.equal(socket.closeCode, 1013);
        resolve();
        return;
      }
      if (Date.now() > deadline) {
        manager.stopHeartbeat();
        reject(new Error('heartbeat did not send pings'));
        return;
      }
      setTimeout(check, 2);
    };
    const originalClose = socket.close.bind(socket);
    socket.close = (code, reason) => {
      socket.closeCode = code;
      socket.closeReason = reason;
      originalClose();
    };
    check();
  });
});

test('host-selected class is used when the multiplayer run starts', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  host.request({ type: 'start', options: { size: 'compact', style: 'stone', classId: 'archer' } });

  const [state] = await waitForState(host);
  assert.equal(heroFrom(state, host.last('room-created').playerId).classId, 'archer');
});

test('a guest moves while the host browser is silent — the run lives on the server', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const room = host.last('room-created').room;

  const guest = connect(manager);
  guest.request({ type: 'join', room, name: 'Guest' });
  const guestId = guest.last('joined').playerId;

  const [initial] = await startRoom(manager, host);
  assert.equal(initial.game.turn, 0);
  const before = heroFrom(initial, guestId);

  // Свёрнутое окно хоста не присылает ни кадров, ни запросов: сокет хоста с
  // этого момента молчит, а ход госта всё равно должен разыграться.
  const [dx, dy] = freeStep(initial, before);
  guest.request({ type: 'action', action: 'tryStep', args: [dx, dy] });

  const [, next] = await waitForState(guest, 2);
  const after = heroFrom(next, guestId);
  assert.equal(next.game.turn, 1, 'ход должен засчитаться');
  assert.equal(after.x, before.x + dx, 'гость должен сместиться');
  assert.equal(after.y, before.y + dy);
  assert.equal(after.id, guestId, 'снимок не должен терять личность героя');

  // Хост тоже получает тот же снимок и рисует ту же карту.
  const hostSnapshot = host.last('state').state;
  assert.deepEqual(hostSnapshot.game.players.map((player) => [player.id, player.x, player.y]),
    next.game.players.map((player) => [player.id, player.x, player.y]));
});
test('the room list shows every room with the players inside it', async () => {
  const manager = new RoomManager();
  manager.webSocketServer = { clients: new Set() };
  const host = connect(manager);
  manager.webSocketServer.clients.add(host);

  const browser = connect(manager);
  manager.webSocketServer.clients.add(browser);
  browser.request({ type: 'list' });
  assert.deepEqual(browser.last('rooms').rooms, []);

  host.request({ type: 'create', name: 'Хост' });
  const room = host.last('room-created').room;
  const guest = connect(manager);
  guest.request({ type: 'join', room, name: 'Гость' });
  guest.emit('close');

  const listed = browser.last('rooms').rooms;
  assert.equal(listed.length, 1);
  assert.equal(listed[0].code, room);
  assert.equal(listed[0].started, false);
  assert.equal(listed[0].capacity, MAX_PLAYERS);
  assert.deepEqual(listed[0].players.map((player) => [player.name, player.host, player.connected]), [
    ['Хост', true, true],
    ['Гость', false, false],
  ]);

  await startRoom(manager, host);
  const started = browser.last('rooms').rooms;
  assert.equal(started[0].started, true, 'список помечает идущий забег');

  // После входа в комнату подписка на список снимается.
  const entering = connect(manager);
  manager.webSocketServer.clients.add(entering);
  entering.request({ type: 'list' });
  entering.request({ type: 'join', room, name: 'Третий' });
  const seenBefore = entering.messages.filter((message) => message.type === 'rooms').length;
  guest.request({ type: 'chat', text: 'пинг' });
  assert.equal(entering.messages.filter((message) => message.type === 'rooms').length, seenBefore);
});

test('a finished run is broadcast once, with the party log and the host gold', () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const code = host.last('room-created').room;
  const guest = connect(manager);
  guest.request({ type: 'join', room: code, name: 'Guest' });

  // Забег подставляется готовым: доводить партию до смерти через протокол
  // недетерминированно, а проверяется здесь формат последнего снимка.
  const room = manager.rooms.get(code);
  let disposed = false;
  const events = {
    actor: host.last('room-created').playerId,
    log: [{ text: 'Вы бьёте Крысу на 7' }, { text: 'Отдых...', narrator: true }],
    screen: { playerId: host.last('room-created').playerId, name: 'merchant' },
    over: { win: true, floor: 10, level: 3, banked: 250 },
  };
  room.run = {
    snapshot: () => ({ game: { turn: 7, over: true, result: 'victory', runSeed: 42 }, map: { w: 1 } }),
    takeEvents: () => events,
    dispose: () => { disposed = true; },
  };
  manager.publish(room, room.run, events);

  const message = host.last('state');
  assert.equal(message.turn, 7);
  assert.deepEqual(message.log, events.log);
  assert.deepEqual(message.screen, events.screen);
  assert.equal(message.banked, 250);
  assert.equal(guest.last('state').banked, 250, 'последний снимок уходит всем');
  assert.equal(disposed, true, 'движок отпускается вместе с забегом');
  assert.equal(room.run, null, 'комната ждёт следующего забега');

  host.request({ type: 'action', action: 'skipTurn', args: [] });
  assert.match(host.last('error').message, /ещё не начат/);
});

test('room protocol enforces the player limit and rejects malformed actions', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const room = host.last('room-created').room;
  const guests = [];

  for (let i = 1; i < MAX_PLAYERS; i++) {
    const guest = connect(manager);
    guest.request({ type: 'join', room, name: 'Guest' + i });
    guests.push(guest);
  }
  const extra = connect(manager);
  extra.request({ type: 'join', room, name: 'Extra' });
  assert.match(extra.last('error').message, /максимальное число/);

  await startRoom(manager, host);
  guests[0].request({ type: 'action', action: 'constructor', args: [] });
  assert.match(guests[0].last('error').message, /Недопустимое/);
  guests[0].request({ type: 'action', action: 'toString', args: [] });
  assert.match(guests[0].last('error').message, /Недопустимое/);
  guests[0].request({ type: 'action', action: 'tryStep', args: [5, 0] });
  assert.match(guests[0].last('error').message, /Недопустимое/);
  guests[0].request({ type: 'action', action: 'playerAction', args: [95, 99999] });
  assert.match(guests[0].last('error').message, /Недопустимое/);
  guests[0].request({ type: 'action', action: 'interact', args: ['teleport'] });
  assert.match(guests[0].last('error').message, /Недопустимое/);
  for (let i = 0; i < 6; i++) guests[0].request({ type: 'chat', text: 'spam' });
  assert.equal(guests[0].last('chat-error').type, 'chat-error');
  for (let i = 0; i < 9; i++) {
    guests[0].request({ type: 'action', action: 'skipTurn', args: [] });
  }
  assert.match(guests[0].last('error').message, /Слишком много/);
});

test('a guest cannot start a run or read a room size outside the config', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const room = host.last('room-created').room;
  const guest = connect(manager);
  guest.request({ type: 'join', room, name: 'Guest' });

  guest.request({ type: 'start', options: {} });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(host.last('state'), undefined);
  assert.match(guest.last('error').message, /не поддерживается/);

  // 'constructor' есть у любого объекта: без hasOwnKey размер карты уехал бы
  // в игру как Object.prototype.constructor с width === undefined. Размер и
  // стиль откатываются к умолчаниям забега.
  host.request({ type: 'start', options: { size: 'constructor', style: 'toString' } });
  const [state] = await waitForState(host);
  assert.equal(state.map.w, 48);
  assert.equal(state.map.h, 34);
  assert.equal(state.game.mapStyle, 'stone');
});

test('an autowalk click reaches the room as one snapshot per step, not as a jump', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const { room, playerId } = host.last('room-created');
  const guest = connect(manager);
  guest.request({ type: 'join', room, name: 'Guest' });

  const [state] = await startRoom(manager, host);
  const hero = heroFrom(state, playerId);

  // Цель — клетка в нескольких шагах по прямой, до которой есть путь. Дальше
  // маршрут может прервать встреченный враг, и это тоже верное поведение.
  let target = null;
  for (let d = 5; d >= 2 && !target; d--) {
    if (state.map.tiles[hero.y][hero.x + d] === 1) target = { x: hero.x + d, y: hero.y };
  }
  assert.ok(target, 'у героя должен быть проходимый коридор');

  const before = host.messages.filter((message) => message.type === 'state').length;
  host.request({ type: 'action', action: 'playerAction', args: [target.x, target.y] });
  const walkStates = (await waitForSettledStates(host, before)).slice(before);
  assert.ok(walkStates.length >= 1, 'действие должно прислать снимок');

  const cells = walkStates.map((snapshot) => {
    const party = heroFrom(snapshot, playerId);
    return [party.x, party.y];
  });
  let stepsTaken = 0;
  for (let i = 1; i < cells.length; i++) {
    const step = Math.abs(cells[i][0] - cells[i - 1][0]) + Math.abs(cells[i][1] - cells[i - 1][1]);
    assert.ok(step <= 1, 'шаг не должен перескакивать клетки: ' + JSON.stringify(cells));
    stepsTaken += step;
  }
  // Главное свойство: снимок уходит на каждый пройденный шаг. Если бы публикация
  // шла раз на действие, маршрут из нескольких клеток пришёл бы одним прыжком.
  assert.equal(walkStates.length, Math.max(1, stepsTaken),
    'на каждый шаг маршрута — свой снимок: ' + JSON.stringify(cells));
  const last = cells[cells.length - 1];
  assert.ok(last[0] !== hero.x || last[1] !== hero.y, 'герой сдвинулся с места');
  assert.ok(Math.abs(last[0] - hero.x) + Math.abs(last[1] - hero.y) <= Math.abs(target.x - hero.x) + Math.abs(target.y - hero.y));
});

test('the host is rate limited on chat like every other player, and a dead room code is reported', () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });

  // Окно чата считается из состояния соединения. Если хост создаётся с неполным
  // набором полей, счётчики undefined и лимит не срабатывает никогда.
  for (let i = 0; i < 6; i++) host.request({ type: 'chat', text: 'spam ' + i });
  assert.equal(host.messages.filter((message) => message.type === 'chat').length, 5);
  assert.equal(host.last('chat-error').type, 'chat-error');

  // Клиент чинит сохранённую сессию по коду, а не по тексту ошибки.
  const stranger = connect(manager);
  stranger.request({ type: 'reconnect', room: 'NOSUCH', token: 'whatever', name: 'Guest' });
  assert.equal(stranger.last('error').code, 'no-room');
});

test('every class id from PLAYER_CLASSES survives the network, unknown ids fall back to tank', () => {
  const CONFIG = require('../js/config');
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const { room } = host.last('room-created');

  // Отключённый игрок держит слот до истечения комнаты, поэтому список классов
  // проверяется на ответе «joined», а не через вещание хоста.
  const joinedClass = [];
  for (const classId of CONFIG.PLAYER_CLASSES) {
    const guest = connect(manager);
    guest.request({ type: 'join', room, name: 'Hero', classId });
    joinedClass.push(guest.last('joined').players.at(-1).classId);
  }
  assert.deepEqual(joinedClass, [...CONFIG.PLAYER_CLASSES]);

  const otherHost = connect(manager);
  otherHost.request({ type: 'create', name: 'Second' });
  const stranger = connect(manager);
  stranger.request({ type: 'join', room: otherHost.last('room-created').room, name: 'Nobody', classId: 'dragon' });
  assert.equal(stranger.last('joined').players.at(-1).classId, 'tank');
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

test('a guest who joins after the start enters the run and returns to its own session', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const { room } = host.last('room-created');

  await startRoom(manager, host);

  const late = connect(manager);
  late.request({ type: 'join', room, name: 'Late', classId: 'berserker' });
  const joined = late.last('joined');
  assert.notEqual(joined.state, null, 'новичок получает актуальное состояние');

  // Добавление в забег идёт через очередь комнаты: ждём снимок с новичком.
  const [withNewcomer] = await waitForState(late, 1);
  assert.ok(heroFrom(withNewcomer, joined.playerId), 'новичок в партии забега');

  const hero = heroFrom(withNewcomer, joined.playerId);
  const [dx, dy] = freeStep(withNewcomer, hero);
  late.request({ type: 'action', action: 'tryStep', args: [dx, dy] });
  const [, afterStep] = await waitForState(late, 2);
  const moved = heroFrom(afterStep, joined.playerId);
  assert.equal(moved.x, hero.x + dx, 'новичок ходит');
  assert.equal(moved.y, hero.y + dy);

  // F5: игрок возвращается в свою сессию, а не в лобби и не в чужую партию.
  const reconnected = connect(manager);
  reconnected.request({ type: 'reconnect', room, token: joined.token, name: 'Late' });
  const restored = reconnected.last('joined');
  assert.equal(restored.playerId, joined.playerId);
  assert.notEqual(restored.state, null);
  assert.ok(heroFrom(restored.state, joined.playerId));
});
