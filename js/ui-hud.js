// HUD игрового экрана: строка статуса, панель героя, кнопки действий,
// панель экипировки и панель способностей.
(function () {
  var C = RK.CONFIG;
  var UI = RK.UI;

  function el(id) { return UI.el(id); }
  function setText(id, text) { UI.setText(id, text); }
  function clearNode(node) { UI.clearNode(node); }
  function makeButton(spriteName, text, className) { return UI.makeButton(spriteName, text, className); }
  function commit(action, args, rerender) { UI.commit(action, args, rerender); }

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
    // Названия статусов живут в реестре: свой список в интерфейсе разъезжался
    // с боевым кодом при первом же новом статусе.
    var statusDefs = (RK.Statuses && RK.Statuses.DEFS) || {};
    if (p.statuses && typeof p.statuses === 'object') {
      for (var statusId in p.statuses) {
        var status = p.statuses[statusId];
        var def = statusDefs[statusId];
        if (status && status.turns > 0 && def) {
          statuses.push(def.name + ' ' + status.turns);
        }
      }
    }
    if (!(p.statuses && p.statuses.burning) && (p.burningTurns > 0)) statuses.push('Горение ' + p.burningTurns);
    if (p.preciseShots > 0) statuses.push('Прицел ' + p.preciseShots);
    if (p.rageTurns > 0) statuses.push('Ярость ' + p.rageTurns);
    if (p.reflectShield > 0) statuses.push('Щит ' + p.reflectShield);
    if (RK.Camp && RK.Camp.active && RK.Camp.active()) statuses.push('Костёр');
    setText('stat-status', statuses.join(' · '));
    setText('stat-turn', String(g.turn));
  }

  function refreshCharacterPanel(g, p) {
    setText('stat-player-name', p.name || 'Игрок');
    setText('stat-class', p.className || '—');

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

    // На потолке уровня строка показывает «МАКС», а полоса — полную.
    var atLevelCap = p.level >= C.MAX_LEVEL;
    setText('stat-xp', atLevelCap ? 'МАКС' : p.xp + ' / ' + C.xpNeed(p.level));
    var xpBar = el('bar-xp-fill');
    if (xpBar) {
      xpBar.style.width = (atLevelCap ? 100 :
        Math.max(0, Math.min(100, (p.xp / C.xpNeed(p.level)) * 100))) + '%';
    }
    setText('stat-potion', '+' + p.potionHeal + ' HP');
    var maxHunger = p.maxHunger || (RK.CONFIG && RK.CONFIG.FOOD_MAX_HUNGER) || 100;
    var hunger = p.hunger == null ? maxHunger : p.hunger;
    // Шаг голода дробный, поэтому в строке округляем до десятых.
    setText('stat-hunger', (Math.round(hunger * 10) / 10) + ' / ' + maxHunger);
    var hungerBar = el('bar-hunger-fill');
    if (hungerBar) hungerBar.style.width = Math.max(0, Math.min(100, (hunger / maxHunger) * 100)) + '%';

    UI.fillDebugStats(p);

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
      UI.setButtonLabel('btn-potion', 'Выпить зелье (R) ×' + potionCount);
      potionButton.disabled = potionCount === 0;
    }
    var soundOn = !!(RK.Audio && RK.Audio.isEnabled());
    UI.setButtonLabel('btn-sound', soundOn ? 'Звук: вкл.' : 'Звук: выкл.');
    UI.setButtonIcon('btn-sound', soundOn ? 'uiSoundOn' : 'uiSoundOff');
    var soundButton = el('btn-sound');
    if (soundButton) soundButton.setAttribute('aria-pressed', soundOn ? 'true' : 'false');

    // Кнопка лагеря — переключатель: в лагере подсвечена и зовёт разойти.
    var campButton = el('btn-camp');
    if (campButton) {
      var camping = !!(RK.Camp && RK.Camp.active && RK.Camp.active());
      UI.setButtonLabel('btn-camp', camping ? 'Разойти' : 'Лагерь');
      UI.toggleClass('btn-camp', 'active', camping);
      campButton.disabled = !!g.over;
    }

    // Телепорт домой: в мире локаций и вне самого города.
    var teleportButton = el('btn-teleport-city');
    if (teleportButton) {
      var cityId = C.WORLD_START_LOCATION;
      var location = g.locationMode && RK.World ? RK.World.current() : null;
      teleportButton.disabled = !!g.over || !location || location.id === cityId;
    }

    var zone = RK.Combat.getZoneAt(p.x, p.y);
    var zoneType = zone && zone.type;
    UI.toggleClass('canvas-wrap', 'zone-buff', zoneType === 'regen' || zoneType === 'attack');
    UI.toggleClass('canvas-wrap', 'zone-debuff', zoneType === 'weakAttack' || zoneType === 'weakDefense');
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
      if (item) UI.appendSlotIcon(slotEl, item);
      slotEl.appendChild(name);
      slotEl.appendChild(value);
      container.appendChild(slotEl);
    }
  }

  // Панель способностей: три кнопки класса с откатом в ходах. Кнопки строятся
  // один раз на класс, состояние обновляется каждый refresh — откат тикает по ходам.
  var skillBar = { classId: null, slots: [] };

  // Кастомное свойство CSS ставится через setProperty: присваивание по имени
  // браузер игнорирует, а в песочнице тестов у элемента нет метода setProperty.
  function setCssVar(node, name, value) {
    if (node.style.setProperty) node.style.setProperty(name, value);
    else node.style[name] = value;
  }

  function buildSkillBar(classId, skills) {
    var container = el('hud-skills');
    if (!container) return;
    clearNode(container);
    skillBar.classId = classId;
    skillBar.slots = [];
    var color = RK.Classes && RK.Classes.skillColor ? RK.Classes.skillColor(classId) : '';
    for (var i = 0; i < skills.length; i++) {
      (function (def) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'skill-slot';
        setCssVar(button, '--skill-color', color);
        var head = document.createElement('span');
        head.className = 'skill-head';
        var key = document.createElement('span');
        key.className = 'skill-key';
        key.textContent = def.key;
        var name = document.createElement('span');
        name.className = 'skill-name';
        name.textContent = def.name;
        head.appendChild(key);
        head.appendChild(name);
        var status = document.createElement('span');
        status.className = 'skill-cd';
        var bar = document.createElement('span');
        bar.className = 'skill-cd-bar';
        var fill = document.createElement('span');
        fill.className = 'skill-cd-fill';
        bar.appendChild(fill);
        button.appendChild(head);
        button.appendChild(status);
        button.appendChild(bar);
        button.addEventListener('click', function () {
          commit('activateClassSkill', [def.id], null);
        });
        container.appendChild(button);
        skillBar.slots.push({ def: def, button: button, status: status, fill: fill });
      })(skills[i]);
    }
  }

  function renderSkillBar(g, p) {
    var container = el('hud-skills');
    if (!container) return;
    var skills = RK.Skills ? RK.Skills.skillsFor(p.classId) : [];
    if (!skills.length) return;
    if (skillBar.classId !== p.classId || skillBar.slots.length !== skills.length) {
      buildSkillBar(p.classId, skills);
    }
    var cooldowns = p.skillCooldowns || {};
    for (var i = 0; i < skillBar.slots.length; i++) {
      var slot = skillBar.slots[i];
      var def = slot.def;
      var unlocked = (p.level || 1) >= def.level;
      var cd = cooldowns[def.id] || 0;
      var armed = p.pendingSpell === def.id;
      if (!unlocked) slot.status.textContent = 'Откроется на ' + def.level + ' ур.';
      else if (armed) slot.status.textContent = 'Выберите цель';
      else if (cd > 0) slot.status.textContent = 'Перезарядка: ' + cd + ' хд.';
      else slot.status.textContent = 'Готов';
      var percent = cd > 0 && def.cooldown > 0
        ? Math.max(0, Math.min(100, (cd / def.cooldown) * 100))
        : 0;
      slot.fill.style.width = percent + '%';
      slot.button.disabled = !unlocked || cd > 0 || !!g.over;
      slot.button.classList.toggle('locked', !unlocked);
      slot.button.classList.toggle('cooling', cd > 0);
      slot.button.classList.toggle('armed', armed);
      slot.button.title = def.text + ' · Кулдаун: ' + def.cooldown + ' ход(а).' +
        (cd > 0 ? ' Осталось: ' + cd + ' ход(а).' : '');
    }
  }

  function refresh() {
    if (UI.screen() !== 'game') return;
    var g = RK.GAME;
    if (!g || !g.player) return;
    var p = UI.displayPlayer();
    if (!p) return;

    setText('stat-hp', p.hp + '/' + p.maxHp);
    var hpBar = el('bar-hp-fill');
    if (hpBar) hpBar.style.width = Math.max(0, (p.hp / p.maxHp) * 100) + '%';
    setText('stat-player-level', 'Ур. ' + p.level);
    var location = g.locationMode && RK.World ? RK.World.current() : null;
    // Имя узла уже несёт ярус данжа — отдельное число ему не нужно.
    setText('stat-floor', location ? location.name : 'Этаж ' + g.floor);
    setText('stat-gold', String(p.gold));
    setText('stat-keys', String(countBackpack(p, 'key')));

    refreshStatusLine(g, p);
    refreshCharacterPanel(g, p);
    refreshActionButtons(g, p);
    renderSkillBar(g, p);
    refreshEquipmentPanel(p);

    RK.Render.draw();
  }

  function renderSkillsScreen() {
    var g = RK.GAME || null;
    var p = g ? UI.displayPlayer() : null;
    var listEl = el('skills-list');
    if (!listEl) return;
    clearNode(listEl);
    if (!p) return;
    var skills = RK.Skills ? RK.Skills.skillsFor(p.classId) : [];
    if (!skills.length) {
      var empty = document.createElement('div');
      empty.className = 'merchant-row';
      empty.textContent = 'Нет доступных навыков.';
      listEl.appendChild(empty);
      return;
    }
    for (var i = 0; i < skills.length; i++) {
      var sk = skills[i];
      var unlocked = (p.level || 1) >= sk.level;
      var cooldowns = p.skillCooldowns || {};
      var cd = cooldowns[sk.id] || 0;
      var row = document.createElement('div');
      row.className = 'merchant-row' + (unlocked ? '' : ' blocked');
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = sk.name + ' (клавиша ' + sk.key + ')';
      var desc = document.createElement('div');
      desc.style.fontSize = '11px';
      desc.style.color = '#aaa';
      desc.style.marginTop = '2px';
      desc.textContent = sk.text + ' · Кулдаун: ' + sk.cooldown + ' ход(а).';
      var status = document.createElement('div');
      status.style.fontSize = '11px';
      status.style.marginTop = '2px';
      if (!unlocked) {
        status.style.color = '#ff7043';
        status.textContent = 'Откроется на ' + sk.level + ' уровне.';
      } else if (cd > 0) {
        status.style.color = '#ffd166';
        status.textContent = 'Перезарядка: ' + cd + ' ход(а).';
      } else {
        status.style.color = '#7ae582';
        status.textContent = 'Готов к использованию.';
      }
      var btn = makeButton(unlocked && cd === 0 ? 'uiSkill' : 'uiLock',
        !unlocked ? 'Закрыто' : cd > 0 ? 'Ждите' : 'Применить');
      btn.disabled = !unlocked || cd > 0;
      (function (skillId) {
        btn.addEventListener('click', function () {
          commit('activateClassSkill', [skillId], renderSkillsScreen);
        });
      })(sk.id);
      row.appendChild(name);
      row.appendChild(desc);
      row.appendChild(status);
      row.appendChild(btn);
      listEl.appendChild(row);
    }
  }

  function showSkills() {
    UI.show('skills');
  }

  function initHudControls() {
    UI.onClick('btn-potion', function () { commit('usePotion', [], null); });
    UI.onClick('btn-skills', function () { showSkills(); });
    UI.onClick('btn-skills-back', function () { UI.show('game'); });
    UI.onClick('btn-rest', function () { UI.perform('skipTurn', []); });
    UI.onClick('btn-camp', function () { UI.perform('campRest', []); });
    UI.onClick('btn-teleport-city', function () { UI.perform('teleportToCity', []); });
    UI.onClick('btn-zoom-in', function () { if (RK.Render && RK.Render.zoomIn) RK.Render.zoomIn(); });
    UI.onClick('btn-zoom-out', function () { if (RK.Render && RK.Render.zoomOut) RK.Render.zoomOut(); });
    UI.onClick('btn-sound', function () {
      RK.Audio.setEnabled(!RK.Audio.isEnabled());
      refresh();
    });
  }

  UI.registerRenderer('skills', renderSkillsScreen);
  UI.setGameRefresh(refresh);

  RK.UI.refresh = refresh;
  RK.UI.showSkills = showSkills;
  RK.UI.renderSkillsScreen = renderSkillsScreen;
  RK.UI.countBackpack = countBackpack;

  UI.onInit(initHudControls);
})();
