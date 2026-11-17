// Экран персонажа: основные статы, четыре зоны конечностей и экипировка.
// Лечение выбирает худшую травму само — мышью по схеме тела целиться не нужно.
(function () {
  var C = RK.CONFIG;
  var UI = RK.UI;

  function el(id) { return UI.el(id); }
  function setText(id, text) { UI.setText(id, text); }
  function clearNode(node) { UI.clearNode(node); }

  function countItems(p, kind) {
    var total = 0;
    var backpack = (p && p.backpack) || [];
    for (var i = 0; i < backpack.length; i++) {
      if (backpack[i].kind === kind) total += backpack[i].count || 1;
    }
    return total;
  }

  function firstItemIndex(p, kind) {
    var backpack = (p && p.backpack) || [];
    for (var i = 0; i < backpack.length; i++) {
      if (backpack[i].kind === kind) return i;
    }
    return -1;
  }

  // Кнопка отправляет обычное действие инвентаря: отдельного сетевого действия нет.
  function healWith(kind) {
    var p = RK.GAME ? UI.displayPlayer() : null;
    if (!p) return;
    var index = firstItemIndex(p, kind);
    if (index < 0) return;
    UI.commit('useInventoryItem', [index], renderCharacterScreen);
  }

  function setBar(id, percent) {
    var bar = el(id);
    if (bar) bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
  }

  function renderBasic(g, p) {
    setText('stat-player-name', p.name || 'Игрок');
    setText('stat-player-level', String(p.level || 1));
    setText('stat-class', p.className || '—');

    var atLevelCap = (p.level || 1) >= C.MAX_LEVEL;
    setText('stat-xp', atLevelCap ? 'МАКС' : (p.xp || 0) + ' / ' + C.xpNeed(p.level || 1));
    setBar('bar-xp-fill', atLevelCap ? 100 : ((p.xp || 0) / C.xpNeed(p.level || 1)) * 100);

    // HP и голод есть и в HUD; на экране персонажа у них свои ID, чтобы не
    // дублировать id в разметке.
    setText('character-stat-hp', p.hp + ' / ' + p.maxHp);
    setBar('character-bar-hp-fill', (p.hp / p.maxHp) * 100);

    var maxHunger = p.maxHunger || C.FOOD_MAX_HUNGER || 100;
    var hunger = p.hunger == null ? maxHunger : p.hunger;
    // Шаг голода дробный, поэтому в строке округляем до десятых.
    setText('character-stat-hunger', (Math.round(hunger * 10) / 10) + ' / ' + maxHunger);
    setBar('character-bar-hunger-fill', (hunger / maxHunger) * 100);

    setText('stat-atk', String(p.atk || 0));
    setText('stat-def', String(p.def || 0));
    setText('stat-potion', '+' + (p.potionHeal || 0) + ' HP');
    setText('stat-gold', String(p.gold || 0));
    setText('stat-keys', String(countItems(p, 'key')));
    setText('stat-turn', String(g && g.turn != null ? g.turn : 0));
  }

  function mark(text, className) {
    var node = document.createElement('span');
    node.className = 'limb-mark ' + className;
    node.textContent = text;
    return node;
  }

  function renderLimbCard(zone) {
    var card = document.createElement('div');
    card.className = 'limb-card' + (zone.fracture ? ' fractured' : '') +
      (zone.bleeding > 0 ? ' bleeding' : '');
    card.setAttribute('data-zone', zone.id);

    var head = document.createElement('div');
    head.className = 'limb-card-head';
    var name = document.createElement('span');
    name.className = 'limb-name';
    name.textContent = zone.name;
    var hp = document.createElement('span');
    hp.className = 'limb-hp';
    hp.textContent = zone.hp + ' / ' + zone.maxHp;
    head.appendChild(name);
    head.appendChild(hp);

    var bar = document.createElement('span');
    bar.className = 'bar limb-bar';
    var fill = document.createElement('div');
    fill.className = 'limb-bar-fill';
    fill.style.width = Math.max(0, Math.min(100, (zone.hp / Math.max(1, zone.maxHp)) * 100)) + '%';
    bar.appendChild(fill);

    var marks = document.createElement('div');
    marks.className = 'limb-marks';
    if (zone.fracture) marks.appendChild(mark('Перелом', 'fracture'));
    if (zone.bleeding >= 2) marks.appendChild(mark('Сильное кровотечение', 'bleeding-heavy'));
    else if (zone.bleeding > 0) marks.appendChild(mark('Кровотечение', 'bleeding'));

    var penalty = document.createElement('div');
    penalty.className = 'limb-penalty';
    penalty.textContent = zone.penalty || 'Без штрафов';

    card.appendChild(head);
    card.appendChild(bar);
    card.appendChild(marks);
    card.appendChild(penalty);
    return card;
  }

  function renderLimbs(p) {
    var container = el('character-limbs');
    if (!container) return;
    clearNode(container);
    var data = RK.Limbs ? RK.Limbs.describe(p) : { zones: [] };
    if (!data.zones.length) {
      var empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'У этого существа нет конечностей.';
      container.appendChild(empty);
      return;
    }
    for (var i = 0; i < data.zones.length; i++) container.appendChild(renderLimbCard(data.zones[i]));
  }

  // Бинт и шина лечат одну худшую травму; без подходящей травмы кнопка выключена.
  function renderHealButtons(p) {
    var bandages = countItems(p, 'bandage');
    var splints = countItems(p, 'splint');
    var canBandage = bandages > 0 && !!(RK.Limbs && RK.Limbs.worstBleeding(p));
    var canSplint = splints > 0 && !!(RK.Limbs && RK.Limbs.worstFracture(p));
    var bandageButton = el('btn-character-bandage');
    var splintButton = el('btn-character-splint');
    if (bandageButton) {
      UI.setButtonLabel('btn-character-bandage', 'Бинт ×' + bandages);
      bandageButton.disabled = !canBandage;
    }
    if (splintButton) {
      UI.setButtonLabel('btn-character-splint', 'Шина ×' + splints);
      splintButton.disabled = !canSplint;
    }
    var hint = el('character-limb-hint');
    if (hint) {
      hint.textContent = bandages || splints
        ? 'Бинт останавливает кровотечение, шина лечит перелом. Предмет сам выбирает худшую травму.'
        : 'Бинты и шины лежат в рюкзаке: их можно найти в подземелье.';
    }
  }

  function renderCharacterScreen() {
    var g = RK.GAME || null;
    var p = g ? UI.displayPlayer() : null;
    if (!p) return;
    renderBasic(g, p);
    renderLimbs(p);
    renderHealButtons(p);
    if (UI.renderEquipmentPanel) UI.renderEquipmentPanel(p);
  }

  function showCharacter() {
    UI.show('character');
  }

  function initCharacterControls() {
    UI.onClick('btn-character', showCharacter);
    UI.onClick('btn-character-back', function () { UI.show('game'); });
    UI.onClick('btn-character-bandage', function () { healWith('bandage'); });
    UI.onClick('btn-character-splint', function () { healWith('splint'); });
  }

  UI.registerRenderer('character', renderCharacterScreen, { onSync: true });
  UI.onInit(initCharacterControls);

  RK.UI.showCharacter = showCharacter;
  RK.UI.renderCharacterScreen = renderCharacterScreen;
  // Кнопки лечения нужны и тестам, и другим экранам: имя одно на всё.
  RK.UI.renderCharacterLimbs = renderLimbs;
  RK.UI.renderCharacterHealButtons = renderHealButtons;
})();
