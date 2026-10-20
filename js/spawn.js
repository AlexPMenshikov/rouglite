// Спавн содержимого этажа: враги, боссы, сундуки и NPC. Логика живёт рядом с
// картой (js/map.js), а забег модуль не знает — всё нужное приходит контекстом.
(function () {
  var C = RK.CONFIG;

  // Контекст забега задаёт бой (js/combat.js): модуль сам о забеге не знает.
  var context = null;

  function game() {
    return context && context.getGame ? context.getGame() : null;
  }

  function enemyAt(x, y) {
    return context && context.enemyAt ? context.enemyAt(x, y) : null;
  }

  function npcAt(x, y) {
    return context && context.npcAt ? context.npcAt(x, y) : null;
  }

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

  // Свободная клетка для нового участника партии: расходится по спирали от центра,
  // пока не найдёт проходимую клетку без врагов, партийцев и лестницы.
  function findFreeSpawnTile(centerX, centerY, exceptId) {
    var run = game();
    if (!run) return null;
    var limit = Math.max(run.mapWidth, run.mapHeight);
    return spiralSearch(centerX, centerY, limit, function (x, y) {
      if (!RK.MapGen.isWalkable(x, y)) return false;
      if (enemyAt(x, y)) return false;
      if (RK.Map.stair && RK.Map.stair.x === x && RK.Map.stair.y === y) return false;
      return true;
    });
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
    var run = game();
    if (!run) return;
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
      run.enemies.push(RK.Entities.makeEnemy(type, t.x, t.y, floor, enhancedRoll, championRoll));
      placed++;
    }
    // Босс: этаж данжа — свой тип по глубине, legacy-этаж — как раньше,
    // поверхность мира без босса. Квест добавляет босса своего типа.
    var curLoc = run.locationMode ? RK.World && RK.World.current() : null;
    var depthBoss = curLoc && curLoc.depth ? RK.World.dungeonBoss(curLoc.parentId, curLoc.depth) : null;
    if (depthBoss || !run.locationMode) spawnBoss(g, floor, depthBoss);
    var forcedBossType = null;
    if (curLoc && run.quests) {
      var surfaceId = curLoc.parentId || curLoc.id;
      var curDepth = curLoc.depth || 1;
      for (var qi = 0; qi < run.quests.length; qi++) {
        var q = run.quests[qi];
        if (!q.completed && q.kind === 'kill' && q.bossType &&
            q.locationId === surfaceId && (q.depth || 1) === curDepth) {
          forcedBossType = q.bossType;
          break;
        }
      }
    }
    if (forcedBossType && forcedBossType !== depthBoss) spawnBoss(g, floor, forcedBossType);
  }

  function spawnBoss(g, floor, forcedType) {
    var run = game();
    if (!run) return;
    var radii = [6, 10, 16, Math.max(g.w, g.h)];
    var bp = null;
    // Два босса на этаже (свой плюс квестовый) не должны встать на одну клетку.
    for (var i = 0; i < radii.length && !bp; i++) {
      var near = RK.MapGen.randomFloorNear(g.stair.x, g.stair.y, radii[i], 1);
      if (near && !enemyAt(near.x, near.y)) bp = near;
    }
    if (!bp) {
      var nb = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (var j = 0; j < nb.length; j++) {
        var nx = g.stair.x + nb[j][0];
        var ny = g.stair.y + nb[j][1];
        if (!RK.MapGen.isWalkable(nx, ny)) continue;
        if (g.spawn && nx === g.spawn.x && ny === g.spawn.y) continue;
        if (enemyAt(nx, ny)) continue;
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
          if (enemyAt(x, y)) continue;
          if (g.tavern && RK.MapGen.isInTavern(g, x, y)) continue;
          bp = { x: x, y: y };
          break;
        }
      }
    }
    if (!bp) bp = { x: g.stair.x, y: g.stair.y };
    run.enemies.push(RK.Entities.makeBoss(bp.x, bp.y, floor, forcedType));
  }

  function isItemAt(x, y) {
    var run = game();
    var items = (run && run.items) || [];
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
    if (RK.MapGen.getDoorAt(x, y) || RK.MapGen.getChestAt(x, y) || enemyAt(x, y)) return false;
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

  // Хранилище — единственный сундук города: ставим на ближайшую свободную клетку
  // к спавну (кольца 1..4), пропуская декорации и занятые объекты.
  function placeStorageChest(g) {
    g.chests = g.chests || [];
    if (g.chests.length || !g.spawn) return;
    var blocked = {};
    var decorations = g.decorations || [];
    for (var d = 0; d < decorations.length; d++) {
      var dec = decorations[d];
      blocked[dec.y + ',' + dec.x] = true;
    }
    for (var ring = 1; ring <= 4; ring++) {
      for (var y = g.spawn.y - ring; y <= g.spawn.y + ring; y++) {
        for (var x = g.spawn.x - ring; x <= g.spawn.x + ring; x++) {
          if (Math.max(Math.abs(x - g.spawn.x), Math.abs(y - g.spawn.y)) !== ring) continue;
          if (x < 1 || y < 1 || x >= g.w - 1 || y >= g.h - 1) continue;
          if (blocked[y + ',' + x]) continue;
          if (!isSpawnCandidate(g, x, y, { keepClearance: false })) continue;
          g.chests.push({
            x: x,
            y: y,
            asset: 'storage',
            state: 'closed',
            looted: false,
            opened: false,
            items: [],
            storage: true,
          });
          return;
        }
      }
    }
  }

  function placeChests(g) {
    var run = game();
    if (!run) return;
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
      var chestItems = [];
      var chestCount = RK.RNG.int(1, 2);
      for (var chestItemIndex = 0; chestItemIndex < chestCount; chestItemIndex++) {
        var chestRoll = RK.RNG.rand();
        var chestItem;
        if (chestRoll < 0.25) {
          var chestGold = RK.RNG.int(C.GOLD_ROLL.floor[0], C.GOLD_ROLL.floor[1]);
          chestItem = RK.Items.makeGold(C.goldFromFloor(chestGold, run.floor), x, y);
        } else if (chestRoll < 0.45) {
          chestItem = RK.Items.spawnFood(x, y);
        } else if (chestRoll < 0.65) {
          chestItem = RK.Items.spawnPotion(x, y);
          chestItem.heal = run.player.potionHeal;
          chestItem.summary = '+' + chestItem.heal + ' HP';
        } else {
          chestItem = RK.Items.generateLootItem(run.floor, x, y, false);
        }
        chestItems.push(chestItem);
      }
      g.chests.push({
        x: x,
        y: y,
        asset: 'chest',
        state: locked ? 'locked' : 'closed',
        keyId: 'iron',
        hp: C.CHEST_HP,
        maxHp: C.CHEST_HP,
        looted: false,
        opened: false,
        items: chestItems,
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
      run.items.push(RK.Items.spawnKey(keyTile.x, keyTile.y, 'iron'));
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
        RK.GameUI.log(RK.Npc.def(kinds[i].kind).name + ' не нашёл места на этом этаже.');
        continue;
      }
      var tile = candidates[RK.RNG.int(0, candidates.length - 1)];
      var npc = RK.Npc.make(kinds[i].kind, tile.x, tile.y, floor);
      if (npc) npcs.push(npc);
    }
    return npcs;
  }

  RK.Spawn = RK.Spawn || {};
  RK.Spawn.setContext = function (value) { context = value || null; };
  RK.Spawn.spiralSearch = spiralSearch;
  RK.Spawn.findFreeSpawnTile = findFreeSpawnTile;
  RK.Spawn.enemyPool = enemyPool;
  RK.Spawn.weightedPick = weightedPick;
  RK.Spawn.spawnEnemies = spawnEnemies;
  RK.Spawn.spawnBoss = spawnBoss;
  RK.Spawn.isSpawnCandidate = isSpawnCandidate;
  RK.Spawn.collectSpawnCandidates = collectSpawnCandidates;
  RK.Spawn.wholeMapArea = wholeMapArea;
  RK.Spawn.placeStorageChest = placeStorageChest;
  RK.Spawn.placeChests = placeChests;
  RK.Spawn.placeFloorNpcs = placeFloorNpcs;
})();
