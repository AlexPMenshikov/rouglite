// Динамические мировые события: случайные происшествия в локации. Состояние
// лежит на GAME.events данными, поэтому уезжает в снимке вместе с забегом:
// клиент и сервер видят одно событие. Хук — вызов tick() из finishTurn.
(function () {
  var C = RK.CONFIG;

  // Пауза между событиями и шанс на ход: событие заметно, но не мешает.
  // Шанс снижен вдвое (было 0.06): события отвлекали от боя.
  var MIN_GAP_TURNS = 18;
  var EVENT_CHANCE = 0.03;

  var DEFS = {
    ambush: {
      title: 'Засада', city: false, weight: 3,
      msg: 'Засада! Из-за угла выскакивают враги.',
    },
    goldRush: {
      title: 'Золотая жила', city: true, weight: 2,
      msg: 'Земля трескается: вокруг рассыпается золото.',
    },
    trapSurge: {
      title: 'Скрытые ловушки', city: false, weight: 2,
      msg: 'Пол проваливается: вокруг взводятся ловушки.',
    },
    regenBloom: {
      title: 'Цветение жизни', city: true, weight: 2, turns: 10,
      msg: 'Цветение жизни: вокруг расцвела зона регенерации.',
      endMsg: 'Цветение увяло.',
    },
    bloodMoon: {
      title: 'Кровавая луна', city: false, weight: 1, turns: 8,
      msg: 'Кровавая луна: враги становятся злее (+3 атаки).',
      endMsg: 'Луна скрылась: враги успокоились.',
    },
  };

  function game() { return RK.GAME; }

  function ensureState(g) {
    if (!g.events || typeof g.events !== 'object') {
      g.events = { active: null, lastTurn: g.turn };
    }
    return g.events;
  }

  function locationType() {
    return RK.World && RK.World.current() ? RK.World.current().type : null;
  }

  function itemAt(g, x, y) {
    var items = g.items || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].x === x && items[i].y === y) return true;
    }
    return false;
  }

  // Клетка свободна для события: пол, без объектов, врагов и выходов.
  function isFreeTile(g, x, y) {
    var mm = RK.Map;
    if (!mm || !RK.MapGen.isWalkable(x, y)) return false;
    if (RK.MapGen.getDoorAt(x, y) || RK.MapGen.getChestAt(x, y) || RK.MapGen.getTrapAt(x, y)) return false;
    if (RK.Combat && RK.Combat.getEnemyAt && RK.Combat.getEnemyAt(x, y)) return false;
    if (g.locationMode && mm.exits && mm.exits.some(function (exit) {
      return exit.x === x && exit.y === y;
    })) return false;
    return true;
  }

  // Клетки вокруг точки: randomFloorNear уже отсекает стены, двери, лестницу
  // и спавн, остальное проверяет isFreeTile и take.
  function scatterAround(g, px, py, radius, minDist, count, take) {
    var placed = 0;
    var guard = 0;
    while (placed < count && guard < count * 12) {
      guard++;
      var t = RK.MapGen.randomFloorNear(px, py, radius, minDist);
      if (!t || !isFreeTile(g, t.x, t.y)) continue;
      if (take(t.x, t.y)) placed++;
    }
    return placed;
  }

  function spawnAmbush(g) {
    var loc = RK.World && RK.World.current();
    var locTypes = loc && C.LOCATION_ENEMIES[loc.type];
    var pool = [];
    if (locTypes && locTypes.length) {
      for (var i = 0; i < locTypes.length; i++) pool.push(locTypes[i]);
    } else {
      pool = ['slime', 'rat', 'skeleton'];
    }
    var p = g.player;
    var count = Math.min(6, 3 + Math.floor(g.floor / 3));
    var before = g.enemies.length;
    scatterAround(g, p.x, p.y, 5, 2, count, function (x, y) {
      var enemy = RK.Entities.makeEnemy(
        pool[RK.RNG.int(0, pool.length - 1)], x, y, g.floor, RK.RNG.chance(0.2));
      enemy.alerted = true;
      g.enemies.push(enemy);
      return true;
    });
    return g.enemies.length > before;
  }

  function spawnGoldRush(g) {
    var p = g.player;
    var before = g.items.length;
    scatterAround(g, p.x, p.y, 4, 1, 6, function (x, y) {
      if (itemAt(g, x, y)) return false;
      g.items.push({
        type: 'gold', asset: 'gold', kind: 'gold',
        x: x, y: y,
        amt: RK.RNG.int(5, 12) + g.floor * 3,
        name: 'Золото', summary: 'Монеты', rarity: 'common',
        color: RK.Items.RARITY_COLORS.common,
      });
      return true;
    });
    return g.items.length > before;
  }

  function spawnTrapSurge(g) {
    var mm = RK.Map;
    if (!mm) return false;
    var p = g.player;
    var before = mm.traps.length;
    var types = C.TRAP_TYPES;
    scatterAround(g, p.x, p.y, 3, 2, 5, function (x, y) {
      mm.traps.push({
        x: x, y: y, asset: 'trap',
        type: types[RK.RNG.int(0, types.length - 1)],
        state: 'armed',
        damage: Math.max(2, Math.floor(g.floor * 1.5) + 2),
      });
      return true;
    });
    return mm.traps.length > before;
  }

  // Ближайшая свободная клетка по спирали — как findFreeTileNear в combat.
  function nearestFreeTile(g, x, y, radius) {
    for (var r = 1; r <= radius; r++) {
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          var nx = x + dx;
          var ny = y + dy;
          if (isFreeTile(g, nx, ny)) return { x: nx, y: ny };
        }
      }
    }
    return null;
  }

  function startRegenBloom(g) {
    var tile = nearestFreeTile(g, g.player.x, g.player.y, 3);
    if (!tile) return false;
    RK.Map.zones.push({
      type: 'regen', x: tile.x, y: tile.y, radius: 4,
      name: 'зону регенерации', eventZone: true,
    });
    return true;
  }

  function endRegenBloom() {
    var zones = RK.Map ? RK.Map.zones : null;
    if (!zones) return;
    for (var i = zones.length - 1; i >= 0; i--) {
      if (zones[i].eventZone) zones.splice(i, 1);
    }
  }

  function startBloodMoon(g) {
    var boosted = 0;
    for (var i = 0; i < g.enemies.length; i++) {
      var e = g.enemies[i];
      if (!e.alive || e.eventBoosted) continue;
      e.eventBoosted = true;
      e.atk += 3;
      boosted++;
    }
    return boosted > 0;
  }

  function endBloodMoon(g) {
    for (var i = 0; i < g.enemies.length; i++) {
      var e = g.enemies[i];
      if (e.eventBoosted) {
        e.atk -= 3;
        e.eventBoosted = false;
      }
    }
  }

  function activate(g, id) {
    var def = DEFS[id];
    if (!def) return false;
    var ok = false;
    if (id === 'ambush') ok = spawnAmbush(g);
    else if (id === 'goldRush') ok = spawnGoldRush(g);
    else if (id === 'trapSurge') ok = spawnTrapSurge(g);
    else if (id === 'regenBloom') ok = startRegenBloom(g);
    else if (id === 'bloodMoon') ok = startBloodMoon(g);
    if (RK.UI && RK.UI.msg) RK.UI.msg(def.msg);
    if (def.turns) ensureState(g).active = { id: id, turnsLeft: def.turns };
    if (RK.Effects && RK.Effects.add) {
      var color = id === 'bloodMoon' ? '#ff5252' : (id === 'regenBloom' ? '#7ae582' : '#ffd166');
      RK.Effects.add(g.player.x, g.player.y, color, { maxR: 14, life: 500 });
    }
    return ok;
  }

  function endActive(g, active) {
    var def = DEFS[active.id];
    if (active.id === 'bloodMoon') endBloodMoon(g);
    else if (active.id === 'regenBloom') endRegenBloom();
    if (def && def.endMsg && RK.UI && RK.UI.msg) RK.UI.msg(def.endMsg);
  }

  function pickEvent() {
    var type = locationType();
    var ids = Object.keys(DEFS);
    var total = 0;
    var weights = [];
    for (var i = 0; i < ids.length; i++) {
      var def = DEFS[ids[i]];
      var w = (def.city || type !== 'city') ? def.weight : 0;
      weights.push(w);
      total += w;
    }
    if (!total) return null;
    var r = RK.RNG.rand() * total;
    var acc = 0;
    for (var j = 0; j < ids.length; j++) {
      acc += weights[j];
      if (r < acc) return ids[j];
    }
    return ids[0];
  }

  function tick() {
    var g = game();
    if (!g || g.over || !g.player || !RK.Map) return;
    var ev = ensureState(g);
    if (ev.active) {
      ev.active.turnsLeft--;
      if (ev.active.turnsLeft <= 0) {
        endActive(g, ev.active);
        ev.active = null;
      }
    }
    if (ev.active) return;
    if (g.turn - ev.lastTurn < MIN_GAP_TURNS) return;
    if (!RK.RNG.chance(EVENT_CHANCE)) return;
    var id = pickEvent();
    if (!id) return;
    ev.lastTurn = g.turn;
    activate(g, id);
  }

  function init(g) {
    ensureState(g);
    g.events.lastTurn = g.turn;
  }

  // Принудительный запуск: для отладки и тестов, минуя шанс и паузу.
  function force(id) {
    var g = game();
    if (!g || g.over) return false;
    var ev = ensureState(g);
    ev.lastTurn = g.turn;
    return activate(g, id);
  }

  RK.Events = {
    init: init,
    tick: tick,
    force: force,
    EVENTS: DEFS,
  };
})();
