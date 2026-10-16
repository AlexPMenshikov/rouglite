(function () {
  var CHAT_MAX_LENGTH = 280;
  var socket = null;
  var room = '';
  var playerId = '';
  var token = '';
  var host = false;
  var players = [];
  // Забег считает сервер, поэтому клиент ждёт снимок за каждое своё действие
  // и блокирует ввод до него: иначе можно отправить два хода подряд.
  var awaitingServer = false;
  // Забег партии засчитывается в банк хоста один раз, по seed забега.
  var bankedRunSeed = null;
  var chatEnabled = false;
  var applyingReconnect = false;
  var reconnectTimer = null;
  var reconnectAttempts = 0;
  var intentionalClose = false;
  var pendingRequest = null;
  var MAX_RECONNECT_DELAY_MS = 30000;

  // Машиночитаемые коды ошибок сервера. Раньше клиент решал, чинить ли
  // сохранённую сессию, поиском подстрок в русском тексте ошибки.
  var FATAL_RECONNECT_CODES = new Set(['bad-token', 'no-room']);
  // Таблица без прототипа: иначе notice вида 'constructor' находит
  // Object.prototype.constructor и вызывает его как обработчик экрана.
  var NPC_SCREENS = Object.assign(Object.create(null), {
    merchant: 'showMerchant',
    blacksmith: 'showBlacksmith',
    tavern: 'showTavern',
    guild: 'showGuild',
  });

  // Экран NPC из события забега открывается тому, кто вызвал действие.
  // Разговор приходит с id NPC, торговля и кузнец — без него.
  function openNpcScreen(screen, localId) {
    if (!screen || screen.playerId !== localId) return;
    if (screen.name === 'npc') {
      if (RK.UI.showNpc) RK.UI.showNpc(screen.npcId);
      return;
    }
    var handler = NPC_SCREENS[screen.name];
    if (handler) RK.UI[handler]();
  }

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
      setStatus('Соединение с сервером потеряно. Проверьте сервер и подключитесь снова.');
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

  function scheduleReconnect() {
    if (intentionalClose || reconnectTimer !== null || !room || !token) return;
    var delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY_MS);
    reconnectAttempts++;
    setStatus('Соединение потеряно. Повторное подключение через ' + Math.ceil(delay / 1000) + ' с…');
    reconnectTimer = window.setTimeout(function () {
      reconnectTimer = null;
      applyingReconnect = true;
      pendingRequest = { type: 'reconnect', room: room, token: token, name: RK.Meta.data.playerName || 'Игрок' };
      openSocket(pendingRequest, 'Восстанавливаем сессию…');
    }, delay);
  }

  function cancelReconnect() {
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    reconnectAttempts = 0;
  }

  function openSocket(request, status) {
    pendingRequest = request;
    if (typeof WebSocket === 'undefined') {
      setStatus('WebSocket не поддерживается этим браузером.');
      return;
    }
    var scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    var connection = new WebSocket(scheme + '//' + window.location.host + '/ws');
    socket = connection;
    setStatus(status || 'Подключение к локальному серверу…');
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
      awaitingServer = false;
      if (RK.UI && RK.UI.networkDisconnected) RK.UI.networkDisconnected();
      setChatEnabled(false);
      if (room && token && !intentionalClose) {
        scheduleReconnect();
      } else {
        setStatus(room ? 'Соединение закрыто. Забег можно продолжить после переподключения.' : 'Соединение с сервером закрыто.');
      }
    });
    connection.addEventListener('error', function () {
      if (socket !== connection) return;
      setStatus('Не удалось подключиться. Проверьте адрес и локальный сервер.');
      if (room && token && !intentionalClose) scheduleReconnect();
    });
  }

  function connect(request) {
    // Соединение принадлежит одной комнате, поэтому сокет подписки на список
    // комнат переиспользуется только пока игрок ещё ни в какой не вошёл.
    intentionalClose = true;
    cancelReconnect();
    var hadSession = !!playerId;
    room = request.room || '';
    playerId = '';
    host = false;
    players = [];
    awaitingServer = false;
    setChatEnabled(false);
    if (!hadSession && connected()) {
      intentionalClose = false;
      socket.send(JSON.stringify(request));
      return;
    }
    if (socket) socket.close();
    intentionalClose = false;
    openSocket(request);
  }

  function setChatEnabled(enabled) {
    chatEnabled = enabled;
    if (RK.UI && RK.UI.chatEnabled) RK.UI.chatEnabled(enabled);
  }

  function attachIdentity(message) {
    room = message.room;
    playerId = message.playerId;
    token = message.token;
    host = !!message.host;
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
        intentionalClose = true;
        cancelReconnect();
        pendingRequest = null;
        forgetSavedSession();
        room = '';
        token = '';
        playerId = '';
        setStatus(errorMessage || 'Сессию нельзя восстановить.');
      }
      return;
    }
    if (message.type === 'rooms') {
      if (RK.UI.networkRooms) RK.UI.networkRooms(message.rooms || []);
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
      cancelReconnect();
      pendingRequest = null;
      setStatus(message.host ? 'Хост переподключился.' : 'Подключено к комнате ' + room + '.');
      applyState({ state: message.state });
      return;
    }
    if (message.type === 'players') {
      players = message.players || [];
      RK.UI.networkPlayers(players, host);
      return;
    }
    if (message.type === 'host-disconnected') {
      setStatus('Хост отключился. Забег продолжается на сервере, дождитесь его возвращения.');
      return;
    }
    if (message.type === 'state') {
      applyState(message);
    }
  }

  // Снимок приходит после каждого действия любого игрока: журнал партии,
  // состояние карты и экраны NPC, которые запросил ходивший.
  function applyState(message) {
    awaitingServer = false;
    if (!message.state || !message.state.game) return;
    var lines = message.log || [];
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].narrator) RK.UI.narratorMsg(lines[i].text);
      else RK.UI.msg(lines[i].text);
    }
    RK.Combat.applySnapshot(message.state, playerId);
    openNpcScreen(message.screen, playerId);
    bankPartyGold(message);
    showGameState(message.state.game, message.banked || 0);
    RK.Render.draw();
  }

  // Золото партии уходит в банк хоста. Забег считает сервер, поэтому сумму он
  // присылает вместе с последним снимком, а хост засчитывает её один раз.
  function bankPartyGold(message) {
    var game = message.state.game;
    if (!host || !message.banked || game.runSeed == null || game.runSeed === bankedRunSeed) return;
    bankedRunSeed = game.runSeed;
    RK.Meta.addBank(message.banked);
  }

  function showGameState(game, banked) {
    if (game.over) {
      RK.UI.over(
        game.result === 'victory',
        game.floor,
        game.player ? game.player.level : 1,
        banked,
        game.stats,
        game.player,
      );
      return;
    }
    if (RK.UI.screen() === 'menu' || RK.UI.screen() === 'over' || RK.UI.screen() === 'class-select') {
      RK.UI.show('game');
    }
  }

  // Единственная точка чтения сохранённой сессии: раньше одинаковая логика с
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
    intentionalClose = false;
    room = saved.room;
    token = saved.token;
    connect({ type: 'reconnect', room: saved.room, token: saved.token, name: saved.name });
  }

  RK.Network = {
    createRoom: function (name) {
      intentionalClose = true;
      cancelReconnect();
      forgetSavedSession();
      RK.Meta.data.playerName = name || 'Игрок';
      connect({
        type: 'create',
        name: name,
        classId: RK.Meta.data.selectedClass || 'tank',
        luck: RK.Meta.data.luck || 0,
      });
    },
    joinRoom: function (code, name) {
      RK.Meta.data.playerName = name || 'Игрок';
      intentionalClose = false;
      cancelReconnect();
      // Если в этом браузере уже была сессия этой комнаты, продолжаем её,
      // а не создаём нового героя.
      var saved = readSavedSession();
      if (saved && saved.room === String(code || '').toUpperCase()) {
        applyingReconnect = true;
        room = saved.room;
        token = saved.token;
        connect({ type: 'reconnect', room: saved.room, token: saved.token, name: name });
        return;
      }
      connect({ type: 'join', room: code, name: name, classId: RK.Meta.data.selectedClass || 'tank' });
    },
    // Подписка на список комнат: сервер шлёт обновления сам, пока игрок в меню.
    refreshRooms: function () {
      intentionalClose = false;
      if (connected()) {
        socket.send(JSON.stringify({ type: 'list' }));
        return;
      }
      openSocket({ type: 'list' }, 'Запрашиваем список комнат…');
    },
    reconnect: reconnectSaved,
    disconnect: function () {
      intentionalClose = true;
      cancelReconnect();
      if (socket) socket.close(1000, 'Client disconnected');
    },
    action: function (name, args) {
      if (!room || !playerId) return null;
      if (!send({ type: 'action', action: name, args: args || [] })) return null;
      awaitingServer = true;
      return true;
    },
    chat: function (text) {
      if (!chatEnabled || typeof text !== 'string') return false;
      return send({ type: 'chat', text: text.slice(0, CHAT_MAX_LENGTH) });
    },
    startGame: function (options) {
      if (!host) return false;
      return send({ type: 'start', options: options || {} });
    },
    // Гость выбирает класс до старта забега: сервер запоминает его и подставит
    // герою при createRun. Хост может так же сменить свой класс.
    selectClass: function (classId) {
      if (!room || !playerId) return false;
      return send({ type: 'selectClass', classId: classId });
    },
    // Хост выгоняет отключённого игрока.
    kick: function (playerIdToKick) {
      if (!host || !room) return false;
      return send({ type: 'kick', playerId: playerIdToKick });
    },
    connected: connected,
    isHost: function () { return host; },
    inRoom: function () { return !!room && !!playerId; },
    isWaitingForServer: function () { return awaitingServer; },
    room: function () { return room; },
    playerId: function () { return playerId; },
  };
})();
