(function () {
  var C = RK.CONFIG;
  var M;

  var walk = {
    animating: false,
    auto: false,
    autoTx: 0,
    autoTy: 0,
    path: null,
    sx: 0,
    sy: 0,
    ex: 0,
    ey: 0,
    t0: 0,
    duration: C.WALK_MS || 95,
    onDone: null,
  };

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function busy() {
    return !!walk.animating;
  }

  function getDrawPos() {
    if (!M || !M.player) return { x: 0, y: 0 };
    var p = M.player;
    if (!walk.animating) return { x: p.x, y: p.y };
    var t = (now() - walk.t0) / walk.duration;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    t = t * t * (3 - 2 * t);
    return {
      x: walk.sx + (walk.ex - walk.sx) * t,
      y: walk.sy + (walk.ey - walk.sy) * t,
    };
  }

  function startStepAnim(nx, ny, done) {
    var p = M.player;
    walk.animating = true;
    walk.sx = p.x;
    walk.sy = p.y;
    walk.ex = nx;
    walk.ey = ny;
    walk.t0 = now();
    walk.duration = C.WALK_MS || 95;
    walk.onDone = done;
  }

  function tickWalk(ts) {
    if (!walk.animating) return false;
    var t = ((ts || now()) - walk.t0) / walk.duration;
    if (t < 1) return true;
    walk.animating = false;
    var cb = walk.onDone;
    walk.onDone = null;
    if (cb) cb();
    return busy();
  }

  function resetGame() {
    walk.animating = false;
    walk.auto = false;
    walk.path = null;
    walk.onDone = null;
    M = RK.GAME = {
      floor: 1,
      turn: 0,
      mapWidth: C.COLS,
      mapHeight: C.ROWS,
      mapStyle: 'stone',
      activeZone: null,
      enemies: [],
      items: [],
      player: null,
      over: false,
      runSeed: RK.RNG.randomSeed(),
      stats: {
        enemiesKilled: 0,
        damageReceived: 0,
        killsByName: {},
        bossKillsByName: {},
      },
    };
  }

  function newRun(options) {
    resetGame();
    var mapSize = options && C.MAP_SIZES[options.size] ? C.MAP_SIZES[options.size] : C.MAP_SIZES.medium;
    M.mapWidth = mapSize.width;
    M.mapHeight = mapSize.height;
    M.mapStyle = options && C.MAP_STYLES[options.style] ? options.style : 'stone';
    var canvas = document.getElementById('game');
    var canvasWrap = document.getElementById('canvas-wrap');
    if (canvas) {
      canvas.width = C.TILE * C.COLS;
      canvas.height = C.TILE * C.ROWS;
    }
    if (RK.Audio && !RK.Audio.start()) RK.UI.msg('Web Audio не поддерживается браузером: звуки недоступны.');
    RK.Narrator.initRun(M);
    var player = RK.Entities.createPlayer(0, 0);
    if (RK.Meta && RK.Meta.data && RK.Meta.data.selectedClass) {
      RK.Classes.applyToPlayer(player, RK.Meta.data.selectedClass);
    } else {
      RK.Classes.applyToPlayer(player, 'tank');
    }
    for (var potionIndex = 0; potionIndex < C.START_POTIONS; potionIndex++) {
      var startingPotion = RK.Items.spawnPotion(player.x, player.y);
      startingPotion.heal = player.potionHeal;
      startingPotion.summary = '+' + startingPotion.heal + ' HP';
      addPotionToBackpack(player.backpack, startingPotion);
    }
    M.player = player;
    recomputePlayerStats();
    startFloor(1);
    RK.UI.show('game');
    RK.UI.msg('WASD / стрелки / нумпад — ход. Клик без врагов в обзоре — автопуть. Q — навык класса.');
    RK.Narrator.onEvent('runStart');
    RK.UI.refresh();
  }

  function startFloor(floor) {
    M.floor = floor;
    M.enemies = [];
    M.items = [];
    M.activeZone = null;
    RK.MapGen.generate(floor, M.runSeed, M.mapWidth, M.mapHeight, M.mapStyle);
    if (RK.Audio) RK.Audio.setFloor(floor);
    M.player.x = RK.Map.spawn.x;
    M.player.y = RK.Map.spawn.y;
    spawnEnemies(RK.Map, floor);
    M.items = RK.Items.spawnItems(floor, RK.Map.spawn);
    RK.Fov.compute(M.player.x, M.player.y);
    updatePlayerZone();
    RK.Narrator.onEvent('floorStart', { floor: floor });
  }

  function enemyPool(floor) {
    if (floor <= 2) return [['slime', 3], ['rat', 3], ['skeleton', 1]];
    if (floor <= 4) return [['slime', 2], ['rat', 2], ['skeleton', 2], ['archer', 1]];
    if (floor <= 7) return [['skeleton', 3], ['archer', 2], ['bat', 2], ['demon', 1]];
    return [['archer', 2], ['bat', 2], ['demon', 3], ['skeleton', 1]];
  }

  function weightedPick(pool) {
    var total = 0;
    for (var i = 0; i < pool.length; i++) total += pool[i][1];
    var r = RK.RNG.rand() * total;
    var acc = 0;
    for (var j = 0; j < pool.length; j++) {
      acc += pool[j][1];
      if (r < acc) return pool[j][0];
    }
    return pool[0][0];
  }

  function spawnEnemies(g, floor) {
    var areaScale = Math.sqrt((g.w * g.h) / (C.COLS * C.ROWS));
    var count = Math.min(100, Math.round((C.BASE_ENEMIES + floor * C.ENEMIES_PER_FLOOR) * areaScale));
    var pool = enemyPool(floor);
    var placed = 0;
    var guard = 0;
    while (placed < count && guard < 400) {
      guard++;
      var t = RK.MapGen.randomFloorNear(g.spawn.x, g.spawn.y, Math.max(g.w, g.h), 6);
      if (!t) continue;
      if (Math.abs(t.x - g.stair.x) <= 3 && Math.abs(t.y - g.stair.y) <= 3) continue;
      var type = weightedPick(pool);
      var e = RK.Entities.makeEnemy(type, t.x, t.y, floor);
      M.enemies.push(e);
      placed++;
    }
    spawnBoss(g, floor);
  }

  function spawnBoss(g, floor) {
    var radii = [6, 10, 16, Math.max(g.w, g.h)];
    var bp = null;
    for (var i = 0; i < radii.length && !bp; i++) {
      bp = RK.MapGen.randomFloorNear(g.stair.x, g.stair.y, radii[i], 1);
    }
    if (!bp) {
      var nb = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (var j = 0; j < nb.length; j++) {
        var nx = g.stair.x + nb[j][0];
        var ny = g.stair.y + nb[j][1];
        if (!RK.MapGen.isWalkable(nx, ny)) continue;
        if (g.spawn && nx === g.spawn.x && ny === g.spawn.y) continue;
        if (getEnemyAt(nx, ny)) continue;
        bp = { x: nx, y: ny };
        break;
      }
    }
    if (!bp) {
      for (var y = 0; y < g.h && !bp; y++) {
        for (var x = 0; x < g.w; x++) {
          if (g.tiles[y][x] !== 1) continue;
          if (g.stair && x === g.stair.x && y === g.stair.y) continue;
          if (g.spawn && x === g.spawn.x && y === g.spawn.y) continue;
          if (getEnemyAt(x, y)) continue;
          bp = { x: x, y: y };
          break;
        }
      }
    }
    if (!bp) bp = { x: g.stair.x, y: g.stair.y };
    M.enemies.push(RK.Entities.makeBoss(bp.x, bp.y, floor));
  }

  function getEnemyAt(x, y) {
    for (var i = 0; i < M.enemies.length; i++) {
      var e = M.enemies[i];
      if (e.alive && e.x === x && e.y === y) return e;
    }
    return null;
  }

  function hasVisibleEnemy() {
    if (!RK.Map || !RK.Map.vis) return false;
    for (var i = 0; i < M.enemies.length; i++) {
      var e = M.enemies[i];
      if (!e.alive) continue;
      if (RK.Map.vis[e.y] && RK.Map.vis[e.y][e.x]) return true;
    }
    return false;
  }

  function playerAction(tx, ty) {
    if (!M || M.over || busy()) return;
    if (!RK.MapGen.isWalkable(tx, ty)) return;
    var p = M.player;
    if (tx === p.x && ty === p.y) {
      skipTurn();
      return;
    }
    if (!hasVisibleEnemy()) {
      beginAutoWalk(tx, ty);
      return;
    }
    var adj = getEnemyAt(tx, ty);
    if (adj) {
      if (adjacent(p, adj)) {
        doAttack(p, adj, true);
        finishTurn();
      } else {
        tryMoveToward(tx, ty);
      }
      return;
    }
    tryMoveToward(tx, ty);
  }

  function beginAutoWalk(tx, ty) {
    walk.auto = true;
    walk.autoTx = tx;
    walk.autoTy = ty;
    continueAutoWalk();
  }

  function stopAutoWalk() {
    walk.auto = false;
  }

  function continueAutoWalk() {
    if (!M || M.over || !walk.auto) {
      stopAutoWalk();
      return;
    }
    var p = M.player;
    if (p.x === walk.autoTx && p.y === walk.autoTy) {
      stopAutoWalk();
      return;
    }
    if (hasVisibleEnemy()) {
      stopAutoWalk();
      return;
    }
    var occ = function (x, y) {
      return getEnemyAt(x, y) != null || (x === p.x && y === p.y);
    };
    var path = RK.MapGen.findPathNear(p.x, p.y, walk.autoTx, walk.autoTy, occ);
    if (!path || !path.length) {
      stopAutoWalk();
      return;
    }
    var s = path[0];
    if (getEnemyAt(s.x, s.y)) {
      stopAutoWalk();
      return;
    }
    var floorBefore = M.floor;
    startStepAnim(s.x, s.y, function () {
      movePlayer(s.x, s.y);
      if (M.over || M.floor !== floorBefore) {
        stopAutoWalk();
        return;
      }
      if (p.x === walk.autoTx && p.y === walk.autoTy) {
        stopAutoWalk();
        return;
      }
      if (hasVisibleEnemy()) {
        stopAutoWalk();
        return;
      }
      continueAutoWalk();
    });
  }

  function skipTurn() {
    if (!M || M.over || busy()) return;
    var p = M.player;
    var mods = RK.Narrator.getMods(M.turn);
    if (mods.restHeal > 0 && p.hp < p.maxHp) {
      var heal = Math.min(p.maxHp - p.hp, mods.restHeal);
      p.hp += heal;
      RK.UI.msg('Отдых: +' + heal + ' HP');
    } else {
      RK.UI.msg('Отдых...');
    }
    RK.Narrator.onEvent('rest');
    finishTurn();
  }

  function adjacent(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;
  }

  function tryStep(dx, dy) {
    if (!M || M.over || busy()) return;
    if (!dx && !dy) {
      skipTurn();
      return;
    }
    var p = M.player;
    var nx = p.x + dx;
    var ny = p.y + dy;
    if (!RK.MapGen.isWalkable(nx, ny)) return;
    var e = getEnemyAt(nx, ny);
    if (e) {
      if (adjacent(p, e)) {
        doAttack(p, e, true);
        finishTurn();
      }
      return;
    }
    startStepAnim(nx, ny, function () {
      movePlayer(nx, ny);
    });
  }

  function tryMoveToward(tx, ty) {
    if (busy()) return;
    var p = M.player;
    var occ = function (x, y) {
      return getEnemyAt(x, y) != null || (x === p.x && y === p.y);
    };
    var path = RK.MapGen.findPathNear(p.x, p.y, tx, ty, occ);
    if (path && path.length) {
      var s = path[0];
      var e = getEnemyAt(s.x, s.y);
      if (e) {
        if (adjacent(p, e)) {
          doAttack(p, e, true);
          finishTurn();
        }
        return;
      }
      startStepAnim(s.x, s.y, function () {
        movePlayer(s.x, s.y);
      });
    }
  }

  function movePlayer(x, y) {
    var p = M.player;
    p.x = x;
    p.y = y;
    if (RK.Audio) RK.Audio.playStep();
    updatePlayerZone();
    handlePickup();
    checkStairs();
    finishTurn();
  }

  function recomputePlayerStats() {
    var p = M.player;
    if (!p) return;
    var info = RK.Classes && RK.Classes.getClassDef ? RK.Classes.getClassDef(p.classId || 'tank') : null;
    var classAtk = 0;
    var classDef = 0;
    var classHp = 0;
    if (info && info.id === 'tank') {
      classDef += 1 + Math.floor((p.level || 1) / 2);
      classHp += 8 + (p.level || 1) * 2;
    }
    if (info && info.id === 'berserker') {
      classAtk += 1 + Math.floor((p.level || 1) / 2);
      classHp += 4 + (p.level || 1);
    }
    p.atk = (p.baseAtk || C.PLAYER.atk) + (p.gearBonuses ? p.gearBonuses.atk : 0) + classAtk;
    p.def = (p.baseDef || C.PLAYER.def) + (p.gearBonuses ? p.gearBonuses.def : 0) + classDef;
    p.maxHp = (p.baseMaxHp || C.PLAYER.hp) + (p.gearBonuses ? p.gearBonuses.hp : 0) + classHp;
    if (p.hp > p.maxHp) p.hp = p.maxHp;
  }

  function getZoneAt(x, y) {
    var zones = RK.Map && RK.Map.zones ? RK.Map.zones : [];
    for (var i = 0; i < zones.length; i++) {
      var dx = x - zones[i].x;
      var dy = y - zones[i].y;
      if (dx * dx + dy * dy <= zones[i].radius * zones[i].radius) return zones[i];
    }
    return null;
  }

  function getZoneMods(x, y) {
    var zone = getZoneAt(x, y);
    return {
      atkBonus: zone && zone.type === 'attack' ? 3 : (zone && zone.type === 'weakAttack' ? -2 : 0),
      defBonus: zone && zone.type === 'weakDefense' ? -2 : 0,
    };
  }

  function updatePlayerZone() {
    var zone = getZoneAt(M.player.x, M.player.y);
    var zoneId = zone ? zone.type + ':' + zone.x + ':' + zone.y : null;
    if (zoneId === M.activeZone) return;
    var wasInZone = M.activeZone !== null;
    M.activeZone = zoneId;
    if (zone) RK.UI.msg('Вы вошли в ' + zone.name + '.');
    else if (wasInZone) RK.UI.msg('Вы покинули зону эффекта.');
  }

  function addPotionToBackpack(backpack, potion) {
    for (var i = 0; i < backpack.length; i++) {
      var stack = backpack[i];
      if (stack.kind === 'potion' && stack.heal === potion.heal) {
        stack.count = (stack.count || 1) + (potion.count || 1);
        return;
      }
    }
    potion.count = potion.count || 1;
    backpack.push(potion);
  }

  function useInventoryItem(index) {
    var p = M.player;
    if (!p || !p.backpack || !p.backpack[index]) return false;
    var item = p.backpack[index];
    if (item.kind === 'potion') {
      return usePotion(index);
    }
    if (item.slot) {
      if (item.equipped) {
        p.equipment[item.slot] = null;
        item.equipped = false;
        p.gearBonuses.atk -= item.stats && item.stats.atk ? item.stats.atk : 0;
        p.gearBonuses.def -= item.stats && item.stats.def ? item.stats.def : 0;
        p.gearBonuses.hp -= item.stats && item.stats.hp ? item.stats.hp : 0;
        p.backpack.splice(index, 1);
        p.backpack.push(item);
        recomputePlayerStats();
        RK.UI.msg('Снято: ' + item.name);
        RK.UI.refresh();
        return true;
      }
      var current = p.equipment[item.slot];
      if (current) {
        p.gearBonuses.atk -= current.stats && current.stats.atk ? current.stats.atk : 0;
        p.gearBonuses.def -= current.stats && current.stats.def ? current.stats.def : 0;
        p.gearBonuses.hp -= current.stats && current.stats.hp ? current.stats.hp : 0;
        p.backpack.splice(index, 1);
        current.equipped = false;
        p.backpack.push(current);
      } else {
        p.backpack.splice(index, 1);
      }
      p.equipment[item.slot] = item;
      item.equipped = true;
      p.gearBonuses.atk += item.stats && item.stats.atk ? item.stats.atk : 0;
      p.gearBonuses.def += item.stats && item.stats.def ? item.stats.def : 0;
      p.gearBonuses.hp += item.stats && item.stats.hp ? item.stats.hp : 0;
      recomputePlayerStats();
      RK.UI.msg('Надето: ' + item.name + ' (' + item.summary + ')');
      RK.UI.refresh();
      return true;
    }
    return false;
  }

  function usePotion(index) {
    var p = M && M.player;
    if (!p || !p.backpack) return false;
    var potionIndex = index;
    if (potionIndex == null) {
      potionIndex = -1;
      for (var i = 0; i < p.backpack.length; i++) {
        if (p.backpack[i].kind === 'potion') {
          potionIndex = i;
          break;
        }
      }
    }
    var potion = p.backpack[potionIndex];
    if (!potion || potion.kind !== 'potion') {
      RK.UI.msg('В рюкзаке нет зелий.');
      return false;
    }
    if (p.hp >= p.maxHp) {
      RK.UI.msg('Зелье можно выпить, когда здоровье будет неполным.');
      return false;
    }
    var healing = Math.min(p.maxHp - p.hp, potion.heal || p.potionHeal);
    p.hp += healing;
    potion.count = (potion.count || 1) - 1;
    if (potion.count <= 0) p.backpack.splice(potionIndex, 1);
    if (RK.Audio) RK.Audio.playAbility();
    RK.UI.msg('Зелье лечения: +' + healing + ' HP.');
    RK.UI.refresh();
    return true;
  }

  function dropInventoryItem(index) {
    var p = M.player;
    if (!p || !p.backpack || !p.backpack[index]) return false;
    var item = p.backpack.splice(index, 1)[0];
    if (item.equipped && p.equipment[item.slot]) {
      p.equipment[item.slot] = null;
      p.gearBonuses.atk -= item.stats && item.stats.atk ? item.stats.atk : 0;
      p.gearBonuses.def -= item.stats && item.stats.def ? item.stats.def : 0;
      p.gearBonuses.hp -= item.stats && item.stats.hp ? item.stats.hp : 0;
      item.equipped = false;
      recomputePlayerStats();
    }
    item.x = p.x;
    item.y = p.y;
    item.type = item.type || (item.slot === 'weapon' ? 'sword' : item.slot === 'armor' ? 'shield' : item.slot === 'boots' ? 'boots' : 'gold');
    M.items.push(item);
    RK.UI.msg('Вы выбросили: ' + item.name);
    RK.UI.refresh();
    return true;
  }

  function unequipSlot(slot) {
    var p = M.player;
    if (!p || !slot || !p.equipment || !p.equipment[slot]) return false;
    var item = p.equipment[slot];
    p.equipment[slot] = null;
    item.equipped = false;
    p.gearBonuses.atk -= item.stats && item.stats.atk ? item.stats.atk : 0;
    p.gearBonuses.def -= item.stats && item.stats.def ? item.stats.def : 0;
    p.gearBonuses.hp -= item.stats && item.stats.hp ? item.stats.hp : 0;
    p.backpack.push(item);
    recomputePlayerStats();
    RK.UI.msg('Снято: ' + item.name);
    RK.UI.refresh();
    return true;
  }

  function handlePickup() {
    var p = M.player;
    for (var i = M.items.length - 1; i >= 0; i--) {
      var it = M.items[i];
      if (it.x === p.x && it.y === p.y) {
        M.items.splice(i, 1);
        if (it.type === 'gold' && it.kind !== 'loot') {
          var g = Math.max(1, Math.round((it.amt || 0) * (1 + RK.Meta.data.luck * 0.15) *
            RK.Narrator.getMods(M.turn).goldMul));
          p.gold += g;
          RK.UI.msg('Золото +' + g);
        } else if (it.type === 'potion' || it.kind === 'potion') {
          var potion = {};
          for (var potionProperty in it) potion[potionProperty] = it[potionProperty];
          potion.kind = 'potion';
          potion.type = 'potion';
          potion.name = potion.name || 'Зелье лечения';
          potion.heal = Math.max(potion.heal || 0, p.potionHeal);
          potion.summary = '+' + potion.heal + ' HP';
          addPotionToBackpack(p.backpack, potion);
          RK.UI.msg('Зелье лечения добавлено в рюкзак (всего: ' +
            p.backpack.reduce(function (total, stack) {
              return total + (stack.kind === 'potion' ? (stack.count || 1) : 0);
            }, 0) + ').');
        } else if (it.kind === 'loot') {
          var gear = {};
          for (var property in it) gear[property] = it[property];
          gear.x = p.x;
          gear.y = p.y;
          p.backpack.push(gear);
          RK.UI.msg('Подобран лут: ' + gear.name + ' (' + gear.summary + ')');
        }
      }
    }
  }

  function checkStairs() {
    var p = M.player;
    if (p.x === RK.Map.stair.x && p.y === RK.Map.stair.y) {
      if (M.floor >= C.MAX_FLOOR) {
        victory();
      } else {
        M.floor++;
        RK.UI.msg('Вы спускаетесь на этаж ' + M.floor);
        startFloor(M.floor);
      }
    }
  }

  function finishTurn() {
    if (M.over) return;
    M.turn++;
    if (M.player.classSkillCooldown > 0) M.player.classSkillCooldown--;
    if (M.player.reflectShield > 0) M.player.reflectShield--;
    if (M.player.rageTurns > 0) M.player.rageTurns--;
    recomputePlayerStats();
    RK.Narrator.tick(M.turn);
    var zone = getZoneAt(M.player.x, M.player.y);
    if (zone && zone.type === 'regen' && M.player.hp < M.player.maxHp) {
      var healing = Math.min(2, M.player.maxHp - M.player.hp);
      M.player.hp += healing;
      RK.UI.msg('Зона регенерации: +' + healing + ' HP.');
    }
    if (M.player.hp > 0) enemiesAct();
    RK.Fov.compute(M.player.x, M.player.y);
    RK.Narrator.onEvent('turnEnd', { turn: M.turn });
    RK.UI.refresh();
    if (M.player.hp <= 0) death();
  }

  function enemiesAct() {
    if (RK.Narrator.getMods(M.turn).freezeEnemies) return;
    for (var i = 0; i < M.enemies.length; i++) {
      var e = M.enemies[i];
      if (!e.alive || M.player.hp <= 0) continue;
      enemyAct(e);
    }
  }

  function enemyAct(e) {
    var p = M.player;
    if (!e.alerted) {
      var dx = p.x - e.x;
      var dy = p.y - e.y;
      var radius = C.ENEMY_VISION_RADIUS;
      if (dx * dx + dy * dy > radius * radius || !RK.Fov.lineOk(e.x, e.y, p.x, p.y)) return;
      e.alerted = true;
    }
    if (e.behavior === 'slow' && M.turn % 2 === 0) return;
    var d = RK.MapGen.manhattan(e.x, e.y, p.x, p.y);
    var near = adjacent(e, p);
    if (e.behavior === 'archer') {
      if (d <= 4 && RK.Fov.lineOk(e.x, e.y, p.x, p.y)) {
        doAttack(e, p, false);
      } else {
        chase(e, p);
      }
    } else {
      if (near) {
        doAttack(e, p, false);
      } else {
        chase(e, p);
      }
    }
  }

  function chase(e, p) {
    var path = RK.MapGen.findPath(e.x, e.y, p.x, p.y, null);
    if (!path || !path.length) return;
    var s = path[0];
    if (getEnemyAt(s.x, s.y) || (s.x === p.x && s.y === p.y)) return;
    e.x = s.x;
    e.y = s.y;
    if (e.behavior === 'bat') {
      var path2 = RK.MapGen.findPath(e.x, e.y, p.x, p.y, null);
      if (path2 && path2.length) {
        var s2 = path2[0];
        if (!getEnemyAt(s2.x, s2.y) && !(s2.x === p.x && s2.y === p.y)) {
          e.x = s2.x;
          e.y = s2.y;
        }
      }
    }
  }

  function doAttack(att, def, byPlayer) {
    if (def.alive === false) return;
    if (RK.Audio) RK.Audio.playAttack();
    var mods = RK.Narrator.getMods(M.turn);
    if (def.dodge && RK.RNG.chance(def.dodge)) {
      RK.Effects.add(def.x, def.y, '#aaaaaa', { maxR: 7 });
      RK.Effects.addDamage(def.x, def.y, 'MISS', '#aaaaaa');
      if (byPlayer) RK.UI.msg(def.name + ' уклонился!');
      else RK.UI.msg('Нетопырь увернулся!');
      return;
    }
    var p = M.player;
    var zoneMods = getZoneMods(p.x, p.y);
    var dmg = Math.max(1, att.atk + (byPlayer ? mods.atkBonus + zoneMods.atkBonus : 0) +
      RK.RNG.int(0, 2) - def.def - (byPlayer ? 0 : mods.defBonus + zoneMods.defBonus));
    if (!byPlayer) dmg += mods.dmgTakenBonus;
    if (byPlayer && p && p.classId === 'berserker' && p.rageTurns > 0) {
      dmg += 4;
    }
    if (!byPlayer && p && p.classId === 'tank' && p.reflectShield > 0) {
      var reflected = Math.max(1, Math.floor(dmg * 0.5));
      att.hp = Math.max(0, (att.hp || 0) - reflected);
      RK.UI.msg('Щитовой ответ: отражено ' + reflected + ' урона.');
      dmg = Math.max(1, Math.floor(dmg * 0.5));
      if (att.hp <= 0) {
        killEnemy(att);
      }
    }
    dmg = Math.max(1, dmg);
    if (!byPlayer) {
      M.stats.damageReceived += Math.min(dmg, Math.max(0, def.hp));
    }
    def.hp -= dmg;
    splatBlood(def.x, def.y, byPlayer ? 1.2 : 0.9, def.behavior === 'boss');
    if (byPlayer) {
      if (p && p.classId === 'berserker' && p.rageTurns > 0) {
        var heal = Math.min(p.maxHp - p.hp, Math.max(1, Math.round(dmg * 0.7)));
        p.hp += heal;
        RK.UI.msg('Безумие: +' + heal + ' HP');
      }
      RK.Effects.add(def.x, def.y, def.color, { maxR: def.behavior === 'boss' ? 13 : 9 });
      RK.Effects.addDamage(def.x, def.y, dmg, '#ffdd55');
      RK.UI.msg('Вы бьёте ' + def.name + ' на ' + dmg);
      if (def.hp <= 0) killEnemy(def);
    } else {
      RK.Effects.add(def.x, def.y, '#ff5252', { maxR: 12 });
      RK.Effects.addDamage(def.x, def.y, dmg, '#ff5252');
      RK.Effects.notePlayerHit();
      RK.UI.msg(att.name + ' бьёт вас на ' + dmg);
    }
  }

  function splatBlood(x, y, strength, heavy) {
    var n = heavy ? 4 : 2;
    for (var i = 0; i < n; i++) {
      var ox = x + (RK.RNG.chance(0.55) ? RK.RNG.int(-1, 1) : 0);
      var oy = y + (RK.RNG.chance(0.55) ? RK.RNG.int(-1, 1) : 0);
      RK.MapGen.addBlood(ox, oy, strength);
    }
    if (heavy) RK.MapGen.addBlood(x, y, strength * 1.4);
  }

  function killEnemy(e) {
    e.alive = false;
    M.stats.enemiesKilled++;
    if (e.behavior === 'boss') {
      M.stats.bossKillsByName[e.name] = (M.stats.bossKillsByName[e.name] || 0) + 1;
    } else {
      M.stats.killsByName[e.name] = (M.stats.killsByName[e.name] || 0) + 1;
    }
    splatBlood(e.x, e.y, e.behavior === 'boss' ? 1.8 : 1.3, true);
    var p = M.player;
    addXp(e.xp);
    RK.Narrator.onEvent('kill', { boss: e.behavior === 'boss' });
    var gold = Math.max(1, RK.RNG.int(2, 6) + M.floor * 2);
    M.items.push({ type: 'gold', kind: 'gold', x: e.x, y: e.y, amt: gold, name: 'Золото', summary: 'Монеты', rarity: 'common', color: RK.Items.RARITY_COLORS.common });
    RK.UI.msg('С ' + e.name + ' выпало золото: ' + gold + '.');
    if (e.behavior === 'boss' || RK.RNG.chance(0.5)) {
      var drop = RK.Items.generateLootItem(M.floor, e.x, e.y, e.behavior === 'boss');
      drop.source = 'kill';
      M.items.push(drop);
      RK.UI.msg('С трупа выпал лут: ' + (drop.name || 'Лут'));
    }
  }

  function addXp(n) {
    var p = M.player;
    n = Math.round(n * RK.Narrator.getMods(M.turn).xpMul);
    p.xp += n;
    var need = C.XP_BASE + (p.level - 1) * C.XP_GROWTH;
    while (p.xp >= need) {
      p.xp -= need;
      p.level++;
      p.baseMaxHp += C.LEVEL_HP;
      p.maxHp += C.LEVEL_HP;
      p.hp = Math.min(p.maxHp, p.hp + C.LEVEL_HEAL);
      p.baseAtk += C.LEVEL_ATK;
      recomputePlayerStats();
      need = C.XP_BASE + (p.level - 1) * C.XP_GROWTH;
      RK.UI.msg('Уровень повышен! Теперь ' + p.level);
      RK.Narrator.onEvent('levelUp');
    }
  }

  function bankGold() {
    var p = M.player;
    var g = Math.floor(p.gold * (1 + RK.Meta.data.luck * 0.15));
    RK.Meta.addBank(g);
    return g;
  }

  function death() {
    M.over = true;
    RK.Narrator.onEvent('death');
    var g = bankGold();
    RK.UI.over(false, M.floor, M.player.level, g, M.stats);
  }

  function victory() {
    M.over = true;
    RK.Narrator.onEvent('victory');
    var g = bankGold();
    RK.UI.over(true, C.MAX_FLOOR, M.player.level, g, M.stats);
  }

  function setPlayerStats(stats) {
    if (!M || M.over || !M.player) return false;
    var p = M.player;
    p.baseMaxHp = stats.maxHp;
    p.baseAtk = stats.atk;
    p.baseDef = stats.def;
    p.maxHp = stats.maxHp;
    p.hp = Math.min(stats.hp, p.maxHp);
    recomputePlayerStats();
    RK.UI.refresh();
    if (p.hp <= 0) death();
    return true;
  }

  function activateClassSkill() {
    var p = M && M.player;
    if (!M || M.over || !p) return false;
    var ok = RK.Classes.useSkill(p);
    if (ok) {
      if (RK.Audio) RK.Audio.playAbility();
      RK.UI.refresh();
      return true;
    }
    RK.UI.msg('Навык класса перезаряжается.');
    return false;
  }

  RK.Combat = {
    newRun: newRun,
    playerAction: playerAction,
    skipTurn: skipTurn,
    tryStep: tryStep,
    setPlayerStats: setPlayerStats,
    getEnemyAt: getEnemyAt,
    useInventoryItem: useInventoryItem,
    usePotion: usePotion,
    dropInventoryItem: dropInventoryItem,
    unequipSlot: unequipSlot,
    recomputePlayerStats: recomputePlayerStats,
    activateClassSkill: activateClassSkill,
    getZoneAt: getZoneAt,
    getZoneMods: getZoneMods,
    busy: busy,
    tickWalk: tickWalk,
    getDrawPos: getDrawPos,
  };
})();
