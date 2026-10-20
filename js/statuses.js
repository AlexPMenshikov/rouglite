// Статусы: применение, тики и урон от них. Логика лежит рядом с реестром
// (js/status-defs.js), а забег модуль не знает — всё нужное приходит контекстом.
(function () {
  var DEFS = RK.Statuses.DEFS;

  function turnOf(ctx) {
    var game = ctx && ctx.getGame ? ctx.getGame() : null;
    return game && Number.isFinite(game.turn) ? game.turn : 0;
  }

  // Контекст забега: модуль сам его не знает, но бой может дать его один раз —
  // тогда вызов без контекста (например, из теста) всё равно знает про ход и партию.
  var context = null;

  function contextOf(ctx) {
    if (ctx) return ctx;
    return context;
  }

  function isParty(ctx, actor) {
    return !!(ctx && ctx.isParty && ctx.isParty(actor));
  }

  function elementalMultiplier(actor, type) {
    if (!actor || !type) return 1;
    var resistances = (actor.resistances && typeof actor.resistances === 'object') ? actor.resistances : {};
    var value = resistances[type];
    if (typeof value !== 'number' || !isFinite(value)) return 1;
    if (value < 0) return 0;
    return value;
  }

  function ensureStatuses(actor) {
    if (!actor || typeof actor !== 'object') return null;
    if (!actor.statuses || typeof actor.statuses !== 'object') actor.statuses = {};
    return actor.statuses;
  }

  // Старые поля горения живут параллельно реестру: на них смотрит бой и рендер.
  function syncBurningLegacy(actor) {
    if (!actor) return;
    var status = actor.statuses && actor.statuses.burning;
    if (status) {
      actor.burningTurns = status.turns;
      actor.burningDamage = status.damage || actor.burningDamage || 2;
      actor.burningAppliedTurn = status.appliedTurn || actor.burningAppliedTurn || 0;
    } else {
      actor.burningTurns = actor.burningTurns || 0;
      if (!actor.burningTurns) {
        actor.burningDamage = 0;
        actor.burningAppliedTurn = 0;
      }
    }
  }

  function applyStatus(actor, id, opts, ctx) {
    if (!actor) return null;
    ctx = contextOf(ctx);
    var def = DEFS[id];
    if (!def) return null;
    opts = opts || {};
    var statuses = ensureStatuses(actor);
    var turns = Number.isInteger(opts.turns) ? opts.turns : def.defaultTurns;
    var damage = Number.isInteger(opts.damage) ? opts.damage : def.defaultDamage;
    var appliedTurn = Number.isInteger(opts.appliedTurn) ? opts.appliedTurn : turnOf(ctx) + 1;
    var current = statuses[id];
    if (current) {
      if (turns > (current.turns || 0)) current.turns = turns;
      if (damage > (current.damage || 0)) current.damage = damage;
      if (appliedTurn > (current.appliedTurn || 0)) current.appliedTurn = appliedTurn;
    } else {
      statuses[id] = { id: id, turns: turns, damage: damage, appliedTurn: appliedTurn, color: opts.color || def.color };
    }
    syncBurningLegacy(actor);
    if (id === 'stun') actor.stunned = true;
    if (id === 'chill') actor.chilled = (statuses.chill.turns || 0) > 0;
    return statuses[id];
  }

  function tickDamageStatus(actor, id, ctx) {
    var def = DEFS[id];
    if (!def || def.kind !== 'damage') return;
    var statuses = actor && actor.statuses;
    var status = statuses && statuses[id];
    if (!status || !(status.turns > 0)) return;
    if (status.appliedTurn >= turnOf(ctx)) return;
    var multiplier = elementalMultiplier(actor, def.element);
    var damage = Math.min(actor.hp, Math.max(1, Math.round((status.damage || def.defaultDamage || 1) * multiplier)));
    actor.hp -= damage;
    if (isParty(ctx, actor)) {
      if (ctx.onDamage) ctx.onDamage(actor, damage, def.deathCause || 'От урона со временем');
    }
    var color = (status.color || def.color || '#ffffff');
    RK.Effects.add(actor.x, actor.y, color, { maxR: 10 });
    RK.Effects.addDamage(actor.x, actor.y, damage, color);
    RK.UI.msg((status && status.name ? status.name : def.name) + ': -' + damage +
      ' HP (' + (status.turns - 1) + ' хода).');
    status.turns--;
    if (status.turns <= 0) {
      delete statuses[id];
      if (id === 'burning') {
        actor.burningTurns = 0;
        actor.burningDamage = 0;
        actor.burningAppliedTurn = 0;
      }
      RK.UI.msg((def.name) + ' прошло.');
    }
    syncBurningLegacy(actor);
  }

  function tickActorStatuses(actor, ctx) {
    if (!actor || actor.hp <= 0) return;
    ctx = contextOf(ctx);
    ensureStatuses(actor);
    tickDamageStatus(actor, 'burning', ctx);
    tickDamageStatus(actor, 'poison', ctx);
    tickDamageStatus(actor, 'bleed', ctx);
    // Контроль-статусы сами «поглощаются» в enemyAct или просто тикают.
    var stun = actor.statuses && actor.statuses.stun;
    if (stun && stun.turns > 0 && stun.appliedTurn < turnOf(ctx)) {
      stun.turns--;
      if (stun.turns <= 0) delete actor.statuses.stun;
      if (actor.stunned && !(actor.statuses && actor.statuses.stun)) actor.stunned = false;
    }
    var chill = actor.statuses && actor.statuses.chill;
    if (chill && chill.turns > 0 && chill.appliedTurn < turnOf(ctx)) {
      chill.turns--;
      if (chill.turns <= 0) {
        delete actor.statuses.chill;
        actor.chilled = false;
      }
    }
    syncBurningLegacy(actor);
  }

  function applyElementalDamage(target, amount, type) {
    if (!target) return 0;
    var final = Math.max(1, Math.round((amount || 0) * elementalMultiplier(target, type)));
    target.hp -= final;
    return final;
  }

  RK.Statuses = RK.Statuses || {};
  RK.Statuses.DEFS = DEFS;
  RK.Statuses.ELEMENTS = ['physical', 'fire', 'poison', 'ice', 'arcane', 'lightning'];
  RK.Statuses.ensure = ensureStatuses;
  RK.Statuses.apply = applyStatus;
  RK.Statuses.tickActor = tickActorStatuses;
  RK.Statuses.elementalMultiplier = elementalMultiplier;
  RK.Statuses.resistance = elementalMultiplier;
  RK.Statuses.applyDamage = applyElementalDamage;
  RK.Statuses.setContext = function (value) { context = value || null; };
  RK.Statuses.list = function (actor) { return actor && actor.statuses ? Object.keys(actor.statuses) : []; };
})();
