// Лобби сетевой комнаты: список комнат, игроки, вход и продолжение забега.
(function () {
  var UI = RK.UI;

  function el(id) { return UI.el(id); }
  function setText(id, text) { UI.setText(id, text); }
  function clearNode(node) { UI.clearNode(node); }
  function makeButton(spriteName, text, className) { return UI.makeButton(spriteName, text, className); }
  function onClick(id, handler) { UI.onClick(id, handler); }

  // Комната: код, состояние и игроки; кнопка входа ведёт туда же, куда ввод кода вручную.
  function renderRoomList(rooms, pending) {
    var list = el('lan-room-list');
    if (!list) return;
    clearNode(list);
    if (pending) setText('lan-rooms-status', 'Запрашиваем список комнат…');
    else setText('lan-rooms-status', rooms.length ? '' : 'Пока нет открытых комнат. Создайте свою.');

    for (var i = 0; i < rooms.length; i++) {
      var room = rooms[i];
      var connectedCount = room.players.filter(function (player) { return player.connected; }).length;

      var row = document.createElement('div');
      row.className = 'lan-room';

      var head = document.createElement('div');
      head.className = 'lan-room-head';
      var code = document.createElement('strong');
      code.textContent = room.code;
      head.appendChild(code);
      var state = document.createElement('span');
      state.textContent = (room.started ? 'забег идёт' : 'ждёт игроков') + ' · ' +
        connectedCount + '/' + room.capacity;
      head.appendChild(state);
      row.appendChild(head);

      var playersRow = document.createElement('div');
      playersRow.className = 'lan-room-players';
      for (var p = 0; p < room.players.length; p++) {
        var member = room.players[p];
        var line = document.createElement('span');
        line.className = 'lan-player' + (member.connected ? '' : ' disconnected');
        line.textContent = member.name + (member.host ? ' — хост' : '') +
          (member.connected ? '' : ' — отключён');
        playersRow.appendChild(line);
      }
      row.appendChild(playersRow);

      var joinLabel = room.started ? 'ПРИСОЕДИНИТЬСЯ К ЗАБЕГУ' : 'ПОДКЛЮЧИТЬСЯ';
      var joinButton = makeButton('uiLan', joinLabel);
      joinButton.type = 'button';
      joinButton.disabled = connectedCount >= room.capacity;
      joinButton.addEventListener('click', function (roomCode) {
        return function () {
          RK.UI.showJoinClassSelection(roomCode);
        };
      }(room.code));
      row.appendChild(joinButton);
      list.appendChild(row);
    }
  }

  // Строка игрока в лобби и в HUD: имя, класс, пометки хоста и отключения.
  // У отключённого гостя хост видит кнопку «Выгнать».
  function playerLine(player, isHost) {
    var line = document.createElement('div');
    line.className = 'lan-player' + (player.connected ? '' : ' disconnected');
    var classDef = RK.Classes && RK.Classes.CLASS_DEFS ? RK.Classes.CLASS_DEFS[player.classId] : null;
    line.textContent = player.name +
      (classDef ? ' — ' + classDef.name : '') +
      (player.host ? ' — хост' : '') +
      (player.connected ? '' : ' — отключён');
    if (isHost && !player.host && !player.connected) {
      var kickButton = document.createElement('button');
      kickButton.type = 'button';
      kickButton.className = 'kick-player';
      kickButton.textContent = 'Выгнать';
      kickButton.addEventListener('click', function (playerId) {
        return function () {
          if (RK.Network && RK.Network.kick) RK.Network.kick(playerId);
        };
      }(player.id));
      line.appendChild(kickButton);
    }
    return line;
  }

  // Сохранённый забег одиночной игры. Кнопка появляется только когда снимок
  // есть и читается: битое сохранение — это не ошибка, а обычный новый забег.
  function refreshContinueButton() {
    var button = el('btn-continue-run');
    if (!button) return;
    var usable = !!(RK.World && RK.World.hasSavedRun && RK.World.hasSavedRun());
    button.classList.toggle('hidden', !usable);
  }

  function continueSavedRun(id) {
    if (!RK.World || !RK.Combat) return false;
    var snapshot = RK.World.loadRun(id);
    if (!snapshot) {
      // Сохранение исчезло или оказалось битым между показом меню и кликом.
      refreshContinueButton();
      return false;
    }
    RK.Network.disconnect();
    if (!RK.Combat.applySnapshot(snapshot, RK.Network.playerId())) {
      RK.World.clearRun();
      refreshContinueButton();
      UI.msg('Сохранённый забег не читается. Начните новый.');
      return false;
    }
    UI.show('game');
    UI.msg('Забег продолжен.');
    return true;
  }

  function initLanControls() {
    onClick('btn-host-room', function () {
      RK.UI.clearPendingRun();
      RK.Network.createRoom(UI.savePlayerName());
    });
    onClick('btn-join-room', function () {
      RK.UI.showJoinClassSelection(el('lan-room-code').value);
    });
    onClick('btn-refresh-rooms', function () {
      RK.Network.refreshRooms();
      renderRoomList([], true);
    });
    onClick('btn-continue-run', function () {
      continueSavedRun();
    });
    onClick('btn-start-coop', function () {
      if (!RK.Network || (RK.Network.inRoom && !RK.Network.inRoom())) return;
      RK.UI.showClassSelection({ mode: 'network', options: { size: el('map-size').value, style: el('map-style').value } });
    });
    var form = el('chat-form');
    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var input = el('chat-input');
        var text = input.value.trim();
        if (!text || !RK.Network.chat(text)) return;
        input.value = '';
        UI.chatStatus('');
      });
    }
    UI.chatEnabled(false);
  }

  function networkDisconnected() {
    RK.UI.resetPendingRun();
    if (RK.Network && RK.Network.inRoom && RK.Network.inRoom()) return;
    var hostButton = el('btn-host-room');
    var joinButton = el('btn-join-room');
    var startButton = el('btn-start-coop');
    var browser = el('lan-browser');
    if (UI.screen() === 'class-select') UI.show('menu');
    if (hostButton) hostButton.disabled = false;
    if (joinButton) joinButton.disabled = false;
    if (startButton) startButton.disabled = true;
    if (browser) browser.classList.remove('hidden');
  }

  function showLobby(room, isHost) {
    RK.UI.clearPendingRun();
    var startingRun = RK.UI.takeNetworkStart();
    if (!startingRun && UI.screen() !== 'menu') UI.show('menu');
    UI.toggleClass('lan-lobby', 'hidden', false);
    UI.toggleClass('lan-browser', 'hidden', true);
    setText('lan-room-display', room);
    setText('game-room-display', room);
    UI.toggleClass('game-room-code', 'hidden', !isHost);
    // Кнопка выбора класса нужна и хосту, и гостю: гость выбирает свой класс.
    UI.toggleClass('btn-start-coop', 'hidden', false);
    var startButton = el('btn-start-coop');
    if (startButton) startButton.disabled = false;
    var hostButton = el('btn-host-room');
    var joinButton = el('btn-join-room');
    if (hostButton) hostButton.disabled = true;
    if (joinButton) joinButton.disabled = true;
  }

  function networkPlayers(players, isHost) {
    var lobby = el('lan-player-list');
    var gameList = el('game-player-list');
    clearNode(lobby);
    clearNode(gameList);
    for (var i = 0; i < players.length; i++) {
      lobby.appendChild(playerLine(players[i], isHost));
      gameList.appendChild(playerLine(players[i], isHost));
    }
    gameList.classList.toggle('hidden', !players.length);
    // Кнопка выбора класса доступна и гостю: он выбирает класс своего героя.
    UI.toggleClass('btn-start-coop', 'hidden', false);
    var startButton = el('btn-start-coop');
    if (startButton) startButton.disabled = false;
  }

  // Меню — единственное место, где видна кнопка продолжения, поэтому её
  // состояние освежается при каждом показе: забег мог сохраниться или кончиться.
  UI.registerRenderer('menu', refreshContinueButton);

  RK.UI.continueSavedRun = continueSavedRun;
  RK.UI.refreshContinueButton = refreshContinueButton;
  RK.UI.networkStatus = function (message) {
    setText('lan-status', message || '');
  };
  RK.UI.networkDisconnected = networkDisconnected;
  RK.UI.showLobby = showLobby;
  RK.UI.networkRooms = function (rooms) {
    renderRoomList(rooms, false);
  };
  RK.UI.networkRuns = function (runs) {
    var mapped = (runs || []).map(function (run) {
      return { room: run.code, players: run.players || [] };
    });
    renderRoomList(mapped, false);
  };
  RK.UI.networkPlayers = networkPlayers;

  UI.onInit(initLanControls);
  UI.onInit(refreshContinueButton);
})();
