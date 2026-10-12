(function () {
  var ACTION_POLL_INTERVAL_MS = 16;
  var CHAT_MAX_LENGTH = 280;
  var socket = null;
  var room = '';
  var playerId = '';
  var token = '';
  var host = false;
  var players = [];
  var remoteBusy = false;
  var actionQueue = [];
  var applyingReconnect = false;
  var chatEnabled = false;

  // Машиночитаемые коды ошибок сервера. Раньше клиент решал, чинить ли
  // сохранённую сессию, поиском подстрок в русском тексте ошибки.
  var FATAL_RECONNECT_CODES = new Set(['bad-token', 'no-room']);
  // Таблица без прототипа: иначе notice вида 'constructor' находит
  // Object.prototype.constructor и вызывает его как обработчик экрана.
  var NPC_SCREENS = Object.assign(Object.create(null), {
    merchant: 'showMerchant',
    blacksmith: 'showBlacksmith',
  });

  function storageKey() {
    return 'rouglite.lan.session';
  }

  function connected() {
    return socket && socket.readyState === WebSocket.OPEN;
  }

  function setStatus(message) {
    if (RK.UI && RK.UI.networkStatus) RK.UI.networkStatus(message);
  }

  function send(message) {
    if (!connected()) {
      setStatus('Соединение с хостом потеряно. Проверьте сервер и подключитесь снова.');
      return false;
    }
    socket.send(JSON.stringify(message));
    return true;
  }

  function remember() {
    if (!room || !token || !window.localStorage) return;
    window.localStorage.setItem(storageKey(), JSON.stringify({
      room: room,
      token: token,
      name: RK.Meta.data.playerName || 'Игрок',
    }));
  }

  function connect(request) {
    if (typeof WebSocket === 'undefined') {
      setStatus('WebSocket не поддерживается этим браузером.');
      return;
    }
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      socket.close();
    }
    room = request.room || '';
    setChatEnabled(false);
    playerId = '';
    host = false;
    players = [];
    remoteBusy = false;
    actionQueue = [];
    var scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    var connection = new WebSocket(scheme + '//' + window.location.host + '/ws');
    socket = connection;
    setStatus('Подключение к локальному серверу…');
    connection.addEventListener('open', function () {
      connection.send(JSON.stringify(request));
    });
    connection.addEventListener('message', function (event) {
      if (socket !== connection) return;
      var message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        setStatus('Получено некорректное сообщение от сервера.');
        return;
      }
      handle(message);
    });
    connection.addEventListener('close', function () {
      if (socket !== connection) return;
      remoteBusy = false;
      setStatus(room ? 'Соединение закрыто. Забег можно продолжить после переподключения.' : 'Соединение с сервером закрыто.');
      if (RK.UI && RK.UI.networkDisconnected) RK.UI.networkDisconnected();
      setChatEnabled(false);
    });
    connection.addEventListener('error', function () {
      if (socket !== connection) return;
      setStatus('Не удалось подключиться. Проверьте адрес и локальный сервер.');
    });
  }

  function attachIdentity(message) {
    room = message.room;
    playerId = message.playerId;
    token = message.token;
    host = !!message.host || message.type === 'room-created' || message.type === 'host-reconnected';
    players = message.players || players;
    remember();
    RK.UI.networkPlayers(players, host);
    RK.UI.showLobby(room, host);
    setChatEnabled(true);
  }

  function handle(message) {
    if (message.type === 'chat') {
      if (RK.UI.chatMessage) RK.UI.chatMessage(message);
      return;
    }
    if (message.type === 'chat-error') {
      if (RK.UI.chatStatus) RK.UI.chatStatus(message.message);
      return;
    }
    if (message.type === 'error') {
      var errorMessage = typeof message.message === 'string' ? message.message : '';
      setStatus(errorMessage || 'Ошибка сетевого подключения.');
      if (applyingReconnect && FATAL_RECONNECT_CODES.has(message.code)) {
        applyingReconnect = false;
        window.localStorage.removeItem(storageKey());
      }
      return;
    }
    if (message.type === 'room-created') {
      attachIdentity(message);
      setStatus('Комната создана. Игроки могут подключиться по коду ' + room + '.');
      return;
    }
    if (message.type === 'joined' || message.type === 'host-reconnected') {
      attachIdentity(message);
      applyingReconnect = false;
      setStatus(message.host ? 'Хост переподключился.' : 'Подключено к комнате ' + room + '.');
      applyRemoteState(message.state);
      return;
    }
    if (message.type === 'players') {
      players = message.players || [];
      if (RK.GAME && RK.GAME.players) {
        for (var i = 0; i < players.length; i++) {
          RK.Combat.setPlayerConnected(players[i].id, players[i].connected);
        }
        if (host) publishState();
      }
      RK.UI.networkPlayers(players, host);
      return;
    }
    if (message.type === 'player-joined' && host) {
      if (RK.GAME && RK.GAME.players) {
        RK.Combat.addNetworkPlayer(message.player.id, message.player.name, message.player.classId);
        publishState();
      }
      return;
    }
    if (message.type === 'player-disconnected' && host) {
      RK.Combat.setPlayerConnected(message.playerId, false);
      publishState();
      return;
    }
    if (message.type === 'host-disconnected') {
      setChatEnabled(false);
      setStatus('Хост отключён. Забег ждёт его переподключения.');
      return;
    }
    if (message.type === 'notice' && NPC_SCREENS[message.notice]) {
      RK.UI[NPC_SCREENS[message.notice]]();
      return;
    }
    if (message.type === 'state' && !host) {
      applyRemoteState(message.state);
      return;
    }
    if (message.type === 'action' && host) {
      actionQueue.push(message);
      processActions();
    }
  }

  // Приём снимка от хоста: общая точка для 'joined' и 'state'.
  function applyRemoteState(state) {
    if (!state || !state.game) return;
    RK.Combat.applySnapshot(state, playerId);
    showGameState(state.game);
    RK.Render.draw();
  }

  function showGameState(game) {
    if (game.over) {
      RK.UI.over(
        game.result === 'victory',
        game.floor,
        game.player ? game.player.level : 1,
        0,
        game.stats,
        game.player,
      );
      return;
    }
    if (RK.UI.screen() === 'menu' || RK.UI.screen() === 'over') RK.UI.show('game');
  }

  // Один цикл ожидания вместо двух почти одинаковых: сначала ждём конца
  // анимации шага, затем выполняем действие и ждём его завершения.
  function processActions() {
    if (remoteBusy || !actionQueue.length) return;
    remoteBusy = true;
    whenIdle(function () {
      var request = actionQueue.shift();
      if (RK.GAME && !RK.GAME.over) {
        RK.Combat.performNetworkAction(request.playerId, request.action, request.args);
      }
      whenIdle(function () {
        publishState();
        if (playerId) RK.Combat.setActivePlayer(playerId);
        remoteBusy = false;
        processActions();
      });
    });
  }

  function whenIdle(callback) {
    if (!RK.Combat.busy()) {
      callback();
      return;
    }
    window.setTimeout(function () { whenIdle(callback); }, ACTION_POLL_INTERVAL_MS);
  }

  function publishState() {
    if (!host || !RK.GAME || !connected()) return;
    send({ type: 'state', state: RK.Combat.createSnapshot() });
  }

  function action(name, args) {
    if (!room || !playerId || host) return null;
    return send({ type: 'action', action: name, args: args || [] });
  }

  function setChatEnabled(enabled) {
    chatEnabled = enabled;
    if (RK.UI && RK.UI.chatEnabled) RK.UI.chatEnabled(enabled);
  }

  function chat(text) {
    if (!chatEnabled || typeof text !== 'string') return false;
    return send({ type: 'chat', text: text.slice(0, CHAT_MAX_LENGTH) });
  }

  // Сохранённая сессия читается в одном месте: раньше одинаковая логика с
  // localStorage и try/catch была продублирована в reconnectSaved и joinRoom.
  function readSavedSession() {
    if (!window.localStorage) return null;
    var raw = window.localStorage.getItem(storageKey());
    if (!raw) return null;
    try {
      var saved = JSON.parse(raw);
      return saved && saved.room && saved.token ? saved : null;
    } catch (error) {
      window.localStorage.removeItem(storageKey());
      return null;
    }
  }

  function forgetSavedSession() {
    if (window.localStorage) window.localStorage.removeItem(storageKey());
  }

  function reconnectSaved() {
    var saved = readSavedSession();
    if (!saved) return;
    applyingReconnect = true;
    room = saved.room;
    token = saved.token;
    connect({ type: 'reconnect', room: saved.room, token: saved.token, name: saved.name });
  }

  RK.Network = {
    createRoom: function (name) {
      room = '';
      forgetSavedSession();
      RK.Meta.data.playerName = name || 'Игрок';
      RK.Meta.data.selectedClass = RK.Meta.data.selectedClass || 'tank';
      connect({
        type: 'create',
        name: name,
        classId: RK.Meta.data.selectedClass || 'tank',
      });
    },
    joinRoom: function (code, name) {
      RK.Meta.data.playerName = name || 'Игрок';
      // Если в этом браузере уже была сессия этой комнаты, продолжаем её,
      // а не создаём нового героя.
      var saved = readSavedSession();
      if (saved && saved.room === String(code || '').toUpperCase()) {
        applyingReconnect = true;
        room = saved.room;
        connect({ type: 'reconnect', room: saved.room, token: saved.token, name: name });
        return;
      }
      connect({ type: 'join', room: code, name: name, classId: RK.Meta.data.selectedClass || 'tank' });
    },
    reconnect: reconnectSaved,
    action: action,
    chat: chat,
    performLocalAction: function (name, args) {
      if (!host || !RK.GAME || !RK.GAME.players || RK.GAME.players.length < 2) return false;
      RK.Combat.performNetworkAction(playerId, name, args);
      return true;
    },
    publishState: publishState,
    connected: connected,
    isHost: function () { return host; },
    isRemoteClient: function () { return !!room && !!playerId && !host; },
    isRemoteBusy: function () { return remoteBusy; },
    room: function () { return room; },
    playerId: function () { return playerId; },
    focusPlayer: function () {
      var gamePlayers = RK.GAME && RK.GAME.players;
      if (gamePlayers) {
        for (var i = 0; i < gamePlayers.length; i++) {
          if (gamePlayers[i].id === playerId) return gamePlayers[i];
        }
      }
      return RK.GAME && RK.GAME.player;
    },
    startGame: function (options) {
      if (!host) return;
      RK.Combat.newRun(options);
      for (var i = 0; i < players.length; i++) {
        if (!players[i].host) RK.Combat.addNetworkPlayer(players[i].id, players[i].name, players[i].classId);
      }
      publishState();
    },
    openNpcScreen: function (notice, targetPlayerId) {
      if (host) send({ type: 'notice', notice: notice, playerId: targetPlayerId });
    },
    openMerchant: function (targetPlayerId) {
      this.openNpcScreen('merchant', targetPlayerId);
    },
    openBlacksmith: function (targetPlayerId) {
      this.openNpcScreen('blacksmith', targetPlayerId);
    },
  };
})();
