'use strict';

const crypto = require('node:crypto');

// Пределы карты и слоты берём из того же конфига, что и клиент: прежние
// собственные числа (96 без предела по Y) разъезжались с js/config.js.
const CONFIG = require('../js/config');
const { createRun } = require('./game-engine');

const MAX_PLAYERS = 4;
const MAX_ROOMS = 32;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CHAT_MAX_LENGTH = 280;
const CHAT_RATE_LIMIT = 5;
const CHAT_RATE_WINDOW_MS = 5000;
const NAME_MAX_LENGTH = 18;
const ACTION_RATE_LIMIT = 8;
const ACTION_RATE_WINDOW_MS = 1000;
const MAX_ACTION_ARGS = 5;
const WS_OPEN = 1;
const HEARTBEAT_INTERVAL_MS = 30000;
const INTERACT_MODES = ['use', 'pick', 'force'];
// Удача — счётчик улучшения из мет-прогресса хоста, а не произвольное число.
const MAX_LUCK = 1000;

// Правила объявлены явно для каждого действия: прежний catch-all
// `return args.length === 0` молча пропускал любое новое действие. Таблица без
// прототипа, иначе `action: 'constructor'` нашёл бы Object.prototype.constructor.
const ACTION_RULES = Object.assign(Object.create(null), {
  activateClassSkill: () => true,
  acceptQuest: () => true,
  skipTurn: () => true,
  interact: (args) => args.length === 1 && INTERACT_MODES.includes(args[0]),
  playerAction: (args) => args.length === 2 && args.every(isTileCoordinate),
  tryStep: (args) => args.length === 2 && args.every((v) => Number.isInteger(v) && v >= -1 && v <= 1),
  usePotion: (args) => args.length === 0 || (args.length === 1 && isBackpackIndex(args[0])),
  useInventoryItem: (args) => args.length === 1 && isBackpackIndex(args[0]),
  dropInventoryItem: (args) => args.length === 1 && isBackpackIndex(args[0]),
  sellInventoryItem: (args) => args.length === 1 && isBackpackIndex(args[0]),
  unequipSlot: (args) => args.length === 1 && isSlot(args[0]),
  upgradeEquipment: (args) => args.length === 1 && isSlot(args[0]),
});

function isBackpackIndex(value) {
  return Number.isInteger(value) && value >= 0 && value <= 1000;
}

function isSlot(value) {
  return CONFIG.SLOTS.includes(value);
}

function isTileCoordinate(value) {
  return Number.isInteger(value) &&
    value >= 0 &&
    value < CONFIG.MAP_LIMITS.maxWidth &&
    value < CONFIG.MAP_LIMITS.maxHeight;
}

// Свои ключи объекта, а не truthy по нему: table['constructor'] вернул бы
// Object.prototype.constructor, и в игру ушёл бы размер карты «undefined».
function hasOwnKey(table, value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(table, value);
}

function runOptions(value) {
  return {
    size: hasOwnKey(CONFIG.MAP_SIZES, value && value.size) ? value.size : undefined,
    style: hasOwnKey(CONFIG.MAP_STYLES, value && value.style) ? value.style : undefined,
  };
}

function normalizeLuck(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(MAX_LUCK, Math.round(value))) : 0;
}

function randomCode() {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (byte) => ROOM_CODE_CHARS[byte % ROOM_CODE_CHARS.length]).join('');
}

// Состояние соединения, создаваемое в одном месте: у хоста и гостя одинаковый
// набор полей, а без счётчиков окон лимиты для хоста не считались бы (undefined
// превращает сравнение в NaN), а без socket ошибка чата ушла бы в никуда.
function createClient(room, player, socket) {
  return {
    room,
    player,
    socket,
    host: player.host,
    actionWindowStarted: Date.now(),
    actionsInWindow: 0,
    chatWindowStarted: Date.now(),
    chatMessagesInWindow: 0,
  };
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\x00-\x1f\x7f<>]/g, '')
    .trim()
    .slice(0, NAME_MAX_LENGTH);
}

function safeName(value) {
  return normalizeName(value) || 'Игрок';
}

function isPlayerClass(value) {
  return CONFIG.PLAYER_CLASSES.includes(value);
}

