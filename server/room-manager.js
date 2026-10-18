'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');

// Пределы карты и слоты берём из того же конфига, что и клиент: прежние
// собственные числа (96 без предела по Y) разъезжались с js/config.js.
const CONFIG = require('../js/config');
const { createRun } = require('./game-engine');
const runStore = require('./run-store');

const MAX_PLAYERS = 6;
const MAX_ROOMS = 32;
// Комната без единого подключённого сокета живёт 20 минут, потом удаляется:
// иначе мёртвые комнаты держат память до бесконечности. Сокет жив — комната
// жива, даже если игрок молчит: отвернувшийся хост не должен терять забег.
const ROOM_IDLE_MS = 20 * 60 * 1000;
const ROOM_SWEEP_INTERVAL_MS = 60 * 1000;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CHAT_MAX_LENGTH = 280;
const CHAT_RATE_LIMIT = 5;
const CHAT_RATE_WINDOW_MS = 5000;
const NAME_MAX_LENGTH = 18;
// Идентификатор задания — это вид NPC, решётка и номер: «merchant#7».
const QUEST_ID_MAX_LENGTH = 64;
// Лимит защищает от спама и от залипания при задержанных подтверждениях. Он
// обязан быть выше темпа ходьбы с нажатой клавишей: шаг длится C.WALK_MS плюс
// тик, то есть около 9 ходов в секунду. При 8 в секунду игрок упирался в
// «Слишком много действий» на девятом ходу обычной ходьбы.
const ACTION_RATE_LIMIT = 20;
const ACTION_RATE_WINDOW_MS = 1000;
const MAX_ACTION_ARGS = CONFIG.MAX_ACTION_ARGS || 5;
const WS_OPEN = 1;
const HEARTBEAT_INTERVAL_MS = 20000;
const HEARTBEAT_MISSES = 2;
const MAX_BUFFERED_BYTES = 1024 * 1024;
const INTERACT_MODES = ['use', 'pick', 'force'];
// Удача — счётчик улучшения из мет-прогресса хоста, а не произвольное число.
// Граница живёт в конфиге: её читает и run-store при чтении файла забега.
const MAX_LUCK = CONFIG.MAX_LUCK;

// Что комната уже отправила клиентам, помечается сериализованной копией:
// версии считать незачем, а сравнение строк точно отвечает на вопрос «изменилась
// ли часть». Ключи обнуляются вместе с комнатой, поэтому первый снимок новой
// комнаты уходит целиком.
function changedSinceBroadcast(room, part, value) {
  const key = value === undefined ? '' : JSON.stringify(value);
  if (room.sent[part] === key) return false;
  room.sent[part] = key;
  return true;
}

// Правила объявлены явно для каждого действия: прежний catch-all
// `return args.length === 0` молча пропускал любое новое действие. Таблица без
// прототипа, иначе `action: 'constructor'` нашёл бы Object.prototype.constructor.
//
// Псевдонимы храня и лечения принимают те же аргументы, что и каноническое имя,
// поэтому правило объявляется один раз и вешается на все имена (см. aliasRules).
const NO_ARGS = () => true;
const BACKPACK_ITEM = (args) => args.length === 1 && isBackpackIndex(args[0]);
// Меню таверны — общий источник правды FOODS из конфига.
const FOOD_IDS = CONFIG.FOODS.map((food) => food.id);

