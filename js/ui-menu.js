// Меню: выбор класса, магазин мет-прогресса, старт забега и экран итогов.
(function () {
  var C = RK.CONFIG;
  var UI = RK.UI;

  // Подготовка старта: класс выбирается до забега, а для гостя — ещё и до входа в комнату.
  var pendingRun = null;
  var pendingJoinCode = null;
  var pendingNetworkStart = false;

  function el(id) { return UI.el(id); }
  function setText(id, text) { UI.setText(id, text); }
  function clearNode(node) { UI.clearNode(node); }
  function makeButton(spriteName, text, className) { return UI.makeButton(spriteName, text, className); }
  function onClick(id, handler) { UI.onClick(id, handler); }

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
      [ 'Оружие: ' + UI.classWeaponText(def), def.passive, 'Навык: ' + def.skillName + ' — ' + def.skillText ].forEach(function (text) {
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
            UI.msg('Класс выбран: ' + RK.Classes.CLASS_DEFS[id].name);
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
    // Вход в комнату: класс выбран на этом же экране, соединение открывает joinRoom.
    if (pendingJoinCode) {
      var code = pendingJoinCode;
      pendingJoinCode = null;
      if (RK.Network && RK.Network.joinRoom) RK.Network.joinRoom(code, UI.savePlayerName());
      return;
    }
    if (!pendingRun) return;
    var run = pendingRun;
    pendingRun = null;
    if (!RK.Meta.data.classes || !RK.Meta.data.classes[RK.Meta.data.selectedClass]) {
      RK.Meta.data.selectedClass = RK.Meta.data.classes && RK.Meta.data.classes.berserker ? 'berserker' : 'paladin';
      RK.Meta.save();
    }
    UI.clearLog();
    UI.savePlayerName();
    if (run.mode === 'single') {
      RK.Combat.newRun(run.options);
      return;
    }
    if (!RK.Network) {
      UI.show('menu');
      return;
    }
    // Гость отправляет выбранный класс на сервер, забег стартует хост.
    if (!RK.Network.isHost()) {
      RK.Network.selectClass(RK.Meta.data.selectedClass || 'paladin');
      UI.show('menu');
      return;
    }
    if (RK.Network.startGame(Object.assign({}, run.options, {
      classId: RK.Meta.data.selectedClass || 'paladin',
    }))) {
      pendingNetworkStart = true;
      UI.show('menu');
    }
  }

  function showClassSelection(run) {
    if (run.mode === 'network' && !RK.Network) return;
    pendingRun = run;
    pendingJoinCode = null;
    renderClassSelection();
    // Гость выбирает класс себе, забег запускает хост: кнопка подтверждения другая.
    var guest = run.mode === 'network' && !RK.Network.isHost();
    UI.setButtonLabel('btn-class-select-start', guest ? 'ГОТОВО' : 'НАЧАТЬ ЗАБЕГ');
    UI.show('class-select');
  }

  // Гость сначала выбирает класс, потом подключается к комнате: joinRoom берёт
  // класс из Meta.data.selectedClass, который ставит buyClass на этом же экране.
  function showJoinClassSelection(code) {
    if (!RK.Network || !code) return;
    pendingRun = null;
    pendingJoinCode = code;
    renderClassSelection();
    UI.setButtonLabel('btn-class-select-start', 'ПОДКЛЮЧИТЬСЯ');
    UI.show('class-select');
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
            UI.msg('Улучшение куплено!');
          }
        };
      }(u.id));
      row.appendChild(info);
      row.appendChild(btn);
      list.appendChild(row);
    }

    renderClassList(el('shop-classes'), 'shop');
    UI.show('shop');
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
        appendSpriteIcon(item, UI.itemSprite(loot), loot.name);
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

  function over(win, floor, level, banked, stats, player, deathCause) {
    var title = el('over-title');
    if (title) {
      title.textContent = win ? 'ПОБЕДА!' : 'ВЫ ПОГИБЛИ';
      title.style.color = win ? '#7ae582' : '#ff5252';
    }
    var statsEl = el('over-stats');
    if (!statsEl) return;
    clearNode(statsEl);
    var rows = [
      ['Достигнут этаж: ', floor],
      ['Уровень персонажа: ', level],
      ['Сбережено в банке: ', banked + ' золота'],
    ];
    if (!win) rows.push(['Причина смерти: ', deathCause || 'не установлена']);
    rows.forEach(function (row) {
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
    UI.show('over');
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
      UI.savePlayerName();
      showClassSelection({ mode: 'single', options: runOptions() });
    };
    onClick('btn-play', prepareSingleRun);
    onClick('btn-retry', prepareSingleRun);
    onClick('btn-class-select-back', function () {
      pendingRun = null;
      pendingJoinCode = null;
      UI.show('menu');
    });
    onClick('btn-class-select-start', beginRun);
    onClick('btn-shop', showShop);
    onClick('btn-shop-back', function () { UI.show('menu'); });
    onClick('btn-help', function () { UI.show('help'); });
    onClick('btn-help-back', function () { UI.show('menu'); });
    onClick('btn-settings', function () { UI.show('settings'); });
    onClick('btn-settings-back', function () { UI.show('game'); });
    onClick('btn-exit-menu', function () { if (RK.Network && RK.Network.disconnect) RK.Network.disconnect(); UI.show('menu'); RK.UI.refreshContinueButton(); });
    onClick('btn-saves', function () { UI.show('saves'); });
    onClick('btn-saves-back', function () { UI.show('menu'); });
    onClick('btn-inventory', function () { RK.UI.showInventory(); });
    onClick('btn-questlog', function () { RK.UI.showQuestLog(); });
    onClick('btn-inventory-back', function () { UI.show('game'); });
    onClick('btn-storage-back', function () { UI.show('game'); });
    onClick('btn-merchant-back', function () { UI.show('game'); });
    onClick('btn-blacksmith-back', function () { UI.show('game'); });
    onClick('btn-talk-back', function () { UI.show('game'); });
    onClick('btn-tavern-back', function () { UI.show('game'); });
    onClick('btn-guild-back', function () { UI.show('game'); });
    onClick('btn-temple-back', function () { UI.show('game'); });
    onClick('btn-questlog-back', function () { UI.show('game'); });
    onClick('btn-debug-room', function () {
      UI.clearLog();
      UI.savePlayerName();
      RK.Debug.open();
    });
    onClick('btn-guild-store', function () { RK.UI.showGuildStore(); });
    onClick('btn-temple-blessing', function () { RK.UI.showTempleBlessing(); });
  }

  // Подготовка забега сбрасывается целиком: старый выбор класса не должен
  // пережить выход из комнаты.
  function resetPendingRun() {
    pendingRun = null;
    pendingJoinCode = null;
    pendingNetworkStart = false;
  }

  // Забрать признак «забег стартовал по сети»: хост открывает лобби сразу после старта.
  function takeNetworkStart() {
    var startingRun = pendingNetworkStart;
    pendingNetworkStart = false;
    return startingRun;
  }

  RK.UI.showShop = showShop;
  RK.UI.showClassSelection = showClassSelection;
  RK.UI.showJoinClassSelection = showJoinClassSelection;
  RK.UI.over = over;
  RK.UI.resetPendingRun = resetPendingRun;
  RK.UI.takeNetworkStart = takeNetworkStart;
  RK.UI.clearPendingRun = function () { pendingRun = null; };

  UI.onInit(initMenuControls);
})();
