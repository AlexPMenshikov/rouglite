'use strict';

const crypto = require('node:crypto');

const MAX_PLAYERS = 4;
const MAX_ROOMS = 32;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACTIONS = new Set([
  'activateClassSkill',
  'interact',
  'playerAction',
  'skipTurn',
  'tryStep',
  'usePotion',
  'useInventoryItem',
  'dropInventoryItem',
  'unequipSlot',
  'sellInventoryItem',
  'sellEquipmentItem',
  'upgradeEquipment',
  'acceptQuest',
]);

function randomCode() {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (byte) => ROOM_CODE_CHARS[byte % ROOM_CODE_CHARS.length]).join('');
}

function safeName(value) {
  return String(value || 'Игрок').trim().replace(/[<>]/g, '').slice(0, 18) || 'Игрок';
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.clients = new WeakMap();
  }

  handleConnection(socket) {
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
      this.joinRoom(socket, message, safeName(message.name), message.type === 'reconnect');
      return;
    }

    const client = this.clients.get(socket);
    if (!client) {
      this.send(socket, { type: 'error', message: 'Сначала создайте комнату или подключитесь к ней.' });
      return;
    }

    if (message.type === 'state' && client.host) {
      if (!message.state || !message.state.game || !message.state.map ||
          Buffer.byteLength(JSON.stringify(message.state)) > 2 * 1024 * 1024) {
        this.send(socket, { type: 'error', message: 'Снимок игрового состояния слишком большой или некорректен.' });
        return;
      }
      client.room.state = message.state;
      this.broadcast(client.room, { type: 'state', state: message.state });
      return;
    }
    if (message.type === 'notice' && client.host &&
        message.notice === 'merchant' && typeof message.playerId === 'string') {
      const player = client.room.players.get(message.playerId);
      if (player && player.socket && !player.host) {
        this.send(player.socket, { type: 'notice', notice: 'merchant' });
      }
      return;
    }
    if (message.type === 'notice' && client.host &&
        message.notice === 'blacksmith' && typeof message.playerId === 'string') {
      const player = client.room.players.get(message.playerId);
      if (player && player.socket && !player.host) {
        this.send(player.socket, { type: 'notice', notice: 'blacksmith' });
      }
      return;
    }
    if (message.type === 'action' && !client.host) {
      if (!this.validAction(message)) {
        this.send(socket, { type: 'error', message: 'Недопустимое игровое действие.' });
        return;
      }
      const now = Date.now();
      if (now - client.actionWindowStarted >= 1000) {
        client.actionWindowStarted = now;
        client.actionsInWindow = 0;
      }
      client.actionsInWindow++;
      if (client.actionsInWindow > 8) {
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
      classId: message.classId === 'berserker' ? 'berserker' : 'tank',
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
    this.clients.set(socket, { room, player, host: true });
    this.send(socket, {
      type: 'room-created',
      room: code,
      playerId: player.id,
      token: player.token,
      players: this.playerList(room),
    });
  }

  joinRoom(socket, message, name, reconnect) {
    const code = typeof message.room === 'string' ? message.room.toUpperCase().trim() : '';
    const room = this.rooms.get(code);
    if (!room) {
      this.send(socket, { type: 'error', message: 'Комната не найдена или хост ещё не запустил её.' });
      return;
    }
    if (this.clients.has(socket)) {
      this.send(socket, { type: 'error', message: 'Это подключение уже состоит в комнате.' });
      return;
    }

    const token = typeof message.token === 'string' ? message.token : '';
    let player = null;
    let resumed = reconnect;
    if (token) {
      player = Array.from(room.players.values()).find((entry) => entry.token === token);
      if (!player) {
        this.send(socket, { type: 'error', message: 'Ссылка для переподключения недействительна.' });
        return;
      }
      if (player.socket) {
        const previousSocket = player.socket;
        this.clients.delete(previousSocket);
        player.socket = null;
        if (previousSocket.readyState === 1) previousSocket.close(4001, 'Session resumed');
      }
      resumed = true;
    } else {
      const matchingDisconnectedPlayers = Array.from(room.players.values()).filter((entry) =>
        !entry.host && !entry.socket && entry.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      if (matchingDisconnectedPlayers.length > 1) {
        this.send(socket, { type: 'error', message: 'Найдено несколько отключённых игроков с таким именем. Переподключитесь по сохранённой ссылке.' });
        return;
      }
      if (matchingDisconnectedPlayers.length === 1) {
        player = matchingDisconnectedPlayers[0];
        resumed = true;
      } else {
        if (room.players.size >= MAX_PLAYERS) {
          this.send(socket, { type: 'error', message: 'В комнате уже максимальное число игроков (4).' });
          return;
        }
        player = {
          id: crypto.randomUUID(),
          token: crypto.randomBytes(24).toString('hex'),
          name,
          classId: message.classId === 'berserker' ? 'berserker' : 'tank',
          host: false,
          socket: null,
        };
        room.players.set(player.id, player);
      }
    }

    player.socket = socket;
    if (message.name && !player.host) player.name = name;
    const client = {
      room,
      player,
      host: player.host,
      actionWindowStarted: Date.now(),
      actionsInWindow: 0,
    };
    this.clients.set(socket, client);
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

  validAction(message) {
    if (!ACTIONS.has(message.action) || !Array.isArray(message.args)) return false;
    const args = message.args;
    const isIndex = (value) => Number.isInteger(value) && value >= 0 && value <= 1000;
    const isSlot = (value) => ['weapon', 'head', 'armor', 'ring', 'amulet', 'boots'].includes(value);
    if (message.action === 'playerAction') {
      return args.length === 2 && args.every((value) =>
        Number.isInteger(value) && value >= 0 && value < 96);
    }
    if (message.action === 'tryStep') {
      return args.length === 2 && args.every((value) =>
        Number.isInteger(value) && value >= -1 && value <= 1);
    }
    if (message.action === 'interact') {
      return args.length === 1 && ['use', 'pick', 'force'].includes(args[0]);
    }
    if (message.action === 'usePotion') {
      return args.length === 0 || (args.length === 1 && isIndex(args[0]));
    }
    if (['useInventoryItem', 'dropInventoryItem', 'sellInventoryItem'].includes(message.action)) {
      return args.length === 1 && isIndex(args[0]);
    }
    if (['unequipSlot', 'sellEquipmentItem'].includes(message.action)) {
      return args.length === 1 && isSlot(args[0]);
    }
    if (message.action === 'upgradeEquipment') {
      return args.length === 1 && isSlot(args[0]);
    }
    if (message.action === 'acceptQuest') {
      return args.length === 0;
    }
    return args.length === 0;
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
    if (socket.readyState === 1) socket.send(JSON.stringify(message));
  }
}

module.exports = { RoomManager, MAX_PLAYERS };
