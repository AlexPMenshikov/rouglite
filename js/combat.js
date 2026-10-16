(function () {
  var C = RK.CONFIG;
  var M;

  // Поля карты, которые снимок жмёт в map.matrices. Список живёт в map.js —
  // он же кодирует и разворачивает, поэтому combat берёт его оттуда.
  var MATRIX_FIELDS = RK.MapGen.MATRIX_FIELDS;

  // Единый реестр статусов живёт в js/status-defs.js, combat берёт его оттуда.
  var STATUS_DEFS = RK.Statuses.DEFS;

// Режимы взаимодействия, разводимые клавишами E / L / F.
  var INTERACT = {
    USE: 'use',
    PICK: 'pick',
    FORCE: 'force',
  };

  // Спиральный обход клеток вокруг центра до maxRadius (не включая).
  // Возвращает первую клетку, для которой predicate вернул true.
  function spiralSearch(centerX, centerY, maxRadius, predicate) {
    for (var radius = 1; radius < maxRadius; radius++) {
      for (var dy = -radius; dy <= radius; dy++) {
        for (var dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          var x = centerX + dx;
          var y = centerY + dy;
          if (predicate(x, y)) return { x: x, y: y };
        }
      }
    }
    return null;
  }

  // Свободная клетка рядом с партией: ею бой расставляет соседей при переходе
  // между локациями, чтобы никто не вставал на клетку выхода. Ищет ближе,
  // чем findFreeSpawnTile, но с меньшим числом проверок.
  function findFreeTileNear(x, y, exceptId) {
    var tile = findFreeSpawnTile(x, y, exceptId);
    if (tile) return tile;
    return spiralSearch(x, y, 2, function (cx, cy) {
      return RK.MapGen.isWalkable(cx, cy);
    });
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
    return (RK.Meta && RK.Meta.data && RK.Meta.data.selectedClass) || 'paladin';
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
    player.classId = classId || 'paladin';
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
    M.quests = [registerQuest(firstQuest, 'merchant', false)];
    resizeCanvas();
    if (RK.Audio && !RK.Audio.start()) RK.UI.msg('Web Audio не поддерживается браузером: звуки недоступны.');
    RK.Narrator.initRun(M);
    if (RK.Events && RK.Events.init) RK.Events.init(M);
    if (RK.Camp && RK.Camp.init) RK.Camp.init(M);
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
    return spiralSearch(centerX, centerY, limit, function (x, y) {
      if (!RK.MapGen.isWalkable(x, y)) return false;
      if (getEnemyAt(x, y)) return false;
      if (RK.Map.stair && RK.Map.stair.x === x && RK.Map.stair.y === y) return false;
      if (getPartyPlayerAt(x, y, exceptId)) return false;
      return true;
    });
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
    var base;
    if (floor <= 2) base = [['slime', 3], ['rat', 3], ['skeleton', 1]];
    else if (floor <= 4) base = [['slime', 2], ['rat', 2], ['skeleton', 2], ['archer', 1]];
    else if (floor <= 7) base = [['skeleton', 3], ['archer', 2], ['bat', 2], ['demon', 1]];
    else base = [['archer', 2], ['bat', 2], ['demon', 3], ['skeleton', 1]];
    // Локационные обитатели преобладают (вес 2 против 1 у базовых),
    // поэтому локация узнаваема, но не однообразна. Вне мира — старый пул.
    var loc = RK.World && RK.World.current();
    var locTypes = loc && C.LOCATION_ENEMIES[loc.type];
    if (!locTypes || !locTypes.length) return base;
    var pool = [];
    for (var i = 0; i < locTypes.length; i++) pool.push([locTypes[i], 2]);
    for (var j = 0; j < base.length; j++) pool.push([base[j][0], 1]);
    return pool;
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
      // Одно случайное число на врага: enhanced и champion взаимоисключающие.
      // Не вызываем RK.RNG дважды, чтобы не сдвигать дальнейшую детерминированность
      // забега (события, лут) больше, чем требует новый шанс чемпиона.
      var roll = RK.RNG.rand();
      var enhancedRoll = roll < 0.2;
      var loc = RK.World && RK.World.current();
      var championRate = 0.08 + Math.min(0.12, Math.max(0, floor - 1) * 0.015);
      if (loc && (loc.type === 'crypt' || loc.type === 'dungeon' || loc.type === 'ruins')) championRate += 0.06;
      // Вероятность чемпиона считается среди не-усиленных: сдвигаем порог.
      var championThreshold = 0.2 + championRate * (1 - 0.2);
      var championRoll = !enhancedRoll && roll < championThreshold;
      M.enemies.push(RK.Entities.makeEnemy(type, t.x, t.y, floor, enhancedRoll, championRoll));
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
    else if (service === 'guild') RK.UI.showGuild();
    else RK.UI.showNpc(npc.id);
  }

  function playerAction(tx, ty) {
    if (!M || M.over || busy()) return false;
    var p = M.player;
    var door = RK.MapGen.getDoorAt(tx, ty);
    var chest = RK.MapGen.getChestAt(tx, ty);
    var npc = npcAt(tx, ty);
    var trap = RK.MapGen.getTrapAt(tx, ty);
    var exit = M.locationMode && RK.Map.exits && RK.Map.exits.find(function (point) {
      return point.x === tx && point.y === ty;
    });
    // Клик по переходу — команда дойти и перейти: маршрут строит автопроход,
    // а сам переход случается шагом на клетку (checkStairs). Переход, на котором
    // герой уже стоит (партия встаёт на входные ворота), срабатывает сразу.
    var stair = !M.locationMode ? RK.Map.stair : null;
    if (exit || (stair && stair.x === tx && stair.y === ty)) {
      RK.UI.msg('Переход: ' + (exit ? exit.label : 'вниз, на этаж ' + (M.floor + 1)) + '.');
      if (M.player.x === tx && M.player.y === ty) {
        stopAutoWalk();
        checkStairs();
        RK.UI.refresh();
        return true;
      }
      beginAutoWalk(tx, ty);
      return busy();
    }
    // Врага проверяем раньше предметов: враг, стоящий на ловушке, иначе перехватывал
    // бы клик, и лучник не стрелял бы вместо этого.
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
      }
      tryMoveToward(tx, ty);
      return busy();
    }
    if (door || chest || npc || trap) {
      var target = door || chest || npc || trap;
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
      if (trap && !door && !chest) {
        RK.UI.msg('Ловушка под ногами. Нажмите L, чтобы обезвредить её.');
        return true;
      }
      return interact(INTERACT.USE);
    }
    if (!RK.MapGen.isWalkable(tx, ty)) return false;
    if (tx === p.x && ty === p.y) {
      skipTurn();
      return true;
    }
    // Соседняя клетка, в том числе по диагонали, — один шаг, как с нумпада:
    // tryStep уже знает диагональ и сам ставит взгляд, 8-направленный BFS не нужен.
    if (Math.max(Math.abs(tx - p.x), Math.abs(ty - p.y)) === 1) {
      return tryStep(tx - p.x, ty - p.y);
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
    // Взгляд обновляем на каждый шаг автопрохода: иначе герой смотрит туда,
    // куда повернулся последним ручным шагом.
    setFacing(s.x - p.x, s.y - p.y);
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
    interruptCampIfActive('Вы покидаете лагерь.');
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
    interruptCampIfActive('Вы покидаете лагерь.');
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
        applyStatus(M.player, 'burning', { turns: 3, damage: 2, appliedTurn: M.turn + 1 });
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
      triggerChampionPhase(actor);
RK.UI.msg((actor.name || 'Враг') + ' попал в ловушку: -' + (enemyBefore - actor.hp) + ' HP.');
      if (actor.hp <= 0) killEnemy(actor);
      return true;
    }
    return false;
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

  function applyStatus(actor, id, opts) {
    if (!actor) return null;
    var def = STATUS_DEFS[id];
    if (!def) return null;
    opts = opts || {};
    var statuses = ensureStatuses(actor);
    var turns = Number.isInteger(opts.turns) ? opts.turns : def.defaultTurns;
    var damage = Number.isInteger(opts.damage) ? opts.damage : def.defaultDamage;
    var appliedTurn = Number.isInteger(opts.appliedTurn) ? opts.appliedTurn : ((M && M.turn) || 0) + 1;
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

  function tickDamageStatus(actor, id, label) {
    var def = STATUS_DEFS[id];
    if (!def || def.kind !== 'damage') return;
    var statuses = actor && actor.statuses;
    var status = statuses && statuses[id];
    if (!status || !(status.turns > 0)) return;
    if (status.appliedTurn >= M.turn) return;
    var multiplier = elementalMultiplier(actor, def.element);
  var damage = Math.min(actor.hp, Math.max(1, Math.round((status.damage || def.defaultDamage || 1) * multiplier)));
    actor.hp -= damage;
    if (actor === M.player || (M.players && M.players.indexOf(actor) !== -1)) {
      M.stats.damageReceived += damage;
    }
    var color = (status.color || def.color || '#ffffff');
    var effectsTarget = actor;
    RK.Effects.add(effectsTarget.x, effectsTarget.y, color, { maxR: 10 });
    RK.Effects.addDamage(effectsTarget.x, effectsTarget.y, damage, color);
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

  function tickTimerStatus(actor, id) {
    var def = STATUS_DEFS[id];
    if (!def || def.kind !== 'damage') return;
    var statuses = actor && actor.statuses;
    var status = statuses && statuses[id];
    if (!status || !(status.turns > 0)) return;
    if (status.appliedTurn >= M.turn) return;
    status.turns--;
    if (status.turns <= 0) delete statuses[id];
    if (id === 'chill') actor.chilled = !!(statuses && statuses.chill);
  }

  function tickActorStatuses(actor) {
    if (!actor || actor.hp <= 0) return;
    ensureStatuses(actor);
    tickDamageStatus(actor, 'burning', 'Горение');
    tickDamageStatus(actor, 'poison', 'Яд');
    tickDamageStatus(actor, 'bleed', 'Кровотечение');
    // Контроль-статусы сами «поглощаются» в enemyAct или просто тикают.
    var stun = actor.statuses && actor.statuses.stun;
    if (stun && stun.turns > 0 && stun.appliedTurn < M.turn) {
      stun.turns--;
      if (stun.turns <= 0) delete actor.statuses.stun;
      if (actor.stunned && !(actor.statuses && actor.statuses.stun)) actor.stunned = false;
    }
    var chill = actor.statuses && actor.statuses.chill;
    if (chill && chill.turns > 0 && chill.appliedTurn < M.turn) {
      chill.turns--;
      if (chill.turns <= 0) {
        delete actor.statuses.chill;
        actor.chilled = false;
      }
    }
    syncBurningLegacy(actor);
    if (actor.hp <= 0 && actor !== M.player) {
      // Смерть от статуса обрабатывается вызывающим кодом.
    }
  }

  function tickBurning(party) {
    for (var i = 0; i < party.length; i++) {
      tickActorStatuses(party[i]);
      if (party[i] && party[i].hp <= 0) {
        // deferred death handled by finishTurn checks; call death if local hero.
        if (party[i] === M.player || (M.players && M.players.indexOf(party[i]) === M.players.indexOf(M.player))) {
          death();
        }
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
      advanceQuest('loot', null, 1);
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

  // Любое перемещение или атака гасят лагерь: привал — это неподвижный отдых.
  function interruptCampIfActive(reason) {
    if (RK.Camp && RK.Camp.leave && M && M.camp && M.camp.active) {
      RK.Camp.leave(reason);
    }
  }

  function movePlayer(x, y) {
    var p = M.player;
    interruptCampIfActive('Вы покидаете лагерь.');
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
    var info = RK.Classes && RK.Classes.getClassDef ? RK.Classes.getClassDef(p.classId || 'paladin') : null;
    var classAtk = 0;
    var classDef = 0;
    var classHp = 0;
    if (info && info.id === 'paladin') {
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

  // Двуручное лежит в обеих руках: снять его можно из любой, а очистить — из всех.
  function clearItemSlots(player, item) {
    for (var i = 0; i < C.SLOTS.length; i++) {
      if (player.equipment[C.SLOTS[i]] === item) player.equipment[C.SLOTS[i]] = null;
    }
  }

  function unequipIntoBackpack(player, slot, index) {
    var item = player.equipment[slot];
    if (!item) return false;
    clearItemSlots(player, item);
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
    var slot = RK.Classes.targetSlotFor(p, item);
    if (!slot) return false;
    var restriction = RK.Classes.equipRestriction(p, item, slot);
    if (restriction) {
      RK.UI.msg(restriction);
      return false;
    }
    if (item.equipped) {
      // Предмет может лежать не в своём слоте: второе оружие берсерка сидит в offhand.
      var held = null;
      for (var s = 0; s < C.SLOTS.length; s++) {
        if (p.equipment[C.SLOTS[s]] === item) { held = C.SLOTS[s]; break; }
      }
      return unequipIntoBackpack(p, held || item.slot, index);
    }

    // Двуручное требует обе руки; вторую руку отдаёт второе оружие берсерка.
    var hands = RK.Classes.handsFor(p, item);
    for (var h = 0; h < hands.length; h++) {
      var occupant = p.equipment[hands[h]];
      if (occupant && occupant !== item && occupant.twoHanded && !item.twoHanded) {
        RK.UI.msg('Обе руки заняты двуручным оружием.');
        return false;
      }
    }
    // Снимаем всё, что стоит в нужных руках.
    for (var h2 = 0; h2 < hands.length; h2++) {
      var current = p.equipment[hands[h2]];
      if (current && current !== item) {
        p.backpack.splice(index, 1);
        clearItemSlots(p, current);
        current.equipped = false;
        applyGearBonuses(p, current.stats, -1);
        p.backpack.push(current);
        index = p.backpack.indexOf(item);
      }
    }
    p.backpack.splice(index, 1);
    for (var h3 = 0; h3 < hands.length; h3++) p.equipment[hands[h3]] = item;
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
    if (item.equipped) {
      clearItemSlots(p, item);
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
          advanceQuest('loot', null, 1);
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
      var member = members[playerIndex];
      if (member.classSkillCooldown > 0) member.classSkillCooldown--;
      if (member.reflectShield > 0) member.reflectShield--;
      if (member.rageTurns > 0) member.rageTurns--;
      if (member.preciseShots > 0) member.preciseShots--;
      if (member.bloodlustTurns > 0) member.bloodlustTurns--;
      if (member.unstoppableTurns > 0) member.unstoppableTurns--;
      if (member.piercingShots > 0) member.piercingShots--;
      if (member.defenseReduceTurns > 0) member.defenseReduceTurns--;
      if (RK.Classes && RK.Classes.tickSkillCooldowns) RK.Classes.tickSkillCooldowns(member);
    }
    tickBurning(members);
    var enemyStatusSnapshot = M.enemies.slice();
    for (var esi = 0; esi < enemyStatusSnapshot.length; esi++) {
      var enemyForStatus = enemyStatusSnapshot[esi];
      if (!enemyForStatus || !enemyForStatus.alive) continue;
      tickActorStatuses(enemyForStatus);
      if (enemyForStatus.hp <= 0) killEnemy(enemyForStatus);
    }
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
    // Мировые события тикают каждый ход: сервер видит их в снимке вместе с игрой.
    if (RK.Events && RK.Events.tick) RK.Events.tick();
    // Кемпинг тикает так же: лечение и проверка врагов в радиусе лагеря.
    if (RK.Camp && RK.Camp.tick) RK.Camp.tick();
    if (M.locationMode && RK.World) RK.World.saveCurrentState();
    RK.UI.refresh();
    for (var aliveIndex = 0; aliveIndex < members.length; aliveIndex++) {
      members[aliveIndex].alive = members[aliveIndex].hp > 0;
    }
    if (!members.some(function (member) { return member.hp > 0; })) death();
  }

  function enemiesAct() {
    if (RK.Narrator.getMods(M.turn).freezeEnemies) return;
    if (M.sceneKind === 'debug') return; // В комнате отладки враги не действуют.
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
    if (e.stunned || (e.statuses && e.statuses.stun)) {
      e.stunned = false;
      if (e.statuses) delete e.statuses.stun;
      RK.UI.msg(e.name + ' оглушён и пропускает ход.');
      return;
    }
    if (e.isChampion && e.regenPercent && e.hp > 0 && e.hp < e.maxHp) {
      var regenHeal = Math.max(1, Math.round(e.maxHp * e.regenPercent));
      e.hp = Math.min(e.maxHp, e.hp + regenHeal);
    }
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
    var zoneMods = getZoneMods(p.x, p.y);
    var dmg = Math.max(1, p.atk + mods.atkBonus + zoneMods.atkBonus +
      RK.RNG.int(0, 2) - target.def);
    var precise = p.preciseShots > 0;
    if (precise) {
      p.preciseShots--;
      dmg *= C.PRECISE_SHOT_MULTIPLIER;
    }
    var piercing = p.piercingShots > 0;
    if (piercing) {
      p.piercingShots--;
    }
    RK.Effects.addShot(p.x, p.y, target.x, target.y, weapon && weapon.weaponType === 'crossbow' ? '#ffd27a' : '#c8f0a0');
    if (target.dodge && RK.RNG.chance(target.dodge)) {
      RK.Effects.addDamage(target.x, target.y, 'МИМО', '#aaaaaa');
      RK.UI.msg('Промах: ' + target.name + ' уходит от выстрела.');
      return true;
    }
    target.hp -= dmg;
    splatBlood(target.x, target.y, precise ? 1.6 : 1.1, target.behavior === 'boss');
    triggerChampionPhase(target);
    RK.Effects.addDamage(target.x, target.y, dmg, '#ddff88');
    RK.UI.msg('Выстрел из ' + weaponLabel + ' «' + weaponName + '»: ' + target.name + ' получает ' + dmg +
      (precise ? ' (прицельный)' : '') + (piercing ? ' (пронзающий)' : ''));
    if (target.hp <= 0) killEnemy(target);
    if (piercing) {
      var dx = Math.sign(target.x - p.x);
      var dy = Math.sign(target.y - p.y);
      var cx = target.x + dx;
      var cy = target.y + dy;
      while (cx >= 0 && cy >= 0 && cx < M.mapWidth && cy < M.mapHeight) {
        var next = getEnemyAt(cx, cy);
        if (next) {
          var ndmg = Math.max(1, dmg - 2);
          next.hp -= ndmg;
          RK.Effects.addDamage(next.x, next.y, ndmg, '#ddff88');
          RK.UI.msg('Пронзающий выстрел: ' + next.name + ' получает ' + ndmg + '.');
          if (next.hp <= 0) killEnemy(next);
        }
        cx += dx;
        cy += dy;
      }
    }
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
    if (byPlayer && target.alive !== false) triggerChampionPhase(target);
    if (byPlayer) finishPlayerAttack(target, damage);
    else finishEnemyAttack(attacker, damage);
  }

  function playerAttackDamage(player, target) {
    var mods = RK.Narrator.getMods(M.turn);
    var zoneMods = getZoneMods(player.x, player.y);
    var damage = player.atk + mods.atkBonus + zoneMods.atkBonus + RK.RNG.int(0, 2) - target.def;
    if (player.classId === 'berserker' && player.rageTurns > 0) damage += C.RAGE_ATTACK_BONUS;
    if (player.bloodlustTurns > 0) {
      damage = player.atk + mods.atkBonus + zoneMods.atkBonus + RK.RNG.int(0, 2);
    }
    if (player.unstoppableTurns > 0) {
      damage = Math.max(1, damage * 2);
    }
    return damage;
  }

  function enemyAttackDamage(enemy, target) {
    var mods = RK.Narrator.getMods(M.turn);
    var zoneMods = getZoneMods(M.player.x, M.player.y);
    var damage = enemy.atk + RK.RNG.int(0, 2) - target.def -
      mods.defBonus - zoneMods.defBonus + mods.dmgTakenBonus;
    if (target.defenseReduceTurns > 0) {
      damage = Math.max(1, damage - (target.defenseReduceAmount || 2));
    }
    if (target.unstoppableTurns > 0) {
      damage = Math.max(1, Math.floor(damage * 0.5));
    }
    if (M.player.classId === 'paladin' && M.player.reflectShield > 0) {
      var reflected = Math.max(1, Math.floor(damage * C.REFLECT_RATIO));
      enemy.hp = Math.max(0, (enemy.hp || 0) - reflected);
      RK.UI.msg('Святой отклик: отражено ' + reflected + ' урона.');
      damage = Math.max(1, Math.floor(damage * C.REFLECT_RATIO));
      if (enemy.hp <= 0) killEnemy(enemy);
    }
    return damage;
  }

  function finishPlayerAttack(target, damage) {
    var p = M.player;
    if (p && p.bloodlustTurns > 0) {
      var bloodHeal = Math.min(p.maxHp - p.hp, Math.max(1, Math.round(damage * 0.75)));
      p.hp += bloodHeal;
      RK.UI.msg('Жажда крови: +' + bloodHeal + ' HP');
    } else if (p && p.unstoppableTurns > 0) {
      var unstopHeal = Math.min(p.maxHp - p.hp, Math.max(1, Math.round(damage * 0.5)));
      p.hp += unstopHeal;
      RK.UI.msg('Неудержимый: +' + unstopHeal + ' HP');
    } else if (p && p.classId === 'berserker' && p.rageTurns > 0) {
      var rageHeal = Math.min(p.maxHp - p.hp, Math.max(1, Math.round(damage * C.BERSERKER_LIFESTEAL)));
      p.hp += rageHeal;
      RK.UI.msg('Безумие: +' + rageHeal + ' HP');
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
    if (attacker && attacker.isChampion) {
      if (championHasAffix(attacker, 'fiery') && M.player.hp > 0) {
        applyStatus(M.player, 'burning', { turns: 3, damage: 2, appliedTurn: M.turn + 1 });
        RK.UI.msg(attacker.name + ' поджигает вас.');
      }
      if (championHasAffix(attacker, 'frenzied')) {
        var heal = Math.min(attacker.maxHp - attacker.hp, Math.max(1, Math.round(damage * 0.15)));
        attacker.hp += heal;
        if (heal > 0) RK.UI.msg(attacker.name + ' питается болью: +' + heal + ' HP.');
      }
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

  function addLocationDrop(item) {
    if (M.locationMode) {
      item.id = item.id || 'drop-' + M.turn + '-' + M.items.length + '-' + Math.floor(RK.RNG.rand() * 0x100000000).toString(36);
      M.placedLocationItems = M.placedLocationItems || [];
      M.placedLocationItems.push(item);
    }
    M.items.push(item);
  }

  function championHasAffix(e, id) {
    return !!(e && e.isChampion && Array.isArray(e.affixes) && e.affixes.indexOf(id) !== -1);
  }

  function triggerChampionPhase(e) {
    if (!e || !e.isChampion || e.alive === false || e.hp <= 0 || e.phaseDone) return;
    var threshold = typeof e.phaseThreshold === 'number' ? e.phaseThreshold : 0.5;
    if (e.hp / Math.max(1, e.maxHp) > threshold) return;
    e.phaseDone = true;
    e.phase = 1;
    e.atk = Math.round(e.atk * 1.3);
    e.maxHp = Math.max(e.maxHp, e.hp);
    e.hp = Math.min(e.maxHp, e.hp + Math.round(e.maxHp * 0.25));
    RK.Effects.add(e.x, e.y, '#f2c94c', { maxR: 14 });
    RK.UI.msg(e.name + ' впадает в ярость: урон растёт, HP восстановлены.');
  }

  function onChampionKilled(e) {
    if (!e || !e.isChampion || !championHasAffix(e, 'explosive')) return;
    var members = party();
    for (var i = 0; i < members.length; i++) {
      var member = members[i];
      if (!member || member.hp <= 0) continue;
      var distance = RK.MapGen.manhattan(e.x, e.y, member.x, member.y);
      if (distance > 2) continue;
      var damage = Math.max(1, M.floor * 3 + 4);
      member.hp = Math.max(0, member.hp - damage);
      M.stats.damageReceived += damage;
      RK.Effects.add(member.x, member.y, '#ff7b32', { maxR: 12 });
      RK.Effects.addDamage(member.x, member.y, damage, '#ff7b32');
      RK.UI.msg('Взрыв: ' + member.name + ' получает ' + damage + ' урона.');
    }
  }

  function killEnemy(e) {
    onChampionKilled(e);
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
    advanceQuest('kill', e.type, 1);
    var gold = Math.max(1, RK.RNG.int(2, 6) + M.floor * 2);
    if (e.isChampion) gold = Math.max(gold, Math.max(2, M.floor * 4 + RK.RNG.int(4, 10)));
    var goldDrop = { type: 'gold', asset: 'gold', kind: 'gold', x: e.x, y: e.y, amt: gold, name: 'Золото', summary: 'Монеты', rarity: 'common', color: RK.Items.RARITY_COLORS.common };
    addLocationDrop(goldDrop);
    RK.UI.msg('С ' + e.name + ' выпало золото: ' + gold + '.');
    if (e.isChampion || e.enhanced || e.behavior === 'boss' || RK.RNG.chance(0.5)) {
      var drop = RK.Items.generateLootItem(M.floor, e.x, e.y, e.behavior === 'boss', e.enhanced || e.isChampion);
      drop.source = 'kill';
      addLocationDrop(drop);
      RK.UI.msg('С трупа выпал лут: ' + (drop.name || 'Лут'));
    }
  }

  // Идентификатор и заказчик задания. id нужен журналу (сдача по кнопке),
  // giver — NPC, у которого задание сдаётся. Стартовое задание забега даёт торговец,
  // иначе его было бы некому закрыть.
  function registerQuest(quest, giver, fromOffer) {
    M.questSeq = (M.questSeq || 0) + 1;
    quest.id = (giver || 'run') + '#' + M.questSeq;
    quest.giver = giver || null;
    // Цепочка сдвигается только у заданий, взятых из предложения NPC.
    quest.fromOffer = !!fromOffer;
    if (!quest.progress) quest.progress = 0;
    return quest;
  }

  function questReady(quest) {
    return !!quest && quest.progress >= quest.target;
  }

  // Прогресс идёт всем активным заданиям нужного вида: NPC-задания и стартовое
  // живут в одном списке, поэтому отдельная ссылка на «главное» задание не нужна.
  // Одно событие засчитывается каждому подходящему заданию — иначе первое
  // заблокировало бы остальные: убитый демон шёл бы только стартовой цели.
  function advanceQuest(kind, detail, amount) {
    var amt = amount || 1;
    if (!M.quests || !M.quests.length) return;
    for (var qi = 0; qi < M.quests.length; qi++) {
      var q = M.quests[qi];
      if (q.completed || q.kind !== kind) continue;
      if (kind === 'kill' && (q.enemyTypes || [q.type]).indexOf(detail) < 0) continue;
      // visit — задание на дорогу: засчитывается только нужная локация.
      if (kind === 'visit' && q.type !== detail) continue;
      if (q.progress >= q.target) continue;
      q.progress = Math.min(q.target, q.progress + amt);
      RK.UI.msg(questReady(q)
        ? 'Задание выполнено: ' + q.description + '. Сдайте его заказчику.'
        : 'Прогресс задания: ' + q.progress + '/' + q.target + '.');
    }
  }

  // Сдача задания: награда, репутация и следующее предложение заказчика.
  function deliverQuest(quest, npc) {
    quest.completed = true;
    var reward = quest.reward || 0;
    M.player.gold += reward;
    if (RK.Faction && RK.Faction.changeReputation && reward) {
      RK.Faction.changeReputation(reward / 10);
    }
    RK.UI.msg('Задание сдано: ' + (quest.description || 'задание') + ' (+' + reward + ' золота).');
    if (npc && quest.fromOffer) {
      npc.accepted = true;
      if (npc.questChain && npc.questChainIndex < npc.questChain.length - 1) {
        npc.questChainIndex++;
        npc.offer = npc.questChain[npc.questChainIndex];
      }
    }
    RK.UI.refresh();
    return true;
  }

  // Сдача задания заказчику: герой стоит рядом, цель выполнена.
  function turnInQuest(npcId) {
    if (!M.player) return false;
    var npc = RK.Npc.findByKind(M.npcs, npcId == null ? 'merchant' : npcId);
    if (!npc) return false;
    if (!RK.Npc.isNear(npc, M.player.x, M.player.y)) {
      RK.UI.msg('Подойдите к ' + RK.Npc.nameOf(npc) + ', чтобы сдать задание.');
      return false;
    }
    // Сдаётся та работа, которую NPC выдал: кроме неё у него может висеть
    // заказ забега, а он сдаётся по кнопке в журнале.
    var ready = (M.quests || []).filter(function (q) {
      return !q.completed && q.giver === npc.id && questReady(q);
    });
    var quest = ready.find(function (q) { return q.fromOffer; }) || ready[0];
    if (!quest) {
      RK.UI.msg(RK.Npc.nameOf(npc) + ': выполненных заданий нет.');
      return false;
    }
    return deliverQuest(quest, npc);
  }

  // Сдача задания из журнала: закрывается ровно то, что нажали.
  function turnInQuestAny(questId) {
    if (!M.player) return false;
    var quest = (M.quests || []).find(function (q) { return q.id === questId; });
    if (!quest || quest.completed) return false;
    if (!questReady(quest)) {
      RK.UI.msg('Задание ещё не выполнено: ' + quest.progress + '/' + quest.target + '.');
      return false;
    }
    var npc = quest.giver ? RK.Npc.findByKind(M.npcs, quest.giver) : null;
    if (quest.giver && (!npc || !RK.Npc.isNear(npc, M.player.x, M.player.y))) {
      RK.UI.msg('Подойдите к ' + RK.Npc.nameOf(npc || { kind: quest.giver }) + ', чтобы сдать задание.');
      return false;
    }
    return deliverQuest(quest, npc);
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
    var q = registerQuest(npc.offer, npc.id, true);
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

  // Кемпинг: вход и выход одним действием (toggle). Логика — в js/camp.js.
  function campRest() {
    if (!RK.Camp || !RK.Camp.rest) return false;
    return RK.Camp.rest() === true;
  }

  // Телепорт в город: возврат из любой локации без обратного пути.
  function teleportToCity() {
    if (!M || M.over || !M.locationMode) return false;
    var target = C.WORLD_START_LOCATION || 'city_start';
    if (RK.GAME && RK.GAME.locationId === target) {
      RK.UI.msg('Вы уже в городе.');
      return false;
    }
    if (!RK.World || !RK.World.travelTo || !RK.World.travelTo(target)) return false;
    RK.UI.msg('Телепорт: вы переноситесь в город.');
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

  function activateClassSkill(skillId) {
    var p = M && M.player;
    if (!M || M.over || !p) return false;
    var skills = RK.Skills ? RK.Skills.skillsFor(p.classId) : null;
    if (!skills || !skills.length) return false;
    var def = null;
    for (var i = 0; i < skills.length; i++) {
      if (skills[i].id === skillId) { def = skills[i]; break; }
    }
    if (!def) {
      var aliasIndex = { basic: 0, advanced: 1, master: 2 }[skillId];
      if (aliasIndex != null && skills[aliasIndex]) {
        def = skills[aliasIndex];
      } else {
        def = skills[0];
      }
    }
    if ((p.level || 1) < def.level) {
      RK.UI.msg('Навык «' + def.name + '» откроется на ' + def.level + ' уровне.');
      return false;
    }
    var ok = RK.Classes.useSkill(p, def.id);
    if (ok) {
      if (RK.Effects) {
        RK.Effects.add(p.x, p.y, RK.Classes.skillColor(p.classId), { maxR: 24, life: 480 });
      }
      if (RK.Audio) RK.Audio.playAbility();
      if (def.id === 'shield_bash') {
        performShieldBash(p);
      } else if (def.id === 'volley') {
        performVolley(p);
      }
      RK.UI.refresh();
      return true;
    }
    var cooldowns = p.skillCooldowns || {};
    var remaining = cooldowns[def.id] || 0;
    RK.UI.msg(remaining > 0
      ? 'Навык «' + def.name + '» перезаряжается: ' + remaining + ' ход(а).'
      : 'Навык класса перезаряжается.');
    return false;
  }

  // Защита щита из второй руки добавляется к удару щитом.
  function offhandShieldDef(p) {
    var off = p && p.equipment && p.equipment.offhand;
    return off && off.slot === 'offhand' && off.stats ? (off.stats.def || 0) : 0;
  }

  function performShieldBash(p) {
    var dx = [1, -1, 0, 0, 1, 1, -1, -1];
    var dy = [0, 0, 1, -1, 1, -1, 1, -1];
    var hit = 0;
    for (var i = 0; i < dx.length; i++) {
      var e = getEnemyAt(p.x + dx[i], p.y + dy[i]);
      if (!e) continue;
      var damage = Math.max(1, Math.floor((p.atk || 10) * 0.8) + offhandShieldDef(p));
      e.hp -= damage;
      applyStatus(e, 'stun', { turns: 1, appliedTurn: M.turn + 1 });
      hit++;
      RK.Effects.addDamage(e.x, e.y, damage, '#8ee3ef');
      RK.Effects.add(e.x, e.y, '#8ee3ef', { maxR: 10 });
      if (e.hp <= 0) killEnemy(e);
    }
    if (hit > 0) {
      RK.UI.msg('Удар щитом: поражено врагов — ' + hit + ', оглушение на 1 ход.');
    } else {
      RK.UI.msg('Удар щитом: рядом никого нет.');
    }
  }

  function performVolley(p) {
    var weapon = RK.Classes.rangedWeapon(p);
    if (!weapon) {
      RK.UI.msg('Для града стрел нужен лук или арбалет.');
      return;
    }
    var targets = visibleEnemies();
    if (!targets.length) {
      RK.UI.msg('Град стрел: нет целей в поле зрения.');
      return;
    }
    for (var i = 0; i < targets.length; i++) {
      var target = targets[i];
      var mods = RK.Narrator.getMods(M.turn);
      var zoneMods = getZoneMods(p.x, p.y);
      var dmg = Math.max(1, p.atk + mods.atkBonus + zoneMods.atkBonus +
        RK.RNG.int(0, 2) - target.def);
      RK.Effects.addShot(p.x, p.y, target.x, target.y, '#c8f0a0');
      target.hp -= dmg;
      RK.Effects.addDamage(target.x, target.y, dmg, '#ddff88');
      RK.UI.msg('Град стрел: ' + target.name + ' получает ' + dmg + '.');
      if (target.hp <= 0) killEnemy(target);
    }
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

  // Выгнанный игрок уходит из партии: без этого его герой остался бы на карте и
  // занимал клетку. Если фокус забега был на нём, берём первого оставшегося.
  function removeNetworkPlayer(id) {
    if (!M || !M.players) return false;
    var index = -1;
    for (var i = 0; i < M.players.length; i++) {
      if (M.players[i].id === id) { index = i; break; }
    }
    if (index === -1) return false;
    M.players.splice(index, 1);
    if (M.player && M.player.id === id) M.player = M.players[0] || null;
    delete walk.steps[id];
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
      // Псевдонимы (storeItem, guildStore, heal и прочие) — это wire-имена, по которым
      // уже отправленные клиенты зовут то же самое действие. Отдельных функций за ними
      // нет: они указывают на каноническую, чтобы правка поведения меняла все имена разом.
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
        turnInQuestAny: turnInQuestAny,
        storeInWarehouse: storeInWarehouse,
        templeBlessing: templeBlessing,
        templeHeal: templeHeal,
        tavernRest: tavernRest,
        tavernRumors: tavernRumors,
        campRest: campRest,
        teleportToCity: teleportToCity,
      });
      var actionAliases = C.ACTION_ALIASES || {};
      for (var canonical in actionAliases) {
        if (!Object.prototype.hasOwnProperty.call(actionAliases, canonical)) continue;
        aliasHandlers(ACTION_HANDLERS, canonical, actionAliases[canonical]);
      }
    }
    return ACTION_HANDLERS;
  }

  var MAX_ACTION_ARGS = 5;

  // Копирует обработчик на все псевдонимы одним присваиванием.
  function aliasHandlers(table, canonical, aliases) {
    aliases.forEach(function (name) { table[name] = table[canonical]; });
  }

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
    RK.Map = RK.Combat.restoreMap(snapshot.map);
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
    dialogueChoice: dialogueChoice,
    advanceQuest: advanceQuest,
    openNpcScreen: openNpcScreen,
    activateClassSkill: activateClassSkill,
    turnInQuest: turnInQuest,
    turnInQuestAny: turnInQuestAny,
    tavernRest: tavernRest,
    tavernRumors: tavernRumors,
    storeInWarehouse: storeInWarehouse,
    templeBlessing: templeBlessing,
    templeHeal: templeHeal,
    campRest: campRest,
    teleportToCity: teleportToCity,
    setPlayerStats: setPlayerStats,

    getEnemyAt: getEnemyAt,
    triggerChampionPhase: triggerChampionPhase,
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
    removeNetworkPlayer: removeNetworkPlayer,
    setActivePlayer: setActivePlayer,
    createSnapshot: createSnapshot,
    applySnapshot: applySnapshot,
    performAction: performAction,
    // Таблица действий — часть контракта (её проверяет ACTION_RULES на сервере),
    // поэтому отдаё наружу: без неё расхождение таблиц нечем поймать.
    actionHandlers: actionHandlers,
  };
  function applyElementalDamage(target, amount, type) {
    if (!target) return 0;
    var final = Math.max(1, Math.round((amount || 0) * elementalMultiplier(target, type)));
    target.hp -= final;
    return final;
  }

  RK.Statuses = {
    DEFS: STATUS_DEFS,
    ELEMENTS: ['physical', 'fire', 'poison', 'ice', 'arcane', 'lightning'],
    ensure: ensureStatuses,
    apply: applyStatus,
    tickActor: tickActorStatuses,
    elementalMultiplier: elementalMultiplier,
    resistance: elementalMultiplier,
    applyDamage: applyElementalDamage,
    list: function (actor) { return actor && actor.statuses ? Object.keys(actor.statuses) : []; },
  };
  RK.Combat.elementalMultiplier = elementalMultiplier;
})();
