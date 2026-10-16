// Кемпинг: привал с костром вне боя. Состояние лежит на GAME.camp данными,
// поэтому уезжает в снимке вместе с забегом: клиент и сервер видят один лагерь.
// Хук — вызов tick() из finishTurn; движение и атаки гасят лагерь из combat.js.
(function () {
  var C = RK.CONFIG;

  function game() { return RK.GAME; }

  function ensureState(g) {
    if (!g.camp || typeof g.camp !== 'object') {
      g.camp = { active: false, turns: 0, healedAll: false };
    }
    return g.camp;
  }

  function active() {
    var g = game();
    return !!(g && g.camp && g.camp.active);
  }

  // Заводит состояние на старте забега: как Events.init в newRun.
  function init(g) {
    ensureState(g);
  }

  // Живой враг в радиусе лагеря: привал требует тишины вокруг.
  function enemiesNear(g, radius) {
    var p = g.player;
    if (!p) return false;
    var enemies = g.enemies || [];
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e || !e.alive) continue;
      if (Math.abs(e.x - p.x) + Math.abs(e.y - p.y) <= radius) return true;
    }
    return false;
  }

  function healParty(g) {
    var members = g.players && g.players.length ? g.players : [g.player];
    var allFull = true;
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      if (!m || m.hp <= 0) continue;
      if (m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + C.CAMP_HEAL_PER_TICK);
      if (m.hp < m.maxHp) allFull = false;
    }
    return allFull;
  }

  // Тик из finishTurn: лечит партию и гасит лагерь, если враг подошёл.
  function tick() {
    var g = game();
    if (!g || g.over || !g.camp || !g.camp.active) return;
    var allFull = healParty(g);
    g.camp.turns++;
    if (enemiesNear(g, C.CAMP_SAFE_RADIUS)) {
      leave('Лагерь прерван: враги рядом.');
      return;
    }
    if (allFull && !g.camp.healedAll) {
      g.camp.healedAll = true;
      RK.UI.msg('Отдых завершён: партия полностью восстановлена.');
    }
  }

  function leave(reason) {
    var g = game();
    if (!g || !g.camp || !g.camp.active) return;
    g.camp.active = false;
    g.camp.turns = 0;
    g.camp.healedAll = false;
    if (reason) RK.UI.msg(reason);
    RK.UI.refresh();
  }

  // Вход в лагерь и выход из него — одним действием, как кнопка в HUD.
  function partyHasFood(g) {
    var members = g && g.players && g.players.length ? g.players : [g && g.player];
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      if (!m || !m.backpack) continue;
      for (var j = 0; j < m.backpack.length; j++) {
        var item = m.backpack[j];
        if (item && item.kind === 'food' && (item.count || 1) > 0) return true;
      }
    }
    return false;
  }

  function rest() {
    var g = game();
    if (!g || g.over) return false;
    var state = ensureState(g);
    if (state.active) {
      leave('Вы уходите от костра.');
      return true;
    }
    var p = g.player;
    if (!p || p.hp <= 0) return false;
    if (!partyHasFood(g)) {
      RK.UI.msg('Нужна еда для привала.');
      return false;
    }
    if (enemiesNear(g, C.CAMP_SAFE_RADIUS)) {
      RK.UI.msg('Враги слишком близко для лагеря.');
      return false;
    }
    state.active = true;
    state.turns = 0;
    state.healedAll = false;
    RK.UI.msg('Вы разводите костёр: +' + C.CAMP_HEAL_PER_TICK + ' HP за ход.');
    RK.UI.refresh();
    return true;
  }

  RK.Camp = {
    init: init,
    rest: rest,
    leave: leave,
    tick: tick,
    active: active,
  };
})();