const ACTION_RULES = Object.assign(Object.create(null), {
  activateClassSkill: (args) => args.length === 0 || (args.length === 1 && typeof args[0] === 'string' &&
    /^[a-z_]+$/.test(args[0])),
  // Без аргумента — предложение торговца, с аргументом — предложение конкретного
  // NPC. Список видов берётся из конфига, чтобы в игру не ушёл чужой идентификатор.
  acceptQuest: (args) => args.length === 0 || (args.length === 1 && CONFIG.NPC_KINDS.includes(args[0])),
  dialogueChoice: (args) => args.length === 2 && typeof args[0] === 'string' &&
    CONFIG.NPC_KINDS.includes(args[0]) &&
    Number.isInteger(args[1]) && args[1] >= 0 && args[1] < 10,
  skipTurn: NO_ARGS,
  interact: (args) => args.length === 1 && INTERACT_MODES.includes(args[0]),
  playerAction: (args) => args.length === 2 && args.every(isTileCoordinate),
  castMageSpell: (args) => args.length === 3 && typeof args[0] === 'string' &&
    /^[a-z_]+$/.test(args[0]) && args.slice(1).every(isTileCoordinate),
  tryStep: (args) => args.length === 2 && args.every((v) => Number.isInteger(v) && v >= -1 && v <= 1),
  usePotion: (args) => args.length === 0 || (args.length === 1 && isBackpackIndex(args[0])),
  useFood: (args) => args.length === 0 || (args.length === 1 && isBackpackIndex(args[0])),
  storeInChest: BACKPACK_ITEM,
  takeFromChest: (args) => args.length === 0 || (args.length === 1 && isBackpackIndex(args[0])),
  useInventoryItem: BACKPACK_ITEM,
  dropInventoryItem: BACKPACK_ITEM,
  sellInventoryItem: BACKPACK_ITEM,
  unequipSlot: (args) => args.length === 1 && isSlot(args[0]),
  upgradeEquipment: (args) => args.length === 1 && isSlot(args[0]),
  turnInQuest: (args) => args.length === 0 || (args.length === 1 && typeof args[0] === 'string' && CONFIG.NPC_KINDS.includes(args[0])),
  turnInQuestAny: (args) => args.length === 1 && typeof args[0] === 'string' && args[0].length <= QUEST_ID_MAX_LENGTH,
  storeInWarehouse: BACKPACK_ITEM,
  templeBlessing: NO_ARGS,
  templeHeal: NO_ARGS,
  tavernRest: NO_ARGS,
  tavernRumors: NO_ARGS,
  tavernBuyFood: (args) => args.length === 1 && FOOD_IDS.includes(args[0]),
  campRest: NO_ARGS,
  teleportToCity: NO_ARGS,
});

// Клиент в прошлых версиях присылал эти имена вместо канонических. Сервер обязан
// понимать их, поэтому правило канонического действия копируется на псевдоним.
// Список берётся из CONFIG.ACTION_ALIASES, чтобы он не расходился с клиентом.
const actionAliases = CONFIG.ACTION_ALIASES || {};
for (const canonical in actionAliases) {
  if (Object.prototype.hasOwnProperty.call(actionAliases, canonical)) {
    aliasRules(ACTION_RULES, canonical, actionAliases[canonical]);
  }
}