// Сравнение токенов постоянного времени: токен — единственный секрет, по
// которому можно вернуть чужую сессию.
function tokenMatches(expected, given) {
  if (typeof expected !== 'string' || typeof given !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.clients = new WeakMap();
    this.webSocketServer = null;
    this.heartbeatTimer = null;
  }

  handleConnection(socket) {
    // Ошибка сокета без подписчика роняет процесс. Здесь же heartbeat: без него
    // полумёртвое TCP-соединение держит слот комнаты до системного таймаута.
    socket.on('error', () => this.disconnect(socket));
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });

    socket.on('message', (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        this.send(socket, { type: 'error', message: 'Некорректное сообщение.' });
        return;
      }
      this.handleMessage(socket, message);
    });

    socket.on('close', () => this.disconnect(socket));
  }

  startHeartbeat(intervalMs = HEARTBEAT_INTERVAL_MS) {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      for (const socket of this.webSocketServer ? this.webSocketServer.clients : []) {
        if (socket.isAlive === false) {
          socket.terminate();
          continue;
        }
        socket.isAlive = false;
        try {
          socket.ping();
        } catch {
          socket.terminate();
        }
      }
    }, intervalMs);
    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  handleMessage(socket, message) {
    if (!message || typeof message.type !== 'string') {
      this.send(socket, { type: 'error', message: 'Некорректное сообщение.' });
      return;
    }
    const connectedClient = this.clients.get(socket);
    if (connectedClient) connectedClient.room.lastActivity = Date.now();

    // Просмотр комнат не требует комнаты: подписка живёт на свободном сокете и
    // снимается при входе. Игрок, уже состоящий в комнате, всё равно получает
    // ответ — иначе увидел бы отказ там, где просто спросил список.
    if (message.type === 'list') {
      if (!connectedClient) socket.wantsRooms = true;
      this.sendRooms(socket);
      return;
    }

    if (message.type === 'create') {
      this.createRoom(socket, message);
      return;
    }
    if (message.type === 'join' || message.type === 'reconnect') {
      this.joinRoom(socket, message, safeName(message.name));
      return;
    }

    const client = this.clients.get(socket);
    if (!client) {
      this.send(socket, { type: 'error', message: 'Сначала создайте комнату или подключитесь к ней.' });
      return;
    }

    if (message.type === 'chat') {
      this.handleChat(client, message);
      return;
    }
    if (message.type === 'start' && client.host) {
      if (client.room.run) {
        this.send(socket, { type: 'error', message: 'Забег в этой комнате уже идёт.' });
        return;
      }
      this.enqueue(client.room, () => this.startRun(client.room, runOptions(message.options)));
      return;
    }
    if (message.type === 'action') {
      this.handleAction(client, message);
      return;
    }

    this.send(socket, { type: 'error', message: 'Это сообщение здесь не поддерживается.' });
  }

  createRoom(socket, message) {
    if (this.clients.has(socket)) {
      this.send(socket, { type: 'error', message: 'Это подключение уже состоит в комнате.' });
      return;
    }
    this.removeExpiredRooms();
    if (this.rooms.size >= MAX_ROOMS) {
      this.send(socket, { type: 'error', message: 'Сейчас нельзя создать новую комнату. Попробуйте позже.' });
      return;
    }
    let code;
    do {
      code = randomCode();
    } while (this.rooms.has(code));

    const player = {
      id: crypto.randomUUID(),
      token: crypto.randomBytes(24).toString('hex'),
      name: safeName(message.name),
      classId: isPlayerClass(message.classId) ? message.classId : 'tank',
      luck: normalizeLuck(message.luck),
      host: true,
      socket,
    };
    const room = this.createRoomState(code, player);
    this.send(socket, {
      type: 'room-created',
      room: code,
      playerId: player.id,
      token: player.token,
      host: true,
      players: this.playerList(room),
    });
    this.broadcastRooms();
  }

  createRoomState(code, host) {
    const room = {
      code,
      players: new Map([[host.id, host]]),
      run: null,
      // Снимок последнего забега: по нему переподключившийся видит то же состояние.
      state: null,
      queue: Promise.resolve(),
      lastActivity: Date.now(),
    };
    this.rooms.set(code, room);
    this.clients.set(host.socket, createClient(room, host, host.socket));
    host.socket.wantsRooms = false;
    return room;
  }

  joinRoom(socket, message, name) {
    const code = typeof message.room === 'string' ? message.room.toUpperCase().trim() : '';
    const room = this.rooms.get(code);
    if (!room) {
      // Код нужен клиенту, чтобы забыть сохранённую сессию: иначе он будет
      // переподключаться к комнате, которой больше нет.
      this.send(socket, { type: 'error', code: 'no-room', message: 'Комната не найдена или хост ещё не запустил её.' });
      return;
    }
    if (this.clients.has(socket)) {
      this.send(socket, { type: 'error', message: 'Это подключение уже состоит в комнате.' });
      return;
    }

    const token = typeof message.token === 'string' ? message.token : '';
    let player = null;
    // Снимок отдаётся только тому, кто действительно продолжает сессию: тип
    // сообщения ничего не значит, «reconnect» без токена ниже создаёт героя.
    let resumed = false;
    if (token) {
      player = Array.from(room.players.values()).find((entry) => tokenMatches(entry.token, token));
      if (!player) {
        this.send(socket, { type: 'error', code: 'bad-token', message: 'Ссылка для переподключения недействительна.' });
        return;
      }
      if (player.socket) {
        const previousSocket = player.socket;
        this.clients.delete(previousSocket);
        player.socket = null;
        if (previousSocket.readyState === WS_OPEN) previousSocket.close(4001, 'Session resumed');
      }
      resumed = true;
    } else {
      // Без токена вернуть отключённого игрока нельзя: любой, кто знает код комнаты
      // и имя героя, иначе забрал бы чужую сессию. Новое имя — новый игрок.
      if (room.players.size >= MAX_PLAYERS) {
        this.send(socket, { type: 'error', message: 'В комнате уже максимальное число игроков (4).' });
        return;
      }
      player = {
        id: crypto.randomUUID(),
        token: crypto.randomBytes(24).toString('hex'),
        name,
        classId: isPlayerClass(message.classId) ? message.classId : 'tank',
        host: false,
        socket: null,
      };
      room.players.set(player.id, player);
    }

    player.socket = socket;
    // Забег мог начаться раньше входа игрока: партия уже сформирована, поэтому
    // он добавляется в тот же забег, что и при createRun. Без этого игрок
    // видит чужой забег наблюдателем: состояние приходит, а ходить нельзя.
    if (room.run) {
      this.enqueue(room, () => {
        if (!room.run) return;
        room.run.addPlayer(player.id, player.name, player.classId);
        this.publish(room, room.run, room.run.takeEvents());
      });
    }
    if (message.name && !player.host) player.name = name;
    this.clients.set(socket, createClient(room, player, socket));
    socket.wantsRooms = false;
    this.send(socket, {
      type: player.host ? 'host-reconnected' : 'joined',
      room: code,
      playerId: player.id,
      token: player.token,
      host: player.host,
      players: this.playerList(room),
      state: (player.host || resumed || room.run) ? room.state : null,
    });
    this.broadcast(room, { type: 'players', players: this.playerList(room) });
    this.broadcastRooms();
  }

  // Окно действий в секунду: защита и от спама, и от залипания при задержанных
  // подтверждениях по сети.
  consumeActionQuota(client) {
    const now = Date.now();
    if (now - client.actionWindowStarted >= ACTION_RATE_WINDOW_MS) {
      client.actionWindowStarted = now;
      client.actionsInWindow = 0;
    }
    client.actionsInWindow++;
    return client.actionsInWindow <= ACTION_RATE_LIMIT;
  }

  handleChat(client, message) {
    if (typeof message.text !== 'string') return;
    const text = message.text.trim().slice(0, CHAT_MAX_LENGTH);
    if (!text) return;

    const now = Date.now();
    if (now - client.chatWindowStarted >= CHAT_RATE_WINDOW_MS) {
      client.chatWindowStarted = now;
      client.chatMessagesInWindow = 0;
    }
    client.chatMessagesInWindow++;
    if (client.chatMessagesInWindow > CHAT_RATE_LIMIT) {
      this.send(client.socket, { type: 'chat-error', message: 'Слишком часто. Подождите немного.' });
      return;
    }

    this.broadcast(client.room, {
      type: 'chat',
      playerId: client.player.id,
      name: client.player.name,
      text,
      timestamp: now,
    });
  }

  validAction(message) {
    if (typeof message.action !== 'string' || !Array.isArray(message.args)) return false;
    const rule = ACTION_RULES[message.action];
    if (typeof rule !== 'function') return false;
    if (message.args.length > MAX_ACTION_ARGS) return false;
    return rule(message.args) === true;
  }

  handleAction(client, message) {
    const room = client.room;
    if (!room.run) {
      this.send(client.socket, { type: 'error', message: 'Забег ещё не начат. Хост должен нажать «Начать забег».' });
      return;
    }
    if (!this.validAction(message)) {
      this.send(client.socket, { type: 'error', message: 'Недопустимое игровое действие.' });
      return;
    }
    if (!this.consumeActionQuota(client)) {
      this.send(client.socket, { type: 'error', message: 'Слишком много действий подряд. Подождите немного.' });
      return;
    }
    this.enqueue(room, () => this.applyAction(room, client.player, message));
  }

  // Симуляция одна на комнату, поэтому действия строго по одному: два
  // одновременных хода перемешали бы снимок и счётчик ходов.
  enqueue(room, task) {
    room.queue = room.queue
      .then(() => task())
      .catch((error) => {
        console.error('Комната ' + room.code + ': действие не выполнено — ' + error.message);
      });
  }

  async applyAction(room, player, message) {
    const run = room.run;
    if (!run) return;
    // Снимок уходит и посреди действия: автопроход клиент должен видеть по клетке
    // за ход, а не перескакиванием из начала в конец.
    let published = 0;
    const publishStep = () => {
      published++;
      if (room.run === run) this.publish(room, run, run.takeEvents());
    };
    try {
      await run.act(player.id, message.action, message.args, publishStep);
    } catch (error) {
      console.error('Комната ' + room.code + ': ' + error.message);
      this.send(player.socket, { type: 'error', message: 'Действие не выполнено. Попробуйте ещё раз.' });
      return;
    }
    // Действие без анимированного шага (атака, навык, предмет) снимком ещё не
    // публиковалось; если шаги были, последний снимок уже промежуточный.
    if (published === 0) publishStep();
  }

  startRun(room, options) {
    const party = Array.from(room.players.values(), ({ id, name, classId }) => ({ id, name, classId }));
    if (!party.length) return;
    const host = Array.from(room.players.values()).find((player) => player.host);
    room.run = createRun({ players: party, runOptions: options, luck: host ? host.luck : 0 });
    room.state = room.run.snapshot();
    this.publish(room, room.run, room.run.takeEvents());
    this.broadcastRooms();
  }

  // Снимок уходит всем игрокам комнаты после каждого действия: он и есть
  // «логика отрисовки», которую раньше считал браузер хоста.
  publish(room, run, events) {
    const state = run.snapshot();
    if (!state) return;
    room.state = state;
    room.lastActivity = Date.now();
    const message = {
      type: 'state',
      state,
      turn: state.game.turn,
      actor: events.actor,
    };
    if (events.log.length) message.log = events.log;
    if (events.screen) message.screen = events.screen;
    if (events.over) {
      message.banked = events.over.banked;
      // Движок отпускается сразу: комната ждёт следующего забега, а к результату
      // можно вернуться по room.state.
      room.run = null;
      run.dispose();
    }
    this.broadcast(room, message);
  }

  disconnect(socket) {
    const client = this.clients.get(socket);
    if (!client) return;
    this.clients.delete(socket);
    if (client.player.socket !== socket) return;
    client.player.socket = null;
    client.room.lastActivity = Date.now();
    this.broadcast(client.room, { type: 'players', players: this.playerList(client.room) });
    if (client.host) {
      // Забег не останавливается: он живёт на сервере, а не в окне хоста.
      this.broadcast(client.room, { type: 'host-disconnected' });
    }
    this.broadcastRooms();
  }

  removeExpiredRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const hasConnectedPlayers = Array.from(room.players.values()).some((player) => player.socket);
      if (hasConnectedPlayers || now - room.lastActivity <= ROOM_TTL_MS) continue;
      if (room.run) room.run.dispose();
      this.rooms.delete(code);
    }
  }

  playerList(room) {
    return Array.from(room.players.values(), ({ id, name, classId, host, socket }) => ({
      id,
      name,
      classId,
      host,
      connected: !!socket,
    }));
  }

  roomSummaries() {
    return Array.from(this.rooms.values(), (room) => ({
      code: room.code,
      started: !!room.run,
      capacity: MAX_PLAYERS,
      players: this.playerList(room),
    }));
  }

  sendRooms(socket) {
    this.send(socket, { type: 'rooms', rooms: this.roomSummaries() });
  }

  broadcastRooms() {
    const message = { type: 'rooms', rooms: this.roomSummaries() };
    for (const socket of this.webSocketServer ? this.webSocketServer.clients : []) {
      if (socket.wantsRooms && !this.clients.has(socket)) this.send(socket, message);
    }
  }

  broadcast(room, message) {
    for (const player of room.players.values()) {
      if (player.socket) this.send(player.socket, message);
    }
  }

  send(socket, message) {
    if (socket && socket.readyState === WS_OPEN) socket.send(JSON.stringify(message));
  }
}

module.exports = { RoomManager, MAX_PLAYERS, ACTION_RULES };
