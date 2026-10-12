(function () {
  var C = RK.CONFIG;
  var current = 'menu';

  var SCREENS = ['menu', 'shop', 'inventory', 'merchant', 'blacksmith', 'game', 'over', 'help'];

  var SORT_MODES = [
    { id: 'value', label: 'Ценность' },
    { id: 'rarity', label: 'Редкость' },
    { id: 'type', label: 'Тип' },
    { id: 'none', label: 'Как есть' },
  ];
  var SORT_MODE_DEFAULT = 'value';

  var FILTERS = [
    { id: 'all', label: 'Всё' },
    { id: 'gear', label: 'Снаряжение' },
    { id: 'weapon', label: 'Оружие' },
    { id: 'potion', label: 'Зелья' },
    { id: 'trap', label: 'Ловушки' },
    { id: 'key', label: 'Ключи' },
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

  // Разрешение элементов один раз: страницы перестраиваются целиком и
  // дёргают getElementById десятки раз за открытие.
  var domCache = Object.create(null);

  function el(id) {
    var node = domCache[id];
    if (node === undefined) node = domCache[id] = document.getElementById(id) || null;
    return node;
  }

  // Безопасная запись: отсутствующий элемент не должен ронять refresh.
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

  // replaceChildren доступен в браузере; в тестовых стабах DOM минимален,
  // поэтому остаётся запасной путь через innerHTML.
  function clearNode(node) {
    if (!node) return;
    if (typeof node.replaceChildren === 'function') node.replaceChildren();
    else node.innerHTML = '';
  }

  // Идентификаторы, без которых игра не запустится. Проверяются один раз
  // в init(), чтобы опечатка в разметке не превращалась в ошибку в рантайме.
  var REQUIRED_IDS = [
    'log', 'chat-form', 'chat-input', 'btn-play', 'btn-retry', 'btn-shop', 'btn-shop-back',
    'btn-inventory', 'btn-inventory-back', 'btn-merchant-back', 'btn-blacksmith-back',
    'btn-potion', 'btn-skill', 'btn-rest', 'btn-sound', 'btn-render-mode',
    'debug-stats-form', 'btn-host-room', 'btn-join-room', 'btn-start-coop',
    'btn-help', 'btn-help-back', 'player-name', 'map-size', 'map-style',
  ];

  function assertRequiredElements() {
    var missing = REQUIRED_IDS.filter(function (id) { return !el(id); });
    if (missing.length) throw new Error('ui: отсутствуют элементы разметки: ' + missing.join(', '));
  }

  function displayPlayer() {
    var g = RK.GAME;
    if (!g) return null;
    var focusPlayer = RK.Network && RK.Network.focusPlayer ? RK.Network.focusPlayer() : null;
    return focusPlayer || g.player;
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

  // Единая точка диспетчеризации действий для UI и ввода. Сеть обрабатывается
  // первой: если действие ушло хосту или уже выполняется локально, стоп.
  function perform(action, args) {
    if (RK.Network && RK.Network.isRemoteBusy && RK.Network.isRemoteBusy()) return;
    if (RK.Network && RK.Network.action(action, args) !== null) return;
    if (RK.Network && RK.Network.performLocalAction(action, args)) return;
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

  // Сортировка и фильтры строятся одинаково: ряд кнопок-переключателей.
  function renderButtonGroup(containerId, table, currentId, onSelect) {
    var container = el(containerId);
    clearNode(container);
    if (!container) return;
    for (var i = 0; i < table.length; i++) {
      var entry = table[i];
      var button = document.createElement('button');
      button.className = 'inventory-control' + (currentId === entry.id ? ' active' : '');
      button.textContent = entry.label;
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
        var takeButton = document.createElement('button');
        takeButton.textContent = 'Снять';
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

  // Действие, затем перерисовка нужного экрана. Раньше тройка
  // «perform → render → refresh» повторялась в девяти местах, а refresh()
  // внутри combat.js уже заканчивается полным реpaint канваса.
  //
  // Экран инвентаря перестраивается один раз: либо rerender, либо общий
  // случай ниже, когда действие нажали с другого экрана.
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
      var useBtn = document.createElement('button');
      useBtn.textContent = itemButtonLabel(loot);
      useBtn.disabled = loot.kind === 'key' || !!blockReason;
      if (blockReason) useBtn.title = blockReason;
      useBtn.addEventListener('click', function (idx) {
        return function (event) {
          event.stopPropagation();
          commit('useInventoryItem', [idx], renderInventoryScreen);
        };
      }(index));
      var dropBtn = document.createElement('button');
      dropBtn.textContent = 'Выбросить';
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

  // show() сам перестраивает нужный экран, поэтому повторный вызов рендера
  // здесь был бы второй перестройкой DOM с переподпиской обработчиков.
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
      var btn = document.createElement('button');
      btn.textContent = 'Принять задание';
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
      var button = document.createElement('button');
      button.textContent = 'Продать — ' + RK.Combat.getSellValue(item);
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
    var md = '# Рогалик\n\nБраузерный roguelite с процедурными этажами, боем, лутом и кооперативом по LAN. Открыть `rougelite.html` в браузере.\n\n## Особенности\n\n- процедурная генерация этажей (камень/пещера/склеп), враги, боссы, классы, уровни\n- **классы**: танк (защита и отражение урона), берсерк (ярость и лечение от урона), лучник (стрельба на расстоянии видимости, чутьё на ловушки)\n- инвентарь с сортировкой по ценности/редкости/типу и фильтрами, экипировка, постоянные улучшения, банк золота\n- **таверна** — безопасная комната с торговцем и кузнецом (враги могут заходить)\n- **кузнец** — улучшение надетой экипировки до 5 уровней (+15% базовых статов/уровень)\n- **торговец** — задания (убить демонов / найти предметы) за золото\n- **озерца и ручьи** в больших комнатах (декор, не блокируют проход)\n- **ловушки** в комнатах (штыри, иглы, пламя — взвод, отмычка, срабатывание); лучник видит их за 2 клетки, обезвреживает чаще и может переставить свою\n- одиночный режим и LAN-кооператив до 4 игроков (состояние на хосте)\n- сохранение прогресса и комнаты между перезапусками\n- ASCII / пиксельная графика (переключение кнопкой «Вид»), F11 — фуллскрин\n\n## Классы\n\n| Класс | Оружие | Особенности |\n|---|---|---|\n| Танк | меч, топор | защита и здоровье, «Щитовой ответ» |\n| Берсерк | меч, топор | атака и лечение от урона, «Безумие» |\n| Лучник | лук, арбалет | выстрел кликом мыши на расстоянии видимости, чутьё на ловушки, «Прицельный выстрел» |\n\n## Управление\n\n| Действие | Клавиши |\n|---|---|\n| Движение | WASD / стрелки / мышь / нумпад |\n| Выстрел (лучник) | клик мышью по врагу в пределах видимости |\n| Взаимодействие (двери, сундуки, NPC) | `E` |\n| Вскрыть замок / обезвредить ловушку | `L` |\n| Выбить / сломать | `F` |\n| Зелье лечения | `R` |\n| Навык класса | `Q` |\n| Пропустить ход | `5` / `.` |\n| Выход из комнаты отладки | `Esc` |\n\n## Запуск\n\n1. **Одиночная игра**: задать имя героя → открыть `rougelite.html`\n2. **LAN-кооператив**: Node.js 18+ → `start.bat` / `start.sh` на хосте → остальные открывают адрес из консоли, вводят код комнаты и имя\n3. **Тесты**: `node --test` (нужен `ws` из `package.json`)\n\n## Ресурсы\n\nВнешние PNG-тайлсеты 16×16 (например `assets/tiny-dungeon.png`). Порядок тайлов — `KENNEY_MAP` в `js/assets.js`. Кастомные полы/стены: `floor-dark.png`, `wall-dark.png` (этажи 4–6), `floor-deep.png`, `wall-deep.png` (этажи 7–10). Проверяйте лицензии (CC0, CC-BY и др.).';
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
      var btn = document.createElement('button');
      btn.textContent = 'Улучшить (+' + (item.upgradeLevel + 1) + ') — ' + cost + ' золота';
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
    var form = el('chat-form');
    var button = form && form.querySelector ? form.querySelector('button') : null;
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
      skillButton.textContent = clsInfo
        ? clsInfo.skillName + ' (Q)' + (p.classSkillCooldown > 0 ? ' — ' + p.classSkillCooldown + ' хд' : '')
        : 'Навык (Q)';
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
      potionButton.textContent = 'Выпить зелье (R) ×' + potionCount;
      potionButton.disabled = potionCount === 0;
    }
    var soundOn = !!(RK.Audio && RK.Audio.isEnabled());
    setText('btn-sound', soundOn ? 'Звук: вкл.' : 'Звук: выкл.');
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

    setText('stat-hp', 'HP ' + p.hp + '/' + p.maxHp);
    var hpBar = el('bar-hp-fill');
    if (hpBar) hpBar.style.width = Math.max(0, (p.hp / p.maxHp) * 100) + '%';
    setText('stat-level', 'Ур. ' + p.level);
    setText('stat-floor', 'Этаж ' + g.floor + '/' + C.MAX_FLOOR);
    setText('stat-gold', 'Золото ' + p.gold);
    setText('stat-keys', 'Ключи ' + countBackpack(p, 'key'));

    refreshStatusLine(g, p);
    refreshCharacterPanel(g, p);
    refreshActionButtons(g, p);
    refreshEquipmentPanel(p);

    RK.Render.draw();
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
      // Данные берутся из статических описаний, но собираются узлами, а не
      // склейкой HTML: так добавление перевода не превратится в XSS.
      info.appendChild(bold(u.name));
      var desc = document.createElement('span');
      desc.textContent = u.desc + ' (куплено: ' + count + ')';
      info.appendChild(desc);
      var btn = document.createElement('button');
      btn.textContent = 'Купить — ' + cost;
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

    var classList = el('shop-classes');
    clearNode(classList);
    for (var classId in RK.Classes.CLASS_DEFS) {
      var def = RK.Classes.CLASS_DEFS[classId];
      var rowClass = document.createElement('div');
      rowClass.className = 'shop-class';
      var infoClass = document.createElement('div');
      infoClass.className = 'info';
      infoClass.appendChild(bold(def.name));
      var classWeapon = def.ranged ? 'лук, арбалет (50/50)' : 'меч, топор, секира';
      [ 'Оружие: ' + classWeapon, def.passive, 'Навык: ' + def.skillName ].forEach(function (text) {
        var line = document.createElement('span');
        line.textContent = text;
        infoClass.appendChild(line);
      });
      var actionBtn = document.createElement('button');
      var owned = !!(RK.Meta.data.classes && RK.Meta.data.classes[classId]);
      var selected = RK.Meta.data.selectedClass === classId;
      actionBtn.textContent = owned ? (selected ? 'Выбрано' : 'Выбрать') : 'Купить — ' + def.cost;
      actionBtn.disabled = (!owned && RK.Meta.data.bank < def.cost) || (owned && selected);
      actionBtn.addEventListener('click', function (id) {
        return function () {
          if (RK.Meta.buyClass(id)) {
            showShop();
            msg('Класс обновлён: ' + RK.Classes.CLASS_DEFS[id].name);
          } else {
            msg('Недостаточно золота для покупки класса.');
          }
        };
      }(classId));
      rowClass.appendChild(infoClass);
      rowClass.appendChild(actionBtn);
      classList.appendChild(rowClass);
    }
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
    var startRun = function () {
      clearLog();
      savePlayerName();
      RK.Combat.newRun(runOptions());
    };
    onClick('btn-play', startRun);
    onClick('btn-retry', startRun);
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

  function initLanControls() {
    onClick('btn-host-room', function () { RK.Network.createRoom(savePlayerName()); });
    onClick('btn-join-room', function () {
      RK.Network.joinRoom(el('lan-room-code').value, savePlayerName());
    });
    onClick('btn-start-coop', function () {
      if (!RK.Network.isHost()) return;
      clearLog();
      RK.Network.startGame({ size: el('map-size').value, style: el('map-style').value });
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
        RK.Render.draw();
      });
    });
  }

  function initRenderModeButton() {
    var button = el('btn-render-mode');
    if (!button) return;
    var sync = function () {
      var mode = RK.Render.getMode();
      button.textContent = mode === 'ascii' ? 'Вид: ASCII' : 'Вид: графика';
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

  function init() {
    assertRequiredElements();
    initMenuControls();
    initLanControls();
    initHudControls();
    initTilesetControl();
    initRenderModeButton();
    initDebugLogToggle();
  }

  function refreshTilesetControl(message, updateSelection) {
    var toggle = el('tileset-enabled');
    if (toggle && updateSelection) toggle.checked = RK.Assets.enabled();
    var status = el('tileset-status');
    if (status) status.textContent = message || '';
  }

  // Тултип под курсором. Раньше он вызывался прямо из render.js внутри каждого
  // draw() и читал getBoundingClientRect() у canvas-wrap — это форсировало
  // reflow в каждом кадре и связывало слой отрисовки с DOM.
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

  // Вызывается из render.js в конце кадра: один источник правды о том, что
  // сейчас под курсором, и единственное место, где canvas трогает DOM.
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
    init: init,
    networkStatus: function (message) {
      setText('lan-status', message || '');
    },
    networkDisconnected: function () {
      var hostButton = el('btn-host-room');
      var joinButton = el('btn-join-room');
      var startButton = el('btn-start-coop');
      if (hostButton) hostButton.disabled = false;
      if (joinButton) joinButton.disabled = false;
      if (startButton) startButton.disabled = true;
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
      toggleClass('lan-lobby', 'hidden', false);
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