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
      merchant: null,
      quest: null,
      player: null,
      over: false,
      result: null,
      runSeed: RK.RNG.randomSeed(),
      stats: {
        enemiesKilled: 0,
        damageReceived: 0,
        killsByName: {},
        bossKillsByName: {},
        foundItems: [],
      },
    };
  }

  function newRun(options) {
    resetGame();
    var mapSize = options && C.MAP_SIZES[options.size] ? C.MAP_SIZES[options.size] : C.MAP_SIZES.medium;
    M.mapWidth = mapSize.width;
    M.mapHeight = mapSize.height;
    M.mapStyle = options && C.MAP_STYLES[options.style] ? options.style : 'stone';
    RK.RNG.reset(M.runSeed);
    M.quest = RK.RNG.chance(0.5) ? {
      type: 'demon',
      target: 5,
      progress: 0,
      reward: 120,
      description: 'Убить 5 демонов',
    } : {
      type: 'loot',
      target: 3,
      progress: 0,
      reward: 90,
      description: 'Найти 3 предмета снаряжения',
    };
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
    player.id = RK.Network && RK.Network.playerId ? RK.Network.playerId() || 'local' : 'local';
    player.name = RK.Meta && RK.Meta.data && RK.Meta.data.playerName || 'Игрок';
    M.players = [player];
    recomputePlayerStats();
    startFloor(1);
    RK.UI.show('game');
    RK.UI.msg('WASD / стрелки / нумпад — ход; E — дверь/сундук/торговец, L — взлом/ловушка, F — выбить. Q — навык, R — зелье.');
    RK.Narrator.onEvent('runStart');
    RK.UI.refresh();
    if (RK.Network && RK.Network.publishState) RK.Network.publishState();
  }

  function startFloor(floor) {
    M.floor = floor;
    M.enemies = [];
    M.items = [];
    M.activeZone = null;
    RK.MapGen.generate(floor, M.runSeed, M.mapWidth, M.mapHeight, M.mapStyle);
    if (RK.Audio) RK.Audio.setFloor(floor);
    for (var pi = 0; pi < (M.players || [M.player]).length; pi++) {
      var partyMember = M.players ? M.players[pi] : M.player;
      if (pi === 0) {
        partyMember.x = RK.Map.spawn.x;
        partyMember.y = RK.Map.spawn.y;
        continue;
      }
      var radius = 1;
      while (radius < Math.max(M.mapWidth, M.mapHeight)) {
        var placed = false;
        for (var py = -radius; py <= radius && !placed; py++) {
          for (var px = -radius; px <= radius; px++) {
            var candidateX = RK.Map.spawn.x + px;
            var candidateY = RK.Map.spawn.y + py;
            if (Math.max(Math.abs(px), Math.abs(py)) !== radius ||
                !RK.MapGen.isWalkable(candidateX, candidateY) ||
                getEnemyAt(candidateX, candidateY) ||
                (RK.Map.stair.x === candidateX && RK.Map.stair.y === candidateY) ||
                (M.players || []).some(function (other) {
                  return other !== partyMember && other.x === candidateX && other.y === candidateY;
                })) continue;
            partyMember.x = candidateX;
            partyMember.y = candidateY;
            placed = true;
            break;
          }
        }
        if (placed) break;
        radius++;
      }
    }
    spawnEnemies(RK.Map, floor);
    M.items = RK.Items.spawnItems(floor, RK.Map.spawn);
    placeChests(RK.Map);
    placeMerchant(RK.Map);
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
    if (!M || M.over || busy()) return false;
    var door = RK.MapGen.getDoorAt(tx, ty);
    var chest = RK.MapGen.getChestAt(tx, ty);
    var merchant = getMerchantAt(tx, ty);
    var trap = RK.MapGen.getTrapAt(tx, ty);
    if (door || chest || merchant || trap) {
      var target = door || chest || merchant || trap;
      var dx = target.x - M.player.x;
      var dy = target.y - M.player.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) {
        RK.UI.msg(trap ? 'Подойдите вплотную, чтобы обезвредить ловушку.' : 'Подойдите к объекту вплотную, чтобы взаимодействовать.');
        return false;
      }
      setFacing(dx, dy);
      if (merchant) {
        if (RK.Network && RK.Network.isHost && RK.Network.isHost() &&
            M.player.id !== RK.Network.playerId()) {
          RK.Network.openMerchant(M.player.id);
        } else {
          RK.UI.showMerchant();
        }
        return true;
      }
      if (trap && !door && !chest) {
        RK.UI.msg('Ловушка под ногами. Нажмите L, чтобы обезвредить её.');
        return true;
      }
      return interact('use');
    }
    if (!RK.MapGen.isWalkable(tx, ty)) return false;
    var p = M.player;
    if (tx === p.x && ty === p.y) {
      skipTurn();
      return true;
    }
    if (!hasVisibleEnemy()) {
      beginAutoWalk(tx, ty);
      return walk.auto || busy();
    }
    var adj = getEnemyAt(tx, ty);
    if (adj) {
      if (adjacent(p, adj)) {
        doAttack(p, adj, true);
        finishTurn();
        return true;
      } else {
        tryMoveToward(tx, ty);
      }
      return busy();
    }
    tryMoveToward(tx, ty);
    return busy();
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
      return getEnemyAt(x, y) != null || (x === p.x && y === p.y) ||
        getPartyPlayerAt(x, y, p.id) != null;
    };
    var path = RK.MapGen.findPathNear(p.x, p.y, walk.autoTx, walk.autoTy, occ);
    if (!path || !path.length) {
      stopAutoWalk();
      return;
    }
    var s = path[0];
    if (getEnemyAt(s.x, s.y) || getPartyPlayerAt(s.x, s.y, p.id)) {
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
    if (!M || M.over || busy()) return false;
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
    return true;
  }

  function adjacent(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;
  }

  function tryStep(dx, dy) {
    if (!M || M.over || busy()) return false;
    if (!dx && !dy) {
      skipTurn();
      return true;
    }
    var p = M.player;
    var nx = p.x + dx;
    var ny = p.y + dy;
    setFacing(dx, dy);
    if (!RK.MapGen.isWalkable(nx, ny)) return false;
    if (getPartyPlayerAt(nx, ny, p.id)) return false;
    var e = getEnemyAt(nx, ny);
    if (e) {
      if (adjacent(p, e)) {
        doAttack(p, e, true);
        finishTurn();
        return true;
      }
      return false;
    }
    startStepAnim(nx, ny, function () {
      movePlayer(nx, ny);
    });
    return true;
  }

  function tryMoveToward(tx, ty) {
    if (busy()) return;
    var p = M.player;
    var occ = function (x, y) {
      return getEnemyAt(x, y) != null || (x === p.x && y === p.y) ||
        getPartyPlayerAt(x, y, p.id) != null;
    };
    var path = RK.MapGen.findPathNear(p.x, p.y, tx, ty, occ);
    if (path && path.length) {
      var s = path[0];
      setFacing(s.x - p.x, s.y - p.y);
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

  function setFacing(dx, dy) {
    var p = M && M.player;
    if (!p || (!dx && !dy)) return;
    p.facingX = Math.max(-1, Math.min(1, dx));
    p.facingY = Math.max(-1, Math.min(1, dy));
  }

  function facingObject() {
    var p = M && M.player;
    if (!p) return null;
    var x = p.x + (p.facingX || 0);
    var y = p.y + (p.facingY || 0);
    return {
      door: RK.MapGen.getDoorAt(x, y),
      chest: RK.MapGen.getChestAt(x, y),
      merchant: getMerchantAt(x, y),
      trap: RK.MapGen.getTrapAt(x, y),
    };
  }

  function getMerchantAt(x, y) {
    return M && M.merchant && M.merchant.x === x && M.merchant.y === y ? M.merchant : null;
  }

  function consumeKey(keyId) {
    var backpack = M.player.backpack || [];
    for (var i = 0; i < backpack.length; i++) {
      var key = backpack[i];
      if (key.kind !== 'key' || key.keyId !== keyId || key.count < 1) continue;
      key.count--;
      if (key.count === 0) backpack.splice(i, 1);
      return true;
    }
    return false;
  }

  function wakeNearbyEnemies(x, y) {
    for (var i = 0; i < M.enemies.length; i++) {
      var enemy = M.enemies[i];
      if (enemy.alive && RK.MapGen.manhattan(x, y, enemy.x, enemy.y) <= 8) enemy.alerted = true;
    }
  }

  function triggerTrapOnTile(x, y, actor) {
    var trap = RK.MapGen.getTrapAt(x, y);
    if (!trap || trap.state === 'disarmed' || trap.state === 'triggered') return false;
    var damage = Math.max(1, trap.damage || Math.max(2, Math.floor(M.floor * 1.5) + 2));
    if (actor && actor.id === M.player.id) {
      var before = M.player.hp;
      M.player.hp = Math.max(0, M.player.hp - damage);
      M.stats.damageReceived += Math.min(damage, before);
      trap.state = 'triggered';
      if (trap.type === 'flame' && M.player.hp > 0) {
        M.player.burningTurns = Math.max(M.player.burningTurns || 0, 3);
        M.player.burningDamage = Math.max(M.player.burningDamage || 0, 2);
        M.player.burningAppliedTurn = M.turn + 1;
      }
      RK.Effects.add(M.player.x, M.player.y, trap.type === 'flame' ? '#ff7b32' : '#dedede', { maxR: 12 });
      RK.Effects.addDamage(M.player.x, M.player.y, damage, trap.type === 'flame' ? '#ff7b32' : '#ffdd55');
      RK.UI.msg(trap.type === 'flame'
        ? 'Огненная ловушка срабатывает: -' + (before - M.player.hp) + ' HP. Горение на 3 хода.'
        : 'Ловушка срабатывает: -' + (before - M.player.hp) + ' HP.');
      if (M.player.hp <= 0) death();
      return true;
    }
    if (actor) {
      var enemyBefore = (actor.hp || 0);
      actor.hp = Math.max(0, (actor.hp || 0) - damage);
      trap.state = 'triggered';
      RK.UI.msg((actor.name || 'Враг') + ' попал в ловушку: -' + (enemyBefore - actor.hp) + ' HP.');
      if (actor.hp <= 0) killEnemy(actor);
      return true;
    }
    return false;
  }

  function tickBurning(party) {
    for (var i = 0; i < party.length; i++) {
      var player = party[i];
      if (!(player.burningTurns > 0) || player.burningAppliedTurn >= M.turn || player.hp <= 0) continue;
      var damage = Math.min(player.hp, Math.max(1, player.burningDamage || 2));
      player.hp -= damage;
      player.burningTurns--;
      M.stats.damageReceived += damage;
      RK.Effects.add(player.x, player.y, '#ff7b32', { maxR: 10 });
      RK.Effects.addDamage(player.x, player.y, damage, '#ff7b32');
      RK.UI.msg('Горение: -' + damage + ' HP (' + player.burningTurns + ' хода).');
      if (player.burningTurns <= 0) {
        player.burningTurns = 0;
        player.burningDamage = 0;
        player.burningAppliedTurn = 0;
        RK.UI.msg('Горение прошло.');
      }
    }
  }

  function openChest(chest) {
    if (chest.looted) {
      RK.UI.msg('Сундук пуст.');
      return false;
    }
    chest.state = chest.state === 'broken' ? 'broken' : 'open';
    chest.looted = true;
    var roll = RK.RNG.rand();
    if (roll < 0.35) {
      var gold = RK.RNG.int(12, 24) * Math.max(1, Math.floor(M.floor * 0.7));
      M.player.gold += gold;
      RK.UI.msg('В сундуке найдено золото: +' + gold + '.');
    } else if (roll < 0.65) {
      var potion = RK.Items.spawnPotion(M.player.x, M.player.y);
      potion.heal = M.player.potionHeal;
      potion.summary = '+' + potion.heal + ' HP';
      addPotionToBackpack(M.player.backpack, potion);
      RK.UI.msg('В сундуке найдено зелье лечения.');
    } else {
      var loot = RK.Items.generateLootItem(M.floor, M.player.x, M.player.y, false);
      M.player.backpack.push(loot);
      RK.UI.msg('В сундуке найдено: ' + loot.name + ' (' + loot.summary + ').');
      if (M.quest && M.quest.type === 'loot' && !M.quest.completed) advanceQuest();
    }
    RK.UI.refresh();
    return true;
  }

  function interact(mode) {
    if (!M || M.over || busy()) return false;
    var objects = facingObject();
    if (objects.merchant) {
      if (mode !== 'use') {
        RK.UI.msg('Торговец не нуждается в силе или отмычках.');
        return false;
      }
      RK.UI.showMerchant();
      return true;
    }
    var trap = objects.trap;
    if (trap && mode !== 'pick') {
      RK.UI.msg('Перед вами ловушка. Нажмите L, чтобы её обезвредить.');
      return false;
    }
    var target = trap || objects.door || objects.chest;
    if (!target) {
      RK.UI.msg('Перед вами нет двери, сундука или ловушки.');
      return false;
    }

    if (mode === 'pick') {
      if (trap) {
        if (trap.state === 'disarmed') {
          RK.UI.msg('Ловушка уже обезврежена.');
          return false;
        }
        var luck = M.player.gearBonuses && M.player.gearBonuses.luck ? M.player.gearBonuses.luck : 0;
        var chance = Math.max(0.28, Math.min(0.82, 0.54 + luck / 150 - M.floor * 0.01));
        if (RK.RNG.chance(chance)) {
          trap.state = 'disarmed';
          RK.UI.msg('Ловушка обезврежена.');
        } else {
          RK.UI.msg('Неудачный взлом: ловушка срабатывает.');
          triggerTrapOnTile(trap.x, trap.y, M.player);
        }
        finishTurn();
        return true;
      }
      if (target.state !== 'locked') {
        RK.UI.msg('Этот объект не заперт.');
        return false;
      }
      var luck = M.player.gearBonuses && M.player.gearBonuses.luck ? M.player.gearBonuses.luck : 0;
      var chance = Math.max(0.2, Math.min(0.85, C.LOCKPICK_BASE_CHANCE + luck / 100 - M.floor * 0.01));
      if (RK.RNG.chance(chance)) {
        target.state = 'closed';
        RK.UI.msg(objects.door ? 'Замок двери поддался.' : 'Замок сундука поддался.');
      } else {
        RK.UI.msg('Не удалось вскрыть замок.');
      }
      finishTurn();
      return true;
    }

    if (mode === 'force') {
      if (target.state === 'open' || target.state === 'broken') {
        RK.UI.msg(objects.door ? 'Дверь уже открыта или выбита.' : 'Сундук уже открыт или разбит.');
        return false;
      }
      var damage = Math.max(1, Math.floor(M.player.atk / 5));
      if (objects.door) {
        target.hp -= damage;
        RK.UI.msg('Вы выбиваете дверь: ' + Math.max(0, target.hp) + '/' + target.maxHp + ' прочности.');
        if (target.hp <= 0) {
          target.state = 'broken';
          wakeNearbyEnemies(target.x, target.y);
          RK.UI.msg('Дверь выбита! Шум привлёк врагов.');
        }
      } else {
        target.hp -= damage;
        RK.UI.msg('Вы ломаете сундук: ' + Math.max(0, target.hp) + '/' + target.maxHp + ' прочности.');
        if (target.hp <= 0) {
          target.state = 'broken';
          openChest(target);
          wakeNearbyEnemies(target.x, target.y);
          RK.UI.msg('Сундук разбит! Шум привлёк врагов.');
        }
      }
      finishTurn();
      return true;
    }

    if (objects.door) {
      if (target.state === 'locked') {
        if (!consumeKey(target.keyId)) {
          RK.UI.msg('Дверь заперта. Нужен железный ключ (E), отмычка (L) или сила (F).');
          return false;
        }
        target.state = 'open';
        RK.UI.msg('Вы открыли дверь железным ключом.');
      } else if (target.state === 'open') {
        var occupied = M.player.x === target.x && M.player.y === target.y;
        for (var i = 0; i < M.enemies.length && !occupied; i++) {
          occupied = M.enemies[i].alive && M.enemies[i].x === target.x && M.enemies[i].y === target.y;
        }
        if (occupied) {
          RK.UI.msg('Нельзя закрыть дверь, пока проход занят.');
          return false;
        }
        target.state = 'closed';
        RK.UI.msg('Вы закрыли дверь.');
      } else if (target.state === 'closed') {
        target.state = 'open';
        RK.UI.msg('Вы открыли дверь.');
      } else {
        RK.UI.msg('Дверь уже выбита.');
        return false;
      }
    } else {
      if (target.state === 'open' || target.state === 'broken') {
        RK.UI.msg('Сундук уже открыт.');
        return false;
      }
      if (target.state === 'locked') {
        if (!consumeKey(target.keyId)) {
          RK.UI.msg('Сундук заперт. Нужен железный ключ (E) или отмычка (L).');
          return false;
        }
        RK.UI.msg('Вы открыли замок сундука железным ключом.');
      }
      openChest(target);
    }
    finishTurn();
    return true;
  }

  function placeChests(g) {
    g.chests = [];
    if (!g.rooms.length) return;
    var count = Math.min(3, Math.max(1, Math.floor(g.rooms.length / 6)));
    var lockedPlaced = false;
    var attempts = 0;
    while (g.chests.length < count && attempts < count * 80) {
      attempts++;
      var room = g.rooms[RK.RNG.int(0, g.rooms.length - 1)];
      if (room.cx === g.spawn.x && room.cy === g.spawn.y) continue;
      if (room.cx === g.stair.x && room.cy === g.stair.y) continue;
      var x = RK.RNG.int(room.x, room.x + room.w - 1);
      var y = RK.RNG.int(room.y, room.y + room.h - 1);
      if (RK.MapGen.manhattan(x, y, g.spawn.x, g.spawn.y) < 4 ||
          RK.MapGen.manhattan(x, y, g.stair.x, g.stair.y) < 3) continue;
      if (RK.MapGen.getDoorAt(x, y) || RK.MapGen.getChestAt(x, y) || getEnemyAt(x, y)) continue;
      var occupiedByItem = false;
      for (var itemIndex = 0; itemIndex < M.items.length; itemIndex++) {
        if (M.items[itemIndex].x === x && M.items[itemIndex].y === y) {
          occupiedByItem = true;
          break;
        }
      }
      if (occupiedByItem) continue;
      var locked = !lockedPlaced && g.rooms.length >= 3 && RK.RNG.chance(0.45);
      if (locked) lockedPlaced = true;
      g.chests.push({
        x: x,
        y: y,
        asset: 'chest',
        state: locked ? 'locked' : 'closed',
        keyId: 'iron',
        hp: 3,
        maxHp: 3,
        looted: false,
      });
    }

    var needsKey = false;
    for (var doorIndex = 0; doorIndex < g.doors.length; doorIndex++) {
      if (g.doors[doorIndex].state === 'locked') needsKey = true;
    }
    if (lockedPlaced) needsKey = true;
    if (needsKey) {
      for (var keyAttempt = 0; keyAttempt < 40; keyAttempt++) {
        var keyTile = RK.MapGen.randomFloorNear(g.spawn.x, g.spawn.y, Math.max(g.w, g.h), 2);
        if (!keyTile || RK.MapGen.getDoorAt(keyTile.x, keyTile.y) ||
            RK.MapGen.getChestAt(keyTile.x, keyTile.y) || getEnemyAt(keyTile.x, keyTile.y)) continue;
        var keyOccupied = false;
        for (var keyItemIndex = 0; keyItemIndex < M.items.length; keyItemIndex++) {
          if (M.items[keyItemIndex].x === keyTile.x && M.items[keyItemIndex].y === keyTile.y) {
            keyOccupied = true;
            break;
          }
        }
        if (keyOccupied) continue;
        M.items.push(RK.Items.spawnKey(keyTile.x, keyTile.y, 'iron'));
        break;
      }
    }
  }

  function placeMerchant(g) {
    var candidates = [];
    for (var y = 0; y < g.h; y++) {
      for (var x = 0; x < g.w; x++) {
        if (g.tiles[y][x] !== 1 ||
            RK.MapGen.manhattan(x, y, g.spawn.x, g.spawn.y) < 4 ||
            RK.MapGen.manhattan(x, y, g.stair.x, g.stair.y) < 3 ||
            RK.MapGen.getDoorAt(x, y) || RK.MapGen.getChestAt(x, y) || getEnemyAt(x, y)) continue;
        var occupied = false;
        for (var i = 0; i < M.items.length; i++) {
          if (M.items[i].x === x && M.items[i].y === y) {
            occupied = true;
            break;
          }
        }
        if (!occupied) candidates.push({ x: x, y: y });
      }
    }
    if (!candidates.length) {
      M.merchant = null;
      RK.UI.msg('На этом этаже торговцу не удалось найти место.');
      return;
    }
    var tile = candidates[RK.RNG.int(0, candidates.length - 1)];
    M.merchant = { x: tile.x, y: tile.y, name: 'Странствующий торговец', asset: 'merchant' };
  }

  function movePlayer(x, y) {
    var p = M.player;
    p.x = x;
    p.y = y;
    if (RK.Audio) RK.Audio.playStep();
    updatePlayerZone();
    handlePickup();
    if (!M.over) triggerTrapOnTile(p.x, p.y, p);
    if (!M.over) checkStairs();
    if (M.over) return;
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
        p.gearBonuses.luck -= item.stats && item.stats.luck ? item.stats.luck : 0;
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
        p.gearBonuses.luck -= current.stats && current.stats.luck ? current.stats.luck : 0;
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
      p.gearBonuses.luck += item.stats && item.stats.luck ? item.stats.luck : 0;
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
      p.gearBonuses.luck -= item.stats && item.stats.luck ? item.stats.luck : 0;
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

  function getSellValue(item) {
    if (!item) return 0;
    var value = item.value || (item.kind === 'potion' ? 15 : item.kind === 'key' ? 5 : 1);
    return Math.max(1, value * (item.count || 1));
  }

  function sellInventoryItem(index) {
    var p = M && M.player;
    if (!p || !p.backpack || !p.backpack[index]) return false;
    var item = p.backpack.splice(index, 1)[0];
    var gold = getSellValue(item);
    p.gold += gold;
    RK.UI.msg('Продано: ' + item.name + ' за ' + gold + ' золота.');
    RK.UI.refresh();
    return true;
  }

  function sellEquipmentItem(slot) {
    var p = M && M.player;
    var item = p && p.equipment && p.equipment[slot];
    if (!item) return false;
    p.equipment[slot] = null;
    p.gearBonuses.atk -= item.stats && item.stats.atk ? item.stats.atk : 0;
    p.gearBonuses.def -= item.stats && item.stats.def ? item.stats.def : 0;
    p.gearBonuses.hp -= item.stats && item.stats.hp ? item.stats.hp : 0;
    p.gearBonuses.luck -= item.stats && item.stats.luck ? item.stats.luck : 0;
    var gold = getSellValue(item);
    p.gold += gold;
    recomputePlayerStats();
    RK.UI.msg('Продано: ' + item.name + ' за ' + gold + ' золота.');
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
    p.gearBonuses.luck -= item.stats && item.stats.luck ? item.stats.luck : 0;
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
        } else if (it.kind === 'key') {
          var keyStack = null;
          for (var keyIndex = 0; keyIndex < p.backpack.length; keyIndex++) {
            if (p.backpack[keyIndex].kind === 'key' && p.backpack[keyIndex].keyId === it.keyId) {
              keyStack = p.backpack[keyIndex];
              break;
            }
          }
          if (keyStack) keyStack.count += it.count || 1;
          else p.backpack.push(it);
          RK.UI.msg('Подобран железный ключ.');
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
          var foundItem = {};
          for (var itemProperty in gear) foundItem[itemProperty] = gear[itemProperty];
          foundItem.floor = M.floor;
          M.stats.foundItems.push(foundItem);
          RK.UI.msg('Подобран лут: ' + gear.name + ' (' + gear.summary + ')');
          if (M.quest && M.quest.type === 'loot' && !M.quest.completed) advanceQuest();
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
    var party = M.players || [M.player];
    for (var playerIndex = 0; playerIndex < party.length; playerIndex++) {
      if (party[playerIndex].classSkillCooldown > 0) party[playerIndex].classSkillCooldown--;
      if (party[playerIndex].reflectShield > 0) party[playerIndex].reflectShield--;
      if (party[playerIndex].rageTurns > 0) party[playerIndex].rageTurns--;
    }
    tickBurning(party);
    recomputePlayerStats();
    RK.Narrator.tick(M.turn);
    var zone = getZoneAt(M.player.x, M.player.y);
    if (zone && zone.type === 'regen' && M.player.hp < M.player.maxHp) {
      var healing = Math.min(2, M.player.maxHp - M.player.hp);
      M.player.hp += healing;
      RK.UI.msg('Зона регенерации: +' + healing + ' HP.');
    }
    if (party.some(function (player) { return player.hp > 0; })) enemiesAct();
    RK.Fov.compute(M.player.x, M.player.y);
    RK.Narrator.onEvent('turnEnd', { turn: M.turn });
    RK.UI.refresh();
    for (var aliveIndex = 0; aliveIndex < party.length; aliveIndex++) {
      party[aliveIndex].alive = party[aliveIndex].hp > 0;
    }
    if (!party.some(function (player) { return player.hp > 0; })) death();
    if (RK.Network && RK.Network.isHost && RK.Network.isHost()) RK.Network.publishState();
  }

  function enemiesAct() {
    if (RK.Narrator.getMods(M.turn).freezeEnemies) return;
    for (var i = 0; i < M.enemies.length; i++) {
      var e = M.enemies[i];
      if (!e.alive) continue;
      enemyAct(e);
    }
  }

  function enemyAct(e) {
    var party = (M.players || [M.player]).filter(function (player) { return player.hp > 0; });
    if (!party.length) return;
    party.sort(function (a, b) {
      return RK.MapGen.manhattan(e.x, e.y, a.x, a.y) - RK.MapGen.manhattan(e.x, e.y, b.x, b.y);
    });
    var p = party[0];
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
    if (getEnemyAt(s.x, s.y) || getPartyPlayerAt(s.x, s.y)) return;
    e.x = s.x;
    e.y = s.y;
    triggerTrapOnTile(e.x, e.y, e);
    if (!e.alive) return;
    if (e.behavior === 'bat') {
      var path2 = RK.MapGen.findPath(e.x, e.y, p.x, p.y, null);
      if (path2 && path2.length) {
        var s2 = path2[0];
        if (!getEnemyAt(s2.x, s2.y) && !(s2.x === p.x && s2.y === p.y)) {
          e.x = s2.x;
          e.y = s2.y;
          triggerTrapOnTile(e.x, e.y, e);
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
    if (M.quest && M.quest.type === 'demon' &&
        (e.type === 'demon' || e.type === 'boss_demon') && !M.quest.completed) {
      advanceQuest();
    }
    var gold = Math.max(1, RK.RNG.int(2, 6) + M.floor * 2);
    M.items.push({ type: 'gold', asset: 'gold', kind: 'gold', x: e.x, y: e.y, amt: gold, name: 'Золото', summary: 'Монеты', rarity: 'common', color: RK.Items.RARITY_COLORS.common });
    RK.UI.msg('С ' + e.name + ' выпало золото: ' + gold + '.');
    if (e.behavior === 'boss' || RK.RNG.chance(0.5)) {
      var drop = RK.Items.generateLootItem(M.floor, e.x, e.y, e.behavior === 'boss');
      drop.source = 'kill';
      M.items.push(drop);
      RK.UI.msg('С трупа выпал лут: ' + (drop.name || 'Лут'));
    }
  }

  function advanceQuest() {
    if (!M.quest || M.quest.completed) return;
    M.quest.progress = Math.min(M.quest.target, M.quest.progress + 1);
    if (M.quest.progress >= M.quest.target) {
      M.quest.completed = true;
      M.player.gold += M.quest.reward;
      RK.UI.msg('Задание выполнено! Награда: ' + M.quest.reward + ' золота.');
    } else {
      RK.UI.msg('Прогресс задания: ' + M.quest.progress + '/' + M.quest.target + '.');
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
    M.result = 'defeat';
    RK.Narrator.onEvent('death');
    var g = M.players && M.players.length > 1
      ? M.players.reduce(function (total, player) {
        return total + Math.floor(player.gold * (1 + RK.Meta.data.luck * 0.15));
      }, 0)
      : bankGold();
    if (M.players && M.players.length > 1) RK.Meta.addBank(g);
    RK.UI.over(false, M.floor, M.player.level, g, M.stats);
  }

  function victory() {
    M.over = true;
    M.result = 'victory';
    RK.Narrator.onEvent('victory');
    var g = M.players && M.players.length > 1
      ? M.players.reduce(function (total, player) {
        return total + Math.floor(player.gold * (1 + RK.Meta.data.luck * 0.15));
      }, 0)
      : bankGold();
    if (M.players && M.players.length > 1) RK.Meta.addBank(g);
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

  function getPartyPlayerAt(x, y, exceptId) {
    var party = M && M.players ? M.players : [];
    for (var i = 0; i < party.length; i++) {
      if (party[i].id !== exceptId && party[i].hp > 0 && party[i].x === x && party[i].y === y) return party[i];
    }
    return null;
  }

  function addNetworkPlayer(id, name, classId) {
    if (!M || !M.players || M.players.some(function (player) { return player.id === id; })) return false;
    var player = RK.Entities.createPlayer(0, 0);
    player.id = id;
    player.name = name || 'Игрок';
    player.classId = classId || 'tank';
    RK.Classes.applyToPlayer(player, player.classId);
    for (var potionIndex = 0; potionIndex < C.START_POTIONS; potionIndex++) {
      var potion = RK.Items.spawnPotion(0, 0);
      potion.heal = player.potionHeal;
      potion.summary = '+' + potion.heal + ' HP';
      addPotionToBackpack(player.backpack, potion);
    }
    M.players.push(player);
    var radius = 1;
    while (radius < Math.max(M.mapWidth, M.mapHeight)) {
      var placed = false;
      for (var dy = -radius; dy <= radius && !placed; dy++) {
        for (var dx = -radius; dx <= radius; dx++) {
          var x = M.player.x + dx;
          var y = M.player.y + dy;
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius ||
              !RK.MapGen.isWalkable(x, y) || getEnemyAt(x, y) ||
              getPartyPlayerAt(x, y) || (RK.Map.stair.x === x && RK.Map.stair.y === y)) continue;
          player.x = x;
          player.y = y;
          placed = true;
          break;
        }
      }
      if (placed) break;
      radius++;
    }
    RK.UI.refresh();
    RK.Fov.compute(player.x, player.y);
    return true;
  }

  function setPlayerConnected(id, connected) {
    if (!M || !M.players) return;
    for (var i = 0; i < M.players.length; i++) {
      if (M.players[i].id === id) M.players[i].connected = connected;
    }
    RK.UI.refresh();
  }

  function setActivePlayer(id) {
    if (!M || !M.players) return false;
    for (var i = 0; i < M.players.length; i++) {
      if (M.players[i].id === id) {
        M.player = M.players[i];
        RK.Fov.compute(M.player.x, M.player.y);
        RK.UI.refresh();
        return true;
      }
    }
    return false;
  }

  function performNetworkAction(id, action, args) {
    if (!setActivePlayer(id) || !M.player.alive || M.over) return false;
    args = Array.isArray(args) ? args : [];
    var handlers = {
      activateClassSkill: activateClassSkill,
      interact: interact,
      playerAction: playerAction,
      skipTurn: skipTurn,
      tryStep: tryStep,
      usePotion: usePotion,
      useInventoryItem: useInventoryItem,
      dropInventoryItem: dropInventoryItem,
      unequipSlot: unequipSlot,
      sellInventoryItem: sellInventoryItem,
      sellEquipmentItem: sellEquipmentItem,
    };
    if (!handlers[action] || args.length > 5) return false;
    var turn = M.turn;
    var result = handlers[action].apply(null, args);
    if (result === false) return M.turn !== turn || busy();
    if (M.turn === turn && !busy()) finishTurn();
    return true;
  }

  function createSnapshot() {
    if (!M || !RK.Map) return null;
    return JSON.parse(JSON.stringify({ game: M, map: RK.Map }));
  }

  function applySnapshot(snapshot, localPlayerId) {
    if (!snapshot || !snapshot.game || !snapshot.map) return false;
    walk.animating = false;
    walk.auto = false;
    walk.path = null;
    walk.onDone = null;
    M = RK.GAME = snapshot.game;
    RK.Map = snapshot.map;
    M.players = M.players || [M.player];
    M.player = M.players.find(function (player) { return player.id === localPlayerId; }) || M.players[0];
    if (!M.player) return false;
    M.mapWidth = RK.Map.w;
    M.mapHeight = RK.Map.h;
    var canvas = document.getElementById('game');
    if (canvas) {
      canvas.width = C.TILE * C.COLS;
      canvas.height = C.TILE * C.ROWS;
    }
    if (RK.UI.syncNetworkState) RK.UI.syncNetworkState();
    else RK.UI.refresh();
    return true;
  }

  RK.Combat = {
    newRun: newRun,
    playerAction: playerAction,
    skipTurn: skipTurn,
    tryStep: tryStep,
    setPlayerStats: setPlayerStats,
    getEnemyAt: getEnemyAt,
    useInventoryItem: useInventoryItem,
    sellInventoryItem: sellInventoryItem,
    sellEquipmentItem: sellEquipmentItem,
    getSellValue: getSellValue,
    usePotion: usePotion,
    dropInventoryItem: dropInventoryItem,
    unequipSlot: unequipSlot,
    recomputePlayerStats: recomputePlayerStats,
    activateClassSkill: activateClassSkill,
    getZoneAt: getZoneAt,
    getZoneMods: getZoneMods,
    interact: interact,
    busy: busy,
    tickWalk: tickWalk,
    getDrawPos: getDrawPos,
    addNetworkPlayer: addNetworkPlayer,
    setPlayerConnected: setPlayerConnected,
    setActivePlayer: setActivePlayer,
    performNetworkAction: performNetworkAction,
    createSnapshot: createSnapshot,
    applySnapshot: applySnapshot,
  };
})();
