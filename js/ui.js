(function () {
  var C = RK.CONFIG;
  var current = 'menu';

  function el(id) {
    return document.getElementById(id);
  }

  function perform(action, args) {
    if (RK.Network && RK.Network.isRemoteBusy()) return;
    if (RK.Network && RK.Network.action(action, args) !== null) return;
    if (RK.Network && RK.Network.performLocalAction(action, args)) return;
    RK.Combat[action].apply(null, args || []);
  }

  function show(name) {
    current = name;
    var names = ['menu', 'shop', 'inventory', 'merchant', 'game', 'over'];
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
    }
    refresh();
  }

  function renderInventoryScreen() {
    var g = RK.GAME || null;
    var p = g && g.player ? g.player : null;
    var equipmentEl = el('inventory-equipment-slots');
    var listEl = el('inventory-backpack-list');
    if (!p || !equipmentEl || !listEl) return;

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
    if (!backpack.length) {
      var empty = document.createElement('div');
      empty.className = 'inventory-row';
      empty.textContent = 'Рюкзак пуст';
      listEl.appendChild(empty);
      return;
    }

    for (var i = 0; i < backpack.length; i++) {
      var loot = backpack[i];
      var rowItem = document.createElement('div');
      rowItem.className = 'inventory-row rarity-' + (loot.rarity || 'common');
      var label = document.createElement('span');
      label.className = 'name';
      label.textContent = (loot.name || 'Предмет') +
        (loot.kind === 'potion' && (loot.count || 1) > 1 ? ' ×' + loot.count : '') +
        (loot.summary ? ' — ' + loot.summary : '');
      var actions = document.createElement('div');
      actions.className = 'actions';
      var useBtn = document.createElement('button');
      useBtn.textContent = loot.kind === 'key' ? 'Ключ' :
        (loot.kind === 'potion' ? 'Исп.' : (loot.equipped ? 'Снять' : 'Надеть'));
      useBtn.disabled = loot.kind === 'key';
      useBtn.addEventListener('click', function (idx) {
        return function (ev) {
          ev.stopPropagation();
          perform('useInventoryItem', [idx]);
          renderInventoryScreen();
          RK.UI.refresh();
        };
      }(i));
      var dropBtn = document.createElement('button');
      dropBtn.textContent = 'Выброс';
      dropBtn.addEventListener('click', function (idx) {
        return function (ev) {
          ev.stopPropagation();
          perform('dropInventoryItem', [idx]);
          renderInventoryScreen();
          RK.UI.refresh();
        };
      }(i));
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
    var list = el('merchant-inventory');
    if (!player || !list) return;
    el('merchant-gold').textContent = 'У вас: ' + player.gold + ' золота';
    list.innerHTML = '';

    var slotLabels = {
      weapon: 'Оружие', head: 'Шлем', armor: 'Броня',
      ring: 'Кольцо', amulet: 'Амулет', boots: 'Сапоги',
    };
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

    var equippedCount = 0;
    for (var slot in player.equipment) {
      var equipped = player.equipment[slot];
      if (!equipped) continue;
      equippedCount++;
      addSaleRow(equipped, (slotLabels[slot] || 'Экипировка') + ': ' + equipped.name,
        function (slotId) {
          return function () { perform('sellEquipmentItem', [slotId]); };
        }(slot));
    }
    var backpack = player.backpack || [];
    for (var i = 0; i < backpack.length; i++) {
      var item = backpack[i];
      addSaleRow(item, (item.name || 'Предмет') +
        (item.count > 1 ? ' ×' + item.count : ''),
        function (index) {
          return function () { perform('sellInventoryItem', [index]); };
        }(i));
    }
    if (!equippedCount && !backpack.length) {
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

  function msg(text) {
    var log = el('log');
    if (!log) return;
    var div = document.createElement('div');
    div.textContent = text;
    appendLogEntry(log, div);
  }

  function narratorMsg(text) {
    var log = el('log');
    if (!log) return;
    var div = document.createElement('div');
    div.className = 'log-narrator';
    var name = document.createElement('span');
    name.className = 'narrator-name';
    name.textContent = (RK.Narrator && RK.Narrator.NAME ? RK.Narrator.NAME : 'Рассказчик') + ': ';
    div.appendChild(name);
    div.appendChild(document.createTextNode(text));
    appendLogEntry(log, div);
  }

  function appendLogEntry(log, entry) {
    var followsLatest = log.scrollHeight - log.clientHeight - log.scrollTop < 8;
    log.appendChild(entry);
    if (followsLatest) log.scrollTop = log.scrollHeight;
  }

  function clearLog() {
    var log = el('log');
    if (log) log.innerHTML = '';
  }

  function xpNeed(level) {
    return C.XP_BASE + (level - 1) * C.XP_GROWTH;
  }

  function refresh() {
    if (current !== 'game') return;
    var g = RK.GAME;
    if (!g || !g.player) return;
    var p = g.player;
    el('stat-hp').innerHTML = 'HP ' + p.hp + '/' + p.maxHp;
    var bar = el('bar-hp-fill');
    if (bar) bar.style.width = Math.max(0, (p.hp / p.maxHp) * 100) + '%';
    el('stat-level').textContent = 'Ур. ' + p.level;
    el('stat-floor').textContent = 'Этаж ' + g.floor + '/' + C.MAX_FLOOR;
    el('stat-status').textContent = p.burningTurns > 0 ? 'Горение ' + p.burningTurns : '';
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
    el('stat-class').textContent = p.className || '—';

    var clsInfo = RK.Classes && RK.Classes.getClassDef ? RK.Classes.getClassDef(p.classId || 'tank') : null;
    var skillText = clsInfo ? clsInfo.skillName + (p.classSkillCooldown > 0 ? ' (' + p.classSkillCooldown + ' хд)' : '') : '—';
    el('stat-skill').textContent = skillText;

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
      infoClass.innerHTML = '<b>' + def.name + '</b><span>' + def.passive + '</span><span>Навык: ' + def.skillName + '</span>';
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
        if (definitions[type].name === name) return definitions[type].asset || type;
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

  function over(win, floor, level, banked, stats) {
    el('over-title').textContent = win ? 'ПОБЕДА!' : 'ВЫ ПОГИБЛИ';
    el('over-title').style.color = win ? '#7ae582' : '#ff5252';
    var statsEl = el('over-stats');
    statsEl.innerHTML =
      'Достигнут этаж: <b>' + floor + '</b><br>' +
      'Уровень персонажа: <b>' + level + '</b><br>' +
      'Сбережено в банке: <b>' + banked + '</b> золота';
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
    el('btn-play').addEventListener('click', function () {
      clearLog();
      RK.Combat.newRun({ size: el('map-size').value, style: el('map-style').value });
    });
    el('btn-retry').addEventListener('click', function () {
      clearLog();
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
    el('btn-potion').addEventListener('click', function () {
      perform('usePotion', []);
      if (current === 'inventory') renderInventoryScreen();
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
      RK.Network.createRoom(el('lan-player-name').value);
    });
    el('btn-join-room').addEventListener('click', function () {
      RK.Network.joinRoom(el('lan-room-code').value, el('lan-player-name').value);
    });
    el('btn-start-coop').addEventListener('click', function () {
      if (!RK.Network.isHost()) return;
      clearLog();
      RK.Network.startGame({ size: el('map-size').value, style: el('map-style').value });
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
    msg: msg,
    narratorMsg: narratorMsg,
    clearLog: clearLog,
    refresh: refresh,
    over: over,
    showShop: showShop,
    showInventory: showInventory,
    showMerchant: showMerchant,
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
      else refresh();
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