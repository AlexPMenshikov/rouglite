(function () {
  var C = RK.CONFIG;
  var current = 'menu';

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

  var inventorySort = SORT_MODE_DEFAULT;
  var inventoryFilter = FILTER_DEFAULT;
  var debugLogEnabled = false;
  var MAX_LOG_ENTRIES = 250;
  var MAX_CHAT_ENTRIES = 100;

  function el(id) {
    return document.getElementById(id);
  }

  function displayPlayer() {
    var g = RK.GAME;
    if (!g) return null;
    var focusPlayer = RK.Network && RK.Network.focusPlayer ? RK.Network.focusPlayer() : null;
    return focusPlayer || g.player;
  }

  function savePlayerName() {
    var input = el('player-name');
    var name = input ? input.value.trim().slice(0, 18) : '';
    name = name || 'Игрок';
    if (RK.Meta && RK.Meta.data) {
      RK.Meta.data.playerName = name;
      if (RK.Meta.save) RK.Meta.save();
    }
    return name;
  }

  function perform(action, args) {
    if (RK.Network && RK.Network.isRemoteBusy()) return;
    if (RK.Network && RK.Network.action(action, args) !== null) return;
    if (RK.Network && RK.Network.performLocalAction(action, args)) return;
    RK.Combat[action].apply(null, args || []);
  }

  function show(name) {
    current = name;
    var names = ['menu', 'shop', 'inventory', 'merchant', 'blacksmith', 'game', 'over', 'debug', 'help'];
    for (var i = 0; i < names.length; i++) {
      var screen = el('screen-' + names[i]);
      if (screen) screen.classList.toggle('hidden', names[i] !== name);
    }
    if (name !== 'game') {
      RK.hover = null;
      RK.hoverPath = null;
    }
    if (name === 'inventory') {
      renderInventoryScreen();
    } else if (name === 'blacksmith') {
      renderBlacksmithScreen();
    } else if (name === 'help') {
      renderHelpScreen();
    }
    refresh();
  }

  function rarityRank(item) {
    var order = (RK.Items && RK.Items.RARITY_ORDER) || {};
    return order[item.rarity || 'common'] || 0;
  }

  function itemValue(item) {
    if (!item) return 0;
    var base = item.value || 0;
    if (item.kind === 'gold') base += item.amt || 0;
    return base;
  }

  function itemKindRank(item) {
    var kind = item.kind || 'loot';
    if (kind === 'loot') {
      var slots = ['weapon', 'head', 'armor', 'ring', 'amulet', 'boots'];
      var slotRank = slots.indexOf(item.slot);
      return slotRank == null ? 6 : slotRank;
    }
    return KIND_ORDER[kind] == null ? 11 : KIND_ORDER[kind];
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

  function renderInventoryControls() {
    var sortEl = el('inventory-sort-modes');
    if (sortEl) {
      sortEl.innerHTML = '';
      for (var i = 0; i < SORT_MODES.length; i++) {
        var mode = SORT_MODES[i];
        var btn = document.createElement('button');
        btn.className = 'inventory-control' + (inventorySort === mode.id ? ' active' : '');
        btn.textContent = mode.label;
        btn.setAttribute('aria-pressed', inventorySort === mode.id ? 'true' : 'false');
        btn.addEventListener('click', function (id) {
          return function () {
            inventorySort = id;
            renderInventoryScreen();
          };
        }(mode.id));
        sortEl.appendChild(btn);
      }
    }
    var filterEl = el('inventory-filters');
    if (filterEl) {
      filterEl.innerHTML = '';
      for (var f = 0; f < FILTERS.length; f++) {
        var filter = FILTERS[f];
        var filterBtn = document.createElement('button');
        filterBtn.className = 'inventory-control' + (inventoryFilter === filter.id ? ' active' : '');
        filterBtn.textContent = filter.label;
        filterBtn.setAttribute('aria-pressed', inventoryFilter === filter.id ? 'true' : 'false');
        filterBtn.addEventListener('click', function (id) {
          return function () {
            inventoryFilter = id;
            renderInventoryScreen();
          };
        }(filter.id));
        filterEl.appendChild(filterBtn);
      }
    }
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

  function renderInventoryScreen() {
    var g = RK.GAME || null;
    var p = g ? displayPlayer() : null;
    var equipmentEl = el('inventory-equipment-slots');
    var listEl = el('inventory-backpack-list');
    if (!p || !equipmentEl || !listEl) return;

    renderInventoryControls();

    equipmentEl.innerHTML = '';
    var slotOrder = ['weapon', 'head', 'armor', 'ring', 'amulet', 'boots'];
    var slotLabels = {
      weapon: 'Оружие',
      head: 'Шлем',
      armor: 'Броня',
      ring: 'Кольцо',
      amulet: 'Амулет',
      boots: 'Сапоги'
    };
    var bodyParts = {
      weapon: 'в руку',
      head: 'на голову',
      armor: 'на туловище',
      ring: 'на палец',
      amulet: 'на шею',
      boots: 'на ноги',
    };

    for (var slotIndex = 0; slotIndex < slotOrder.length; slotIndex++) {
      var slot = slotOrder[slotIndex];
      var item = p.equipment && p.equipment[slot];
      var row = document.createElement('div');
      row.className = 'inventory-slot-item';
      var slotName = document.createElement('span');
      slotName.className = 'slot-name';
      slotName.textContent = slotLabels[slot];
      var slotValue = document.createElement('span');
      slotValue.className = 'slot-item';
      if (item) {
        row.classList.add('rarity-' + (item.rarity || 'common'));
        slotValue.textContent = item.name + (item.summary ? ' — ' + item.summary : '');
        var takeBtn = document.createElement('button');
        takeBtn.textContent = 'Снять';
        takeBtn.addEventListener('click', function (slotId) {
          return function (ev) {
            ev.stopPropagation();
            perform('unequipSlot', [slotId]);
            renderInventoryScreen();
            RK.UI.refresh();
          };
        }(slot));
        row.appendChild(slotName);
        row.appendChild(slotValue);
        row.appendChild(takeBtn);
      } else {
        slotValue.textContent = 'пусто';
        row.appendChild(slotName);
        row.appendChild(slotValue);
      }
      equipmentEl.appendChild(row);
    }

    listEl.innerHTML = '';
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
      if (loot.kind === 'loot' && bodyParts[loot.slot]) {
        var equipmentHint = document.createElement('small');
        equipmentHint.className = 'equip-hint';
        equipmentHint.textContent = 'Надевается ' + bodyParts[loot.slot];
        label.appendChild(equipmentHint);
        label.setAttribute('title', equipmentHint.textContent);
      }
      var blockReason = equipBlockReason(p, loot);
      if (blockReason) {
        var blockHint = document.createElement('small');
        blockHint.className = 'equip-hint blocked';
        blockHint.textContent = blockReason;
        label.appendChild(blockHint);
        label.setAttribute('title', blockReason);
        rowItem.classList.add('blocked');
      }
      var actions = document.createElement('div');
      actions.className = 'actions';
      var useBtn = document.createElement('button');
      useBtn.textContent = itemButtonLabel(loot);
      useBtn.disabled = loot.kind === 'key' || !!blockReason;
      if (blockReason) useBtn.title = blockReason;
      useBtn.addEventListener('click', function (idx) {
        return function (ev) {
          ev.stopPropagation();
          perform('useInventoryItem', [idx]);
          renderInventoryScreen();
          RK.UI.refresh();
        };
      }(index));
      var dropBtn = document.createElement('button');
      dropBtn.textContent = 'Выбросить';
      dropBtn.addEventListener('click', function (idx) {
        return function (ev) {
          ev.stopPropagation();
          perform('dropInventoryItem', [idx]);
          renderInventoryScreen();
          RK.UI.refresh();
        };
      }(index));
      actions.appendChild(useBtn);
      actions.appendChild(dropBtn);
      rowItem.appendChild(label);
      rowItem.appendChild(actions);
      listEl.appendChild(rowItem);
    }
  }

  function showInventory() {
    renderInventoryScreen();
    show('inventory');
  }

  function renderMerchantScreen() {
    var player = RK.GAME && RK.GAME.player;
    var g = RK.GAME;
    var list = el('merchant-inventory');
    var questOfferEl = el('merchant-quest-offer');
    if (!player || !list) return;
    el('merchant-gold').textContent = 'У вас: ' + player.gold + ' золота';
    list.innerHTML = '';
    if (questOfferEl) questOfferEl.innerHTML = '';

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
        perform('acceptQuest', []);
        renderMerchantScreen();
        refresh();
      });
      offerDiv.appendChild(name);
      offerDiv.appendChild(btn);
      if (questOfferEl) questOfferEl.appendChild(offerDiv);
    }

    function addSaleRow(item, label, onSell) {
      var row = document.createElement('div');
      row.className = 'merchant-row rarity-' + (item.rarity || 'common');
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = label + (item.summary ? ' — ' + item.summary : '');
      var button = document.createElement('button');
      button.textContent = 'Продать — ' + RK.Combat.getSellValue(item);
      button.addEventListener('click', function () {
        onSell();
        renderMerchantScreen();
        refresh();
      });
      row.appendChild(name);
      row.appendChild(button);
      list.appendChild(row);
    }

    var backpack = player.backpack || [];
    var equippedItems = Object.keys(player.equipment || {}).map(function (slot) {
      return player.equipment[slot];
    });
    function canSell(item) {
      return !item.equipped && equippedItems.indexOf(item) === -1;
    }
    var sellEntries = sortedEntries(backpack, SORT_MODE_DEFAULT, 'all').filter(function (entry) {
      return canSell(entry.item);
    });
    for (var i = 0; i < sellEntries.length; i++) {
      var sellable = sellEntries[i].item;
      addSaleRow(sellable, (sellable.name || 'Предмет') +
        (sellable.count > 1 ? ' ×' + sellable.count : ''),
        function (index) {
          return function () { perform('sellInventoryItem', [index]); };
        }(sellEntries[i].index));
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
    renderBlacksmithScreen();
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
    var goldEl = el('blacksmith-gold');
    if (!p || !listEl || !goldEl) return;
    goldEl.textContent = 'Ваше золото: ' + p.gold;
    listEl.innerHTML = '';

    var slotOrder = ['weapon', 'head', 'armor', 'ring', 'amulet', 'boots'];
    var slotLabels = {
      weapon: 'Оружие',
      head: 'Шлем',
      armor: 'Броня',
      ring: 'Кольцо',
      amulet: 'Амулет',
      boots: 'Сапоги'
    };

    var hasUpgradable = false;
    for (var si = 0; si < slotOrder.length; si++) {
      var slot = slotOrder[si];
      var item = p.equipment && p.equipment[slot];
      if (!item || !item.baseStats || item.upgradeLevel >= C.UPGRADE_MAX) continue;
      hasUpgradable = true;
      var cost = RK.Items.getUpgradeCost(item);
      var row = document.createElement('div');
      row.className = 'merchant-row rarity-' + (item.rarity || 'common');
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = slotLabels[slot] + ': ' + item.name + (item.summary ? ' — ' + item.summary : '');
      var btn = document.createElement('button');
      btn.textContent = 'Улучшить (+' + (item.upgradeLevel + 1) + ') — ' + cost + ' золота';
      btn.disabled = p.gold < cost;
      btn.addEventListener('click', function (s) {
        return function () {
          perform('upgradeEquipment', [s]);
          renderBlacksmithScreen();
          refresh();
        };
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
    name.textContent = String(message.name || 'Игрок').slice(0, 18) + ': ';
    entry.appendChild(name);
    entry.appendChild(document.createTextNode(String(message.text || '').slice(0, 280)));
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
    var log = el('log');
    if (log) log.innerHTML = '';
  }

  function isImportantLog(text) {
    return /уров|побед|пораж|смерт|босс|этаж|задани|подключ|отключ|получ|потер|откры|найден|подобран|ловушк|победил|умер|достиг/i.test(text);
  }

  function xpNeed(level) {
    return C.XP_BASE + (level - 1) * C.XP_GROWTH;
  }

  function refresh() {
    if (current !== 'game' && current !== 'debug') return;
    var g = RK.GAME;
    if (!g || !g.player) return;
    var p = displayPlayer();
    if (!p) return;
    el('stat-hp').innerHTML = 'HP ' + p.hp + '/' + p.maxHp;
    var bar = el('bar-hp-fill');
    if (bar) bar.style.width = Math.max(0, (p.hp / p.maxHp) * 100) + '%';
    el('stat-level').textContent = 'Ур. ' + p.level;
    el('stat-floor').textContent = 'Этаж ' + g.floor + '/' + C.MAX_FLOOR;
    var statuses = [];
    if (p.burningTurns > 0) statuses.push('Горение ' + p.burningTurns);
    if (p.preciseShots > 0) statuses.push('Прицел ' + p.preciseShots);
    if (p.rageTurns > 0) statuses.push('Ярость ' + p.rageTurns);
    if (p.reflectShield > 0) statuses.push('Щит ' + p.reflectShield);
    el('stat-status').textContent = statuses.join(' · ');
    el('stat-gold').textContent = 'Золото ' + p.gold;
    var keyCount = 0;
    for (var keyIndex = 0; keyIndex < (p.backpack || []).length; keyIndex++) {
      if (p.backpack[keyIndex].kind === 'key') keyCount += p.backpack[keyIndex].count || 1;
    }
    el('stat-keys').textContent = 'Ключи ' + keyCount;
    var quest = g.quest;
    el('stat-quest').textContent = quest
      ? 'Задание: ' + quest.description + ' (' + (quest.completed ? 'выполнено' : quest.progress + '/' + quest.target) + ')'
      : '';
    el('stat-player-name').textContent = p.name || 'Игрок';
    el('stat-class').textContent = p.className || '—';

    var clsInfo = RK.Classes && RK.Classes.getClassDef ? RK.Classes.getClassDef(p.classId || 'tank') : null;
    var skillText = clsInfo ? clsInfo.skillName + (p.classSkillCooldown > 0 ? ' (' + p.classSkillCooldown + ' хд)' : '') : '—';
    el('stat-skill').textContent = skillText;
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
    el('stat-atk').textContent = atkExtra
      ? p.atk + ' (' + (atkExtra > 0 ? '+' : '') + atkExtra + ')'
      : String(p.atk);
    el('stat-def').textContent = defExtra
      ? p.def + ' (' + (defExtra > 0 ? '+' : '') + defExtra + ')'
      : String(p.def);
    var need = xpNeed(p.level);
    el('stat-xp').textContent = p.xp + ' / ' + need;
    var xpBar = el('bar-xp-fill');
    if (xpBar) xpBar.style.width = Math.max(0, Math.min(100, (p.xp / need) * 100)) + '%';
    el('stat-potion').textContent = '+' + p.potionHeal + ' HP';
    var potionCount = 0;
    var backpack = p.backpack || [];
    for (var potionIndex = 0; potionIndex < backpack.length; potionIndex++) {
      if (backpack[potionIndex].kind === 'potion') potionCount += backpack[potionIndex].count || 1;
    }
    var potionButton = el('btn-potion');
    potionButton.textContent = 'Выпить зелье (R) ×' + potionCount;
    potionButton.disabled = potionCount === 0;

    var equipmentEl = el('equipment-slots');
    equipmentEl.innerHTML = '';
    var slotOrder = ['weapon', 'head', 'armor', 'ring', 'amulet', 'boots'];
    var slotLabels = {
      weapon: 'Оружие',
      head: 'Шлем',
      armor: 'Броня',
      ring: 'Кольцо',
      amulet: 'Амулет',
      boots: 'Сапоги',
    };
    for (var slotIndex = 0; slotIndex < slotOrder.length; slotIndex++) {
      var slot = slotOrder[slotIndex];
      var equippedItem = p.equipment && p.equipment[slot];
      var slotEl = document.createElement('div');
      slotEl.className = 'equipment-slot' + (equippedItem
        ? ' equipped rarity-' + (equippedItem.rarity || 'common')
        : ' empty');
      var slotName = document.createElement('span');
      slotName.className = 'slot-name';
      slotName.textContent = slotLabels[slot];
      var slotValue = document.createElement('span');
      slotValue.className = 'slot-item';
      slotValue.textContent = equippedItem
        ? equippedItem.name + (equippedItem.summary ? ' — ' + equippedItem.summary : '')
        : 'пусто';
      slotEl.appendChild(slotName);
      slotEl.appendChild(slotValue);
      equipmentEl.appendChild(slotEl);
    }

    var canvasWrap = el('canvas-wrap');
    var playerZone = RK.Combat.getZoneAt(p.x, p.y);
    canvasWrap.classList.toggle('zone-buff', !!playerZone &&
      (playerZone.type === 'regen' || playerZone.type === 'attack'));
    canvasWrap.classList.toggle('zone-debuff', !!playerZone &&
      (playerZone.type === 'weakAttack' || playerZone.type === 'weakDefense'));
    var soundButton = el('btn-sound');
    if (soundButton) {
      soundButton.textContent = RK.Audio && RK.Audio.isEnabled() ? 'Звук: вкл.' : 'Звук: выкл.';
      soundButton.setAttribute('aria-pressed', RK.Audio && RK.Audio.isEnabled() ? 'true' : 'false');
    }

    el('stat-turn').textContent = String(g.turn);

    el('debug-hp').value = String(p.hp);
    el('debug-max-hp').value = String(p.maxHp);
    el('debug-atk').value = String(p.atk);
    el('debug-def').value = String(p.def);

    var ruleEl = el('stat-narrator-rule');
    if (ruleEl && RK.Narrator) {
      var rules = RK.Narrator.activeRulesSummary();
      ruleEl.textContent = rules || '—';
    }

    RK.Render.draw();
  }

  function showShop() {
    el('shop-bank').textContent = 'Сбережения: ' + RK.Meta.data.bank + ' золота';
    var list = el('shop-list');
    list.innerHTML = '';
    for (var i = 0; i < RK.Meta.UPGRADES.length; i++) {
      var u = RK.Meta.UPGRADES[i];
      var cost = RK.Meta.cost(u.id);
      var count = RK.Meta.data[u.id];
      var row = document.createElement('div');
      row.className = 'shop-row';
      var info = document.createElement('div');
      info.className = 'info';
      info.innerHTML = '<b>' + u.name + '</b> <span>' + u.desc + ' (куплено: ' + count + ')</span>';
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
    classList.innerHTML = '';
    for (var classId in RK.Classes.CLASS_DEFS) {
      var def = RK.Classes.CLASS_DEFS[classId];
      var rowClass = document.createElement('div');
      rowClass.className = 'shop-class';
      var infoClass = document.createElement('div');
      infoClass.className = 'info';
      var classWeapon = def.ranged ? 'лук, арбалет (50/50)' : 'меч, топор, секира';
      infoClass.innerHTML = '<b>' + def.name + '</b><span>Оружие: ' + classWeapon + '</span><span>' +
        def.passive + '</span><span>Навык: ' + def.skillName + '</span>';
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

    var rarityOrder = { common: 0, rare: 1, epic: 2, legendary: 3 };
    var rarityNames = {
      common: 'Обычный',
      rare: 'Редкий',
      epic: 'Эпический',
      legendary: 'Легендарный',
    };
    var rankedItems = (foundItems || []).slice().sort(function (a, b) {
      var rarityDifference = (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0);
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
        label.textContent = (rarityNames[loot.rarity] || 'Предмет') + ': ' +
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
    var slotSprites = {
      weapon: 'sword',
      head: 'head',
      armor: 'armor',
      ring: 'ring',
      amulet: 'amulet',
      boots: 'boots',
    };
    return item.asset || slotSprites[item.slot] || item.type || 'gold';
  }

  function over(win, floor, level, banked, stats, player) {
    el('over-title').textContent = win ? 'ПОБЕДА!' : 'ВЫ ПОГИБЛИ';
    el('over-title').style.color = win ? '#7ae582' : '#ff5252';
    var statsEl = el('over-stats');
    statsEl.innerHTML =
      'Достигнут этаж: <b>' + floor + '</b><br>' +
      'Уровень персонажа: <b>' + level + '</b><br>' +
      'Сбережено в банке: <b>' + banked + '</b> золота';
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
    runSummary.innerHTML =
      '<b>Убито врагов:</b> ' + stats.enemiesKilled +
      ' (обычных: ' + (stats.enemiesKilled - bossKills) + ', боссов: ' + bossKills + ')' +
      '<br><b>Получено урона:</b> ' + stats.damageReceived;
    statsEl.appendChild(runSummary);
    appendBestItems(statsEl, stats.foundItems);
    appendKillList(statsEl, 'Убийства врагов', stats.killsByName);
    appendKillList(statsEl, 'Убийства боссов', stats.bossKillsByName);
    show('over');
  }

  function init() {
    var nameInput = el('player-name');
    if (nameInput && RK.Meta && RK.Meta.data) {
      nameInput.value = RK.Meta.data.playerName || 'Игрок';
    }
    var tilesetToggle = el('tileset-enabled');
    if (tilesetToggle) {
      tilesetToggle.checked = RK.Assets.enabled();
      tilesetToggle.addEventListener('change', function () {
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
          RK.Render.draw();
        });
      });
    }
    var renderModeButton = el('btn-render-mode');
    if (renderModeButton) {
      function refreshRenderModeButton() {
        var mode = RK.Render.getMode();
        renderModeButton.textContent = mode === 'ascii' ? 'Вид: ASCII' : 'Вид: графика';
        renderModeButton.setAttribute('aria-pressed', mode === 'ascii' ? 'true' : 'false');
      }
      refreshRenderModeButton();
      renderModeButton.addEventListener('click', function () {
        var nextMode = RK.Render.getMode() === 'ascii' ? 'graphics' : 'ascii';
        var saved = RK.Render.setMode(nextMode);
        refreshRenderModeButton();
        if (!saved) msg('Режим отображения изменён, но сохранить настройку не удалось.');
      });
    }
    var debugLogToggle = el('debug-log');
    if (debugLogToggle) {
      debugLogToggle.checked = debugLogEnabled;
      debugLogToggle.addEventListener('change', function () {
        debugLogEnabled = debugLogToggle.checked;
      });
    }
    setChatEnabled(false);
    el('chat-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var input = el('chat-input');
      var text = input.value.trim();
      if (!text || !RK.Network.chat(text)) return;
      input.value = '';
      chatStatus('');
    });
    el('btn-play').addEventListener('click', function () {
      clearLog();
      savePlayerName();
      RK.Combat.newRun({ size: el('map-size').value, style: el('map-style').value });
    });
    el('btn-retry').addEventListener('click', function () {
      clearLog();
      savePlayerName();
      RK.Combat.newRun({ size: el('map-size').value, style: el('map-style').value });
    });
    el('btn-shop').addEventListener('click', showShop);
    el('btn-shop-back').addEventListener('click', function () {
      show('menu');
    });
    el('btn-inventory').addEventListener('click', showInventory);
    el('btn-inventory-back').addEventListener('click', function () {
      show('game');
    });
    el('btn-merchant-back').addEventListener('click', function () {
      show('game');
    });
    el('btn-blacksmith-back').addEventListener('click', function () {
      show('game');
    });
    el('btn-potion').addEventListener('click', function () {
      perform('usePotion', []);
      if (current === 'inventory') renderInventoryScreen();
      refresh();
    });
    el('btn-skill').addEventListener('click', function () {
      perform('activateClassSkill', []);
      refresh();
    });
    el('btn-rest').addEventListener('click', function () {
      perform('skipTurn', []);
    });
    el('btn-sound').addEventListener('click', function () {
      RK.Audio.setEnabled(!RK.Audio.isEnabled());
      refresh();
    });
    el('debug-stats-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!this.reportValidity()) return;
      RK.Combat.setPlayerStats({
        hp: Number(el('debug-hp').value),
        maxHp: Number(el('debug-max-hp').value),
        atk: Number(el('debug-atk').value),
        def: Number(el('debug-def').value),
      });
    });
    el('btn-host-room').addEventListener('click', function () {
      RK.Network.createRoom(savePlayerName());
    });
    el('btn-join-room').addEventListener('click', function () {
      RK.Network.joinRoom(el('lan-room-code').value, savePlayerName());
    });
    el('btn-start-coop').addEventListener('click', function () {
      if (!RK.Network.isHost()) return;
      clearLog();
      RK.Network.startGame({ size: el('map-size').value, style: el('map-style').value });
    });
    el('btn-debug-room').addEventListener('click', function () {
      clearLog();
      savePlayerName();
      RK.Combat.newDebugRoom();
    });
    el('btn-debug-back').addEventListener('click', function () {
      show('menu');
    });
    el('btn-help').addEventListener('click', showHelp);
    el('btn-help-back').addEventListener('click', function () {
      show('menu');
    });
  }

  function refreshTilesetControl(message, updateSelection) {
    var toggle = el('tileset-enabled');
    if (toggle && updateSelection) toggle.checked = RK.Assets.enabled();
    var status = el('tileset-status');
    if (status) status.textContent = message || '';
  }

  RK.UI = {
    show: show,
    msg: function (text) { msg(text, debugLogEnabled || isImportantLog(text)); },
    narratorMsg: function (text) { narratorMsg(text, false); },
    clearLog: clearLog,
    chatMessage: chatMessage,
    chatStatus: chatStatus,
    chatEnabled: setChatEnabled,
    debugLogEnabled: function (enabled) { debugLogEnabled = !!enabled; },
    refresh: refresh,
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
      el('lan-status').textContent = message || '';
    },
    networkDisconnected: function () {
      el('btn-host-room').disabled = false;
      el('btn-join-room').disabled = false;
      el('btn-start-coop').disabled = true;
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
    gameTooltip: function (text, clientX, clientY, rarity) {
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
      var rarityColor = rarity && RK.Items.RARITY_COLORS[rarity];
      tooltip.style.borderColor = rarityColor || '';
      tooltip.style.color = rarityColor || '';
      tooltip.classList.remove('hidden');
      var left = clientX - bounds.left + 12;
      var top = clientY - bounds.top + 12;
      left = Math.max(4, Math.min(left, bounds.width - tooltip.offsetWidth - 4));
      top = Math.max(4, Math.min(top, bounds.height - tooltip.offsetHeight - 4));
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    },
    showLobby: function (room, isHost) {
      el('lan-lobby').classList.toggle('hidden', false);
      el('lan-room-display').textContent = room;
      el('game-room-display').textContent = room;
      el('game-room-code').classList.toggle('hidden', !isHost);
      el('btn-start-coop').classList.toggle('hidden', !isHost);
      el('btn-start-coop').disabled = !isHost;
      el('btn-host-room').disabled = true;
      el('btn-join-room').disabled = true;
    },
    networkPlayers: function (players, isHost) {
      var lobby = el('lan-player-list');
      var gameList = el('game-player-list');
      lobby.innerHTML = '';
      gameList.innerHTML = '';
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
      el('btn-start-coop').classList.toggle('hidden', !isHost);
    },
  };
})();