function aliasRules(table, canonical, aliases) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(table, alias)) continue;
    table[alias] = table[canonical];
  }
}

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
    this.sweepTimer = null;
  }

  handleConnection(socket) {
    // Ошибка сокета без подписчика роняет процесс. Здесь же heartbeat: без него
    // полумёртвое TCP-соединение держит слот комнаты до системного таймаута.
    socket.on('error', () => this.disconnect(socket));
    socket.isAlive = true;
    socket.heartbeatMisses = 0;
    if (socket._socket && typeof socket._socket.setKeepAlive === 'function') {
      socket._socket.setKeepAlive(true, HEARTBEAT_INTERVAL_MS);
    }
    socket.on('pong', () => {
      socket.isAlive = true;
      socket.heartbeatMisses = 0;
    });

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
        if (socket.isAlive === false) socket.heartbeatMisses++;
        if (socket.heartbeatMisses >= HEARTBEAT_MISSES) {
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

  // Подметалка мёртвых комнат. Отдельный таймер, а не раз в сообщение:
  // сообщения не приходят в пустой комнате, и её некому будет удалить. Тот же
  // проход зовётся перед созданием комнаты, иначе лимит MAX_ROOMS считался бы
  // по одному сроку жизни, а удаляли комнаты по другому.
  startSweeper(intervalMs = ROOM_SWEEP_INTERVAL_MS) {
    this.stopSweeper();
    this.sweepTimer = setInterval(() => this.sweepIdleRooms(), intervalMs);
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }

  stopSweeper() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  // Комната удаляется, когда в ней не осталось подключённых игроков и с
  // последнего сообщения прошло больше ROOM_IDLE_MS. Порядок важен: забег
  // сначала сохраняется на диск, потом освобождается, иначе переживший
  // сервер забег потерял бы снимок.
  sweepIdleRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const hasConnectedPlayers = Array.from(room.players.values()).some((player) => player.socket);
      if (hasConnectedPlayers || now - room.lastActivity <= ROOM_IDLE_MS) continue;
      if (room.run) {
        // Сначала на диск, потом освобождение: иначе переживший сервер забег
        // потерял бы снимок вместе с памятью.
        if (room.state) this.saveRunToDisk(room, room.state);
        room.run.dispose();
      }
      this.rooms.delete(code);
    }
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
    if (message.type === 'runs') {
      if (!connectedClient) socket.wantsRuns = true;
      this.sendRuns(socket);
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
    if (message.type === 'selectClass') {
      this.handleSelectClass(client, message);
      return;
    }
    if (message.type === 'kick') {
      this.handleKick(client, message);
      return;
    }
    if (message.type === 'start' && client.host) {
      if (client.room.run) {
        this.send(socket, { type: 'error', message: 'Забег в этой комнате уже идёт.' });
        return;
      }
      const options = runOptions(message.options);
      options.classId = isPlayerClass(message.options && message.options.classId)
        ? message.options.classId
        : client.player.classId;
      this.enqueue(client.room, () => this.startRun(client.room, options));
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
    this.sweepIdleRooms();
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
      classId: isPlayerClass(message.classId) ? message.classId : 'paladin',
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
      // Что ушло клиентам: неизменная часть снимка не едет повторно.
      sent: { map: null, world: null },
      // Локация, на которой забег последний раз лёг на диск: запись идёт при
      // переходах, а не на каждом шаге.
      savedLocation: null,
    };
    this.rooms.set(code, room);
    this.clients.set(host.socket, createClient(room, host, host.socket));
    host.socket.wantsRooms = false;
    return room;
  }

  // Комната, пережившая перезапуск сервера, лежит на диске. Вход по её коду
  // поднимает забег заново: без этого игроки нашли бы «Комната не найдена» и
  // потеряли бы партию, хотя она сохранена.
  restoreRoom(code) {
    if (this.rooms.has(code)) return this.rooms.get(code);
    const saved = runStore.loadRun(code);
    if (!saved) return null;
    const players = new Map(saved.players.map((entry) => [entry.id, {
      id: entry.id,
      token: entry.token,
      name: entry.name,
      classId: entry.classId,
      // Удача переживает перезапуск вместе с забегом: без неё новый забег в
      // поднятой комнате шёл бы с нулевой удачей вместо удачи хоста.
      luck: normalizeLuck(entry.luck),
      host: entry.host,
      socket: null,
    }]));
    if (!players.size) return null;
    const party = Array.from(players.values(), ({ id, name, classId }) => ({ id, name, classId }));
    let run;
    try {
      run = createRun({ players: party, snapshot: saved.state });
    } catch (error) {
      console.error('Комната ' + code + ': сохранённый забег не поднялся — ' + error.message);
      return null;
    }
    const room = {
      code,
      players,
      run,
      state: saved.state,
      queue: Promise.resolve(),
      lastActivity: Date.now(),
      // Поднятая с диска комната ещё ничего не отправляла: первый снимок
      // уходит целиком, и подключившийся игрок получает карту вместе с ним.
      sent: { map: null, world: null },
      savedLocation: saved.state.game.locationId || null,
      restored: true,
    };
    this.rooms.set(code, room);
    console.log('Room ' + code + ' restored from disk with ' + players.size + ' hero(es).');
    return room;
  }

  joinRoom(socket, message, name) {
    const code = typeof message.room === 'string' ? message.room.toUpperCase().trim() : '';
    const room = this.rooms.get(code) || this.restoreRoom(code);
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
        this.send(socket, { type: 'error', message: 'В комнате уже максимальное число игроков (6).' });
        return;
      }
      player = {
        id: crypto.randomUUID(),
        token: crypto.randomBytes(24).toString('hex'),
        name,
        classId: isPlayerClass(message.classId) ? message.classId : 'paladin',
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
    return this.checkRateWindow(client, ACTION_RATE_WINDOW_MS, ACTION_RATE_LIMIT, 'actionWindowStarted', 'actionsInWindow');
  }

  // Общий счётчик окна: сбрасывает при истечении и возвращает результат проверки лимита.
  checkRateWindow(client, windowMs, limit, windowKey, countKey) {
    const now = Date.now();
    if (now - client[windowKey] >= windowMs) {
      client[windowKey] = now;
      client[countKey] = 0;
    }
    client[countKey]++;
    return client[countKey] <= limit;
  }

  handleChat(client, message) {
    if (typeof message.text !== 'string') return;
    const text = message.text.trim().slice(0, CHAT_MAX_LENGTH);
    if (!text) return;

    if (!this.checkRateWindow(client, CHAT_RATE_WINDOW_MS, CHAT_RATE_LIMIT, 'chatWindowStarted', 'chatMessagesInWindow')) {
      this.send(client.socket, { type: 'chat-error', message: 'Слишком часто. Подождите немного.' });
      return;
    }

    this.broadcast(client.room, {
      type: 'chat',
      playerId: client.player.id,
      name: client.player.name,
      text,
      timestamp: Date.now(),
    });
  }

  // Выбор класса идёт до старта забега: партия ещё не сформирована, поэтому
  // класс просто запоминается у игрока и уходит в createRun при нажатии «начать».
  // После старта менять нельзя — герой уже создан.
  handleSelectClass(client, message) {
    if (client.room.run) {
      this.send(client.socket, { type: 'error', message: 'Забег уже идёт: класс не сменить.' });
      return;
    }
    if (!isPlayerClass(message.classId)) {
      this.send(client.socket, { type: 'error', message: 'Неизвестный класс.' });
      return;
    }
    client.player.classId = message.classId;
    this.broadcast(client.room, { type: 'players', players: this.playerList(client.room) });
  }

  // Хост выгоняет отключённого игрока: слот освобождается, а герой уходит из
  // забега. Подключённого так не выкинуть — он вернулся бы переподключением.
  handleKick(client, message) {
    if (!client.host) {
      this.send(client.socket, { type: 'error', message: 'Выгонять игроков может только хост.' });
      return;
    }
    const target = client.room.players.get(message.playerId);
    if (!target || target.host) {
      this.send(client.socket, { type: 'error', message: 'Такого игрока нет.' });
      return;
    }
    if (target.socket) {
      this.send(client.socket, { type: 'error', message: 'Игрок ещё в игре.' });
      return;
    }
    client.room.players.delete(target.id);
    if (client.room.run) {
      const room = client.room;
      const run = room.run;
      this.enqueue(room, () => {
        if (room.run !== run) return;
        run.removePlayer(target.id);
        this.publish(room, run, run.takeEvents());
      });
    }
    this.broadcast(client.room, { type: 'players', players: this.playerList(client.room) });
    this.broadcastRooms();
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
    // Новый забег затирает сохранение прежнего: комната снова играет с нуля.
    room.savedLocation = null;
    // Что уходило клиентам, относилось к прежнему забегу. Новая карта едет целиком,
    // даже если случайно совпадёт с прежней побайтово.
    room.sent = { map: null, world: null };
    runStore.deleteRun(room.code);
    this.publish(room, room.run, room.run.takeEvents());
    this.broadcastRooms();
  }

  // Снимок уходит всем игрокам комнаты после каждого действия: он и есть
  // «логика отрисовки», которую раньше считал браузер хоста. Неизменная часть
  // (карта локации и состояние посещённых) между шагами та же самая, поэтому
  // она едет один раз — иначе снимок на каждый шаг тащил бы её заново.
  publish(room, run, events) {
    const state = run.snapshot();
    if (!state) return;
    const previousLocation = room.savedLocation;
    room.state = state;
    room.lastActivity = Date.now();
    const wire = { game: state.game, mapState: state.mapState };
    if (changedSinceBroadcast(room, 'map', state.map)) wire.map = state.map;
    if (changedSinceBroadcast(room, 'world', state.world)) wire.world = state.world;
    const message = {
      type: 'state',
      state: wire,
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
      room.savedLocation = null;
      runStore.deleteRun(room.code);
      run.dispose();
    } else if (state.game.locationId && state.game.locationId !== previousLocation) {
      // Запись на каждый шаг забила бы диск. Переход локации — точка, после
      // которой игрок ждёт результата: забег переживает и падение, и переход.
      this.saveRunToDisk(room, state);
      room.savedLocation = state.game.locationId;
    }
    this.broadcast(room, message);
  }

  saveRunToDisk(room, state) {
    // Токены едут в файл вместе с забегом: без них перезапуск сервера вернул бы
    // партию, в которой никто не узнаёт своего героя.
    const players = Array.from(room.players.values(), (player) => ({
      id: player.id,
      token: player.token,
      name: player.name,
      classId: player.classId,
      luck: normalizeLuck(player.luck),
      host: player.host,
    }));
    return runStore.saveRun(room.code, state, players);
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

  sendRuns(socket) {
    const runs = [];
    try {
      for (const file of fs.readdirSync(runStore.runsDir())) {
        const match = /^([A-Z0-9]{4,8})\.json$/.exec(file);
        if (!match) continue;
        const loaded = runStore.loadRun(match[1]);
        if (!loaded) continue;
        runs.push({
          code: match[1],
          players: (loaded.players || []).map(function (player) {
            return { name: player.name, classId: player.classId };
          }),
        });
      }
    } catch (error) {
      // Каталог недоступен или полон битых файлов: список забегов — подсказка
      // в меню, потеря подсказки не должна ронять сервер.
      console.error('Список сохранённых партий не прочитан: ' + error.message);
    }
    this.send(socket, { type: 'runs', runs: runs });
  }

  broadcastRooms() {
    const message = { type: 'rooms', rooms: this.roomSummaries() };
    const payload = this.serialize(message);
    if (payload === null) return;
    for (const socket of this.webSocketServer ? this.webSocketServer.clients : []) {
      if (socket.wantsRooms && !this.clients.has(socket)) this.sendPayload(socket, payload);
    }
  }

  // Рассылка комнаты сериализует сообщение один раз: снимок — это десятки
  // килобайт, а сокетов в комнате до четырёх, и stringify на каждый из них
  // означал бы ту же работу вчетверо.
  broadcast(room, message) {
    const payload = this.serialize(message);
    if (payload === null) return;
    for (const player of room.players.values()) {
      if (player.socket) this.sendPayload(player.socket, payload);
    }
  }

  send(socket, message) {
    const payload = this.serialize(message);
    if (payload !== null) this.sendPayload(socket, payload);
  }

  serialize(message) {
    try {
      return JSON.stringify(message);
    } catch {
      return null;
    }
  }

  sendPayload(socket, payload) {
    if (!socket || socket.readyState !== WS_OPEN) return;
    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      socket.close(1013, 'Slow connection');
      return;
    }
    try {
      socket.send(payload);
    } catch {
      socket.terminate();
    }
  }
}

module.exports = { RoomManager, MAX_PLAYERS, ACTION_RULES };
