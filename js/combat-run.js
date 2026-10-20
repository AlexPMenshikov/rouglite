// Забег: партия, герой, этаж, ход и сеть.
(function () {
  var C = RK.CONFIG;

  function resetGame() {
    RK.CombatMove.walk.steps = Object.create(null);
    RK.CombatMove.walk.auto = false;
    RK.CombatMove.walk.autoSeen = [];
    RK.GAME = {
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
    RK.GAME.mapWidth = mapSize.width;
    RK.GAME.mapHeight = mapSize.height;
    RK.GAME.mapStyle = options && C.MAP_STYLES[options.style] ? options.style : 'stone';
    RK.RNG.reset(RK.GAME.runSeed);
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
    RK.GAME.quests = [RK.Quests.registerQuest(firstQuest, 'merchant', false)];
    resizeCanvas();
    if (RK.Audio && !RK.Audio.start()) RK.UI.msg('Web Audio не поддерживается браузером: звуки недоступны.');
    RK.Narrator.initRun(RK.GAME);
    if (RK.Events && RK.Events.init) RK.Events.init(RK.GAME);
    if (RK.Camp && RK.Camp.init) RK.Camp.init(RK.GAME);
    var hero = heroOf(options);
    var player = initPartyMember(hero.id, hero.name, hero.classId);
    RK.GAME.player = player;
    RK.GAME.players = [player];
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
    RK.GAME.mapWidth = C.COLS;
    RK.GAME.mapHeight = C.ROWS;
    RK.GAME.mapStyle = 'stone';
    RK.GAME.floor = 1;
    RK.GAME.turn = 0;
    RK.GAME.runSeed = RK.RNG.randomSeed();
    RK.RNG.reset(RK.GAME.runSeed);
    return {
      game: RK.GAME,
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
    RK.GAME.floor = floor;
    RK.GAME.activeZone = null;
    RK.GAME.locationMode = !!locationMode;
    RK.GAME.locationId = locationMode && RK.World ? RK.World.current().id : null;
    if (!locationMode || !RK.World) RK.MapGen.generate(floor, RK.GAME.runSeed, RK.GAME.mapWidth, RK.GAME.mapHeight, RK.GAME.mapStyle);
    if (RK.Audio) RK.Audio.setFloor(floor);
    if (!returningToSavedLocation) {
      RK.GAME.enemies = [];
      RK.GAME.items = [];
      RK.GAME.placedLocationItems = [];
      RK.GAME.npcs = [];
    }
    var loc = locationMode ? RK.World.current() : null;
    var typeDef = loc ? C.LOCATION_TYPES[loc.type] : null;
    var isCity = !!loc && loc.type === 'city';
    if (!returningToSavedLocation) {
      if (!locationMode) placePartyMembers();
      if (!typeDef || typeDef.spawnRate > 0) RK.Spawn.spawnEnemies(RK.Map, floor);
      RK.GAME.items = RK.Items.spawnItems(floor, RK.Map.spawn);
      // Город — безопасный перевалочный пункт: сундуков в нём нет.
      if (!isCity) RK.Spawn.placeChests(RK.Map);
      else RK.Spawn.placeStorageChest(RK.Map);
      RK.GAME.npcs = isCity
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
      RK.GAME.placedLocationItems = (RK.GAME.placedLocationItems || []).filter(function (item) {
        return RK.MapGen.isWalkable(item.x, item.y);
      });
    }
    var decorationBlockers = party().concat(
      RK.GAME.enemies,
      RK.GAME.items,
      RK.GAME.npcs || [],
      RK.Map.chests,
      RK.Map.doors,
      RK.Map.traps,
      RK.Map.torches,
    );
    var preservedDecorations = (RK.Map.decorations || []).filter(function (decoration) {
      return decoration && decoration.furniture === true;
    });
    RK.Map.decorations = RK.MapGen.placeDecorations(RK.Map, decorationBlockers).concat(preservedDecorations);
    RK.Fov.compute(RK.GAME.player.x, RK.GAME.player.y);
    updatePlayerZone();
    RK.Narrator.onEvent('floorStart', { floor: floor });
  }

  function getEnemyAt(x, y) {
    for (var i = 0; i < RK.GAME.enemies.length; i++) {
      var e = RK.GAME.enemies[i];
      if (e.alive && e.x === x && e.y === y) return e;
    }
    return null;
  }

  function visibleEnemies() {
    var seen = [];
    if (!RK.Map || !RK.Map.vis) return seen;
    for (var i = 0; i < RK.GAME.enemies.length; i++) {
      var e = RK.GAME.enemies[i];
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
      if (RK.CombatMove.walk.autoSeen.indexOf(visible[i]) === -1) return true;
    }
    return false;
  }

  // После перехода партия встаёт не в одну клетку: ходивший — на выход,
  // остальные — на свободные соседние. Иначе сосед занимал бы клетку выхода
  // и герой не смог бы вернуться обратно: шаг в занятую клетку отклоняется.
  function placePartyAtEntry() {
    var members = party();
    for (var i = 0; i < members.length; i++) {
      var member = members[i];
      if (member.id === RK.GAME.player.id) {
        member.x = RK.GAME.player.x;
        member.y = RK.GAME.player.y;
        continue;
      }
      var tile = RK.CombatMove.findFreeTileNear(RK.GAME.player.x, RK.GAME.player.y, member.id);
      member.x = tile ? tile.x : RK.GAME.player.x;
      member.y = tile ? tile.y : RK.GAME.player.y;
    }
  }

  function checkStairs() {
    var p = RK.GAME.player;
    // В режиме локаций проверяем переходы между локациями.
    if (RK.GAME.locationMode && RK.World && RK.Map && RK.Map.exits) {
      for (var i = 0; i < RK.Map.exits.length; i++) {
        var exit = RK.Map.exits[i];
        if (p.x === exit.x && p.y === exit.y) {
          if (RK.World.travel(exit.id)) {
            // Расстановку партии и снимок новой локации делает World.travel:
            // здесь остаётся только сбросить анимацию шага и обновить экран.
            RK.CombatMove.walk.auto = false;
            RK.CombatMove.walk.steps = Object.create(null);
            RK.UI.refresh();
          }
          return;
        }
      }
      return;
    }
    // Легаси-этаж без мира: спуск ведёт ниже без конца — победы в игре нет.
    if (RK.Map.stair && p.x === RK.Map.stair.x && p.y === RK.Map.stair.y) {
      RK.GAME.floor++;
      RK.UI.msg('Вы спускаетесь на этаж ' + RK.GAME.floor);
      startFloor(RK.GAME.floor);
    }
  }

  // Сохранение одиночного забега. localStorage синхронный, поэтому запись идёт
  // раз в SAVE_EVERY_TURNS ходов; в сетевой комнате состояние считает сервер,
  // и клиентский снимок только мешал бы. Переход локации и финал забега
  // сохраняются сразу — это точки, после которых игрок ждёт результата.
  function autosave() {
    if (C.ENABLE_WORLD && !RK.World) return;
    if (RK.Network && RK.Network.inRoom && RK.Network.inRoom()) return;
    if (RK.GAME.turn % C.SAVE_EVERY_TURNS !== 0) return;
    if (RK.World) RK.World.saveRun();
  }

  function recomputePlayerStats() {
    var p = RK.GAME.player;
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
    var zone = getZoneAt(RK.GAME.player.x, RK.GAME.player.y);
    var zoneId = zone ? zone.type + ':' + zone.x + ':' + zone.y : null;
    if (zoneId === RK.GAME.activeZone) return;
    var wasInZone = RK.GAME.activeZone !== null;
    RK.GAME.activeZone = zoneId;
    if (zone) RK.UI.msg('Вы вошли в ' + zone.name + '.');
    else if (wasInZone) RK.UI.msg('Вы покинули зону эффекта.');
  }

  // Партия всегда хранится в RK.GAME.players; RK.GAME.player — только её фокус.
  function party() {
    if (!RK.GAME) return [];
    return RK.GAME.players && RK.GAME.players.length ? RK.GAME.players : (RK.GAME.player ? [RK.GAME.player] : []);
  }

  function metaLuck() {
    return RK.Meta && RK.Meta.data ? (RK.Meta.data.luck || 0) : 0;
  }

  // Золото, попадающее в банк: удача из мет-прогресса увеличивает вклад.
  function bankValue(gold) {
    return Math.floor(gold * (1 + metaLuck() * C.META_LUCK_GOLD_RATE));
  }

  function setPlayerStats(stats) {
    if (!RK.GAME || RK.GAME.over || !RK.GAME.player) return false;
    var p = RK.GAME.player;
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

  function addXp(n) {
    var p = RK.GAME.player;
    if (p.level >= C.MAX_LEVEL) return;
    n = Math.round(n * RK.Narrator.getMods(RK.GAME.turn).xpMul);
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
    RK.GAME.over = true;
    RK.GAME.result = 'defeat';
    // Забег окончен: сохранение больше нечего продолжать, и «Продолжить» в меню
    // должно исчезнуть.
    if (RK.World && RK.World.clearRun) RK.World.clearRun();
    RK.Narrator.onEvent('death');
    var banked = bankPartyGold();
    RK.UI.over(false, RK.GAME.floor, RK.GAME.player.level, banked, RK.GAME.stats, RK.GAME.player, RK.GAME.deathCause);
  }

  function death() {
    endRun();
  }

  // Пишем только смертельный удар: пережитый урон причину не меняет.
  function noteDeathCause(cause) {
    if (RK.GAME) RK.GAME.deathCause = cause;
  }

  function getPartyPlayerAt(x, y, exceptId) {
    var party = RK.GAME && RK.GAME.players ? RK.GAME.players : [];
    for (var i = 0; i < party.length; i++) {
      if (party[i].id !== exceptId && party[i].hp > 0 && party[i].x === x && party[i].y === y) return party[i];
    }
    return null;
  }

  function addNetworkPlayer(id, name, classId) {
    if (!RK.GAME || !RK.GAME.players || RK.GAME.players.some(function (player) { return player.id === id; })) return false;
    var player = initPartyMember(id, name, classId);
    RK.GAME.players.push(player);
    var tile = RK.Spawn.findFreeSpawnTile(RK.GAME.player.x, RK.GAME.player.y, id);
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
    if (!RK.GAME || !RK.GAME.players) return false;
    var index = -1;
    for (var i = 0; i < RK.GAME.players.length; i++) {
      if (RK.GAME.players[i].id === id) { index = i; break; }
    }
    if (index === -1) return false;
    RK.GAME.players.splice(index, 1);
    if (RK.GAME.player && RK.GAME.player.id === id) RK.GAME.player = RK.GAME.players[0] || null;
    delete RK.CombatMove.walk.steps[id];
    return true;
  }

  function setActivePlayer(id) {
    if (!RK.GAME || !RK.GAME.players) return false;
    for (var i = 0; i < RK.GAME.players.length; i++) {
      if (RK.GAME.players[i].id === id) {
        RK.GAME.player = RK.GAME.players[i];
        RK.Fov.compute(RK.GAME.player.x, RK.GAME.player.y);
        RK.UI.refresh();
        return true;
      }
    }
    return false;
  }

  // Размер канваса задаёт рендер (js/render.js): на сервере канваса нет,
  // а в браузере вызов идёт через него — иначе формула разошлась бы в двух местах.
  function resizeCanvas() {
    if (RK.Render && RK.Render.resizeCanvas) RK.Render.resizeCanvas();
  }

  function finishTurn() {
    if (RK.GAME.over) return;
    RK.GAME.turn++;
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
    RK.CombatHit.tickBurning(members);
    RK.CombatHit.decayHunger(members);
    var enemyStatusSnapshot = RK.GAME.enemies.slice();
    for (var esi = 0; esi < enemyStatusSnapshot.length; esi++) {
      var enemyForStatus = enemyStatusSnapshot[esi];
      if (!enemyForStatus || !enemyForStatus.alive) continue;
      RK.CombatHit.tickActorStatuses(enemyForStatus);
      if (enemyForStatus.hp <= 0) RK.CombatHit.killEnemy(enemyForStatus);
    }
    recomputePlayerStats();
    RK.Narrator.tick(RK.GAME.turn);
    var zone = getZoneAt(RK.GAME.player.x, RK.GAME.player.y);
    if (zone && zone.type === 'regen' && RK.GAME.player.hp < RK.GAME.player.maxHp) {
      var healing = Math.min(2, RK.GAME.player.maxHp - RK.GAME.player.hp);
      RK.GAME.player.hp += healing;
      RK.UI.msg('Зона регенерации: +' + healing + ' HP.');
    }
    if (members.some(function (member) { return member.hp > 0; })) RK.CombatHit.enemiesAct();
    RK.Fov.compute(RK.GAME.player.x, RK.GAME.player.y);
    RK.Narrator.onEvent('turnEnd', { turn: RK.GAME.turn });
    // Мировые события тикают каждый ход: сервер видит их в снимке вместе с игрой.
    if (RK.Events && RK.Events.tick) RK.Events.tick();
    // Кемпинг тикает так же: лечение и проверка врагов в радиусе лагеря.
    if (RK.Camp && RK.Camp.tick) RK.Camp.tick();
    if (RK.GAME.locationMode && RK.World) RK.World.saveCurrentState();
    RK.UI.refresh();
    for (var aliveIndex = 0; aliveIndex < members.length; aliveIndex++) {
      members[aliveIndex].alive = members[aliveIndex].hp > 0;
    }
    if (!members.some(function (member) { return member.hp > 0; })) death();
  }

  RK.CombatRun = {
    newRun: newRun,
    createDebugContext: createDebugContext,
    startFloor: startFloor,
    setPlayerStats: setPlayerStats,
    getEnemyAt: getEnemyAt,
    visibleEnemies: visibleEnemies,
    hasNewVisibleEnemy: hasNewVisibleEnemy,
    placePartyAtEntry: placePartyAtEntry,
    party: party,
    metaLuck: metaLuck,
    getZoneAt: getZoneAt,
    getZoneMods: getZoneMods,
    recomputePlayerStats: recomputePlayerStats,
    updatePlayerZone: updatePlayerZone,
    noteDeathCause: noteDeathCause,
    death: death,
    endRun: endRun,
    addXp: addXp,
    bankPartyGold: bankPartyGold,
    getPartyPlayerAt: getPartyPlayerAt,
    addNetworkPlayer: addNetworkPlayer,
    removeNetworkPlayer: removeNetworkPlayer,
    setActivePlayer: setActivePlayer,
    localPlayerId: localPlayerId,
    localPlayerName: localPlayerName,
    resizeCanvas: resizeCanvas,
    checkStairs: checkStairs,
    autosave: autosave,
    bankValue: bankValue,
    finishTurn: finishTurn,
    selectedClassId: selectedClassId,
    heroOf: heroOf,
    initPartyMember: initPartyMember,
    placePartyMembers: placePartyMembers,
    resetGame: resetGame,
  };
})();
