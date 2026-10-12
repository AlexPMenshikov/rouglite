'use strict';

const crypto = require('node:crypto');

// Пределы карты и слоты экипировки берём из того же конфига, что и клиент:
// раньше здесь стояли собственные числа (96 без предела по Y), которые
// разъезжались с js/config.js.
const CONFIG = require('../js/config');

const MAX_PLAYERS = 4;
const MAX_ROOMS = 32;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CHAT_MAX_LENGTH = 280;
const CHAT_RATE_LIMIT = 5;
const CHAT_RATE_WINDOW_MS = 5000;
const NAME_MAX_LENGTH = 18;
const STATE_MAX_BYTES = 2 * 1024 * 1024;
const ACTION_RATE_LIMIT = 8;
const ACTION_RATE_WINDOW_MS = 1000;
const MAX_ACTION_ARGS = 5;
const WS_OPEN = 1;
const HEARTBEAT_INTERVAL_MS = 30000;
const NOTICES = new Set(['merchant', 'blacksmith']);
const INTERACT_MODES = ['use', 'pick', 'force'];

// Правила валидации объявлены явно для каждого действия: раньше в конце стоял
// catch-all `return args.length === 0`, и любое новое действие молча проходило
// проверку без правил. Таблица без прототипа, иначе `action: 'constructor'`
// находит Object.prototype.constructor и проходит валидацию.
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

function randomCode() {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (byte) => ROOM_CODE_CHARS[byte % ROOM_CODE_CHARS.length]).join('');
}

// Состояние соединения. Создаётся в одном месте, потому что у хоста и гостя
// одинаковый набор полей: без счётчиков окон лимиты для хоста не считались бы
// (undefined превращает сравнение в NaN), а без socket поле ошибка чата
// уходила бы в никуда.
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
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, NAME_MAX_LENGTH);
}

function safeName(value) {
  return normalizeName(value) || 'Игрок';
}

function isPlayerClass(value) {
  return CONFIG.PLAYER_CLASSES.includes(value);
}

// Сравнение токенов постоянного времени: токен — единственный секрет,
// по которому можно вернуть чужую сессию.
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
    // Ошибка уровня сокета без подписчика роняет процесс. Здесь же живёт
    // heartbeat: без него полумёртвое TCP-соединение держит слот комнаты до
    // системного таймаута.
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

  // Периодически закрывает соединения, которые не отвечают на ping.
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

    if (message.type === 'state' && client.host) {
      if (!message.state || !message.state.game || !message.state.map ||
          Buffer.byteLength(JSON.stringify(message.state)) > STATE_MAX_BYTES) {
        this.send(socket, { type: 'error', message: 'Снимок игрового состояния слишком большой или некорректен.' });
        return;
      }
      client.room.state = message.state;
      this.broadcast(client.room, { type: 'state', state: message.state });
      return;
    }
    if (message.type === 'notice' && client.host &&
        NOTICES.has(message.notice) && typeof message.playerId === 'string') {
      const player = client.room.players.get(message.playerId);
      if (player && player.socket && !player.host) {
        this.send(player.socket, { type: 'notice', notice: message.notice });
      }
      return;
    }
    if (message.type === 'action' && !client.host) {
      if (!this.validAction(message)) {
        this.send(socket, { type: 'error', message: 'Недопустимое игровое действие.' });
        return;
      }
      if (!this.consumeActionQuota(client)) {
        this.send(socket, { type: 'error', message: 'Слишком много действий подряд. Подождите немного.' });
        return;
      }
      const host = this.connectedHost(client.room);
      if (!host) {
        this.send(socket, { type: 'error', message: 'Хост временно отключён. Ожидание переподключения…' });
        return;
      }
      this.send(host.socket, {
        type: 'action',
        playerId: client.player.id,
        action: message.action,
        args: message.args,
      });
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
      host: true,
      socket,
    };
    const room = {
      code,
      players: new Map([[player.id, player]]),
      state: null,
      lastActivity: Date.now(),
    };
    this.rooms.set(code, room);
    this.clients.set(socket, createClient(room, player, socket));
    this.send(socket, {
      type: 'room-created',
      room: code,
      playerId: player.id,
      token: player.token,
      players: this.playerList(room),
    });
  }

  joinRoom(socket, message, name) {
    const code = typeof message.room === 'string' ? message.room.toUpperCase().trim() : '';
    const room = this.rooms.get(code);
    if (!room) {
      // Код нужен клиенту, чтобы забыть сохранённую сессию: без него он будет
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
    // Снимок отдаётся только тому, кто действительно продолжает чужую сессию.
    // Тип сообщения сам по себе ничего не значит: «reconnect» без токена ниже
    // создаёт нового героя.
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
      // Без токена вернуть отключённого игрока нельзя: любой, кто знает код
      // комнаты и имя героя, иначе забрал бы чужую сессию. Новое имя — это
      // новый игрок.
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
    if (message.name && !player.host) player.name = name;
    this.clients.set(socket, createClient(room, player, socket));
    this.send(socket, {
      type: player.host ? 'host-reconnected' : 'joined',
      room: code,
      playerId: player.id,
      token: player.token,
      host: player.host,
      players: this.playerList(room),
      state: player.host || resumed ? room.state : null,
    });
    if (player.host) {
      this.broadcast(room, { type: 'players', players: this.playerList(room) });
    } else {
      const host = this.connectedHost(room);
      if (host) this.send(host.socket, {
        type: 'player-joined',
        player: { id: player.id, name: player.name, classId: player.classId },
      });
      this.broadcast(room, { type: 'players', players: this.playerList(room) });
    }
  }

  // Окно действий в секунду: защищает и от спама, и от залипания при
  // задержанных подтверждениях по сети.
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

  disconnect(socket) {
    const client = this.clients.get(socket);
    if (!client) return;
    this.clients.delete(socket);
    if (client.player.socket !== socket) return;
    client.player.socket = null;
    client.room.lastActivity = Date.now();
    this.broadcast(client.room, { type: 'players', players: this.playerList(client.room) });
    if (client.host) {
      this.broadcast(client.room, { type: 'host-disconnected' });
      return;
    }
    const host = this.connectedHost(client.room);
    if (host) this.send(host.socket, { type: 'player-disconnected', playerId: client.player.id });
  }

  connectedHost(room) {
    const host = Array.from(room.players.values()).find((player) => player.host && player.socket);
    return host ? { socket: host.socket, player: host } : null;
  }

  removeExpiredRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const hasConnectedPlayers = Array.from(room.players.values()).some((player) => player.socket);
      if (!hasConnectedPlayers && now - room.lastActivity > ROOM_TTL_MS) this.rooms.delete(code);
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
