(function () {
  var C = RK.CONFIG;
  var current = 'menu';

  function el(id) {
    return document.getElementById(id);
  }

  function show(name) {
    current = name;
    var names = ['menu', 'shop', 'game', 'over'];
    for (var i = 0; i < names.length; i++) {
      el('screen-' + names[i]).classList.toggle('hidden', names[i] !== name);
    }
    if (name !== 'game') {
      RK.hover = null;
      RK.hoverPath = null;
    }
    refresh();
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
    init: init,
  };
})();