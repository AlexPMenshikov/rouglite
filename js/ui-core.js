// Ядро интерфейса: состояние экрана, DOM-помощники, лог, чат и переходы между
// экранами. Остальные файлы js/ui-*.js добавляют свои экраны в RK.UI.
(function () {
  var C = RK.CONFIG;
  var current = 'menu';

  var SCREENS = ['menu', 'class-select', 'shop', 'inventory', 'storage', 'merchant', 'blacksmith', 'tavern', 'talk', 'guild', 'temple', 'game', 'over', 'help', 'questlog', 'skills', 'settings', 'saves'];

  var MAX_LOG_ENTRIES = 250;
  var MAX_CHAT_ENTRIES = 100;
  var PLAYER_NAME_MAX = 18;
  var CHAT_TEXT_MAX = 280;

  var debugLogEnabled = false;

  // Отрисовка экранов: модули регистрируют свои экраны, ядро знает только имена.
  // onShow — перерисовать при открытии экрана, onSync — при синхронизации комнаты.
  var renderers = Object.create(null);

  // Подписки на кнопки и панели: каждый модуль добавляет свой кусок init().
  var initHooks = [];

  // Обновление игрового экрана: HUD перерисовывает его сам (js/ui-hud.js).
  var gameRefresh = function () {};

  // Узлы запрашиваются один раз: экраны перестраиваются целиком и дёргали getElementById десятки раз.
  var domCache = Object.create(null);

  function el(id) {
    var node = domCache[id];
    if (node === undefined) node = domCache[id] = document.getElementById(id) || null;
    return node;
  }

  // Отсутствующий элемент не должен ронять refresh.
  function setText(id, text) {
    var node = el(id);
    if (node) node.textContent = text;
  }

  function setValue(id, value) {
    var node = el(id);
    if (node) node.value = value;
  }

  function toggleClass(id, className, on) {
    var node = el(id);
    if (node) node.classList.toggle(className, on);
  }

  // replaceChildren доступен в браузере, но в тестовых стабах DOM минимален — нужен запасной путь.
  function clearNode(node) {
    if (!node) return;
    if (typeof node.replaceChildren === 'function') node.replaceChildren();
    else node.innerHTML = '';
  }

  // Кнопка = пиксельная иконка + подпись. Иконка — спрайт из assets.js, а не Unicode-символы:
  // символы не держат пиксельный стиль тайлов. Подпись в своём span: смена текста (зелья, навык, звук) не стирает иконку.
  function appendIcon(container, spriteName) {
    var icon = document.createElement('canvas');
    icon.className = 'btn-icon';
    icon.width = 16;
    icon.height = 16;
    // Рядом есть подпись, поэтому картинка декоративная: иначе диктор прочёл бы её имя вместо текста кнопки.
    icon.setAttribute('aria-hidden', 'true');
    if (RK.Assets && RK.Assets.draw) RK.Assets.draw(icon.getContext('2d'), spriteName, 0, 0, 16);
    container.appendChild(icon);
    return icon;
  }

  // Иконка предмета в строке слота экипировки: спрайт вещи, подпись читается рядом.
  function appendSlotIcon(row, item) {
    var icon = document.createElement('canvas');
    icon.className = 'slot-icon';
    icon.width = 24;
    icon.height = 24;
    // Рядом есть название вещи, поэтому картинка декоративная.
    icon.setAttribute('aria-hidden', 'true');
    if (RK.Assets && RK.Assets.draw) RK.Assets.draw(icon.getContext('2d'), itemSprite(item), 0, 0, 24);
    row.appendChild(icon);
  }

  // Кнопки из кода собираются теми же средствами, что и кнопки из разметки.
  function makeButton(spriteName, text, className) {
    var button = document.createElement('button');
    if (className) button.className = className;
    splitButton(button, spriteName, text);
    return button;
  }

  // Кнопка из разметки: текст берётся из её содержимого, иконка добавляется перед ним
  // одним проходом при init(). Список один, чтобы пропущенная кнопка была видна в коде.
  var STATIC_BUTTON_ICONS = [
    ['btn-shop', 'uiShop'],
    ['btn-debug-room', 'uiDebug'],
    ['btn-help', 'uiHelp'],
    ['btn-host-room', 'uiRoom'],
    ['btn-join-room', 'uiLan'],
    ['btn-refresh-rooms', 'uiLan'],
    ['btn-continue-run', 'uiPlay'],
    ['btn-start-coop', 'uiPlay'],
    ['btn-inventory', 'uiInventory'],
    ['btn-storage-back', 'uiBack'],
    ['btn-potion', 'potion'],
    ['btn-skills', 'uiSkill'],
    ['btn-sound', 'uiSoundOn'],
    ['btn-render-mode', 'uiView'],
    ['btn-rest', 'uiRest'],
    ['btn-camp', 'uiCamp'],
    ['btn-teleport-city', 'uiCity'],
    ['btn-retry', 'uiPlay'],
    ['btn-shop-back', 'uiBack'],
    ['btn-inventory-back', 'uiBack'],
    ['btn-merchant-back', 'uiBack'],
    ['btn-blacksmith-back', 'uiBack'],
    ['btn-talk-back', 'uiBack'],
    ['btn-tavern-back', 'uiBack'],
    ['btn-tavern-rest', 'uiRest'],
    ['btn-tavern-rumors', 'uiQuest'],
    ['btn-help-back', 'uiBack'],
    ['btn-chat-send', 'uiSend'],
    ['btn-debug-apply', 'uiDebug'],
  ];

  // Иконка и подпись хранятся ссылками, а не ищутся в DOM: children — HTMLCollection без filter,
  // а поиск по классу на каждом refresh обходил бы дерево заново.
  var buttonParts = new Map();
  var staticButtonParts = Object.create(null);

  function splitButton(button, spriteName, text) {
    clearNode(button);
    var icon = spriteName ? appendIcon(button, spriteName) : null;
    var label = document.createElement('span');
    label.className = 'btn-label';
    label.textContent = text;
    button.appendChild(label);
    var parts = { icon: icon, label: label, sprite: spriteName };
    buttonParts.set(button, parts);
    return parts;
  }

  function decorateStaticButtons() {
    for (var i = 0; i < STATIC_BUTTON_ICONS.length; i++) {
      var id = STATIC_BUTTON_ICONS[i][0];
      var button = el(id);
      if (!button) continue;
      staticButtonParts[id] = splitButton(button, STATIC_BUTTON_ICONS[i][1], button.textContent);
    }
  }

  // Кнопка из кода со своим спрайтом: иконка и подпись ставятся один раз,
  // а перерисовка иконки идёт тем же проходом, что и у кнопок из разметки.
  function decorateButton(id, spriteName, text) {
    var button = el(id);
    if (!button) return null;
    var parts = splitButton(button, spriteName, text);
    staticButtonParts[id] = parts;
    return parts;
  }

  // Тайлсет грузится асинхронно, а кнопки создаются раньше: иконки пришлось бы рисовать в пустоту.
  // Поэтому после загрузки (и после смены тайлсета) все иконки перерисовываются одним проходом.
  function refreshIcons() {
    for (var id in staticButtonParts) {
      var parts = staticButtonParts[id];
      if (parts && parts.sprite) setButtonIcon(id, parts.sprite);
    }
  }

  // Иконка подменяется без перестройки кнопки: у звука и навыка она меняется по состоянию.
  function setButtonIcon(id, spriteName) {
    var parts = staticButtonParts[id];
    if (!parts || !parts.icon || !RK.Assets || !RK.Assets.draw) return;
    var ctx = parts.icon.getContext('2d');
    if (ctx && ctx.clearRect) ctx.clearRect(0, 0, parts.icon.width, parts.icon.height);
    RK.Assets.draw(ctx, spriteName, 0, 0, 16);
  }

  function setButtonLabel(id, text) {
    var parts = staticButtonParts[id];
    if (!parts) {
      setText(id, text);
      return;
    }
    parts.label.textContent = text;
  }

  function renderButtonGroup(containerId, table, currentId, onSelect) {
    var container = el(containerId);
    clearNode(container);
    if (!container) return;
    for (var i = 0; i < table.length; i++) {
      var entry = table[i];
      var button = makeButton(entry.icon, entry.label,
        'inventory-control' + (currentId === entry.id ? ' active' : ''));
      button.setAttribute('aria-pressed', currentId === entry.id ? 'true' : 'false');
      button.addEventListener('click', function (id) {
        return function () { onSelect(id); };
      }(entry.id));
      container.appendChild(button);
    }
  }

  function onClick(id, handler) {
    var node = el(id);
    if (node) node.addEventListener('click', handler);
  }

  function onChange(id, handler) {
    var node = el(id);
    if (node) node.addEventListener('change', handler);
  }

  // Без этих ID игра не запустится; проверка в init() превращает опечатку в разметке в рантайм-ошибку.
  var REQUIRED_IDS = [
    'log', 'chat-form', 'chat-input', 'btn-play', 'btn-retry', 'btn-shop', 'btn-shop-back',
    'btn-inventory', 'btn-inventory-back', 'btn-merchant-back', 'btn-blacksmith-back',
    'btn-storage-back', 'storage-backpack-list', 'storage-chest-list', 'resolution-options',
    'btn-talk-back', 'btn-tavern-back', 'btn-tavern-rest', 'btn-tavern-rumors',
    'talk-title', 'talk-text', 'talk-actions',
    'btn-potion', 'btn-rest', 'btn-camp', 'btn-teleport-city', 'btn-sound', 'btn-render-mode',
    'hud-skills',
    'debug-stats-form', 'btn-host-room', 'btn-join-room', 'btn-start-coop', 'btn-log-toggle',
    'btn-refresh-rooms', 'lan-room-list', 'btn-help', 'btn-help-back', 'player-name',
    'map-size', 'map-style', 'class-select-list', 'btn-class-select-back',
    'btn-class-select-start', 'class-select-bank',
    'btn-questlog', 'btn-questlog-back', 'questlog-active-list', 'questlog-completed-list',
    'btn-skills', 'btn-skills-back', 'skills-list',
  ];

  function assertRequiredElements() {
    var missing = REQUIRED_IDS.filter(function (id) { return !el(id); });
    if (missing.length) throw new Error('ui: отсутствуют элементы разметки: ' + missing.join(', '));
  }

  // Герой этого экрана: в сетевой комнате RK.GAME.player уже указывает на героя этого клиента.
  function displayPlayer() {
    var g = RK.GAME;
    return g ? g.player : null;
  }

  // Идентификатор локального игрока: квесты принадлежат тому, кто их принял.
  function myPlayerId() {
    return RK.Combat && RK.Combat.localPlayerId ? RK.Combat.localPlayerId() : 'local';
  }

  function savePlayerName() {
    var input = el('player-name');
    var name = input ? input.value.trim().slice(0, PLAYER_NAME_MAX) : '';
    name = name || 'Игрок';
    if (RK.Meta && RK.Meta.data) {
      RK.Meta.data.playerName = name;
      if (RK.Meta.save) RK.Meta.save();
    }
    return name;
  }

  // Единая диспетчеризация действий для UI и ввода. Сеть обрабатывается первой: в комнате ход уходит на сервер.
  function perform(action, args) {
    if (RK.Network && RK.Network.isWaitingForServer()) return;
    if (RK.Network && RK.Network.action(action, args) !== null) return;
    RK.Combat[action].apply(null, args || []);
  }

  // Действие, затем перерисовка экрана: тройка perform/render/refresh повторялась в девяти местах,
  // а refresh() внутри combat.js уже заканчивается полным repaint канваса.
  function commit(action, args, rerender) {
    perform(action, args);
    if (rerender) rerender();
    else if (current === 'inventory' && renderers.inventory) renderers.inventory.render();
  }

  function registerRenderer(name, render, options) {
    renderers[name] = {
      render: render,
      onShow: !options || options.onShow !== false,
      onSync: !!(options && options.onSync),
    };
  }

  function onInit(hook) {
    if (typeof hook === 'function') initHooks.push(hook);
  }

  function setGameRefresh(handler) {
    gameRefresh = typeof handler === 'function' ? handler : function () {};
  }

  function show(name) {
    current = name;
    for (var i = 0; i < SCREENS.length; i++) {
      toggleClass('screen-' + SCREENS[i], 'hidden', SCREENS[i] !== name);
    }
    if (name !== 'game') {
      RK.hover = null;
      RK.hoverPath = null;
      RK.hoverPointer = null;
    }
    var renderer = renderers[name];
    if (renderer && renderer.onShow) renderer.render();
    gameRefresh();
  }

  // Состояние комнаты приходит снимком: экраны, открытые в комнате, перерисовываются.
  function syncNetworkState() {
    var renderer = renderers[current];
    if (renderer && renderer.onSync) renderer.render();
    else gameRefresh();
  }

  function msg(text, important) {
    if (!important && !debugLogEnabled) return;
    var log = el('log');
    if (!log) return;
    var div = document.createElement('div');
    div.textContent = text;
    appendLogEntry(log, div, MAX_LOG_ENTRIES);
  }

  function narratorMsg(text, important) {
    if (!important && !debugLogEnabled) return;
    var log = el('log');
    if (!log) return;
    var div = document.createElement('div');
    div.className = 'log-narrator';
    var name = document.createElement('span');
    name.className = 'narrator-name';
    name.textContent = (RK.Narrator && RK.Narrator.NAME ? RK.Narrator.NAME : 'Рассказчик') + ': ';
    div.appendChild(name);
    div.appendChild(document.createTextNode(text));
    appendLogEntry(log, div, MAX_LOG_ENTRIES);
  }

  function appendLogEntry(log, entry, maxEntries) {
    var followsLatest = log.scrollHeight - log.clientHeight - log.scrollTop < 8;
    log.appendChild(entry);
    while (log.children.length > maxEntries) log.removeChild(log.firstChild);
    if (followsLatest) log.scrollTop = log.scrollHeight;
  }

  function chatMessage(message) {
    var log = el('chat-messages');
    if (!log || !message) return;
    var entry = document.createElement('div');
    var name = document.createElement('strong');
    name.textContent = String(message.name || 'Игрок').slice(0, PLAYER_NAME_MAX) + ': ';
    entry.appendChild(name);
    entry.appendChild(document.createTextNode(String(message.text || '').slice(0, CHAT_TEXT_MAX)));
    appendLogEntry(log, entry, MAX_CHAT_ENTRIES);
    log.scrollTop = log.scrollHeight;
  }

  function chatStatus(message) {
    var status = el('chat-status');
    if (status) status.textContent = message || '';
  }

  function setChatEnabled(enabled) {
    var panel = el('chat-panel');
    if (panel) panel.classList.toggle('hidden', !enabled);
    var input = el('chat-input');
    var button = el('btn-chat-send');
    if (input) input.disabled = !enabled;
    if (button) button.disabled = !enabled;
    chatStatus(enabled ? '' : 'Чат доступен после подключения к комнате.');
  }

  function clearLog() {
    clearNode(el('log'));
  }

  function isImportantLog(text) {
    return /уров|побед|пораж|смерт|босс|этаж|задани|подключ|отключ|получ|потер|откры|найден|подобран|ловушк|победил|умер|достиг|голод/i.test(text);
  }

  // Оружие класса — из CLASS_DEFS: у мага лук и арбалет запрещены правилами экипировки.
  function classWeaponText(def) {
    return (def && def.weapon) || 'меч, копьё';
  }

  function itemSprite(item) {
    return item.asset || C.SLOT_ASSETS[item.slot] || item.type || 'gold';
  }

  // Тултип под курсором. Раньше вызывался прямо из render.js внутри каждого draw() и читал
  // getBoundingClientRect() у canvas-wrap — форсировал reflow в каждом кадре и связывал отрисовку с DOM.
  function gameTooltip(text, clientX, clientY, rarity) {
    var tooltip = el('game-tooltip');
    var canvasWrap = el('canvas-wrap');
    if (!tooltip || !canvasWrap) return;
    if (!text) {
      tooltip.classList.add('hidden');
      tooltip.style.borderColor = '';
      tooltip.style.color = '';
      return;
    }
    var bounds = canvasWrap.getBoundingClientRect();
    tooltip.textContent = text;
    var rarityColor = rarity && C.RARITY_COLORS[rarity];
    tooltip.style.borderColor = rarityColor || '';
    tooltip.style.color = rarityColor || '';
    tooltip.classList.remove('hidden');
    var left = clientX - bounds.left + 12;
    var top = clientY - bounds.top + 12;
    left = Math.max(4, Math.min(left, bounds.width - tooltip.offsetWidth - 4));
    top = Math.max(4, Math.min(top, bounds.height - tooltip.offsetHeight - 4));
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  // Вызывается из render.js в конце кадра: один источник правды о том, что под курсором, и единственное место, где canvas трогает DOM.
  function refreshTooltip() {
    var pointer = RK.hoverPointer;
    var hoverInfo = (pointer && RK.hover && RK.Render && RK.Render.getHoverInfo)
      ? RK.Render.getHoverInfo(RK.hover)
      : '';
    gameTooltip(
      typeof hoverInfo === 'string' ? hoverInfo : hoverInfo.text,
      pointer ? pointer.x : 0,
      pointer ? pointer.y : 0,
      typeof hoverInfo === 'string' ? null : hoverInfo.rarity,
    );
  }

  function init() {
    assertRequiredElements();
    // Иконки рисуются после разметки всех экранов: кнопка, созданная позже, осталась бы без иконки.
    decorateStaticButtons();
    for (var i = 0; i < initHooks.length; i++) initHooks[i]();
  }

  RK.UI = {
    // экраны и действия
    show: show,
    screen: function () { return current; },
    perform: perform,
    commit: commit,
    registerRenderer: registerRenderer,
    onInit: onInit,
    setGameRefresh: setGameRefresh,
    syncNetworkState: syncNetworkState,

    // DOM
    el: el,
    setText: setText,
    setValue: setValue,
    toggleClass: toggleClass,
    clearNode: clearNode,
    makeButton: makeButton,
    appendSlotIcon: appendSlotIcon,
    renderButtonGroup: renderButtonGroup,
    decorateButton: decorateButton,
    onClick: onClick,
    onChange: onChange,
    refreshIcons: refreshIcons,
    setButtonIcon: setButtonIcon,
    setButtonLabel: setButtonLabel,

    // данные экрана
    displayPlayer: displayPlayer,
    myPlayerId: myPlayerId,
    savePlayerName: savePlayerName,
    classWeaponText: classWeaponText,
    itemSprite: itemSprite,

    // лог, чат и подсказки
    msg: function (text, important) {
      msg(text, important === undefined ? (debugLogEnabled || isImportantLog(text)) : important);
    },
    narratorMsg: function (text) { narratorMsg(text, false); },
    clearLog: clearLog,
    chatMessage: chatMessage,
    chatStatus: chatStatus,
    chatEnabled: setChatEnabled,
    setDebugLogEnabled: function (value) { debugLogEnabled = !!value; },
    isDebugLogEnabled: function () { return debugLogEnabled; },
    gameTooltip: gameTooltip,
    refreshTooltip: refreshTooltip,

    init: init,
  };
})();
