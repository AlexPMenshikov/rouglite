(function () {
  var socket = null;
  var room = '';
  var playerId = '';
  var token = '';
  var host = false;
  var players = [];
  var remoteBusy = false;
  var actionQueue = [];
  var applyingReconnect = false;

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
  }

  function handle(message) {
    if (message.type === 'error') {
      var errorMessage = typeof message.message === 'string' ? message.message : '';
      setStatus(errorMessage || 'Ошибка сетевого подключения.');
      if (applyingReconnect &&
          (errorMessage.indexOf('недействительна') !== -1 || errorMessage.indexOf('не найдена') !== -1)) {
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
      if (message.state && message.state.game) {
        RK.Combat.applySnapshot(message.state, playerId);
        showGameState(message.state.game);
        RK.Render.draw();
      }
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
      setStatus('Хост отключён. Забег ждёт его переподключения.');
      return;
    }
    if (message.type === 'notice' && message.notice === 'merchant') {
      RK.UI.showMerchant();
      return;
    }
    if (message.type === 'state' && !host && message.state && message.state.game) {
      RK.Combat.applySnapshot(message.state, playerId);
      showGameState(message.state.game);
      RK.Render.draw();
      return;
    }
    if (message.type === 'action' && host) {
      actionQueue.push(message);
      processActions();
    }
  }

  function showGameState(game) {
    if (game.over) {
      RK.UI.over(
        game.result === 'victory',
        game.floor,
        game.player ? game.player.level : 1,
        0,
        game.stats,
      );
      return;
    }
    if (RK.UI.screen() === 'menu' || RK.UI.screen() === 'over') RK.UI.show('game');
  }

  function processActions() {
    if (remoteBusy || !actionQueue.length) return;
    remoteBusy = true;
    var request = actionQueue.shift();
    waitForIdle(request);
  }

  function waitForIdle(request) {
    if (RK.Combat.busy()) {
      window.setTimeout(function () { waitForIdle(request); }, 25);
      return;
    }
    if (RK.GAME && !RK.GAME.over) {
      RK.Combat.performNetworkAction(request.playerId, request.action, request.args);
    }
    waitForAction();
  }

  function waitForAction() {
    if (RK.Combat.busy()) {
      window.setTimeout(waitForAction, 25);
      return;
    }
    publishState();
    if (playerId) RK.Combat.setActivePlayer(playerId);
    remoteBusy = false;
    processActions();
  }

  function publishState() {
    if (!host || !RK.GAME || !connected()) return;
    send({ type: 'state', state: RK.Combat.createSnapshot() });
  }

  function action(name, args) {
    if (!room || !playerId || host) return null;
    return send({ type: 'action', action: name, args: args || [] });
  }

  function reconnectSaved() {
    if (!window.localStorage) return;
    var raw = window.localStorage.getItem(storageKey());
    if (!raw) return;
    var saved;
    try {
      saved = JSON.parse(raw);
    } catch (error) {
      window.localStorage.removeItem(storageKey());
      return;
    }
    applyingReconnect = true;
    room = saved.room;
    token = saved.token;
    connect({ type: 'reconnect', room: saved.room, token: saved.token, name: saved.name });
  }

  RK.Network = {
    createRoom: function (name) {
      room = '';
      if (window.localStorage) window.localStorage.removeItem(storageKey());
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
      var key = storageKey();
      var saved = window.localStorage && window.localStorage.getItem(key);
      if (saved) {
        try {
          var session = JSON.parse(saved);
          if (session.room === String(code || '').toUpperCase()) {
            applyingReconnect = true;
            room = session.room;
            connect({ type: 'reconnect', room: session.room, token: session.token, name: name });
            return;
          }
        } catch (error) {
          window.localStorage.removeItem(key);
        }
      }
      connect({ type: 'join', room: code, name: name, classId: RK.Meta.data.selectedClass || 'tank' });
    },
    reconnect: reconnectSaved,
    action: action,
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
    startGame: function (options) {
      if (!host) return;
      RK.Combat.newRun(options);
      for (var i = 0; i < players.length; i++) {
        if (!players[i].host) RK.Combat.addNetworkPlayer(players[i].id, players[i].name, players[i].classId);
      }
      publishState();
    },
    openMerchant: function (targetPlayerId) {
      if (host) send({ type: 'notice', notice: 'merchant', playerId: targetPlayerId });
    },
  };
})();
