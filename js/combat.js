(function () {
  var C = RK.CONFIG;
  var M;

  // Поля карты, которые снимок жмёт в map.matrices. Список принадлежит map.js:
// он же кодирует и разворачивает, поэтому combat знает только имена.
var MATRIX_FIELDS = ['tiles', 'floorTypes', 'regions', 'explored'];

// Режимы взаимодействия, разводимые клавишами E / L / F.
  var INTERACT = {
    USE: 'use',
    PICK: 'pick',
    FORCE: 'force',
  };

  // Свободная клетка рядом с партией: ею бой расставляет соседей при переходе
  // между локациями, чтобы никто не вставал на клетку выхода. Спиральь от
  // точки входа — та же, что у findFreeSpawnTile, но с запасом по радиусу.
  function findFreeTileNear(x, y, exceptId) {
    var tile = findFreeSpawnTile(x, y, exceptId);
    if (tile) return tile;
    for (var radius = 1; radius < 3 && !tile; radius++) {
      for (var dy = -radius; dy <= radius && !tile; dy++) {
        for (var dx = -radius; dx <= radius && !tile; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          if (RK.MapGen.isWalkable(x + dx, y + dy)) tile = { x: x + dx, y: y + dy };
        }
      }
    }
    return tile;
  }

  // Анимация шага хранится на каждого участника партии: соседи по кооперативу
  // переезжают плавно, а не скачком. onDone есть только у шага своего героя;
  // шаги остальных приходят снимком — их двигает отрисовка.
  var walk = {
    steps: Object.create(null),
    auto: false,
    autoTx: 0,
    autoTy: 0,
    autoSeen: [],
    done: 0,
  };

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function stepOf(player) {
    return player ? walk.steps[player.id] || null : null;
  }

  function stepsActive() {
    for (var id in walk.steps) {
      if (walk.steps[id]) return true;
    }
    return false;
  }

  // Ход занят во время анимации своего героя: за ход забег пересчитывается один раз.
  function busy() {
    return !!stepOf(M && M.player);
  }

  // Единственное место, где canvas подстраивается под тайл.
  function resizeCanvas() {
    var canvas = document.getElementById('game');
    if (!canvas) return;
    canvas.width = C.TILE * C.COLS;
    canvas.height = C.TILE * C.ROWS;
  }

  // Партия всегда хранится в M.players; M.player — только её фокус.
  function party() {
    if (!M) return [];
    return M.players && M.players.length ? M.players : (M.player ? [M.player] : []);
  }

  function metaLuck() {
    return RK.Meta && RK.Meta.data ? (RK.Meta.data.luck || 0) : 0;
  }

  // Золото, попадающее в банк: удача из мет-прогресса увеличивает вклад.
  function bankValue(gold) {
    return Math.floor(gold * (1 + metaLuck() * C.META_LUCK_GOLD_RATE));
  }

  function getDrawPos(player) {
    player = player || (M && M.player);
    if (!player) return { x: 0, y: 0 };
    var step = stepOf(player);
    if (!step) return { x: player.x, y: player.y };
    var t = (now() - step.t0) / step.duration;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    t = t * t * (3 - 2 * t);
    return {
      x: step.sx + (step.ex - step.sx) * t,
      y: step.sy + (step.ey - step.sy) * t,
    };
  }

  function startStep(player, sx, sy, ex, ey, done) {
    walk.steps[player.id] = {
      sx: sx,
      sy: sy,
      ex: ex,
      ey: ey,
      t0: now(),
      duration: C.WALK_MS || 95,
      onDone: done || null,
    };
  }

  function startStepAnim(nx, ny, done) {
    var p = M.player;
    startStep(p, p.x, p.y, nx, ny, done);
  }

  // Счётчик завершённых шагов: сетевой забег публикует снимок после каждого шага,
// иначе автопроход пришёл бы на клиент одним прыжком.
  function stepsDone() {
    return walk.done;
  }

  function tickWalk(ts) {
    var at = ts || now();
    var finished = null;
    for (var id in walk.steps) {
      var step = walk.steps[id];
      if ((at - step.t0) / step.duration < 1) continue;
      if (!finished) finished = [];
      finished.push(id);
    }
    if (finished) {
      for (var i = 0; i < finished.length; i++) {
        var done = walk.steps[finished[i]];
        delete walk.steps[finished[i]];
        walk.done++;
        if (done.onDone) done.onDone();
      }
    }
    return stepsActive();
  }

  function resetGame() {
    walk.steps = Object.create(null);
    walk.auto = false;
    walk.autoSeen = [];
    M = RK.GAME = {
      floor: 1,
      turn: 0,
      mapWidth: C.COLS,
      mapHeight: C.ROWS,
      mapStyle: 'stone',
      activeZone: null,
      enemies: [],
      items: [],
      npcs: [],
      quests: [],
      questSeq: 0,
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

  function selectedClassId() {
    return (RK.Meta && RK.Meta.data && RK.Meta.data.selectedClass) || 'tank';
  }

  function localPlayerId() {
    return (RK.Network && RK.Network.playerId && RK.Network.playerId()) || 'local';
  }

  function localPlayerName() {
    return (RK.Meta && RK.Meta.data && RK.Meta.data.playerName) || 'Игрок';
  }

  // Создание героя с классом и стартовыми зельями. Общая точка для нового забега,
// сетевого игрока и комнаты отладки.
  function initPartyMember(id, name, classId) {
    var player = RK.Entities.createPlayer(0, 0);
    player.id = id || 'local';
    player.name = name || 'Игрок';
    player.classId = classId || 'tank';
    RK.Classes.applyToPlayer(player, player.classId);
    for (var potionIndex = 0; potionIndex < C.START_POTIONS; potionIndex++) {
      var potion = RK.Items.spawnPotion(player.x, player.y);
      potion.heal = player.potionHeal;
      potion.summary = '+' + potion.heal + ' HP';
      addPotionToBackpack(player.backpack, potion);
    }
    return player;
  }

  function newRun(options) {
    resetGame();
    var mapSize = options && C.MAP_SIZES[options.size] ? C.MAP_SIZES[options.size] : C.MAP_SIZES.medium;
    M.mapWidth = mapSize.width;
    M.mapHeight = mapSize.height;
    M.mapStyle = options && C.MAP_STYLES[options.style] ? options.style : 'stone';
    RK.RNG.reset(M.runSeed);
    // Стартовое задание обязано нести `kind`: advanceQuest сопоставляет именно его,
    // иначе задание нельзя выполнить до посещения торговца.
    var firstQuest = RK.RNG.chance(0.5) ? {
      type: 'demon',
      kind: 'kill',
      enemyTypes: ['demon', 'boss_demon'],
      target: 5,
      progress: 0,
      reward: 120,
      description: 'Убить 5 демонов',
    } : {
      type: 'loot',
      kind: 'loot',
      target: 3,
      progress: 0,
      reward: 90,
      description: 'Найти 3 предмета снаряжения',
    };
    M.quests = [firstQuest];
    M.quest = firstQuest;
    resizeCanvas();
    if (RK.Audio && !RK.Audio.start()) RK.UI.msg('Web Audio не поддерживается браузером: звуки недоступны.');
    RK.Narrator.initRun(M);
    var hero = heroOf(options);
    var player = initPartyMember(hero.id, hero.name, hero.classId);
    M.player = player;
    M.players = [player];
    recomputePlayerStats();
    if (C.ENABLE_WORLD && RK.World) {
      // Мир сам загружает стартовую локацию через startFloor.
      RK.World.init();
    } else {
      startFloor(1);
    }
    RK.UI.show('game');
    RK.UI.msg('WASD / стрелки / нумпад — ход; E — дверь/сундук/торговец, L — взлом/ловушка, F — выбить. Q — навык, R — зелье. ЛКМ по полу — автопуть.');
    RK.Narrator.onEvent('runStart');
    RK.UI.refresh();
  }

  // Герой забега: в браузере — из мет-прогресса, на сервере — из комнаты.
// Поэтому newRun работает и в одиночной игре, и в сетевой комнате.
  function heroOf(options) {
    var hero = options && options.hero;
    if (hero && hero.id) return hero;
    return { id: localPlayerId(), name: localPlayerName(), classId: selectedClassId() };
  }

  // Точка входа комнаты отладки: сброс игры и минимальный набор внутренностей,
// которые иначе не экспортируются (см. js/debug.js).
  function createDebugContext() {
    resetGame();
    M.mapWidth = C.COLS;
    M.mapHeight = C.ROWS;
    M.mapStyle = 'stone';
    M.floor = 1;
    M.turn = 0;
    M.runSeed = RK.RNG.randomSeed();
    RK.RNG.reset(M.runSeed);
    return {
      game: M,
      resizeCanvas: resizeCanvas,
      recomputePlayerStats: recomputePlayerStats,
      updatePlayerZone: updatePlayerZone,
      addPotionToBackpack: addPotionToBackpack,
      initPartyMember: initPartyMember,
      selectedClassId: selectedClassId,
      localPlayerId: localPlayerId,
      localPlayerName: localPlayerName,
    };
  }

  // Свободная клетка для нового участника партии: расходится по спирали от центра,
// пока не найдёт проходимую клетку без врагов, партийцев и лестницы.
  function findFreeSpawnTile(centerX, centerY, exceptId) {
    var limit = Math.max(M.mapWidth, M.mapHeight);
    for (var radius = 1; radius < limit; radius++) {
      for (var dy = -radius; dy <= radius; dy++) {
        for (var dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          var x = centerX + dx;
          var y = centerY + dy;
          if (!RK.MapGen.isWalkable(x, y)) continue;
          if (getEnemyAt(x, y)) continue;
          if (RK.Map.stair && RK.Map.stair.x === x && RK.Map.stair.y === y) continue;
          if (getPartyPlayerAt(x, y, exceptId)) continue;
          return { x: x, y: y };
        }
      }
    }
    return null;
  }

  function placePartyMembers() {
    var members = party();
    for (var i = 0; i < members.length; i++) {
      if (i === 0) {
        members[i].x = RK.Map.spawn.x;
        members[i].y = RK.Map.spawn.y;
        continue;
      }
      var tile = findFreeSpawnTile(RK.Map.spawn.x, RK.Map.spawn.y, members[i].id);
      if (tile) {
        members[i].x = tile.x;
        members[i].y = tile.y;
      }
    }
  }

  // Загрузка сцены: карта, враги, предметы, NPC и партия.
  // restored=true — возврат в посещённую локацию: карта и состояние уже восстановлены World,
  // поэтому сцену не пересоздаём, а только достраиваем проходимость.
  function startFloor(floor, locationMode, restored) {
    var returningToSavedLocation = !!restored;
    M.floor = floor;
    M.activeZone = null;
    M.locationMode = !!locationMode;
    M.locationId = locationMode && RK.World ? RK.World.current().id : null;
    if (!locationMode || !RK.World) RK.MapGen.generate(floor, M.runSeed, M.mapWidth, M.mapHeight, M.mapStyle);
    if (RK.Audio) RK.Audio.setFloor(floor);
    if (!returningToSavedLocation) {
      M.enemies = [];
      M.items = [];
      M.placedLocationItems = [];
      M.npcs = [];
    }
    var loc = locationMode ? RK.World.current() : null;
    var typeDef = loc ? C.LOCATION_TYPES[loc.type] : null;
    var isCity = !!loc && loc.type === 'city';
    if (!returningToSavedLocation) {
      if (!locationMode) placePartyMembers();
      if (!typeDef || typeDef.spawnRate > 0) spawnEnemies(RK.Map, floor);
      M.items = RK.Items.spawnItems(floor, RK.Map.spawn);
      // Город — безопасный перевалочный пункт: сундуков в нём нет.
      if (!isCity) placeChests(RK.Map);
      M.npcs = isCity
        ? RK.Npc.placeCityNpcs(RK.Map, floor)
        : (locationMode ? [] : placeFloorNpcs(RK.Map, floor));
    }
    if (locationMode && RK.Map.exits) {
      for (var exitIndex = 0; exitIndex < RK.Map.exits.length; exitIndex++) {
        var exit = RK.Map.exits[exitIndex];
        var path = RK.MapGen.findPath(RK.Map.spawn.x, RK.Map.spawn.y, exit.x, exit.y, null) || [];
        for (var pathIndex = 0; pathIndex < path.length; pathIndex++) {
          RK.Map.explored[path[pathIndex].y][path[pathIndex].x] = true;
        }
      }
      M.placedLocationItems = (M.placedLocationItems || []).filter(function (item) {
        return RK.MapGen.isWalkable(item.x, item.y);
      });
    }
    var decorationBlockers = party().concat(
      M.enemies,
      M.items,
      M.npcs || [],
      RK.Map.chests,
      RK.Map.doors,
      RK.Map.traps,
      RK.Map.torches,
    );
    RK.Map.decorations = RK.MapGen.placeDecorations(RK.Map, decorationBlockers);
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
    var typeDef = RK.World && RK.World.current() && C.LOCATION_TYPES[RK.World.current().type];
    var spawnRate = typeDef ? typeDef.spawnRate : 1;
    var count = Math.min(C.ENEMY_MAX_COUNT,
      Math.round((C.BASE_ENEMIES + floor * C.ENEMIES_PER_FLOOR) * areaScale * spawnRate));
    var pool = enemyPool(floor);
    var placed = 0;
    var guard = 0;
    while (placed < count && guard < C.ENEMY_SPAWN_GUARD) {
      guard++;
      var t = RK.MapGen.randomFloorNear(g.spawn.x, g.spawn.y, Math.max(g.w, g.h), 6);
      if (!t) continue;
      if (Math.abs(t.x - g.stair.x) <= C.ENEMY_STAIR_CLEARANCE &&
          Math.abs(t.y - g.stair.y) <= C.ENEMY_STAIR_CLEARANCE) continue;
      if (g.tavern && RK.MapGen.isInTavern(g, t.x, t.y)) continue;
      if (g.exits && g.exits.some(function (exit) {
        return Math.abs(t.x - exit.x) + Math.abs(t.y - exit.y) <= 4;
      })) continue;
      var type = weightedPick(pool);
      M.enemies.push(RK.Entities.makeEnemy(type, t.x, t.y, floor, RK.RNG.chance(0.2)));
      placed++;
    }
    if (!M.locationMode || !RK.World || RK.World.current().type === 'crypt' || RK.World.current().type === 'dungeon') {
      spawnBoss(g, floor);
    }
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
          if (g.tavern && RK.MapGen.isInTavern(g, x, y)) continue;
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

  function visibleEnemies() {
    var seen = [];
    if (!RK.Map || !RK.Map.vis) return seen;
    for (var i = 0; i < M.enemies.length; i++) {
      var e = M.enemies[i];
      if (e.alive && RK.Map.vis[e.y] && RK.Map.vis[e.y][e.x]) seen.push(e);
    }
    return seen;
  }

  // Автопроход прерывается на новом враге в поле зрения, а не на любом: враги,
  // видимые на момент клика, цель клика не отменяют. Список видимых на старте
  // снимается один раз — при старте автопрохода.
  function hasNewVisibleEnemy() {
    var visible = visibleEnemies();
    for (var i = 0; i < visible.length; i++) {
      if (walk.autoSeen.indexOf(visible[i]) === -1) return true;
    }
    return false;
  }

  // Экран NPC открывает нажавший клавишу. В сетевой комнате забег идёт на сервере,
// поэтому вызов RK.UI приходит из снимка события и открывает экран у этого игрока.
  function openNpcScreen(npc) {
    var service = RK.Npc.service(npc);
    if (service === 'merchant') RK.UI.showMerchant();
    else if (service === 'blacksmith') RK.UI.showBlacksmith();
    else if (service === 'tavern') RK.UI.showTavern();
    else RK.UI.showNpc(npc.id);
  }

  function playerAction(tx, ty) {
    if (!M || M.over || busy()) return false;
    var door = RK.MapGen.getDoorAt(tx, ty);
    var chest = RK.MapGen.getChestAt(tx, ty);
    var npc = npcAt(tx, ty);
    var trap = RK.MapGen.getTrapAt(tx, ty);
    var exit = M.locationMode && RK.Map.exits && RK.Map.exits.find(function (point) {
      return point.x === tx && point.y === ty;
    });
    if (door || chest || npc || trap || exit) {
      var target = door || chest || npc || trap || exit;
      var dx = target.x - M.player.x;
      var dy = target.y - M.player.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) {
        RK.UI.msg(trap ? 'Подойдите вплотную, чтобы обезвредить ловушку.' : 'Подойдите к объекту вплотную, чтобы взаимодействовать.');
        return false;
      }
      setFacing(dx, dy);
      if (npc) {
        openNpcScreen(npc);
        return true;
      }
      if (exit) {
        RK.UI.msg('Выход: ' + exit.label + '. Встаньте на лестницу, чтобы перейти.');
        return true;
      }
      if (trap && !door && !chest) {
        RK.UI.msg('Ловушка под ногами. Нажмите L, чтобы обезвредить её.');
        return true;
      }
      return interact(INTERACT.USE);
    }
    if (!RK.MapGen.isWalkable(tx, ty)) return false;
    var p = M.player;
    if (tx === p.x && ty === p.y) {
      skipTurn();
      return true;
    }
    var adj = getEnemyAt(tx, ty);
    if (adj) {
      if (RK.Classes.canShoot(p)) {
        if (!RK.Classes.canReachTarget(p, tx, ty)) {
          RK.UI.msg(RK.Classes.getClassDef(p.classId).name +
            ' стреляет на расстоянии видимости: цель слишком далеко или нет линии выстрела.');
          return false;
        }
        setFacing(tx - p.x, ty - p.y);
        doRangedAttack(adj);
        finishTurn();
        return true;
      }
      if (adjacent(p, adj)) {
        doAttack(p, adj, true);
        finishTurn();
        return true;
      } else {
        tryMoveToward(tx, ty);
      }
      return busy();
    }
    beginAutoWalk(tx, ty);
    return busy();
  }

  // Клик по полу — команда идти: автопроход идёт весь путь и останавливается только
  // при новом враге в поле зрения, достижении цели или перекрытии пути.
  function beginAutoWalk(tx, ty) {
    walk.auto = true;
    walk.autoTx = tx;
    walk.autoTy = ty;
    walk.autoSeen = visibleEnemies();
    continueAutoWalk();
  }

  function stopAutoWalk() {
    walk.auto = false;
  }

  // Клетка занята, если там враг, сам герой или другой участник партии.
// Предикат общий для автопрохода и движения к цели.
  function makeOccupancy(player) {
    return function (x, y) {
      return getEnemyAt(x, y) != null ||
        (x === player.x && y === player.y) ||
        getPartyPlayerAt(x, y, player.id) != null;
    };
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
    if (hasNewVisibleEnemy()) {
      stopAutoWalk();
      return;
    }
    var path = RK.MapGen.findPathNear(p.x, p.y, walk.autoTx, walk.autoTy, makeOccupancy(p));
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
      if (hasNewVisibleEnemy()) {
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
        if (RK.Classes.canShoot(p)) doRangedAttack(e);
        else doAttack(p, e, true);
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
    var path = RK.MapGen.findPathNear(p.x, p.y, tx, ty, makeOccupancy(p));
    if (path && path.length) {
      var s = path[0];
      setFacing(s.x - p.x, s.y - p.y);
      var e = getEnemyAt(s.x, s.y);
      if (e) {
        if (adjacent(p, e)) {
          if (RK.Classes.canShoot(p)) doRangedAttack(e);
          else doAttack(p, e, true);
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
      npc: npcAt(x, y),
      trap: RK.MapGen.getTrapAt(x, y),
      exit: M.locationMode && RK.Map.exits
        ? RK.Map.exits.find(function (point) { return point.x === x && point.y === y; })
        : null,
    };
  }

  function npcAt(x, y) {
    return RK.Npc.getAt(M && M.npcs, x, y);
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
      if (enemy.alive && RK.MapGen.manhattan(x, y, enemy.x, enemy.y) <= C.WAKE_NOISE_RADIUS) {
        enemy.alerted = true;
      }
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
      if (M.quest && M.quest.type === 'loot' && !M.quest.completed) advanceQuest('loot', null, 1);
    }
    RK.UI.refresh();
    return true;
  }

  function interact(mode) {
    if (!M || M.over || busy()) return false;
    var objects = facingObject();
    if (objects.exit) {
      RK.UI.msg('Выход: ' + objects.exit.label + '. Встаньте на лестницу, чтобы перейти.');
      return false;
    }
    if (objects.npc) {
      if (mode !== INTERACT.USE) {
        RK.UI.msg(RK.Npc.nameOf(objects.npc) + ' не нуждается в силе или отмычках.');
        return false;
      }
      openNpcScreen(objects.npc);
      return true;
    }
    if (objects.trap && mode !== INTERACT.PICK) {
      RK.UI.msg('Перед вами ловушка. Нажмите L, чтобы её обезврежить.');
      return false;
    }
    var target = objects.trap || objects.door || objects.chest;
    if (!target) {
      RK.UI.msg('Перед вами нет двери, сундука или ловушки.');
      return false;
    }

    if (mode === INTERACT.PICK) return pickTarget(target, objects);
    if (mode === INTERACT.FORCE) return forceBreak(target, objects);
    return useTarget(target, objects);
  }

  // Взлом замка или обезвреживание ловушки (L).
  function pickTarget(target, objects) {
    if (target === objects.trap) return disarmTrap(target);
    if (target.state !== 'locked') {
      RK.UI.msg('Этот объект не заперт.');
      return false;
    }
    var luck = M.player.gearBonuses && M.player.gearBonuses.luck ? M.player.gearBonuses.luck : 0;
    var chance = clampChance(C.LOCKPICK_BASE_CHANCE + luck / C.LUCK_PER_LOCKPICK_TILE -
      M.floor * C.FLOOR_LOCKPICK_PENALTY, C.LOCKPICK_MIN_CHANCE, C.LOCKPICK_MAX_CHANCE);
    if (RK.RNG.chance(chance)) {
      target.state = 'closed';
      RK.UI.msg(objects.door ? 'Замок двери поддался.' : 'Замок сундука поддался.');
    } else {
      RK.UI.msg('Не удалось вскрыть замок.');
    }
    finishTurn();
    return true;
  }

  function disarmTrap(trap) {
    if (trap.state === 'disarmed') {
      RK.UI.msg('Ловушка уже обезврежена.');
      return false;
    }
    var luck = M.player.gearBonuses && M.player.gearBonuses.luck ? M.player.gearBonuses.luck : 0;
    var bonus = RK.Classes.disarmBonus(M.player);
    var chance = clampChance(C.TRAP_DISARM_BASE_CHANCE + luck / C.LUCK_PER_DISARM_TILE -
      M.floor * C.FLOOR_LOCKPICK_PENALTY + bonus,
      C.TRAP_DISARM_MIN_CHANCE, C.TRAP_DISARM_MAX_CHANCE);
    if (RK.RNG.chance(chance)) {
      trap.state = 'disarmed';
      RK.UI.msg(bonus > 0 ? 'Ловушка обезврежена (опыт сапожника: шанс выше).' : 'Ловушка обезврежена.');
      if (RK.Classes.canSetTraps(M.player)) {
        addTrapToBackpack(M.player.backpack, RK.Items.spawnTrapItem(trap, M.player.x, M.player.y));
        removeTrapFromMap(trap);
        RK.UI.msg('Ловушка переходит в ваш рюкзак — установите её кнопкой «Установить».');
      }
    } else {
      RK.UI.msg('Неудачный взлом: ловушка срабатывает.');
      triggerTrapOnTile(trap.x, trap.y, M.player);
    }
    finishTurn();
    return true;
  }

    // Выбивание двери или взламывание сундука силой (F).
  function forceBreak(target, objects) {
    if (target.state === 'open' || target.state === 'broken') {
      RK.UI.msg(objects.door ? 'Дверь уже открыта или выбита.' : 'Сундук уже открыт или разбит.');
      return false;
    }
    target.hp -= Math.max(1, Math.floor(M.player.atk / C.FORCE_BREAK_ATK_DIVISOR));
    RK.UI.msg((objects.door ? 'Вы выбиваете дверь: ' : 'Вы ломаете сундук: ') +
      Math.max(0, target.hp) + '/' + target.maxHp + ' прочности.');
    if (target.hp > 0) {
      finishTurn();
      return true;
    }
    target.state = 'broken';
    if (!objects.door) {
      openChest(target);
      RK.UI.msg('Сундук разбит! Шум привлёк врагов.');
    } else {
      RK.UI.msg('Дверь выбита! Шум привлёк врагов.');
    }
    wakeNearbyEnemies(target.x, target.y);
    finishTurn();
    return true;
  }

  // Обычное взаимодействие (E): открыть/закрыть дверь, открыть сундук.
  function useTarget(target, objects) {
    if (objects.door) {
      if (target.state === 'locked') {
        if (!consumeKey(target.keyId)) {
          RK.UI.msg('Дверь заперта. Нужен железный ключ (E), отмычка (L) или сила (F).');
          return false;
        }
        target.state = 'open';
        RK.UI.msg('Вы открыли дверь железным ключом.');
      } else if (target.state === 'open') {
        if (isTileOccupied(target.x, target.y)) {
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
      finishTurn();
      return true;
    }
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
    finishTurn();
    return true;
  }

  function isTileOccupied(x, y) {
    if (M.player.x === x && M.player.y === y) return true;
    for (var i = 0; i < M.enemies.length; i++) {
      if (M.enemies[i].alive && M.enemies[i].x === x && M.enemies[i].y === y) return true;
    }
    return false;
  }

  function isItemAt(x, y) {
    var items = (M && M.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].x === x && items[i].y === y) return true;
    }
    return false;
  }

  // Клетка свободна: пол, вдали от спавна и лестницы, не занята дверью, сундуком,
  // врагом, предметом или NPC.
  function isSpawnCandidate(g, x, y, options) {
    if (g.tiles[y][x] !== 1) return false;
    if (options.keepClearance !== false) {
      if (RK.MapGen.manhattan(x, y, g.spawn.x, g.spawn.y) < C.SPAWN_CLEARANCE) return false;
      if (g.stair && RK.MapGen.manhattan(x, y, g.stair.x, g.stair.y) < C.STAIR_CLEARANCE) return false;
    }
    if (options.avoidNpc && npcAt(x, y)) return false;
    if (RK.MapGen.getDoorAt(x, y) || RK.MapGen.getChestAt(x, y) || getEnemyAt(x, y)) return false;
    return !isItemAt(x, y);
  }

  function collectSpawnCandidates(g, area, options) {
    var candidates = [];
    for (var y = area.y; y < area.y + area.h; y++) {
      for (var x = area.x; x < area.x + area.w; x++) {
        if (isSpawnCandidate(g, x, y, options)) candidates.push({ x: x, y: y });
      }
    }
    return candidates;
  }

  function wholeMapArea(g) {
    return { x: 0, y: 0, w: g.w, h: g.h };
  }

  function placeChests(g) {
    g.chests = [];
    if (!g.rooms.length) return;
    var count = Math.min(3, Math.max(1, Math.floor(g.rooms.length / 6)));
    var lockedPlaced = false;
    var attempts = 0;
    while (g.chests.length < count && attempts < count * C.CHEST_ATTEMPTS_PER_CHEST) {
      attempts++;
      var room = g.rooms[RK.RNG.int(0, g.rooms.length - 1)];
      if (room.cx === g.spawn.x && room.cy === g.spawn.y) continue;
      if (g.stair && room.cx === g.stair.x && room.cy === g.stair.y) continue;
      var x = RK.RNG.int(room.x, room.x + room.w - 1);
      var y = RK.RNG.int(room.y, room.y + room.h - 1);
      if (!isSpawnCandidate(g, x, y, {})) continue;
      var locked = !lockedPlaced && g.rooms.length >= 3 && RK.RNG.chance(0.45);
      if (locked) lockedPlaced = true;
      g.chests.push({
        x: x,
        y: y,
        asset: 'chest',
        state: locked ? 'locked' : 'closed',
        keyId: 'iron',
        hp: C.CHEST_HP,
        maxHp: C.CHEST_HP,
        looted: false,
      });
    }

    var needsKey = false;
    for (var doorIndex = 0; doorIndex < g.doors.length; doorIndex++) {
      if (g.doors[doorIndex].state === 'locked') needsKey = true;
    }
    if (lockedPlaced) needsKey = true;
    if (!needsKey) return;
    for (var keyAttempt = 0; keyAttempt < C.CHEST_KEY_ATTEMPTS; keyAttempt++) {
      var keyTile = RK.MapGen.randomFloorNear(g.spawn.x, g.spawn.y, Math.max(g.w, g.h), 2);
      if (!keyTile || !isSpawnCandidate(g, keyTile.x, keyTile.y, {})) continue;
      M.items.push(RK.Items.spawnKey(keyTile.x, keyTile.y, 'iron'));
      return;
    }
  }

  // Этаж без города (legacy-режим): торговец и кузнец ищут место сначала в
  // таверне, затем по всей карте. Критерии таверны и fallback разные: в таверне
  // NPC может стоять вплотную к спавну и к торговцу.
  function placeFloorNpcs(g, floor) {
    var npcs = [];
    var kinds = [
      { kind: 'merchant', tavern: {}, fallback: {} },
      { kind: 'blacksmith', tavern: { avoidNpc: true, keepClearance: false }, fallback: { avoidNpc: true } },
    ];
    for (var i = 0; i < kinds.length; i++) {
      var candidates = g.tavern ? collectSpawnCandidates(g, g.tavern, kinds[i].tavern) : [];
      if (!candidates.length) candidates = collectSpawnCandidates(g, wholeMapArea(g), kinds[i].fallback);
      if (!candidates.length) {
        RK.UI.msg(RK.Npc.def(kinds[i].kind).name + ' не нашёл места на этом этаже.');
        continue;
      }
      var tile = candidates[RK.RNG.int(0, candidates.length - 1)];
      var npc = RK.Npc.make(kinds[i].kind, tile.x, tile.y, floor);
      if (npc) npcs.push(npc);
    }
    return npcs;
  }

  // Услуга доступна рядом с её NPC. В локации без торговца ограничения нет:
  // продавать и улучшать можно где угодно, как и на этажах без NPC.
  function nearService(kind) {
    if (!M.locationMode) return true;
    var npc = RK.Npc.findByKind(M.npcs, kind);
    if (!npc) return true;
    return RK.Npc.isNear(npc, M.player.x, M.player.y);
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
    if (info && info.id === 'archer') {
      classAtk += 1 + Math.floor((p.level || 1) / 3);
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
    var def = zone ? C.ZONES[zone.type] : null;
    return {
      atkBonus: def ? def.atkBonus : 0,
      defBonus: def ? def.defBonus : 0,
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

  function addTrapToBackpack(backpack, trap) {
    for (var i = 0; i < backpack.length; i++) {
      var stack = backpack[i];
      if (stack.kind === 'trap' && stack.trapType === trap.trapType && stack.trapDamage === trap.trapDamage) {
        stack.count = (stack.count || 1) + (trap.count || 1);
        return;
      }
    }
    trap.count = trap.count || 1;
    backpack.push(trap);
  }

  function removeTrapFromMap(trap) {
    var traps = RK.Map && RK.Map.traps ? RK.Map.traps : null;
    if (!traps) return false;
    var index = traps.indexOf(trap);
    if (index < 0) return false;
    traps.splice(index, 1);
    return true;
  }

  function placeCarriedTrap(index) {
    var p = M && M.player;
    if (!p || !p.backpack || !p.backpack[index]) return false;
    var item = p.backpack[index];
    if (item.kind !== 'trap') return false;
    if (!RK.Classes.canSetTraps(p)) {
      RK.UI.msg('Только лучник умеет взводить ловушки.');
      return false;
    }
    var tx = p.x + (p.facingX || 0);
    var ty = p.y + (p.facingY || 0);
    if (Math.max(Math.abs(tx - p.x), Math.abs(ty - p.y)) !== 1) {
      RK.UI.msg('Повернитесь к соседней клетке, чтобы взвести ловушку.');
      return false;
    }
    if (!RK.MapGen.isInside(tx, ty) || !RK.MapGen.isWalkable(tx, ty)) {
      RK.UI.msg('Перед вами нет места для ловушки — встаньте на проходимую клетку.');
      return false;
    }
    if (RK.MapGen.getTrapAt(tx, ty) || RK.MapGen.getDoorAt(tx, ty) ||
        RK.MapGen.getChestAt(tx, ty) || npcAt(tx, ty) ||
        getEnemyAt(tx, ty) || getPartyPlayerAt(tx, ty, p.id)) {
      RK.UI.msg('Эта клетка занята — ловушку туда поставить нельзя.');
      return false;
    }
    var trap = {
      x: tx,
      y: ty,
      asset: 'trap',
      type: item.trapType || 'spike',
      state: 'armed',
      damage: RK.Items.trapItemDamage(item),
      owner: p.id,
    };
    RK.Map.traps.push(trap);
    item.count = (item.count || 1) - 1;
    if (item.count <= 0) p.backpack.splice(index, 1);
    RK.UI.msg('Ловушка взведена: ' + RK.Items.trapItemName(item) + '.');
    RK.UI.refresh();
    finishTurn();
    return true;
  }

  // Единственное место, где бонусы экипировки попадают в характеристики.
  // sign = 1 при надевании, -1 при снятии.
  function applyGearBonuses(player, stats, sign) {
    var bonuses = player.gearBonuses;
    if (!bonuses) return;
    bonuses.atk += sign * (stats && stats.atk ? stats.atk : 0);
    bonuses.def += sign * (stats && stats.def ? stats.def : 0);
    bonuses.hp += sign * (stats && stats.hp ? stats.hp : 0);
    bonuses.luck += sign * (stats && stats.luck ? stats.luck : 0);
  }

  function unequipIntoBackpack(player, slot, index) {
    var item = player.equipment[slot];
    player.equipment[slot] = null;
    item.equipped = false;
    applyGearBonuses(player, item.stats, -1);
    if (index != null) {
      player.backpack.splice(index, 1);
      player.backpack.push(item);
    } else {
      player.backpack.push(item);
    }
    recomputePlayerStats();
    RK.UI.msg('Снято: ' + item.name);
    RK.UI.refresh();
    return true;
  }

  function useInventoryItem(index) {
    var p = M.player;
    if (!p || !p.backpack || !p.backpack[index]) return false;
    var item = p.backpack[index];
    if (item.kind === 'potion') return usePotion(index);
    if (item.kind === 'trap') return placeCarriedTrap(index);
    if (!item.slot) return false;
    var restriction = RK.Classes.equipRestriction(p, item);
    if (restriction) {
      RK.UI.msg(restriction);
      return false;
    }
    if (item.equipped) return unequipIntoBackpack(p, item.slot, index);

    var current = p.equipment[item.slot];
    if (current) {
      applyGearBonuses(p, current.stats, -1);
      p.backpack.splice(index, 1);
      current.equipped = false;
      p.backpack.push(current);
    } else {
      p.backpack.splice(index, 1);
    }
    p.equipment[item.slot] = item;
    item.equipped = true;
    applyGearBonuses(p, item.stats, 1);
    recomputePlayerStats();
    RK.UI.msg('Надето: ' + item.name + ' (' + item.summary + ')');
    RK.UI.refresh();
    return true;
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
      applyGearBonuses(p, item.stats, -1);
      item.equipped = false;
      recomputePlayerStats();
    }
    item.x = p.x;
    item.y = p.y;
    item.type = item.type || C.SLOT_VISUAL_TYPES[item.slot] || 'gold';
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

  function isEquippedItem(player, item) {
    if (!player || !item) return false;
    if (item.equipped) return true;
    var equipment = player.equipment || {};
    for (var slot in equipment) {
      if (equipment[slot] === item) return true;
    }
    return false;
  }

  function sellInventoryItem(index) {
    var p = M && M.player;
    if (!p || !p.backpack || !p.backpack[index]) return false;
    if (!nearService('merchant')) {
      RK.UI.msg('Подойдите к торговцу, чтобы продать предметы.');
      return false;
    }
    if (isEquippedItem(p, p.backpack[index])) {
      RK.UI.msg('Сначала снимите экипировку, чтобы продать её.');
      return false;
    }
    var item = p.backpack.splice(index, 1)[0];
    var gold = getSellValue(item);
    p.gold += gold;
    RK.UI.msg('Продано: ' + item.name + ' за ' + gold + ' золота.');
    RK.UI.refresh();
    return true;
  }

  function unequipSlot(slot) {
    var p = M && M.player;
    if (!p || !slot || !p.equipment || !p.equipment[slot]) return false;
    return unequipIntoBackpack(p, slot, null);
  }

  function handlePickup() {
    var p = M.player;
    for (var i = M.items.length - 1; i >= 0; i--) {
      var it = M.items[i];
      if (it.x === p.x && it.y === p.y) {
        M.items.splice(i, 1);
            if (M.locationMode && M.placedLocationItems) {
          var persistentIndex = M.placedLocationItems.findIndex(function (item) {
            return item.id && item.id === it.id;
          });
          if (persistentIndex >= 0) M.placedLocationItems.splice(persistentIndex, 1);
        }
        if (it.type === 'gold' && it.kind !== 'loot') {
          var g = Math.max(1, Math.round((it.amt || 0) * (1 + metaLuck() * C.META_LUCK_GOLD_RATE) *
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
          if (M.quest && M.quest.type === 'loot' && !M.quest.completed) advanceQuest('loot', null, 1);
        }
      }
    }
  }

  // После перехода партия встаёт не в одну клетку: ходивший — на выход,
  // остальные — на свободные соседние. Иначе сосед занимал бы клетку выхода
  // и герой не смог бы вернуться обратно: шаг в занятую клетку отклоняется.
  function placePartyAtEntry() {
    var members = party();
    for (var i = 0; i < members.length; i++) {
      var member = members[i];
      if (member.id === M.player.id) {
        member.x = M.player.x;
        member.y = M.player.y;
        continue;
      }
      var tile = findFreeTileNear(M.player.x, M.player.y, member.id);
      member.x = tile ? tile.x : M.player.x;
      member.y = tile ? tile.y : M.player.y;
    }
  }

  function checkStairs() {
    var p = M.player;
    // В режиме локаций проверяем переходы между локациями.
    if (M.locationMode && RK.World && RK.Map && RK.Map.exits) {
      for (var i = 0; i < RK.Map.exits.length; i++) {
        var exit = RK.Map.exits[i];
        if (p.x === exit.x && p.y === exit.y) {
          if (RK.World.travel(exit.id)) {
            // Расстановку партии и снимок новой локации делает World.travel:
            // здесь остаётся только сбросить анимацию шага и обновить экран.
            walk.auto = false;
            walk.steps = Object.create(null);
            RK.UI.refresh();
          }
          return;
        }
      }
      return;
    }
    if (RK.Map.stair && p.x === RK.Map.stair.x && p.y === RK.Map.stair.y) {
      if (M.floor >= C.MAX_FLOOR) {
        victory();
      } else {
        M.floor++;
        RK.UI.msg('Вы спускаетесь на этаж ' + M.floor);
        startFloor(M.floor);
      }
    }
  }

  // Сохранение одиночного забега. localStorage синхронный, поэтому запись идёт
  // раз в SAVE_EVERY_TURNS ходов; в сетевой комнате состояние считает сервер,
  // и клиентский снимок только мешал бы. Переход локации и финал забега
  // сохраняются сразу — это точки, после которых игрок ждёт результата.
  function autosave() {
    if (C.ENABLE_WORLD && !RK.World) return;
    if (RK.Network && RK.Network.inRoom && RK.Network.inRoom()) return;
    if (M.turn % C.SAVE_EVERY_TURNS !== 0) return;
    if (RK.World) RK.World.saveRun();
  }

  function finishTurn() {
    if (M.over) return;
    M.turn++;
    autosave();
    var members = party();
    for (var playerIndex = 0; playerIndex < members.length; playerIndex++) {
      if (members[playerIndex].classSkillCooldown > 0) members[playerIndex].classSkillCooldown--;
      if (members[playerIndex].reflectShield > 0) members[playerIndex].reflectShield--;
      if (members[playerIndex].rageTurns > 0) members[playerIndex].rageTurns--;
      if (members[playerIndex].preciseShots > 0) members[playerIndex].preciseShots--;
    }
    tickBurning(members);
    recomputePlayerStats();
    RK.Narrator.tick(M.turn);
    var zone = getZoneAt(M.player.x, M.player.y);
    if (zone && zone.type === 'regen' && M.player.hp < M.player.maxHp) {
      var healing = Math.min(2, M.player.maxHp - M.player.hp);
      M.player.hp += healing;
      RK.UI.msg('Зона регенерации: +' + healing + ' HP.');
    }
    if (members.some(function (member) { return member.hp > 0; })) enemiesAct();
    RK.Fov.compute(M.player.x, M.player.y);
    RK.Narrator.onEvent('turnEnd', { turn: M.turn });
    if (M.locationMode && RK.World) RK.World.saveCurrentState();
    RK.UI.refresh();
    for (var aliveIndex = 0; aliveIndex < members.length; aliveIndex++) {
      members[aliveIndex].alive = members[aliveIndex].hp > 0;
    }
    if (!members.some(function (member) { return member.hp > 0; })) death();
  }

  function enemiesAct() {
    if (RK.Narrator.getMods(M.turn).freezeEnemies) return;
    if (M.debugRoom) return; // Enemies don't act in debug room
    for (var i = 0; i < M.enemies.length; i++) {
      var e = M.enemies[i];
      if (!e.alive) continue;
      enemyAct(e);
    }
  }

  function enemyAct(e) {
    var targets = party().filter(function (member) { return member.hp > 0; });
    if (!targets.length) return;
    targets.sort(function (a, b) {
      return RK.MapGen.manhattan(e.x, e.y, a.x, a.y) - RK.MapGen.manhattan(e.x, e.y, b.x, b.y);
    });
    var p = targets[0];
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

  function doRangedAttack(target) {
    var p = M && M.player;
    if (!p || !target || target.alive === false) return false;
    var weapon = RK.Classes.rangedWeapon(p);
    var weaponName = weapon ? weapon.name : 'Лук';
    var weaponLabel = weapon && weapon.weaponType === 'crossbow' ? 'арбалета' : 'лука';
    if (RK.Audio) RK.Audio.playAttack();
    var mods = RK.Narrator.getMods(M.turn);
    if (target.dodge && RK.RNG.chance(target.dodge)) {
      RK.Effects.addShot(p.x, p.y, target.x, target.y, '#cfd6ff', { life: 260 });
      RK.Effects.addDamage(target.x, target.y, 'МИМО', '#aaaaaa');
      RK.UI.msg('Промах: ' + target.name + ' уходит от выстрела.');
      return true;
    }
    var zoneMods = getZoneMods(p.x, p.y);
    var dmg = Math.max(1, p.atk + mods.atkBonus + zoneMods.atkBonus +
      RK.RNG.int(0, 2) - target.def);
    var precise = p.preciseShots > 0;
    if (precise) {
      p.preciseShots--;
      dmg *= C.PRECISE_SHOT_MULTIPLIER;
    }
    RK.Effects.addShot(p.x, p.y, target.x, target.y, weapon && weapon.weaponType === 'crossbow' ? '#ffd27a' : '#c8f0a0');
    target.hp -= dmg;
    splatBlood(target.x, target.y, precise ? 1.6 : 1.1, target.behavior === 'boss');
    RK.Effects.addDamage(target.x, target.y, dmg, '#ddff88');
    RK.UI.msg('Выстрел из ' + weaponLabel + ' «' + weaponName + '»: ' + target.name + ' получает ' + dmg +
      (precise ? ' (прицельный)' : ''));
    if (target.hp <= 0) killEnemy(target);
    return true;
  }

  function clampChance(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // Атака героя и врага разведены: флаг byPlayer давал 12 ветвлений и смешивал
  // четыре системы.
  function doAttack(attacker, target, byPlayer) {
    if (target.alive === false) return;
    if (RK.Audio) RK.Audio.playAttack();
    var dodgeLabel = target.name + ' уклонился!';
    if (target.dodge && RK.RNG.chance(target.dodge)) {
      RK.Effects.add(target.x, target.y, '#aaaaaa', { maxR: 7 });
      RK.Effects.addDamage(target.x, target.y, 'МИМО', '#aaaaaa');
      RK.UI.msg(dodgeLabel);
      return;
    }
    var damage = byPlayer
      ? playerAttackDamage(attacker, target)
      : enemyAttackDamage(attacker, target);
    damage = Math.max(1, damage);
    if (!byPlayer) M.stats.damageReceived += Math.min(damage, Math.max(0, target.hp));
    target.hp -= damage;
    splatBlood(target.x, target.y, byPlayer ? 1.2 : 0.9, target.behavior === 'boss');
    if (byPlayer) finishPlayerAttack(target, damage);
    else finishEnemyAttack(attacker, damage);
  }

  function playerAttackDamage(player, target) {
    var mods = RK.Narrator.getMods(M.turn);
    var zoneMods = getZoneMods(player.x, player.y);
    var damage = player.atk + mods.atkBonus + zoneMods.atkBonus + RK.RNG.int(0, 2) - target.def;
    if (player.classId === 'berserker' && player.rageTurns > 0) damage += C.RAGE_ATTACK_BONUS;
    return damage;
  }

  function enemyAttackDamage(enemy, target) {
    var mods = RK.Narrator.getMods(M.turn);
    var zoneMods = getZoneMods(M.player.x, M.player.y);
    var damage = enemy.atk + RK.RNG.int(0, 2) - target.def -
      mods.defBonus - zoneMods.defBonus + mods.dmgTakenBonus;
    if (M.player.classId === 'tank' && M.player.reflectShield > 0) {
      var reflected = Math.max(1, Math.floor(damage * C.REFLECT_RATIO));
      enemy.hp = Math.max(0, (enemy.hp || 0) - reflected);
      RK.UI.msg('Щитовой ответ: отражено ' + reflected + ' урона.');
      damage = Math.max(1, Math.floor(damage * C.REFLECT_RATIO));
      if (enemy.hp <= 0) killEnemy(enemy);
    }
    return damage;
  }

  function finishPlayerAttack(target, damage) {
    var p = M.player;
    if (p && p.classId === 'berserker' && p.rageTurns > 0) {
      var heal = Math.min(p.maxHp - p.hp, Math.max(1, Math.round(damage * C.BERSERKER_LIFESTEAL)));
      p.hp += heal;
      RK.UI.msg('Безумие: +' + heal + ' HP');
    }
    RK.Effects.add(target.x, target.y, target.color, { maxR: target.behavior === 'boss' ? 13 : 9 });
    RK.Effects.addDamage(target.x, target.y, damage, '#ffdd55');
    RK.UI.msg('Вы бьёте ' + target.name + ' на ' + damage);
    if (target.hp <= 0) killEnemy(target);
  }

  function finishEnemyAttack(attacker, damage) {
    RK.Effects.add(M.player.x, M.player.y, '#ff5252', { maxR: 12 });
    RK.Effects.addDamage(M.player.x, M.player.y, damage, '#ff5252');
    RK.Effects.notePlayerHit();
    RK.UI.msg(attacker.name + ' бьёт вас на ' + damage);
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

  function addLocationDrop(item) {
    if (M.locationMode) {
      item.id = item.id || 'drop-' + M.turn + '-' + M.items.length + '-' + Math.floor(RK.RNG.rand() * 0x100000000).toString(36);
      M.placedLocationItems = M.placedLocationItems || [];
      M.placedLocationItems.push(item);
    }
    M.items.push(item);
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
    addXp(e.xp);
    RK.Narrator.onEvent('kill', { boss: e.behavior === 'boss' });
    if (M.quest && M.quest.type === 'demon' &&
        (e.type === 'demon' || e.type === 'boss_demon') && !M.quest.completed) {
      advanceQuest('kill', e.type, 1);
    }
    var gold = Math.max(1, RK.RNG.int(2, 6) + M.floor * 2);
    var goldDrop = { type: 'gold', asset: 'gold', kind: 'gold', x: e.x, y: e.y, amt: gold, name: 'Золото', summary: 'Монеты', rarity: 'common', color: RK.Items.RARITY_COLORS.common };
    addLocationDrop(goldDrop);
    RK.UI.msg('С ' + e.name + ' выпало золото: ' + gold + '.');
    if (e.enhanced || e.behavior === 'boss' || RK.RNG.chance(0.5)) {
      var drop = RK.Items.generateLootItem(M.floor, e.x, e.y, e.behavior === 'boss', e.enhanced);
      drop.source = 'kill';
      addLocationDrop(drop);
      RK.UI.msg('С трупа выпал лут: ' + (drop.name || 'Лут'));
    }
  }

  function advanceQuest(kind, detail, amount) {
    var amt = amount || 1;
    if (!M.quests || !M.quests.length) return;
    for (var qi = 0; qi < M.quests.length; qi++) {
      var q = M.quests[qi];
      if (q.completed || q.kind !== kind) continue;
      if (kind === 'kill' && (q.enemyTypes || [q.type]).indexOf(detail) < 0) continue;
      // visit — задание на дорогу: засчитывается только нужная локация.
      if (kind === 'visit' && q.type !== detail) continue;
      q.progress = Math.min(q.target, q.progress + amt);
      if (q.progress >= q.target) {
        q.completed = true;
        M.player.gold += q.reward;
        RK.UI.msg('Задание выполнено! Награда: ' + q.reward + ' золота.');
      } else {
        RK.UI.msg('Прогресс задания: ' + q.progress + '/' + q.target + '.');
      }
      break;
    }
  }

  // Сдача активного задания конкретному NPC: сдвиг цепочки или закрытие предложения.
  function turnInQuest(npcId) {
    if (!M.player) return false;
    var npc = npcId == null ? RK.Npc.findByKind(M.npcs, 'ancient_guard') : RK.Npc.findByKind(M.npcs, npcId);
    if (!npc || !RK.Npc.isNear(npc, M.player.x, M.player.y)) {
      RK.UI.msg('Подойдите к NPC, чтобы сдать задание.');
      return false;
    }
    var questToComplete = M.quests.find(function (q) { return !q.completed; });
    if (!questToComplete) {
      RK.UI.msg('Нет активного задания на сдачу.');
      return false;
    }
    questToComplete.completed = true;
    if (questToComplete.reward) M.player.gold += questToComplete.reward;
    if (RK.Faction && RK.Faction.changeReputation && questToComplete.reward) {
      RK.Faction.changeReputation(questToComplete.reward / 10);
    }
    RK.UI.msg('Задание сдано: ' + questToComplete.description);
    RK.UI.refresh();
    if (npc.questChain && npc.questChainIndex < npc.questChain.length - 1) {
      npc.questChainIndex++;
      npc.offer = npc.questChain[npc.questChainIndex];
    } else {
      npc.offer = null;
    }
    npc.accepted = true;
    return true;
  }

  // Обратная совместимость: гильдия принимает только collect/escort задания.
  function turnInQuestAtGuild() {
    if (!M || !M.locationMode || (M.locationMode && RK.World && RK.World.current().type !== 'city')) return false;
    var npc = RK.Npc.findByKind(M.npcs, 'ancient_guard');
    if (!npc || !M.player) return false;
    if (!RK.Npc.isNear(npc, M.player.x, M.player.y)) {
      RK.UI.msg('Подойдите к Древнему стражу гильдии, чтобы сдать задание.');
      return false;
    }
    var questToComplete = M.quests.find(function (q) {
      return (q.kind === 'collect' || q.kind === 'escort') && !q.completed;
    });
    if (!questToComplete) return false;
    questToComplete.completed = true;
    if (questToComplete.reward) M.player.gold += questToComplete.reward;
    if (RK.Faction && RK.Faction.changeReputation && questToComplete.reward) {
      RK.Faction.changeReputation(questToComplete.reward / 10);
    }
    RK.UI.msg('Задание сдано в гильдию: ' + questToComplete.description);
    RK.UI.refresh();
    if (npc.questChain && npc.questChainIndex < npc.questChain.length - 1) {
      npc.questChainIndex++;
      npc.offer = npc.questChain[npc.questChainIndex];
    } else {
      npc.offer = null;
    }
    npc.accepted = true;
    return true;
  }

  // Сдача любого выполненного задания из журнала квестов: ищет по id или описанию.
  function turnInQuestAny(questId) {
    if (!M.player) return false;
    var quest = M.quests.find(function (q) {
      return !q.completed && (q.id === questId || q.description === questId);
    });
    if (!quest) return false;
    if (quest.progress < quest.target) {
      RK.UI.msg('Задание ещё не выполнено: ' + quest.progress + '/' + quest.target + '.');
      return false;
    }
    quest.completed = true;
    if (quest.reward) M.player.gold += quest.reward;
    if (RK.Faction && RK.Faction.changeReputation && quest.reward) {
      RK.Faction.changeReputation(quest.reward / 10);
    }
    RK.UI.msg('Задание сдано: ' + quest.description + ' (+' + quest.reward + ' золота).');
    RK.UI.refresh();
    return true;
  }

  // Warehouse: хранение предметов в гильдейском складу.
  function storeInWarehouse(index) {
    if (!M || !M.player || !M.player.backpack || !M.player.backpack[index]) return false;
    var item = M.player.backpack[index];
    // В режиме локации items могут переноситься в placedLocationItems
    if (M.locationMode && RK.World && RK.World.current() && RK.World.current().type === 'city') {
      M.placedLocationItems = M.placedLocationItems || [];
      M.placedLocationItems.push(item);
    }
    M.player.backpack.splice(index, 1);
    RK.UI.msg('Предмет хранится в гильдейском складе: ' + item.name);
    RK.UI.refresh();
    return true;
  }

  // Лечение в храме: восстанавливает здоровье героя.
  function templeHeal() {
    var p = M && M.player;
    if (!p) return false;
    p.hp = p.maxHp;
    RK.UI.msg('Здоровье восстановлено.');
    RK.UI.refresh();
    return true;
  }

  // Благословение храма: +10% к атаке до конца хода.
  function templeBlessing() {
    var p = M && M.player;
    if (!p) return false;
    var bonus = Math.max(1, Math.round((p.atk || 0) * 0.1));
    p.atk = (p.atk || 0) + bonus;
    if (p.gearBonuses) p.gearBonuses.atk = (p.gearBonuses.atk || 0) + bonus;
    p.blessingAttackBonus = (p.blessingAttackBonus || 0) + bonus;
    RK.UI.msg('Благословение: +' + bonus + ' к атаке.');
    RK.UI.refresh();
    return true;
  }

  // Задание берёт NPC, рядом с которым стоит герой. Идентификатор приходит и из
  // сети, поэтому берётся только из списка забега, а не из аргумента как такового.
  function acceptQuest(npcId) {
    if (!M.player) return false;
    var npc = npcId == null
      ? RK.Npc.findByKind(M.npcs, 'merchant')
      : RK.Npc.findByKind(M.npcs, npcId);
    if (!npc || !npc.offer || !RK.Npc.isNear(npc, M.player.x, M.player.y)) return false;
    var q = npc.offer;
    M.quests.push(q);
    npc.offer = null;
    npc.accepted = true;
    RK.UI.msg('Задание принято: ' + q.description);
    RK.UI.refresh();
    return true;
  }

  // Отдых в таверне: восстановление HP за золото.
  function tavernRest() {
    var p = M && M.player;
    if (!p) return false;
    var cost = C.TAVERN_REST_COST || 10;
    if (p.gold < cost) {
      RK.UI.msg('Недостаточно золота для отдыха. Нужно: ' + cost + '.');
      return false;
    }
    p.gold -= cost;
    p.hp = p.maxHp;
    RK.UI.msg('Отдых: здоровье восстановлено. -' + cost + ' золота.');
    RK.UI.refresh();
    return true;
  }

  // Слухи в таверне: подсказка о мире или заданиях.
  function tavernRumors() {
    var p = M && M.player;
    if (!p) return false;
    var cost = C.TAVERN_RUMORS_COST || 5;
    if (p.gold < cost) {
      RK.UI.msg('Недостаточно золота на слухи. Нужно: ' + cost + '.');
      return false;
    }
    p.gold -= cost;
    var rumors = [
      'В лесу на севере скелеты сильнее, чем в южных рощах.',
      'Склеп охраняет древний страж. Будь готов к тяжёлому бою.',
      'Торговец даст больше золота, если принесёшь редкие предметы.',
      'Кузнец улучшает экипировку до +5. Запаситесь золотом.',
      'Жрица благословляет на +10% атаки до конца хода.',
      'В городе гильдия хранит репутацию. Сдавайте задания Древнему стражу.',
    ];
    var rumor = rumors[RK.RNG.int(0, rumors.length - 1)];
    RK.UI.msg('Слухи: ' + rumor + ' (-' + cost + ' золота)');
    RK.UI.refresh();
    return true;
  }

  // Выбор ответа в диалоге: переход к узлу или принятие задания через action.
  function dialogueChoice(npcId, choiceIndex) {
    if (!M.player) return false;
    var npc = npcId == null ? null : RK.Npc.findByKind(M.npcs, npcId);
    if (!npc || !RK.Npc.isNear(npc, M.player.x, M.player.y)) return false;
    var result = RK.Npc.chooseDialogue(npc, choiceIndex);
    if (!result) return false;
    if (result.choice && result.choice.action === 'acceptQuest') acceptQuest(npcId);
    RK.UI.refresh();
    return true;
  }

  function upgradeEquipment(slot) {
    var p = M.player;
    if (!nearService('blacksmith')) {
      RK.UI.msg('Подойдите к кузнецу, чтобы улучшить экипировку.');
      return false;
    }
    var item = p && p.equipment && p.equipment[slot];
    if (!item || !item.baseStats) {
      RK.UI.msg('В этом слоте нет улучшаемой экипировки.');
      return false;
    }
    if (item.upgradeLevel >= C.UPGRADE_MAX) {
      RK.UI.msg('Предмет уже улучшен до максимума (' + C.UPGRADE_MAX + ').');
      return false;
    }
    var cost = RK.Items.getUpgradeCost(item);
    if (cost == null || p.gold < cost) {
      RK.UI.msg('Недостаточно золота. Нужно: ' + (cost || 0) + '.');
      return false;
    }
    p.gold -= cost;
    var ok = RK.Items.upgradeItem(item);
    if (ok) {
      recomputePlayerStats();
      RK.UI.msg(item.name + ' улучшен до +' + item.upgradeLevel + '! (' + item.summary + ')');
      RK.UI.refresh();
      return true;
    }
    p.gold += cost;
    return false;
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

  // В банк уходит золото всей партии: в кооперативе складываются вклады героев.
  function bankPartyGold() {
    var members = party();
    var total = 0;
    for (var i = 0; i < members.length; i++) total += bankValue(members[i].gold || 0);
    RK.Meta.addBank(total);
    return total;
  }

  function endRun(won) {
    M.over = true;
    M.result = won ? 'victory' : 'defeat';
    // Забег окончен: сохранение больше нечего продолжать, и «Продолжить» в меню
    // должно исчезнуть.
    if (RK.World && RK.World.clearRun) RK.World.clearRun();
    RK.Narrator.onEvent(won ? 'victory' : 'death');
    var banked = bankPartyGold();
    RK.UI.over(won, won ? C.MAX_FLOOR : M.floor, M.player.level, banked, M.stats, M.player);
  }

  function death() {
    endRun(false);
  }

  function victory() {
    endRun(true);
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
      if (RK.Effects) {
        RK.Effects.add(p.x, p.y, RK.Classes.skillColor(p.classId), { maxR: 24, life: 480 });
      }
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
    var player = initPartyMember(id, name, classId);
    M.players.push(player);
    var tile = findFreeSpawnTile(M.player.x, M.player.y, id);
    if (tile) {
      player.x = tile.x;
      player.y = tile.y;
    }
    RK.UI.refresh();
    RK.Fov.compute(player.x, player.y);
    return true;
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

  // Действия от имени конкретного героя: их отправляют игроки сетевой комнаты,
  // где забег идёт на сервере. Таблица строится один раз, не на каждый вызов performAction.
  //
  // Псевдонимы (storeItem, guildStore, heal и прочие) — это wire-имена, по которым
  // уже отправленные клиенты зовут то же самое действие. Отдельных функций за ними
  // нет: они указывают на каноническую, чтобы правка поведения меняла все имена разом.
  var ACTION_HANDLERS = null;

  function actionHandlers() {
    if (!ACTION_HANDLERS) {
      // Таблица без прототипа: иначе действие 'constructor' нашло бы
      // Object.prototype.constructor и упало бы при вызове.
      ACTION_HANDLERS = Object.assign(Object.create(null), {
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
        upgradeEquipment: upgradeEquipment,
        acceptQuest: acceptQuest,
        dialogueChoice: dialogueChoice,
        turnInQuest: turnInQuest,
        turnInQuestAtGuild: turnInQuestAtGuild,
        turnInQuestAny: turnInQuestAny,
        storeInWarehouse: storeInWarehouse,
        storeItem: storeInWarehouse,
        guildStore: storeInWarehouse,
        templeBlessing: templeBlessing,
        applyBlessing: templeBlessing,
        blessing: templeBlessing,
        applyTempleBlessing: templeBlessing,
        templeHeal: templeHeal,
        heal: templeHeal,
        applyTempleHeal: templeHeal,
        tavernRest: tavernRest,
        tavernRumors: tavernRumors,
      });
    }
    return ACTION_HANDLERS;
  }

  var MAX_ACTION_ARGS = 5;

  function performAction(id, action, args) {
    if (!setActivePlayer(id) || !M.player.alive || M.over) return false;
    args = Array.isArray(args) ? args : [];
    var handlers = actionHandlers();
    var handler = handlers[action];
    if (typeof handler !== 'function' || args.length > MAX_ACTION_ARGS) return false;
    var turn = M.turn;
    var result = handler.apply(null, args);
    if (result === false) return M.turn !== turn || busy();
    if (M.turn === turn && !busy()) finishTurn();
    return true;
  }

  function createSnapshot() {
    if (!M || !RK.Map) return null;
    var map = JSON.parse(JSON.stringify(RK.Map));
    // Матрицы карты жмутся в map.matrices: в разы меньше символов, а снимок
    // уходит на каждый шаг. Разворачивает их applySnapshot.
    var matrices = RK.MapGen.encodeMatrices(map);
    MATRIX_FIELDS.forEach(function (field) { delete map[field]; });
    // vis в снимок не едет: он посчитан для того, кто ходил, а каждый клиент
    // пересчитывает обзор от своего героя (js/render.js).
    delete map.vis;
    map.matrices = matrices;
    var game = JSON.parse(JSON.stringify({ game: M, map: map }));
    if (M.locationMode && RK.World) {
      RK.World.saveCurrentState();
      // Карта текущей локации едет полем map, матрицы сжаты в map.matrices,
      // а visited несёт только остальные локации: снимок уходит на каждый
      // шаг, поэтому повторы карты там стоили бы десятков килобайт.
      game.world = RK.World.getNetworkState();
    }
    return game;
  }

  // Карта из снимка: матрицы разворачиваются, vis — пустая сетка. Обзор
  // считает рендер от героя игрока, поэтому чужой vis в снимке не нужен.
  function restoreMap(snapshotMap) {
    var map = snapshotMap;
    var matrices = map.matrices;
    if (!matrices) return map;
    var width = Number.isInteger(map.w) ? map.w : 0;
    var height = Number.isInteger(map.h) ? map.h : 0;
    if (!width || !height) return null;
    var decoded = RK.MapGen.decodeMatrices(matrices, width, height);
    if (!decoded) return null;
    map = Object.assign({}, map, decoded);
    delete map.matrices;
    if (!Array.isArray(map.vis)) {
      var vis = [];
      for (var y = 0; y < height; y++) vis.push(new Array(width).fill(false));
      map.vis = vis;
    }
    return map;
  }

  function applySnapshot(snapshot, localPlayerId) {
    if (!snapshot || !snapshot.game || !snapshot.map) return false;
    // Прежние позиции партии: по ним запускается анимация шага — своего героя и
    // соседей, иначе они телепортировались бы между кадрами.
    var previousPositions = Object.create(null);
    var previousParty = M && M.players ? M.players : [];
    for (var pi = 0; pi < previousParty.length; pi++) {
      previousPositions[previousParty[pi].id] = { x: previousParty[pi].x, y: previousParty[pi].y };
    }
    var previousPlayer = M && M.players
      ? M.players.find(function (player) { return player.id === localPlayerId; })
      : null;
    var previousCooldown = previousPlayer ? previousPlayer.classSkillCooldown : null;
    walk.steps = Object.create(null);
    walk.auto = false;
    walk.autoSeen = [];
    M = RK.GAME = snapshot.game;
    RK.Map = restoreMap(snapshot.map);
    if (!RK.Map) return false;
    if (snapshot.world && RK.World && !RK.World.setState(snapshot.world, RK.Map)) return false;
    M.locationMode = !!M.locationMode;
    M.players = M.players || [M.player];
    M.player = M.players.find(function (player) { return player.id === localPlayerId; }) || M.players[0];
    if (!M.player) return false;
    if (previousCooldown === 0 && M.player.classSkillCooldown > 0 && RK.Effects) {
      RK.Effects.add(M.player.x, M.player.y, RK.Classes.skillColor(M.player.classId), { maxR: 24, life: 480 });
    }
    M.mapWidth = RK.Map.w;
    M.mapHeight = RK.Map.h;
    // Забег, записанный до списка NPC (файл комнаты на диске): город населяется
    // заново — расстановка по зданиям детерминирована и даёт тот же результат.
    if (!Array.isArray(M.npcs)) {
      var currentLoc = M.locationMode && RK.World ? RK.World.current() : null;
      M.npcs = currentLoc && currentLoc.type === 'city'
        ? RK.Npc.placeCityNpcs(RK.Map, M.floor)
        : [];
    }
    if (M.locationMode && RK.World && RK.World.current()) M.locationId = RK.World.current().id;
    // Запись текущей локации не едет в снимке (её несёт map), поэтому
    // пересобирается из присланной карты и партии — иначе возврат сюда
    // восстановил бы пустую локацию.
    if (M.locationMode && RK.World) RK.World.saveCurrentState();
    resizeCanvas();
    animateSnapshotSteps(previousPositions);
    if (RK.UI.syncNetworkState) RK.UI.syncNetworkState();
    else RK.UI.refresh();
    return true;
  }

  // Шаг приходит снимком, поэтому герои телепортировали бы на клетку за кадр.
  // Анимация шага для всей партии запускается здесь: логика уже отработала на
  // сервере, поэтому у interpolate нет продолжения — только отрисовка перехода.
  function animateSnapshotSteps(previousPositions) {
    var members = party();
    var animated = false;
    for (var i = 0; i < members.length; i++) {
      var member = members[i];
      var from = previousPositions[member.id];
      if (!from || member.hp <= 0) continue;
      var distance = Math.abs(member.x - from.x) + Math.abs(member.y - from.y);
      // Ровно одна клетка — шаг. Остальное (смена этажа, телепорт) показывается сразу.
      if (distance !== 1) continue;
      startStep(member, from.x, from.y, member.x, member.y, null);
      animated = true;
    }
    return animated;
  }

  // Инициализируем хендлеры действий до создания RK.Combat.
  actionHandlers();

  RK.Combat = {
    newRun: newRun,
    createDebugContext: createDebugContext,
    startFloor: startFloor,

    playerAction: playerAction,
    skipTurn: skipTurn,
    tryStep: tryStep,
    interact: interact,
    usePotion: usePotion,
    useInventoryItem: useInventoryItem,
    placeCarriedTrap: placeCarriedTrap,
    dropInventoryItem: dropInventoryItem,
    unequipSlot: unequipSlot,
    sellInventoryItem: sellInventoryItem,
    getSellValue: getSellValue,
    upgradeEquipment: upgradeEquipment,
    acceptQuest: acceptQuest,
    advanceQuest: advanceQuest,
    openNpcScreen: openNpcScreen,
    activateClassSkill: activateClassSkill,
    turnInQuest: turnInQuest,
    turnInQuestAtGuild: turnInQuestAtGuild,
    turnInQuestAny: turnInQuestAny,
    tavernRest: tavernRest,
    tavernRumors: tavernRumors,
    storeInWarehouse: storeInWarehouse,
    setPlayerStats: setPlayerStats,

    getEnemyAt: getEnemyAt,
    placePartyAtEntry: placePartyAtEntry,
    getZoneAt: getZoneAt,
    getZoneMods: getZoneMods,
    recomputePlayerStats: recomputePlayerStats,

    busy: busy,
    tickWalk: tickWalk,
    getDrawPos: getDrawPos,
    stepsDone: stepsDone,
    isAutoWalking: function () { return walk.auto; },

    addNetworkPlayer: addNetworkPlayer,
    setActivePlayer: setActivePlayer,
    createSnapshot: createSnapshot,
    applySnapshot: applySnapshot,
    performAction: performAction,
    // Таблица действий — часть контракта (её проверяет ACTION_RULES на сервере),
    // поэтому отдаё наружу: без неё расхождение таблиц нечем поймать.
    actionHandlers: actionHandlers,
  };
})();
