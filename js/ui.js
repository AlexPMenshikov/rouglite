(function () {
  var C = RK.CONFIG;
  var current = 'menu';

  function el(id) {
    return document.getElementById(id);
  }

  function show(name) {
    current = name;
    var names = ['menu', 'shop', 'inventory', 'game', 'over'];
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
        slotValue.textContent = item.name + (item.summary ? ' — ' + item.summary : '');
        var takeBtn = document.createElement('button');
        takeBtn.textContent = 'Снять';
        takeBtn.addEventListener('click', function (slotId) {
          return function (ev) {
            ev.stopPropagation();
            RK.Combat.unequipSlot(slotId);
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
      rowItem.className = 'inventory-row';
      var label = document.createElement('span');
      label.className = 'name';
      label.textContent = (loot.name || 'Предмет') + (loot.summary ? ' — ' + loot.summary : '');
      var actions = document.createElement('div');
      actions.className = 'actions';
      var useBtn = document.createElement('button');
      useBtn.textContent = loot.kind === 'potion' ? 'Исп.' : (loot.equipped ? 'Снять' : 'Надеть');
      useBtn.addEventListener('click', function (idx) {
        return function (ev) {
          ev.stopPropagation();
          RK.Combat.useInventoryItem(idx);
          renderInventoryScreen();
          RK.UI.refresh();
        };
      }(i));
      var dropBtn = document.createElement('button');
      dropBtn.textContent = 'Выброс';
      dropBtn.addEventListener('click', function (idx) {
        return function (ev) {
          ev.stopPropagation();
          RK.Combat.dropInventoryItem(idx);
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

  function msg(text) {
    var log = el('log');
    if (!log) return;
    var div = document.createElement('div');
    div.textContent = text;
    log.insertBefore(div, log.firstChild);
    while (log.children.length > 10) log.removeChild(log.lastChild);
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
    log.insertBefore(div, log.firstChild);
    while (log.children.length > 10) log.removeChild(log.lastChild);
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
    el('stat-gold').textContent = 'Золото ' + p.gold;
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
    el('stat-atk').textContent = atkExtra
      ? p.atk + ' (' + (atkExtra > 0 ? '+' : '') + atkExtra + ')'
      : String(p.atk);
    el('stat-def').textContent = defExtra
      ? p.def + ' (+' + defExtra + ')'
      : String(p.def);
    var need = xpNeed(p.level);
    el('stat-xp').textContent = p.xp + ' / ' + need;
    var xpBar = el('bar-xp-fill');
    if (xpBar) xpBar.style.width = Math.max(0, Math.min(100, (p.xp / need) * 100)) + '%';
    el('stat-potion').textContent = '+' + p.potionHeal + ' HP';
    var inventoryEl = el('inventory-icons');
    var buffParts = [];
    inventoryEl.innerHTML = '';
    var itemKinds = ['sword', 'shield', 'boots'];
    for (var itemIndex = 0; itemIndex < itemKinds.length; itemIndex++) {
      var kind = itemKinds[itemIndex];
      var inventoryItem = p.inventory[kind];
      if (!inventoryItem || inventoryItem.count <= 0) continue;
      var def = RK.Items.DEFS[kind];
      var icon = document.createElement('span');
      icon.className = 'inventory-item' + (inventoryItem.durability > 0 ? '' : ' broken');
      icon.title = def.name + ': прочность ' + inventoryItem.durability + '/' +
        (inventoryItem.count * C.EQUIPMENT[kind].durability);
      var symbol = document.createElement('span');
      symbol.className = 'inventory-symbol';
      symbol.textContent = def.symbol;
      symbol.style.color = def.color;
      var count = document.createElement('span');
      count.className = 'inventory-count';
      count.textContent = 'x' + inventoryItem.count;
      icon.appendChild(symbol);
      icon.appendChild(count);
      inventoryEl.appendChild(icon);
      if (inventoryItem.durability > 0) {
        if (kind === 'sword') buffParts.push('атака +' + RK.Combat.itemBonus(kind));
        if (kind === 'shield') buffParts.push('защита +' + RK.Combat.itemBonus(kind));
        if (kind === 'boots') buffParts.push('скорость');
      }
    }
    var equipmentSlots = el('equipment-slots');
    equipmentSlots.innerHTML = '';
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
      var equippedItem = p.equipment && p.equipment[slot];
      var slotEl = document.createElement('div');
      slotEl.className = 'equipment-slot' + (!equippedItem ? ' empty' : '');
      var slotName = document.createElement('span');
      slotName.className = 'slot-name';
      slotName.textContent = slotLabels[slot];
      var slotItem = document.createElement('span');
      slotItem.className = 'slot-item';
      slotItem.textContent = equippedItem ? (equippedItem.name + (equippedItem.summary ? ' — ' + equippedItem.summary : '')) : 'пусто';
      slotEl.addEventListener('click', function (slotId, currentItem) {
        return function () {
          if (!currentItem) return;
          RK.Combat.unequipSlot(slotId);
        };
      }(slot, equippedItem));
      slotEl.appendChild(slotName);
      slotEl.appendChild(slotItem);
      equipmentSlots.appendChild(slotEl);
    }

    var inventoryList = el('inventory-list');
    inventoryList.innerHTML = '';
    var backpack = p.backpack || [];
    for (var i = 0; i < backpack.length; i++) {
      var loot = backpack[i];
      var row = document.createElement('div');
      row.className = 'inventory-row';
      row.addEventListener('click', (function (idx) {
        return function () {
          RK.Combat.useInventoryItem(idx);
        };
      })(i));
      var name = document.createElement('span');
      name.className = 'name';
      var label = loot.name || 'Предмет';
      name.textContent = label + (loot.summary ? ' — ' + loot.summary : '');
      var actions = document.createElement('div');
      actions.className = 'actions';
      var useBtn = document.createElement('button');
      useBtn.textContent = loot.kind === 'potion' ? 'Исп.' : (loot.equipped ? 'Снять' : 'Надеть');
      useBtn.addEventListener('click', (function (idx) {
        return function (ev) {
          ev.stopPropagation();
          RK.Combat.useInventoryItem(idx);
        };
      })(i));
      var dropBtn = document.createElement('button');
      dropBtn.textContent = 'Выброс';
      dropBtn.addEventListener('click', (function (idx) {
        return function (ev) {
          ev.stopPropagation();
          RK.Combat.dropInventoryItem(idx);
        };
      })(i));
      actions.appendChild(useBtn);
      actions.appendChild(dropBtn);
      row.appendChild(name);
      row.appendChild(actions);
      inventoryList.appendChild(row);
    }
    el('stat-sword').textContent = buffParts.length ? buffParts.join(', ') : '—';
    el('stat-turn').textContent = String(g.turn);

    el('debug-hp').value = String(p.hp);
    el('debug-max-hp').value = String(p.maxHp);
    el('debug-atk').value = String(p.atk - RK.Combat.itemBonus('sword'));
    el('debug-def').value = String(p.def - RK.Combat.itemBonus('shield'));

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
        item.textContent = names[i] + ': ' + kills[names[i]];
        list.appendChild(item);
      }
    }
    section.appendChild(list);
    parent.appendChild(section);
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
    appendKillList(statsEl, 'Убийства врагов', stats.killsByName);
    appendKillList(statsEl, 'Убийства боссов', stats.bossKillsByName);
    show('over');
  }

  function init() {
    el('btn-play').addEventListener('click', function () {
      clearLog();
      RK.Combat.newRun();
    });
    el('btn-retry').addEventListener('click', function () {
      clearLog();
      RK.Combat.newRun();
    });
    el('btn-shop').addEventListener('click', showShop);
    el('btn-shop-back').addEventListener('click', function () {
      show('menu');
    });
    el('btn-inventory').addEventListener('click', showInventory);
    el('btn-inventory-back').addEventListener('click', function () {
      show('game');
    });
    el('btn-rest').addEventListener('click', function () {
      RK.Combat.skipTurn();
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
    init: init,
  };
})();