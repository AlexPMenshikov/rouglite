(function () {
  var C = RK.CONFIG;
  var M;

  // Поля карты, которые снимок жмёт в map.matrices, берём напрямую из map.js —
  // он же кодирует и разворачивает, поэтому локальный алиас только дублировал контракт.

  // Логика статусов живёт в js/statuses.js рядом с реестром (js/status-defs.js):
  // забег модуль не знает, всё нужное приходит контекстом.

// Режимы взаимодействия, разводимые клавишами E / L / F. Список общий с вводом
// и серверной проверкой — свой набор в каждом месте разъезжался.
  var INTERACT = {
    USE: C.INTERACT_MODES[0],
    PICK: C.INTERACT_MODES[1],
    FORCE: C.INTERACT_MODES[2],
  };

  // Свободная клетка рядом с партией: ею бой расставляет соседей при переходе
  // между локациями, чтобы никто не вставал на клетку выхода. Ищет ближе,
  // чем findFreeSpawnTile, но с меньшим числом проверок.
  function findFreeTileNear(x, y, exceptId) {
    var tile = RK.Spawn.findFreeSpawnTile(x, y, exceptId);
    if (tile) return tile;
    return RK.Spawn.spiralSearch(x, y, 2, function (cx, cy) {
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

  // Размер канваса задаёт рендер (js/render.js): на сервере канваса нет,
  // а в браузере вызов идёт через него — иначе формула разошлась бы в двух местах.
  function resizeCanvas() {
    if (RK.Render && RK.Render.resizeCanvas) RK.Render.resizeCanvas();
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
      // Причина смерти для экрана итогов; пишется последним смертельным уроном.
      deathCause: null,
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
      RK.Inventory.addPotionToBackpack(player.backpack, potion);
    }
    player.maxHunger = C.FOOD_MAX_HUNGER;
    player.hunger = C.FOOD_MAX_HUNGER;
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
    var firstQuest = RK.RNG.chance(0.5) ? RK.Npc.randomKillQuest(1) : {
      type: 'loot',
      kind: 'loot',
      target: 3,
      progress: 0,
      reward: 90,
      description: 'Найти 3 предмета снаряжения',
    };
    M.quests = [RK.Quests.registerQuest(firstQuest, 'merchant', false)];
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
      addPotionToBackpack: RK.Inventory.addPotionToBackpack,
      initPartyMember: initPartyMember,
      selectedClassId: selectedClassId,
      localPlayerId: localPlayerId,
      localPlayerName: localPlayerName,
    };
  }

  function placePartyMembers() {
    var members = party();
    for (var i = 0; i < members.length; i++) {
      if (i === 0) {
        members[i].x = RK.Map.spawn.x;
        members[i].y = RK.Map.spawn.y;
        continue;
      }
      var tile = RK.Spawn.findFreeSpawnTile(RK.Map.spawn.x, RK.Map.spawn.y, members[i].id);
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
      if (!typeDef || typeDef.spawnRate > 0) RK.Spawn.spawnEnemies(RK.Map, floor);
      M.items = RK.Items.spawnItems(floor, RK.Map.spawn);
      // Город — безопасный перевалочный пункт: сундуков в нём нет.
      if (!isCity) RK.Spawn.placeChests(RK.Map);
      else RK.Spawn.placeStorageChest(RK.Map);
      M.npcs = isCity
        ? RK.Npc.placeCityNpcs(RK.Map, floor)
        : (locationMode ? [] : RK.Spawn.placeFloorNpcs(RK.Map, floor));
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
    var preservedDecorations = (RK.Map.decorations || []).filter(function (decoration) {
      return decoration && decoration.furniture === true;
    });
    RK.Map.decorations = RK.MapGen.placeDecorations(RK.Map, decorationBlockers).concat(preservedDecorations);
    RK.Fov.compute(M.player.x, M.player.y);
    updatePlayerZone();
    RK.Narrator.onEvent('floorStart', { floor: floor });
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
    else if (service === 'temple') RK.UI.showTemple();
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
        (x === player.x && y === player.y);
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
    if (getEnemyAt(s.x, s.y)) {
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
      if (M.player.hp <= 0) { noteDeathCause('От ловушки'); death(); }
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
    return RK.Statuses.elementalMultiplier(actor, type);
  }

  function applyStatus(actor, id, opts) {
    return RK.Statuses.apply(actor, id, opts, runContext);
  }

  function tickActorStatuses(actor) {
    RK.Statuses.tickActor(actor, runContext);
  }

  function decayHunger(party) {
    var cfg = RK.CONFIG || {};
    var maxHunger = cfg.FOOD_MAX_HUNGER || 100;
    var decay = cfg.FOOD_DECAY_PER_TURN || 1;
    var starvingHpLoss = cfg.HUNGER_STARVING_HP_LOSS || 2;
    for (var i = 0; i < party.length; i++) {
      var member = party[i];
      if (!member || member.hp <= 0) continue;
      if (member.maxHunger == null) member.maxHunger = maxHunger;
      if (member.hunger == null) member.hunger = member.maxHunger;
      member.hunger = Math.max(0, member.hunger - decay);
      if (member.hunger <= 0) {
        member.hp = Math.max(0, member.hp - starvingHpLoss);
        if (member.hp <= 0) noteDeathCause('От голода');
        if (member === M.player) RK.UI.msg('Голод: герой слабеет (' + starvingHpLoss + ' HP).');
      }
    }
    recomputePlayerStats();
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
    if (!chest) return false;
    if (chest.items == null) chest.items = [];
    chest.state = chest.state === 'broken' ? 'broken' : 'open';
    chest.opened = true;
    chest.looted = chest.items.length === 0;
    if (chest.items.length) RK.UI.msg('Сундук открыт: внутри ' + chest.items.length + ' предметов.');
    else RK.UI.msg('Сундук пуст.');
    RK.UI.refresh();
    return true;
  }

  // Ближайшее хранилище: обмен предметами возможен только у него.
  function nearestStorage() {
    var chests = (RK.Map && RK.Map.chests) || [];
    if (!chests.length) return null;
    var p = M.player;
    var nearest = null;
    var best = 9999;
    for (var i = 0; i < chests.length; i++) {
      var c = chests[i];
      if (!c || !c.storage) continue;
      var dist = Math.abs(c.x - p.x) + Math.abs(c.y - p.y);
      if (dist < best) { best = dist; nearest = c; }
    }
    return best <= 2 ? nearest : null;
  }

  // Положить предмет из рюкзака в хранилище (индекс в рюкзаке).
  function storeInChest(index) {
    var p = M && M.player;
    if (!p || !p.backpack || !p.backpack[index]) return false;
    var chest = nearestStorage();
    if (!chest) {
      RK.UI.msg('Рядом нет хранилища.');
      return false;
    }
    chest.items = chest.items || [];
    if (chest.items.length >= (RK.CONFIG.CHEST_CAPACITY || 20)) {
      RK.UI.msg('Хранилище полно.');
      return false;
    }
    var item = p.backpack.splice(index, 1)[0];
    chest.items.push(item);
    chest.looted = false;
    RK.UI.msg('Положено в хранилище: ' + item.name);
    RK.UI.refresh();
    return true;
  }

  // Взять предмет из хранилища: takeFromChest(index) берёт у ближайшего.
  function takeFromChest(chest, itemIndex) {
    if (Number.isInteger(chest) && itemIndex == null) {
      itemIndex = chest;
      chest = null;
    }
    if (!chest) chest = nearestStorage();
    if (!chest || !Array.isArray(chest.items) || !chest.items.length) {
      RK.UI.msg('Хранилище пусто.');
      return false;
    }
    if (itemIndex == null) itemIndex = 0;
    if (itemIndex < 0 || itemIndex >= chest.items.length) return false;
    var item = chest.items.splice(itemIndex, 1)[0];
    M.player.backpack.push(item);
    chest.looted = chest.items.length === 0;
    RK.UI.msg('Взято из хранилища: ' + item.name);
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
    if (target.storage) {
      RK.UI.msg('Хранилище не запирается.');
      return false;
    }
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
        RK.Inventory.addTrapToBackpack(M.player.backpack, RK.Items.spawnTrapItem(trap, M.player.x, M.player.y));
        RK.Inventory.removeTrapFromMap(trap);
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
    if (target.storage) {
      RK.UI.msg('Хранилище не ломается.');
      return false;
    }
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

  // Обычное взаимодействие (E): открыть/закрыть дверь, открыть сундук, экран хранилища.
  function useTarget(target, objects) {
    if (target.storage) {
      RK.UI.showStorage();
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
    RK.Inventory.handlePickup();
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
    var hunger = (p.hunger == null ? C.FOOD_MAX_HUNGER : p.hunger);
    var hungerAtkPenalty = 0;
    var hungerDefPenalty = 0;
    if (hunger <= C.HUNGER_HUNGRY_THRESHOLD) hungerAtkPenalty += C.HUNGER_HUNGRY_ATK_PENALTY;
    if (hunger <= 0) {
      hungerAtkPenalty += C.HUNGER_STARVING_ATK_PENALTY - C.HUNGER_HUNGRY_ATK_PENALTY;
      hungerDefPenalty += C.HUNGER_STARVING_DEF_PENALTY;
    }
    p.atk = Math.max(1, (p.baseAtk || C.PLAYER.atk) + (p.gearBonuses ? p.gearBonuses.atk : 0) + classAtk - hungerAtkPenalty);
    p.def = Math.max(0, (p.baseDef || C.PLAYER.def) + (p.gearBonuses ? p.gearBonuses.def : 0) + classDef - hungerDefPenalty);
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

  // Услуга доступна рядом с её NPC. В локации без торговца ограничения нет:
  // продавать и улучшать можно где угодно, как и на этажах без NPC.
  function nearService(kind) {
    if (!M.locationMode) return true;
    var npc = RK.Npc.findByKind(M.npcs, kind);
    if (!npc) return true;
    return RK.Npc.isNear(npc, M.player.x, M.player.y);
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
    // Легаси-этаж без мира: спуск ведёт ниже без конца — победы в игре нет.
    if (RK.Map.stair && p.x === RK.Map.stair.x && p.y === RK.Map.stair.y) {
      M.floor++;
      RK.UI.msg('Вы спускаетесь на этаж ' + M.floor);
      startFloor(M.floor);
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
      if (member.reflectShield > 0) member.reflectShield--;
      if (member.rageTurns > 0) member.rageTurns--;
      if (member.preciseShots > 0) member.preciseShots--;
      if (member.bloodlustTurns > 0) member.bloodlustTurns--;
      if (member.unstoppableTurns > 0) member.unstoppableTurns--;
      if (member.piercingShots > 0) member.piercingShots--;
      if (member.defenseReduceTurns > 0) member.defenseReduceTurns--;
      if (member.blessingTurns > 0) member.blessingTurns--;
      if (RK.Classes && RK.Classes.tickSkillCooldowns) RK.Classes.tickSkillCooldowns(member);
    }
    tickBurning(members);
    decayHunger(members);
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
    if (!byPlayer && target.hp <= 0) {
      noteDeathCause(attacker.behavior === 'boss' ? 'От удара босса' : 'От удара врага');
    }
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
    if (player.blessingTurns > 0) damage += C.BLESSING_ATTACK_BONUS;
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
      if (member.hp <= 0) noteDeathCause('От взрыва');
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
    RK.Quests.advanceQuest('kill', e.type, 1);
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

  // Лечение в храме: восстанавливает здоровье героя за пожертву.
  function templeHeal() {
    var p = M && M.player;
    if (!p) return false;
    var cost = C.TEMPLE_HEAL_COST || 0;
    if (p.gold < cost) {
      RK.UI.msg('Недостаточно золота для лечения. Нужно: ' + cost + '.');
      return false;
    }
    p.gold -= cost;
    p.hp = p.maxHp;
    RK.UI.msg('Молитва здоровья: здоровье восстановлено. -' + cost + ' золота.');
    RK.UI.refresh();
    return true;
  }

  // Благословение храма: прибавка к атаке на несколько ходов. Постоянная
  // прибавка копилась бы от клика к клику, и атаку можно было бы накрутить.
  function templeBlessing() {
    var p = M && M.player;
    if (!p) return false;
    p.blessingTurns = C.BLESSING_TURNS;
    RK.UI.msg('Благословение: +' + C.BLESSING_ATTACK_BONUS + ' к атаке на ' +
      C.BLESSING_TURNS + ' хода.');
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

  // Покупка еды у трактирщика: блюдо уходит в рюкзак стаком.
  function tavernBuyFood(foodId) {
    var p = M && M.player;
    if (!p) return false;
    var foods = C.FOODS || [];
    var def = null;
    for (var i = 0; i < foods.length; i++) {
      if (foods[i].id === foodId) { def = foods[i]; break; }
    }
    if (!def) return false;
    var cost = def.value * (C.TAVERN_FOOD_MARKUP || 2);
    if (p.gold < cost) {
      RK.UI.msg('Недостаточно золота для покупки. Нужно: ' + cost + '.');
      return false;
    }
    p.gold -= cost;
    RK.Inventory.addFoodToBackpack(p.backpack, RK.Items.spawnFood(0, 0, def.id));
    RK.UI.msg('Куплено: ' + def.name + '. -' + cost + ' золота.');
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
    if (p.level >= C.MAX_LEVEL) return;
    n = Math.round(n * RK.Narrator.getMods(M.turn).xpMul);
    p.xp += n;
    var need = C.xpNeed(p.level);
    while (p.xp >= need && p.level < C.MAX_LEVEL) {
      p.xp -= need;
      p.level++;
      p.baseMaxHp += C.LEVEL_HP;
      p.maxHp += C.LEVEL_HP;
      p.hp = Math.min(p.maxHp, p.hp + C.LEVEL_HEAL);
      p.baseAtk += C.LEVEL_ATK;
      recomputePlayerStats();
      need = C.xpNeed(p.level);
      RK.UI.msg('Уровень повышен! Теперь ' + p.level);
      RK.Narrator.onEvent('levelUp');
    }
    // На потолке остаток не хранится: опыт за убийства больше не идёт в дело.
    if (p.level >= C.MAX_LEVEL) p.xp = 0;
  }

  // В банк уходит золото всей партии: в кооперативе складываются вклады героев.
  function bankPartyGold() {
    var members = party();
    var total = 0;
    for (var i = 0; i < members.length; i++) total += bankValue(members[i].gold || 0);
    RK.Meta.addBank(total);
    return total;
  }

  // Забег кончается только смертью героя: пути к победе в игре нет.
  function endRun() {
    M.over = true;
    M.result = 'defeat';
    // Забег окончен: сохранение больше нечего продолжать, и «Продолжить» в меню
    // должно исчезнуть.
    if (RK.World && RK.World.clearRun) RK.World.clearRun();
    RK.Narrator.onEvent('death');
    var banked = bankPartyGold();
    RK.UI.over(false, M.floor, M.player.level, banked, M.stats, M.player, M.deathCause);
  }

  // Пишем только смертельный удар: пережитый урон причину не меняет.
  function noteDeathCause(cause) {
    if (M) M.deathCause = cause;
  }

  function death() {
    endRun();
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
    var tile = RK.Spawn.findFreeSpawnTile(M.player.x, M.player.y, id);
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
        activateClassSkill: RK.Spells.activateClassSkill,
        castMageSpell: RK.Spells.castMageSpell,
        interact: interact,
        playerAction: playerAction,
        skipTurn: skipTurn,
        tryStep: tryStep,
        usePotion: RK.Inventory.usePotion,
        useFood: RK.Inventory.useFood,
        storeInChest: storeInChest,
        takeFromChest: takeFromChest,
        useInventoryItem: RK.Inventory.useInventoryItem,
        dropInventoryItem: RK.Inventory.dropInventoryItem,
        unequipSlot: RK.Inventory.unequipSlot,
        sellInventoryItem: RK.Inventory.sellInventoryItem,
        upgradeEquipment: upgradeEquipment,
        acceptQuest: RK.Quests.acceptQuest,
        dialogueChoice: RK.Quests.dialogueChoice,
        turnInQuest: RK.Quests.turnInQuest,
        turnInQuestAny: RK.Quests.turnInQuestAny,
        storeInWarehouse: storeInWarehouse,
        templeBlessing: templeBlessing,
        templeHeal: templeHeal,
        tavernRest: tavernRest,
        tavernRumors: tavernRumors,
        tavernBuyFood: tavernBuyFood,
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

  var MAX_ACTION_ARGS = C.MAX_ACTION_ARGS || 5;

  // Копирует обработчик на все псевдонимы одним присваиванием. Свой ключ важнее
  // псевдонима: иначе псевдоним канонического действия тихо подменил бы его
  // обработчик. Сервер проверяет псевдонимы так же (aliasRules в room-manager).
  function aliasHandlers(table, canonical, aliases) {
    aliases.forEach(function (name) {
      if (!Object.prototype.hasOwnProperty.call(table, name)) table[name] = table[canonical];
    });
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
    // Реализация живёт в js/combat-snapshot.js: там же и кодек map.matrices.
    return (RK.CombatSnapshot && RK.CombatSnapshot.createSnapshot)
      ? RK.CombatSnapshot.createSnapshot()
      : null;
  }

  function applySnapshot(snapshot, localPlayerId) {
    // Реализация перенесена в js/combat-snapshot.js; здесь только прокидываем
    // локальное состояние и хелперы, которые снаружи не экспортируем.
    if (!(RK.CombatSnapshot && RK.CombatSnapshot.applySnapshot)) return false;
    return RK.CombatSnapshot.applySnapshot(snapshot, localPlayerId, {
      getGame: function () { return M; },
      setGame: function (game) { M = RK.GAME = game; },
      walk: walk,
      resizeCanvas: resizeCanvas,
    });
  }

  // Шаг приходит снимком, поэтому герои телепортировали бы на клетку за кадр.
  // Анимация шага для всей партии запускается здесь: логика уже отработала на
  // сервере, поэтому у interpolate нет продолжения — только отрисовка перехода.
  function animateSnapshotSteps(previousPositions) {
    // Логика оживления шага живёт в js/combat-snapshot.js, вместе с кодеком.
    return (RK.CombatSnapshot && RK.CombatSnapshot.animateSnapshotSteps)
      ? RK.CombatSnapshot.animateSnapshotSteps(previousPositions)
      : false;
  }

  // Контекст забега для вынесенных модулей: статусы, спавн, инвентарь, квесты
  // и спеллы. Модули о забеге не знают — всё нужное приходит отсюда.
  var runContext = {
    getGame: function () { return M; },
    isParty: function (actor) {
      if (!M || !actor) return false;
      return actor === M.player || !!(M.players && M.players.indexOf(actor) !== -1);
    },
    onDamage: function (actor, amount, cause) {
      if (!M || !M.stats) return;
      M.stats.damageReceived += amount;
      if (actor.hp <= 0) noteDeathCause(cause || 'От урона со временем');
    },
    party: party,
    enemyAt: getEnemyAt,
    visibleEnemies: visibleEnemies,
    npcAt: npcAt,
    partyPlayerAt: getPartyPlayerAt,
    killEnemy: killEnemy,
    applyStatus: applyStatus,
    finishTurn: finishTurn,
    recomputePlayerStats: recomputePlayerStats,
    zoneMods: getZoneMods,
    nearService: nearService,
    metaLuck: metaLuck,
    localPlayerId: localPlayerId,
    advanceQuest: function (kind, detail, amount) {
      return RK.Quests.advanceQuest(kind, detail, amount);
    },
  };

  // Модули получают контекст один раз: забег он читает по требованию,
  // поэтому смена героя и новый этаж контекст не ломают.
  RK.Statuses.setContext(runContext);
  RK.Spawn.setContext(runContext);
  RK.Inventory.setContext(runContext);
  RK.Quests.setContext(runContext);
  RK.Spells.setContext(runContext);

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
    // Действия, которые коммитит интерфейс, обязаны быть на фасаде: тест
    // tests/quests.test.js сверяет имена из UI с RK.Combat.
    usePotion: RK.Inventory.usePotion,
    useFood: RK.Inventory.useFood,
    storeInChest: storeInChest,
    takeFromChest: takeFromChest,
    nearestStorage: nearestStorage,
    useInventoryItem: RK.Inventory.useInventoryItem,
    placeCarriedTrap: RK.Inventory.placeCarriedTrap,
    dropInventoryItem: RK.Inventory.dropInventoryItem,
    unequipSlot: RK.Inventory.unequipSlot,
    sellInventoryItem: RK.Inventory.sellInventoryItem,
    getSellValue: RK.Inventory.getSellValue,
    upgradeEquipment: upgradeEquipment,
    acceptQuest: RK.Quests.acceptQuest,
    dialogueChoice: RK.Quests.dialogueChoice,
    advanceQuest: RK.Quests.advanceQuest,
    openNpcScreen: openNpcScreen,
    activateClassSkill: RK.Spells.activateClassSkill,
    castMageSpell: RK.Spells.castMageSpell,
    turnInQuest: RK.Quests.turnInQuest,
    turnInQuestAny: RK.Quests.turnInQuestAny,
    tavernRest: tavernRest,
    tavernRumors: tavernRumors,
    tavernBuyFood: tavernBuyFood,
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
    walk: walk,
    party: party,
    startStep: startStep,
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
  RK.Combat.elementalMultiplier = elementalMultiplier;
})();
