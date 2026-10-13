(function () {
  var C = RK.CONFIG;
  var current = 'menu';

  var SCREENS = ['menu', 'class-select', 'shop', 'inventory', 'merchant', 'blacksmith', 'game', 'over', 'help'];
  var pendingRun = null;
  var pendingNetworkStart = false;

  var SORT_MODES = [
    { id: 'value', label: 'Ценность', icon: 'uiGold' },
    { id: 'rarity', label: 'Редкость', icon: 'uiGem' },
    { id: 'type', label: 'Тип', icon: 'uiTag' },
    { id: 'none', label: 'Как есть', icon: 'uiList' },
  ];
  var SORT_MODE_DEFAULT = 'value';

  var FILTERS = [
    { id: 'all', label: 'Всё', icon: 'uiInventory' },
    { id: 'gear', label: 'Снаряжение', icon: 'uiEquip' },
    { id: 'weapon', label: 'Оружие', icon: 'sword' },
    { id: 'potion', label: 'Зелья', icon: 'potion' },
    { id: 'trap', label: 'Ловушки', icon: 'trapSpike' },
    { id: 'key', label: 'Ключи', icon: 'uiKey' },
  ];
  var FILTER_DEFAULT = 'all';

  var KIND_ORDER = {
    trap: 7,
    potion: 8,
    key: 9,
    gold: 10,
  };
  var KIND_RANK_OTHER = 11;

  var MAX_LOG_ENTRIES = 250;
  var MAX_CHAT_ENTRIES = 100;
  var PLAYER_NAME_MAX = 18;
  var CHAT_TEXT_MAX = 280;

  var inventorySort = SORT_MODE_DEFAULT;
  var inventoryFilter = FILTER_DEFAULT;
  var debugLogEnabled = false;
  var logCollapsed = false;

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
    ['btn-start-coop', 'uiPlay'],
    ['btn-inventory', 'uiInventory'],
    ['btn-potion', 'potion'],
    ['btn-skill', 'uiSkill'],
    ['btn-sound', 'uiSoundOn'],
    ['btn-render-mode', 'uiView'],
    ['btn-rest', 'uiRest'],
    ['btn-retry', 'uiPlay'],
    ['btn-shop-back', 'uiBack'],
    ['btn-inventory-back', 'uiBack'],
    ['btn-merchant-back', 'uiBack'],
    ['btn-blacksmith-back', 'uiBack'],
    ['btn-help-back', 'uiBack'],
    ['btn-chat-send', 'uiSend'],
    ['btn-debug-apply', 'uiDebug'],
  ];

  function decorateStaticButtons() {
    for (var i = 0; i < STATIC_BUTTON_ICONS.length; i++) {
      var id = STATIC_BUTTON_ICONS[i][0];
      var button = el(id);
      if (!button) continue;
      staticButtonParts[id] = splitButton(button, STATIC_BUTTON_ICONS[i][1], button.textContent);
    }
  }

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

  // Без этих ID игра не запустится; проверка в init() превращает опечатку в разметке в рантайм-ошибку.
  var REQUIRED_IDS = [
    'log', 'chat-form', 'chat-input', 'btn-play', 'btn-retry', 'btn-shop', 'btn-shop-back',
    'btn-inventory', 'btn-inventory-back', 'btn-merchant-back', 'btn-blacksmith-back',
    'btn-potion', 'btn-skill', 'btn-rest', 'btn-sound', 'btn-render-mode',
    'debug-stats-form', 'btn-host-room', 'btn-join-room', 'btn-start-coop', 'btn-log-toggle',
    'btn-refresh-rooms', 'lan-room-list', 'btn-help', 'btn-help-back', 'player-name',
    'map-size', 'map-style', 'class-select-list', 'btn-class-select-back',
    'btn-class-select-start', 'class-select-bank',
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
    if (name === 'inventory') renderInventoryScreen();
    else if (name === 'blacksmith') renderBlacksmithScreen();
    else if (name === 'help') renderHelpScreen();
    refresh();
  }

  function rarityRank(item) {
    return C.RARITY_ORDER[item.rarity || 'common'] || 0;
  }

  function itemValue(item) {
    if (!item) return 0;
    var base = item.value || 0;
    if (item.kind === 'gold') base += item.amt || 0;
    return base;
  }

  function itemKindRank(item) {
    var kind = item.kind || 'loot';
    if (kind !== 'loot') return KIND_ORDER[kind] == null ? KIND_RANK_OTHER : KIND_ORDER[kind];
    var slotRank = C.SLOTS.indexOf(item.slot);
    return slotRank === -1 ? 6 : slotRank;
  }

  function matchesFilter(item, filter) {
    if (!filter || filter === 'all') return true;
    if (filter === 'gear') return item.kind === 'loot';
    if (filter === 'weapon') return item.kind === 'loot' && item.slot === 'weapon';
    return item.kind === filter;
  }

  // Backpack rows keep the real backpack index, so sorting never breaks actions.
  function sortedEntries(backpack, sortMode, filter) {
    var entries = [];
    for (var i = 0; i < (backpack || []).length; i++) {
      if (matchesFilter(backpack[i], filter)) entries.push({ item: backpack[i], index: i });
    }
    if (sortMode === 'none') return entries;
    entries.sort(function (a, b) {
      var diff = 0;
      if (sortMode === 'rarity') {
        diff = rarityRank(b.item) - rarityRank(a.item);
        if (!diff) diff = itemValue(b.item) - itemValue(a.item);
      } else if (sortMode === 'type') {
        diff = itemKindRank(a.item) - itemKindRank(b.item);
      } else {
        diff = itemValue(b.item) - itemValue(a.item);
      }
      return diff || a.index - b.index;
    });
    return entries;
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

  function renderInventoryControls() {
    renderButtonGroup('inventory-sort-modes', SORT_MODES, inventorySort, function (id) {
      inventorySort = id;
      renderInventoryScreen();
    });
    renderButtonGroup('inventory-filters', FILTERS, inventoryFilter, function (id) {
      inventoryFilter = id;
      renderInventoryScreen();
    });
  }

  // Иконка кнопки соответствует действию, а не типу вещи: «Надеть» на кольце показывает щит.
  function itemButtonIcon(item) {
    if (item.kind === 'key') return 'uiKey';
    if (item.kind === 'potion') return 'potion';
    if (item.kind === 'trap') return 'trapSpike';
    return item.equipped ? 'uiTrash' : 'uiEquip';
  }

  function itemButtonLabel(item) {
    if (item.kind === 'key') return 'Ключ';
    if (item.kind === 'potion') return 'Исп.';
    if (item.kind === 'trap') return 'Установить';
    return item.equipped ? 'Снять' : 'Надеть';
  }

  function equipBlockReason(player, item) {
    if (!item || item.slot !== 'weapon' || !item.weaponType) return '';
    if (!RK.Classes || !RK.Classes.equipRestriction) return '';
    return RK.Classes.equipRestriction(player, item);
  }

  function renderEquipmentSlots(container, player, withTakeButton) {
    clearNode(container);
    if (!container) return;
    for (var i = 0; i < C.SLOTS.length; i++) {
      var slot = C.SLOTS[i];
      var item = player.equipment && player.equipment[slot];
      var row = document.createElement('div');
      row.className = 'inventory-slot-item' + (item ? ' rarity-' + (item.rarity || 'common') : '');
      var name = document.createElement('span');
      name.className = 'slot-name';
      name.textContent = C.SLOT_LABELS[slot];
      var value = document.createElement('span');
      value.className = 'slot-item';
      value.textContent = item ? item.name + (item.summary ? ' — ' + item.summary : '') : 'пусто';
      row.appendChild(name);
      row.appendChild(value);
      if (item && withTakeButton) {
        var takeButton = makeButton('uiEquip', 'Снять');
        takeButton.addEventListener('click', function (slotId) {
          return function (event) {
            event.stopPropagation();
            commit('unequipSlot', [slotId], renderInventoryScreen);
          };
        }(slot));
        row.appendChild(takeButton);
      }
      container.appendChild(row);
    }
  }

  function appendHint(label, text, blocked) {
    var hint = document.createElement('small');
    hint.className = blocked ? 'equip-hint blocked' : 'equip-hint';
    hint.textContent = text;
    label.appendChild(hint);
    label.setAttribute('title', text);
  }

  // Действие, затем перерисовка экрана: тройка perform/render/refresh повторялась в девяти местах,
  // а refresh() внутри combat.js уже заканчивается полным repaint канваса.
  //
  // Экран инвентаря перестраивается один раз: rerender либо общий случай ниже.
  function commit(action, args, rerender) {
    perform(action, args);
    if (rerender) rerender();
    else if (current === 'inventory') renderInventoryScreen();
  }

  function renderInventoryScreen() {
    var g = RK.GAME || null;
    var p = g ? displayPlayer() : null;
    var equipmentEl = el('inventory-equipment-slots');
    var listEl = el('inventory-backpack-list');
    if (!p || !equipmentEl || !listEl) return;

    renderInventoryControls();
    renderEquipmentSlots(equipmentEl, p, true);

    clearNode(listEl);
    var backpack = p.backpack || [];
    var entries = sortedEntries(backpack, inventorySort, inventoryFilter);
    if (!entries.length) {
      var empty = document.createElement('div');
      empty.className = 'inventory-row';
      empty.textContent = backpack.length ? 'Нет предметов по фильтру' : 'Рюкзак пуст';
      listEl.appendChild(empty);
      return;
    }

    for (var i = 0; i < entries.length; i++) {
      var loot = entries[i].item;
      var index = entries[i].index;
      var rowItem = document.createElement('div');
      rowItem.className = 'inventory-row rarity-' + (loot.rarity || 'common');
      var label = document.createElement('span');
      label.className = 'name';
      label.textContent = (loot.name || 'Предмет') +
        (loot.count > 1 ? ' ×' + loot.count : '') +
        (loot.summary ? ' — ' + loot.summary : '');
      if (loot.kind === 'loot' && C.SLOT_BODY_PARTS[loot.slot]) {
        appendHint(label, 'Надевается ' + C.SLOT_BODY_PARTS[loot.slot], false);
      }
      var blockReason = equipBlockReason(p, loot);
      if (blockReason) {
        appendHint(label, blockReason, true);
        rowItem.classList.add('blocked');
      }
      var actions = document.createElement('div');
      actions.className = 'actions';
      var useBtn = makeButton(itemButtonIcon(loot), itemButtonLabel(loot));
      useBtn.disabled = loot.kind === 'key' || !!blockReason;
      if (blockReason) useBtn.title = blockReason;
      useBtn.addEventListener('click', function (idx) {
        return function (event) {
          event.stopPropagation();
          commit('useInventoryItem', [idx], renderInventoryScreen);
        };
      }(index));
      var dropBtn = makeButton('uiTrash', 'Выбросить');
      dropBtn.addEventListener('click', function (idx) {
        return function (event) {
          event.stopPropagation();
          commit('dropInventoryItem', [idx], renderInventoryScreen);
        };
      }(index));
      actions.appendChild(useBtn);
      actions.appendChild(dropBtn);
      rowItem.appendChild(label);
      rowItem.appendChild(actions);
      listEl.appendChild(rowItem);
    }
  }

  // show() сам перестраивает экран: повторный рендер был бы второй перестройкой DOM с переподпиской обработчиков.
  function showInventory() {
    show('inventory');
  }

  function renderMerchantScreen() {
    var player = RK.GAME && RK.GAME.player;
    var g = RK.GAME;
    var list = el('merchant-inventory');
    var questOfferEl = el('merchant-quest-offer');
    if (!player || !list) return;
    setText('merchant-gold', 'У вас: ' + player.gold + ' золота');
    clearNode(list);
    clearNode(questOfferEl);

    if (g && g.merchantOffer) {
      var q = g.merchantOffer;
      var offerDiv = document.createElement('div');
      offerDiv.className = 'merchant-row merchant-quest-offer-row';
      offerDiv.style.borderColor = '#ffd166';
      offerDiv.style.background = 'rgba(255, 209, 102, 0.1)';
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = '📜 ' + q.description + ' — награда: ' + q.reward + ' золота';
      var btn = makeButton('uiQuest', 'Принять задание');
      btn.addEventListener('click', function () {
        commit('acceptQuest', [], renderMerchantScreen);
      });
      offerDiv.appendChild(name);
      offerDiv.appendChild(btn);
      if (questOfferEl) questOfferEl.appendChild(offerDiv);
    }

    function addSaleRow(item, label, index) {
      var row = document.createElement('div');
      row.className = 'merchant-row rarity-' + (item.rarity || 'common');
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = label + (item.summary ? ' — ' + item.summary : '');
      var button = makeButton('uiGold', 'Продать — ' + RK.Combat.getSellValue(item));
      button.addEventListener('click', function (idx) {
        return function () { commit('sellInventoryItem', [idx], renderMerchantScreen); };
      }(index));
      row.appendChild(name);
      row.appendChild(button);
      list.appendChild(row);
    }

    var backpack = player.backpack || [];
    var equippedItems = C.SLOTS.map(function (slot) { return player.equipment[slot]; });
    var sellEntries = sortedEntries(backpack, SORT_MODE_DEFAULT, 'all').filter(function (entry) {
      return !entry.item.equipped && equippedItems.indexOf(entry.item) === -1;
    });
    for (var i = 0; i < sellEntries.length; i++) {
      var sellable = sellEntries[i].item;
      addSaleRow(sellable, (sellable.name || 'Предмет') +
        (sellable.count > 1 ? ' ×' + sellable.count : ''), sellEntries[i].index);
    }
    if (!sellEntries.length) {
      var empty = document.createElement('div');
      empty.className = 'merchant-row';
      empty.textContent = 'У вас нет предметов для продажи.';
      list.appendChild(empty);
    }
  }

  function showMerchant() {
    renderMerchantScreen();
    show('merchant');
  }

  function showBlacksmith() {
    show('blacksmith');
  }

  function showHelp() {
    show('help');
  }

  function renderHelpScreen() {
    var container = el('help-content');
    if (!container) return;
    var md = '# Рогалик\n\nБраузерный roguelite с процедурными этажами, боем, лутом и кооперативом по LAN. Открыть `rougelite.html` в браузере.\n\n## Особенности\n\n- процедурная генерация этажей (камень/пещера/склеп), враги, боссы, классы, уровни\n- **классы**: танк (защита и отражение урона), берсерк (ярость и лечение от урона), лучник (стрельба на расстоянии видимости, чутьё на ловушки)\n- инвентарь с сортировкой по ценности/редкости/типу и фильтрами, экипировка, постоянные улучшения, банк золота\n- **таверна** — безопасная комната с торговцем и кузнецом (враги могут заходить)\n- **кузнец** — улучшение надетой экипировки до 5 уровней (+15% базовых статов/уровень)\n- **торговец** — задания (убить демонов / найти предметы) за золото\n- **озерца и ручьи** в больших комнатах (декор, не блокируют проход)\n- **ловушки** в комнатах (штыри, иглы, пламя — взвод, отмычка, срабатывание); лучник видит их за 2 клетки, обезвреживает чаще и может переставить свою\n- одиночный режим и LAN-кооператив до 4 игроков (забег ведёт сервер, список комнат — в меню)\n- сохранение прогресса и комнаты между перезапусками\n- ASCII / пиксельная графика (переключение кнопкой «Вид»), F11 — фуллскрин\n\n## Классы\n\n| Класс | Оружие | Особенности |\n|---|---|---|\n| Танк | меч, топор | защита и здоровье, «Щитовой ответ» |\n| Берсерк | меч, топор | атака и лечение от урона, «Безумие» |\n| Лучник | лук, арбалет | выстрел кликом мыши на расстоянии видимости, чутьё на ловушки, «Прицельный выстрел» |\n\n## Управление\n\n| Действие | Клавиши |\n|---|---|\n| Движение | WASD / стрелки / нумпад |\n| Автопроход по клетке | клик мышью по полу |\n| Выстрел (лучник) | клик мышью по врагу в пределах видимости |\n| Взаимодействие (двери, сундуки, NPC) | `E` |\n| Вскрыть замок / обезвредить ловушку | `L` |\n| Выбить / сломать | `F` |\n| Зелье лечения | `R` |\n| Навык класса | `Q` |\n| Пропустить ход | `5` / `.` |\n| Выход из комнаты отладки | `Esc` |\n\nАвтопроход идёт до клетки кратчайшим путём и останавливается, если в поле зрения появился новый враг, путь перекрыт или герой погиб. Уже видимые к моменту клика враги маршрут не отменяют.\n\n## Запуск\n\n1. **Одиночная игра**: задать имя героя → открыть `rougelite.html`\n2. **LAN-кооператив**: Node.js 18+ → `start.bat` / `start.sh` на компьютере с сервером → остальные открывают адрес из консоли, жмут «Список комнат» и подключаются к комнате или вводят её код вручную\n3. **Тесты**: `node --test` (нужен `ws` из `package.json`)\n\n## Ресурсы\n\nВнешние PNG-тайлсеты 16×16 (например `assets/tiny-dungeon.png`). Порядок тайлов — `KENNEY_MAP` в `js/assets.js`. Кастомные полы/стены: `floor-dark.png`, `wall-dark.png` (этажи 4–6), `floor-deep.png`, `wall-deep.png` (этажи 7–10). Проверяйте лицензии (CC0, CC-BY и др.).';
    container.innerHTML = '<div class="help-md">' + md.replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/^\| (.+) \|$/gm, '<div class="help-row">$1</div>')
      .replace(/^\|?\s*[-:]+\s*\|?/gm, '')
      .replace(/^\- (.+)$/gm, '<div class="help-li">• $1</div>')
      .replace(/\n/g, '<br>');
  }

  function renderBlacksmithScreen() {
    var g = RK.GAME;
    var p = g ? displayPlayer() : null;
    var listEl = el('blacksmith-list');
    if (!p || !listEl) return;
    setText('blacksmith-gold', 'Ваше золото: ' + p.gold);
    clearNode(listEl);

    var hasUpgradable = false;
    for (var si = 0; si < C.SLOTS.length; si++) {
      var slot = C.SLOTS[si];
      var item = p.equipment && p.equipment[slot];
      if (!item || !item.baseStats || item.upgradeLevel >= C.UPGRADE_MAX) continue;
      hasUpgradable = true;
      var cost = RK.Items.getUpgradeCost(item);
      var row = document.createElement('div');
      row.className = 'merchant-row rarity-' + (item.rarity || 'common');
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = C.SLOT_LABELS[slot] + ': ' + item.name +
        (item.summary ? ' — ' + item.summary : '');
      var btn = makeButton('uiUpgrade', 'Улучшить (+' + (item.upgradeLevel + 1) + ') — ' + cost + ' золота');
      btn.disabled = p.gold < cost;
      btn.addEventListener('click', function (s) {
        return function () { commit('upgradeEquipment', [s], renderBlacksmithScreen); };
      }(slot));
      row.appendChild(name);
      row.appendChild(btn);
      listEl.appendChild(row);
    }

    if (!hasUpgradable) {
      var empty = document.createElement('div');
      empty.className = 'merchant-row';
      empty.textContent = 'Нет экипировки, которую можно улучшить (макс. ' + C.UPGRADE_MAX + ' уровней).';
      listEl.appendChild(empty);
    }
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
    return /уров|побед|пораж|смерт|босс|этаж|задани|подключ|отключ|получ|потер|откры|найден|подобран|ловушк|победил|умер|достиг/i.test(text);
  }

  function xpNeed(level) {
    return C.XP_BASE + (level - 1) * C.XP_GROWTH;
  }

  function countBackpack(p, kind) {
    var total = 0;
    var backpack = p.backpack || [];
    for (var i = 0; i < backpack.length; i++) {
      if (backpack[i].kind === kind) total += backpack[i].count || 1;
    }
    return total;
  }

  function refreshStatusLine(g, p) {
    var statuses = [];
    if (p.burningTurns > 0) statuses.push('Горение ' + p.burningTurns);
    if (p.preciseShots > 0) statuses.push('Прицел ' + p.preciseShots);
    if (p.rageTurns > 0) statuses.push('Ярость ' + p.rageTurns);
    if (p.reflectShield > 0) statuses.push('Щит ' + p.reflectShield);
    setText('stat-status', statuses.join(' · '));
    var quest = g.quest;
    setText('stat-quest', quest
      ? 'Задание: ' + quest.description + ' (' +
        (quest.completed ? 'выполнено' : quest.progress + '/' + quest.target) + ')'
      : '');
    setText('stat-turn', String(g.turn));
  }

  function refreshCharacterPanel(g, p) {
    setText('stat-player-name', p.name || 'Игрок');
    setText('stat-class', p.className || '—');

    var clsInfo = RK.Classes && RK.Classes.getClassDef ? RK.Classes.getClassDef(p.classId || 'tank') : null;
    setText('stat-skill', clsInfo
      ? clsInfo.skillName + (p.classSkillCooldown > 0 ? ' (' + p.classSkillCooldown + ' хд)' : '')
      : '—');
    var skillButton = el('btn-skill');
    if (skillButton) {
      setButtonLabel('btn-skill', clsInfo
        ? clsInfo.skillName + ' (Q)' + (p.classSkillCooldown > 0 ? ' — ' + p.classSkillCooldown + ' хд' : '')
        : 'Навык (Q)');
      skillButton.disabled = !clsInfo || p.classSkillCooldown > 0 || g.over;
      skillButton.title = clsInfo
        ? clsInfo.skillText + (p.classSkillCooldown > 0 ? ' Перезарядка: ' + p.classSkillCooldown + ' ход.' : '')
        : 'Классовый навык недоступен';
    }

    // Атака и защита показываются вместе с бонусами рассказчика и зоны.
    var atkExtra = 0;
    var defExtra = 0;
    if (RK.Narrator) {
      var mods = RK.Narrator.getMods(g.turn);
      atkExtra += mods.atkBonus || 0;
      defExtra += mods.defBonus || 0;
    }
    var zoneMods = RK.Combat.getZoneMods(p.x, p.y);
    atkExtra += zoneMods.atkBonus;
    defExtra += zoneMods.defBonus;
    setText('stat-atk', formatWithBonus(p.atk, atkExtra));
    setText('stat-def', formatWithBonus(p.def, defExtra));

    setText('stat-xp', p.xp + ' / ' + xpNeed(p.level));
    var xpBar = el('bar-xp-fill');
    if (xpBar) xpBar.style.width = Math.max(0, Math.min(100, (p.xp / xpNeed(p.level)) * 100)) + '%';
    setText('stat-potion', '+' + p.potionHeal + ' HP');

    setValue('debug-hp', String(p.hp));
    setValue('debug-max-hp', String(p.maxHp));
    setValue('debug-atk', String(p.atk));
    setValue('debug-def', String(p.def));

    var ruleEl = el('stat-narrator-rule');
    if (ruleEl && RK.Narrator) ruleEl.textContent = RK.Narrator.activeRulesSummary() || '—';
  }

  function formatWithBonus(value, bonus) {
    return bonus ? value + ' (' + (bonus > 0 ? '+' : '') + bonus + ')' : String(value);
  }

  function refreshActionButtons(g, p) {
    var potionCount = countBackpack(p, 'potion');
    var potionButton = el('btn-potion');
    if (potionButton) {
      setButtonLabel('btn-potion', 'Выпить зелье (R) ×' + potionCount);
      potionButton.disabled = potionCount === 0;
    }
    var soundOn = !!(RK.Audio && RK.Audio.isEnabled());
    setButtonLabel('btn-sound', soundOn ? 'Звук: вкл.' : 'Звук: выкл.');
    setButtonIcon('btn-sound', soundOn ? 'uiSoundOn' : 'uiSoundOff');
    var soundButton = el('btn-sound');
    if (soundButton) soundButton.setAttribute('aria-pressed', soundOn ? 'true' : 'false');

    var zone = RK.Combat.getZoneAt(p.x, p.y);
    var zoneType = zone && zone.type;
    toggleClass('canvas-wrap', 'zone-buff', zoneType === 'regen' || zoneType === 'attack');
    toggleClass('canvas-wrap', 'zone-debuff', zoneType === 'weakAttack' || zoneType === 'weakDefense');
  }

  function refreshEquipmentPanel(p) {
    var container = el('equipment-slots');
    clearNode(container);
    if (!container) return;
    for (var i = 0; i < C.SLOTS.length; i++) {
      var slot = C.SLOTS[i];
      var item = p.equipment && p.equipment[slot];
      var slotEl = document.createElement('div');
      slotEl.className = 'equipment-slot' + (item
        ? ' equipped rarity-' + (item.rarity || 'common')
        : ' empty');
      var name = document.createElement('span');
      name.className = 'slot-name';
      name.textContent = C.SLOT_LABELS[slot];
      var value = document.createElement('span');
      value.className = 'slot-item';
      value.textContent = item
        ? item.name + (item.summary ? ' — ' + item.summary : '')
        : 'пусто';
      slotEl.appendChild(name);
      slotEl.appendChild(value);
      container.appendChild(slotEl);
    }
  }

  function refresh() {
    if (current !== 'game') return;
    var g = RK.GAME;
    if (!g || !g.player) return;
    var p = displayPlayer();
    if (!p) return;

    setText('stat-hp', p.hp + '/' + p.maxHp);
    var hpBar = el('bar-hp-fill');
    if (hpBar) hpBar.style.width = Math.max(0, (p.hp / p.maxHp) * 100) + '%';
    setText('stat-level', 'Ур. ' + p.level);
    var location = g.locationMode && RK.World ? RK.World.current() : null;
    setText('stat-floor', location
      ? location.name + ' — ' + (g.floor || 1)
      : 'Этаж ' + g.floor + '/' + C.MAX_FLOOR);
    setText('stat-gold', String(p.gold));
    setText('stat-keys', String(countBackpack(p, 'key')));

    refreshStatusLine(g, p);
    refreshCharacterPanel(g, p);
    refreshActionButtons(g, p);
    refreshEquipmentPanel(p);

    RK.Render.draw();
  }

  function renderClassList(container, mode) {
    clearNode(container);
    if (!container) return;
    var classes = RK.Classes.CLASS_DEFS;
    for (var classId in classes) {
      if (!Object.prototype.hasOwnProperty.call(classes, classId)) continue;
      var def = classes[classId];
      var row = document.createElement('div');
      row.className = (mode === 'shop' ? 'shop-class' : 'class-select-card') +
        (RK.Meta.data.selectedClass === classId ? ' selected' : '');
      var info = document.createElement('div');
      info.className = 'info';
      info.appendChild(bold(def.name));
      var classWeapon = def.ranged ? 'лук, арбалет (50/50)' : 'меч, топор, секира';
      [ 'Оружие: ' + classWeapon, def.passive, 'Навык: ' + def.skillName + ' — ' + def.skillText ].forEach(function (text) {
        var line = document.createElement('span');
        line.textContent = text;
        info.appendChild(line);
      });
      var selected = RK.Meta.data.selectedClass === classId;
      var actionBtn = makeButton('uiEquip', selected ? 'Выбрано' : 'Выбрать');
      actionBtn.disabled = selected;
      actionBtn.setAttribute('aria-pressed', selected ? 'true' : 'false');
      actionBtn.addEventListener('click', function (id) {
        return function () {
          if (RK.Meta.buyClass(id)) {
            if (mode === 'shop') showShop();
            else renderClassSelection();
            msg('Класс выбран: ' + RK.Classes.CLASS_DEFS[id].name);
          }
        };
      }(classId));
      row.appendChild(info);
      row.appendChild(actionBtn);
      container.appendChild(row);
    }
  }

  function renderClassSelection() {
    setText('class-select-bank', 'Сбережения: ' + RK.Meta.data.bank + ' золота');
    renderClassList(el('class-select-list'), 'selection');
  }

  function beginRun() {
    if (!pendingRun) return;
    var run = pendingRun;
    pendingRun = null;
    if (!RK.Meta.data.classes || !RK.Meta.data.classes[RK.Meta.data.selectedClass]) {
      RK.Meta.data.selectedClass = RK.Meta.data.classes && RK.Meta.data.classes.berserker ? 'berserker' : 'tank';
      RK.Meta.save();
    }
    clearLog();
    savePlayerName();
    if (run.mode === 'single') RK.Combat.newRun(run.options);
    else {
      if (!RK.Network || !RK.Network.isHost()) {
        show('menu');
        return;
      }
      if (RK.Network.startGame(Object.assign({}, run.options, {
        classId: RK.Meta.data.selectedClass || 'tank',
      }))) {
        pendingNetworkStart = true;
        show('menu');
      }
    }
  }

  function showClassSelection(run) {
    if (run.mode === 'network' && (!RK.Network || !RK.Network.isHost())) {
      setText('lan-status', 'Начать сетевой забег может только хост комнаты.');
      return;
    }
    pendingRun = run;
    renderClassSelection();
    show('class-select');
  }

  function showShop() {
    setText('shop-bank', 'Сбережения: ' + RK.Meta.data.bank + ' золота');
    var list = el('shop-list');
    clearNode(list);
    for (var i = 0; i < RK.Meta.UPGRADES.length; i++) {
      var u = RK.Meta.UPGRADES[i];
      var cost = RK.Meta.cost(u.id);
      var count = RK.Meta.data[u.id];
      var row = document.createElement('div');
      row.className = 'shop-row';
      var info = document.createElement('div');
      info.className = 'info';
      // Текст собирается узлами, а не склейкой HTML: перевод не превратится в XSS.
      info.appendChild(bold(u.name));
      var desc = document.createElement('span');
      desc.textContent = u.desc + ' (куплено: ' + count + ')';
      info.appendChild(desc);
      var btn = makeButton('uiBuy', 'Купить — ' + cost);
      btn.disabled = RK.Meta.data.bank < cost;
      btn.addEventListener('click', function (id) {
        return function () {
          if (RK.Meta.buy(id)) {
            showShop();
            msg('Улучшение куплено!');
          }
        };
      }(u.id));
      row.appendChild(info);
      row.appendChild(btn);
      list.appendChild(row);
    }

    renderClassList(el('shop-classes'), 'shop');
    show('shop');
  }

  function bold(text) {
    var node = document.createElement('b');
    node.textContent = text;
    return node;
  }

  function appendKillList(parent, title, kills) {
    var section = document.createElement('section');
    section.className = 'over-kill-section';
    var heading = document.createElement('h3');
    heading.textContent = title;
    section.appendChild(heading);

    var names = Object.keys(kills).sort(function (a, b) {
      return a.localeCompare(b, 'ru');
    });
    var list = document.createElement('ul');
    if (names.length === 0) {
      var empty = document.createElement('li');
      empty.textContent = 'Нет убийств';
      list.appendChild(empty);
    } else {
      for (var i = 0; i < names.length; i++) {
        var item = document.createElement('li');
        appendSpriteIcon(item, enemySpriteForName(names[i]), names[i]);
        var label = document.createElement('span');
        label.textContent = names[i] + ': ' + kills[names[i]];
        item.appendChild(label);
        list.appendChild(item);
      }
    }
    section.appendChild(list);
    parent.appendChild(section);
  }

  function appendBestItems(parent, foundItems) {
    var section = document.createElement('section');
    section.className = 'over-kill-section';
    var heading = document.createElement('h3');
    heading.textContent = 'Лучшие найденные предметы';
    section.appendChild(heading);

    var rankedItems = (foundItems || []).slice().sort(function (a, b) {
      var rarityDifference = (C.RARITY_ORDER[b.rarity] || 0) - (C.RARITY_ORDER[a.rarity] || 0);
      return rarityDifference || (b.value || 0) - (a.value || 0);
    }).slice(0, 5);
    var list = document.createElement('ul');
    if (!rankedItems.length) {
      var empty = document.createElement('li');
      empty.textContent = 'Ценные предметы не найдены';
      list.appendChild(empty);
    } else {
      for (var i = 0; i < rankedItems.length; i++) {
        var loot = rankedItems[i];
        var item = document.createElement('li');
        item.className = 'rarity-' + (loot.rarity || 'common');
        appendSpriteIcon(item, itemSprite(loot), loot.name);
        var label = document.createElement('span');
        label.textContent = (C.RARITY_NAMES[loot.rarity] || 'Предмет') + ': ' +
          loot.name + (loot.summary ? ' — ' + loot.summary : '') +
          ' (этаж ' + loot.floor + ')';
        item.appendChild(label);
        list.appendChild(item);
      }
    }
    section.appendChild(list);
    parent.appendChild(section);
  }

  function appendSpriteIcon(parent, spriteName, label) {
    var icon = document.createElement('canvas');
    icon.className = 'over-result-icon';
    icon.width = 32;
    icon.height = 32;
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-label', label);
    RK.Assets.draw(icon.getContext('2d'), spriteName, 0, 0, 32);
    parent.appendChild(icon);
  }

  function enemySpriteForName(name) {
    var definitions = RK.Entities && RK.Entities.DEFS;
    if (definitions) {
      for (var type in definitions) {
        if (definitions[type].name === name ||
            (definitions[type].enhancedAsset && typeof name === 'string' &&
              name.endsWith(' ' + definitions[type].name.toLowerCase()))) {
          return definitions[type].asset || type;
        }
      }
    }
    return 'boss';
  }

  function itemSprite(item) {
    return item.asset || C.SLOT_ASSETS[item.slot] || item.type || 'gold';
  }

  function over(win, floor, level, banked, stats, player) {
    var title = el('over-title');
    if (title) {
      title.textContent = win ? 'ПОБЕДА!' : 'ВЫ ПОГИБЛИ';
      title.style.color = win ? '#7ae582' : '#ff5252';
    }
    var statsEl = el('over-stats');
    if (!statsEl) return;
    clearNode(statsEl);
    [
      ['Достигнут этаж: ', floor],
      ['Уровень персонажа: ', level],
      ['Сбережено в банке: ', banked + ' золота'],
    ].forEach(function (row) {
      var line = document.createElement('div');
      line.appendChild(document.createTextNode(row[0]));
      line.appendChild(bold(row[1]));
      statsEl.appendChild(line);
    });
    if (player) {
      var character = document.createElement('div');
      character.className = 'over-character';
      character.textContent = (player.name || 'Игрок') + ' — ' + (player.className || 'Персонаж');
      statsEl.appendChild(character);
    }
    var bossKills = 0;
    for (var bossName in stats.bossKillsByName) {
      bossKills += stats.bossKillsByName[bossName];
    }
    var runSummary = document.createElement('div');
    runSummary.className = 'over-run-summary';
    var killed = document.createElement('div');
    killed.appendChild(bold('Убито врагов: '));
    killed.appendChild(document.createTextNode(
      stats.enemiesKilled + ' (обычных: ' + (stats.enemiesKilled - bossKills) +
      ', боссов: ' + bossKills + ')'));
    var damage = document.createElement('div');
    damage.appendChild(bold('Получено урона: '));
    damage.appendChild(document.createTextNode(String(stats.damageReceived)));
    runSummary.appendChild(killed);
    runSummary.appendChild(damage);
    statsEl.appendChild(runSummary);
    appendBestItems(statsEl, stats.foundItems);
    appendKillList(statsEl, 'Убийства врагов', stats.killsByName);
    appendKillList(statsEl, 'Убийства боссов', stats.bossKillsByName);
    show('over');
  }

  function onClick(id, handler) {
    var node = el(id);
    if (node) node.addEventListener('click', handler);
  }

  function onChange(id, handler) {
    var node = el(id);
    if (node) node.addEventListener('change', handler);
  }

  function initMenuControls() {
    var nameInput = el('player-name');
    if (nameInput && RK.Meta && RK.Meta.data) {
      nameInput.value = RK.Meta.data.playerName || 'Игрок';
    }
    var runOptions = function () {
      return { size: el('map-size').value, style: el('map-style').value };
    };
    var prepareSingleRun = function () {
      if (RK.Network && RK.Network.inRoom && RK.Network.inRoom()) {
        RK.Network.disconnect();
      }
      savePlayerName();
      showClassSelection({ mode: 'single', options: runOptions() });
    };
    onClick('btn-play', prepareSingleRun);
    onClick('btn-retry', prepareSingleRun);
    onClick('btn-class-select-back', function () {
      pendingRun = null;
      show('menu');
    });
    onClick('btn-class-select-start', beginRun);
    onClick('btn-shop', showShop);
    onClick('btn-shop-back', function () { show('menu'); });
    onClick('btn-help', function () { show('help'); });
    onClick('btn-help-back', function () { show('menu'); });
    onClick('btn-inventory', showInventory);
    onClick('btn-inventory-back', function () { show('game'); });
    onClick('btn-merchant-back', function () { show('game'); });
    onClick('btn-blacksmith-back', function () { show('game'); });
    onClick('btn-debug-room', function () {
      clearLog();
      savePlayerName();
      RK.Debug.open();
    });
  }

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
          pendingRun = null;
          RK.Network.joinRoom(roomCode, savePlayerName());
        };
      }(room.code));
      row.appendChild(joinButton);
      list.appendChild(row);
    }
  }

  function initLanControls() {
    onClick('btn-host-room', function () {
      pendingRun = null;
      RK.Network.createRoom(savePlayerName());
    });
    onClick('btn-join-room', function () {
      pendingRun = null;
      RK.Network.joinRoom(el('lan-room-code').value, savePlayerName());
    });
    onClick('btn-refresh-rooms', function () {
      RK.Network.refreshRooms();
      renderRoomList([], true);
    });
    onClick('btn-start-coop', function () {
      if (!RK.Network.isHost()) return;
      showClassSelection({ mode: 'network', options: { size: el('map-size').value, style: el('map-style').value } });
    });
    var form = el('chat-form');
    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var input = el('chat-input');
        var text = input.value.trim();
        if (!text || !RK.Network.chat(text)) return;
        input.value = '';
        chatStatus('');
      });
    }
    setChatEnabled(false);
  }

  function initHudControls() {
    onClick('btn-potion', function () { commit('usePotion', [], null); });
    onClick('btn-skill', function () { commit('activateClassSkill', [], null); });
    onClick('btn-rest', function () { perform('skipTurn', []); });
    onClick('btn-sound', function () {
      RK.Audio.setEnabled(!RK.Audio.isEnabled());
      refresh();
    });
    var debugForm = el('debug-stats-form');
    if (debugForm) {
      debugForm.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!this.reportValidity()) return;
        RK.Combat.setPlayerStats({
          hp: Number(el('debug-hp').value),
          maxHp: Number(el('debug-max-hp').value),
          atk: Number(el('debug-atk').value),
          def: Number(el('debug-def').value),
        });
      });
    }
  }

  function initTilesetControl() {
    var tilesetToggle = el('tileset-enabled');
    if (!tilesetToggle) return;
    tilesetToggle.checked = RK.Assets.enabled();
    onChange('tileset-enabled', function () {
      var useTileset = tilesetToggle.checked;
      tilesetToggle.disabled = true;
      refreshTilesetControl(useTileset ? 'Загрузка тайлсета…' : 'Переключение на встроенные тайлы…');
      RK.Assets.setEnabled(useTileset, function (error, loadedExternal) {
        tilesetToggle.disabled = false;
        tilesetToggle.checked = RK.Assets.enabled();
        if (error) {
          refreshTilesetControl('Настройка действует до закрытия страницы; сохранить её не удалось.', true);
        } else if (useTileset && !loadedExternal) {
          refreshTilesetControl('Тайлсет не найден — используются встроенные тайлы.', true);
        } else {
          refreshTilesetControl(useTileset ? 'Внешний тайлсет включён.' : 'Встроенные тайлы включены.', true);
        }
        // Запечённый слой пола нарисован прежними текстурами.
        if (RK.Render.invalidateFloorLayer) RK.Render.invalidateFloorLayer();
        refreshIcons();
        RK.Render.draw();
      });
    });
  }

  function initRenderModeButton() {
    var button = el('btn-render-mode');
    if (!button) return;
    var sync = function () {
      var mode = RK.Render.getMode();
      setButtonLabel('btn-render-mode', mode === 'ascii' ? 'Вид: ASCII' : 'Вид: графика');
      button.setAttribute('aria-pressed', mode === 'ascii' ? 'true' : 'false');
    };
    sync();
    onClick('btn-render-mode', function () {
      var nextMode = RK.Render.getMode() === 'ascii' ? 'graphics' : 'ascii';
      var saved = RK.Render.setMode(nextMode);
      sync();
      if (!saved) msg('Режим отображения изменён, но сохранить настройку не удалось.');
    });
  }

  function initDebugLogToggle() {
    var toggle = el('debug-log');
    if (!toggle) return;
    toggle.checked = debugLogEnabled;
    onChange('debug-log', function () { debugLogEnabled = toggle.checked; });
  }

  // Журнал сворачивается в узкую полосу с той же кнопкой — вернуть его можно одним кликом.
  function applyLogCollapsed() {
    toggleClass('log-panel', 'collapsed', logCollapsed);
    var button = el('btn-log-toggle');
    if (!button) return;
    button.setAttribute('aria-expanded', logCollapsed ? 'false' : 'true');
    button.title = logCollapsed ? 'Показать журнал' : 'Скрыть журнал';
    setButtonLabel('btn-log-toggle', logCollapsed ? 'Журнал' : 'Свернуть');
  }

  function initLogPanelToggle() {
    if (!el('btn-log-toggle')) return;
    splitButton(el('btn-log-toggle'), 'uiLog', 'Свернуть');
    staticButtonParts['btn-log-toggle'] = buttonParts.get(el('btn-log-toggle'));
    applyLogCollapsed();
    onClick('btn-log-toggle', function () {
      logCollapsed = !logCollapsed;
      applyLogCollapsed();
    });
  }

  function init() {
    assertRequiredElements();
    initMenuControls();
    // Иконки рисуются после разметки всех экранов: кнопка, созданная позже, осталась бы без иконки.
    decorateStaticButtons();
    initLanControls();
    initHudControls();
    initTilesetControl();
    initRenderModeButton();
    initDebugLogToggle();
    initLogPanelToggle();
  }

  function refreshTilesetControl(message, updateSelection) {
    var toggle = el('tileset-enabled');
    if (toggle && updateSelection) toggle.checked = RK.Assets.enabled();
    var status = el('tileset-status');
    if (status) status.textContent = message || '';
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

  RK.UI = {
    show: show,
    msg: function (text) { msg(text, debugLogEnabled || isImportantLog(text)); },
    narratorMsg: function (text) { narratorMsg(text, false); },
    clearLog: clearLog,
    chatMessage: chatMessage,
    chatStatus: chatStatus,
    chatEnabled: setChatEnabled,
    refresh: refresh,
    perform: perform,
    gameTooltip: gameTooltip,
    refreshTooltip: refreshTooltip,
    over: over,
    showShop: showShop,
    showInventory: showInventory,
    showMerchant: showMerchant,
    showBlacksmith: showBlacksmith,
    setInventorySort: function (mode) {
      inventorySort = mode || SORT_MODE_DEFAULT;
      if (current === 'inventory') renderInventoryScreen();
      return inventorySort;
    },
    setInventoryFilter: function (filter) {
      inventoryFilter = filter || FILTER_DEFAULT;
      if (current === 'inventory') renderInventoryScreen();
      return inventoryFilter;
    },
    inventorySort: function () { return inventorySort; },
    inventoryFilter: function () { return inventoryFilter; },
    refreshTilesetControl: refreshTilesetControl,
    refreshIcons: refreshIcons,
    init: init,
    networkStatus: function (message) {
      setText('lan-status', message || '');
    },
    networkDisconnected: function () {
      pendingRun = null;
      pendingNetworkStart = false;
      if (RK.Network && RK.Network.inRoom && RK.Network.inRoom()) return;
      var hostButton = el('btn-host-room');
      var joinButton = el('btn-join-room');
      var startButton = el('btn-start-coop');
      var browser = el('lan-browser');
      if (current === 'class-select') show('menu');
      if (hostButton) hostButton.disabled = false;
      if (joinButton) joinButton.disabled = false;
      if (startButton) startButton.disabled = true;
      if (browser) browser.classList.remove('hidden');
    },
    screen: function () {
      return current;
    },
    syncNetworkState: function () {
      if (current === 'inventory') renderInventoryScreen();
      else if (current === 'merchant') renderMerchantScreen();
      else if (current === 'blacksmith') renderBlacksmithScreen();
      else refresh();
    },
    showLobby: function (room, isHost) {
      pendingRun = null;
      var startingRun = pendingNetworkStart;
      pendingNetworkStart = false;
      if (!startingRun && current !== 'menu') show('menu');
      toggleClass('lan-lobby', 'hidden', false);
      toggleClass('lan-browser', 'hidden', true);
      setText('lan-room-display', room);
      setText('game-room-display', room);
      toggleClass('game-room-code', 'hidden', !isHost);
      toggleClass('btn-start-coop', 'hidden', !isHost);
      var startButton = el('btn-start-coop');
      if (startButton) startButton.disabled = !isHost;
      var hostButton = el('btn-host-room');
      var joinButton = el('btn-join-room');
      if (hostButton) hostButton.disabled = true;
      if (joinButton) joinButton.disabled = true;
    },
    networkRooms: function (rooms) {
      renderRoomList(rooms, false);
    },
    networkPlayers: function (players, isHost) {
      var lobby = el('lan-player-list');
      var gameList = el('game-player-list');
      clearNode(lobby);
      clearNode(gameList);
      for (var i = 0; i < players.length; i++) {
        var player = players[i];
        var line = document.createElement('div');
        line.className = 'lan-player' + (player.connected ? '' : ' disconnected');
        line.textContent = player.name + (player.host ? ' — хост' : '') +
          (player.connected ? '' : ' — отключён');
        lobby.appendChild(line);
        gameList.appendChild(line.cloneNode(true));
      }
      gameList.classList.toggle('hidden', !players.length);
      toggleClass('btn-start-coop', 'hidden', !isHost);
    },
  };

})();