// Граф локаций: узлы описывают сцены, переходы соединяют их выходами.
(function () {
  var C = RK.CONFIG;
  var LOCATIONS = RK.WorldData.LOCATIONS;

  // Вход в данж есть в каждой не-городской локации. Сам узел яруса строится по
  // demand (см. dungeonNode), поэтому граф поверхности не растёт заранее.
  Object.keys(LOCATIONS).forEach(function (id) {
    var loc = LOCATIONS[id];
    if (loc.type === 'city') return;
    loc.exits.push({
      id: 'dungeon_entrance',
      to: id + ':d1',
      toExit: 'stairs_up',
      label: 'Вход в подземелье',
      asset: 'stairs',
      stairs: 'down',
    });
  });

  var DUNGEON_NODES = Object.create(null);

  // Узел яруса данжа: та же локация и стиль, но свой id, глубина и
  // выходы. Наверх ведёт на ярус выше (первый — в саму локацию), вниз — если
  // глубина не предел: на дне только босс-зал без спуска.
  function dungeonNode(parentId, depth) {
    var parent = Object.prototype.hasOwnProperty.call(LOCATIONS, parentId) ? LOCATIONS[parentId] : null;
    if (!parent || parent.type === 'city' || depth < 1 || depth > C.DUNGEON_MAX_DEPTH) return null;
    var key = parentId + ':d' + depth;
    if (DUNGEON_NODES[key]) return DUNGEON_NODES[key];
    var node = {
      id: key,
      parentId: parentId,
      depth: depth,
      type: parent.type,
      name: parent.name + ' — ярус ' + depth,
      style: parent.style,
      exits: [{
        id: 'stairs_up',
        to: depth > 1 ? parentId + ':d' + (depth - 1) : parentId,
        toExit: depth > 1 ? 'stairs_down' : 'dungeon_entrance',
        label: 'Лестница наверх',
        asset: 'stairs',
        stairs: 'up',
      }],
    };
    if (depth < C.DUNGEON_MAX_DEPTH) {
      node.exits.push({
        id: 'stairs_down',
        to: parentId + ':d' + (depth + 1),
        toExit: 'stairs_up',
        label: 'Спуск глубже',
        asset: 'stairs',
        stairs: 'down',
      });
    }
    DUNGEON_NODES[key] = node;
    return node;
  }

  var state = { current: null, visited: Object.create(null) };
  // Снимок мира для сети не меняется между переходами: visited других локаций стабилен,
  // а текущая вырезается. Кэш возвращается, пока ключ смены локации не поменяется.
  var networkStateCacheKey = null;
  var networkStateCache = null;

  function invalidateNetworkStateCache() {
    networkStateCacheKey = null;
    networkStateCache = null;
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function getLocation(id) {
    // Свой ключ объекта, а не LOCATIONS[id]: идентификатор '__proto__' вернул бы
    // Object.prototype — и в граф попал бы несуществующий узел.
    if (Object.prototype.hasOwnProperty.call(LOCATIONS, id)) return LOCATIONS[id];
    // Узлы данжей не лежат в LOCATIONS: '<локация>:dN' собирается по demand.
    var match = typeof id === 'string' && /^(.+):d([0-9]+)$/.exec(id);
    return match ? dungeonNode(match[1], Number(match[2])) : null;
  }

  function listLocations() {
    return Object.keys(LOCATIONS).map(function (id) { return LOCATIONS[id]; });
  }

  function getExits(locationId) {
    var loc = getLocation(locationId);
    return loc ? loc.exits : [];
  }

  function current() {
    return state.current ? getLocation(state.current) : null;
  }

  // Задания — состояние забега, а не локации: прогресс, набранный в лесу,
  // не должен откатываться при возвращении в город.
  function saveCurrentState() {
    var id = state.current;
    if (!id || !RK.Map) return;
    var game = RK.GAME;
    // В памяти храним матрицы карты сжатыми: забег долгоживущий, а сетевой
    // снимок всё равно кодирует их в RLE. restoreState распаковывает при входе.
    var mapSnapshot = clone(RK.Map);
    if (RK.MapGen && typeof RK.MapGen.encodeMatrices === 'function') {
      mapSnapshot.matrices = RK.MapGen.encodeMatrices(mapSnapshot);
      (RK.MapGen.MATRIX_FIELDS || []).forEach(function (field) { delete mapSnapshot[field]; });
    }
    state.visited[id] = {
      floor: game ? game.floor : 1,
      mapSnapshot: mapSnapshot,
      gameSnapshot: game ? {
        enemies: clone(game.enemies),
        items: clone(game.items),
        placedLocationItems: clone(game.placedLocationItems),
        npcs: clone(game.npcs),
      } : null,
    };
  }

  // Состояние для снимка. В памяти карты лежат как есть — их читает
  // restoreState, — но наружу уходят сжатыми: снимок едет на каждый шаг.
  // Список полей матриц берётся у кодеков, иначе он разошёлся бы с ними.
  function getNetworkState() {
    var cacheKey = (state.current || '') + '|' + Object.keys(state.visited).sort().join(',');
    if (networkStateCache && networkStateCacheKey === cacheKey) return networkStateCache;

    var next = clone(state);
    Object.keys(next.visited).forEach(function (id) {
      var record = next.visited[id];
      if (!record || !record.mapSnapshot) return;
      var map = record.mapSnapshot;
      if (!map.matrices) {
        map.matrices = RK.MapGen.encodeMatrices(map);
        RK.MapGen.MATRIX_FIELDS.forEach(function (field) { delete map[field]; });
      }
    });
    // Текущая локация не везёт mapSnapshot (её карта — в map) и не везёт
    // gameSnapshot (враги, предметы, NPC — в game). Иначе каждый бой
    // переписывал бы world на каждый шаг. Остаётся только floor: клиент
    // знает, на каком этаже герой, и запись подтверждает, что локация посещена.
    if (next.visited[next.current]) {
      delete next.visited[next.current].mapSnapshot;
      delete next.visited[next.current].gameSnapshot;
    }
    networkStateCacheKey = cacheKey;
    networkStateCache = next;
    return next;
  }

  // Приём снимка: матрицы разворачиваются обратно, иначе возврат в локацию
  // показал бы пустую карту.
  function restoreNetworkState(record) {
    if (!record || !record.mapSnapshot || !record.mapSnapshot.matrices) return record;
    var map = record.mapSnapshot;
    var decoded = RK.MapGen.decodeMatrices(
      map.matrices,
      Number.isInteger(map.w) ? map.w : 0,
      Number.isInteger(map.h) ? map.h : 0,
    );
    if (!decoded) return record;
    record.mapSnapshot = Object.assign({}, clone(map), decoded);
    delete record.mapSnapshot.matrices;
    return record;
  }

  function restoreState(visited, loc) {
    if (!visited || !visited.mapSnapshot) return false;
    var source = visited.mapSnapshot;
    var mapSnapshot = source;
    if (source && source.matrices) {
      var width = Number.isInteger(source.w) ? source.w : 0;
      var height = Number.isInteger(source.h) ? source.h : 0;
      var decoded = RK.MapGen.decodeMatrices(source.matrices, width, height);
      if (!decoded) return false;
      mapSnapshot = Object.assign({}, clone(source), decoded);
      delete mapSnapshot.matrices;
    } else {
      mapSnapshot = clone(source);
    }
    RK.Map = mapSnapshot;
    refreshLocationExits(RK.Map, loc);
    if (!RK.GAME) return true;
    var game = visited.gameSnapshot || {};
    RK.GAME.floor = visited.floor;
    RK.GAME.enemies = clone(game.enemies || []);
    RK.GAME.items = clone(game.items || []);
    RK.GAME.npcs = clone(game.npcs || []);
    RK.GAME.placedLocationItems = clone(game.placedLocationItems || []);
    return true;
  }

  // Пустой переход — выход без локации за ним: на карту он не попадает,
  // иначе клик по вратам не уводил бы никуда.
  function linksToLocation(exit) {
    return !!getLocation(exit.to);
  }

  // Карта локации с её выходами: статические ворота подгоняются под карту,
  // лестницы данжа ставит генератор — вниз в дальней комнате, наверх у спавна.
  function buildLocation(loc, seed) {
    var depth = loc.depth || 1;
    // Тема яруса: глубже входного зала подземелье меняет стиль (грибы, магма, лёд, храм).
    var style = RK.MapBase.depthStyle(loc.type, depth, loc.style);
    var map = RK.MapGen.generateLocation(loc.type, depth, seed, C.MAP_WIDTH, C.MAP_HEIGHT, style);
    map.locationId = loc.id;
    map.locationName = loc.name;
    syncLocationExits(map, loc);
    return map;
  }

  function syncLocationExits(map, loc) {
    map.exits = loc.exits.filter(linksToLocation).map(function (exit) {
      return placeExit(map, exit);
    }).filter(Boolean);
  }

  function refreshLocationExits(map, loc) {
    var expected = loc.exits.filter(linksToLocation);
    if (Array.isArray(map.exits) && map.exits.length === expected.length &&
        expected.every(function (exit) {
          return map.exits.some(function (current) {
            return current.id === exit.id && current.to === exit.to && current.toExit === exit.toExit;
          });
        })) return;
    syncLocationExits(map, loc);
    map.exits = reachableExits(map);
  }

  function placeExit(map, exit) {
    if (exit.stairs === 'up') {
      var near = walkableNeighborOf(map, map.spawn.x, map.spawn.y, map.stair);
      return near ? Object.assign({}, exit, near) : null;
    }
    if (exit.stairs === 'down') {
      // Дальняя комната (map.stair) уже чиста от мобов, ловушек и сундуков —
      // генератор держит вокруг неё отступы.
      return map.stair ? Object.assign({}, exit, { x: map.stair.x, y: map.stair.y }) : null;
    }
    var point = RK.MapGen.snapExitToWalkable(map, exit.x, exit.y);
    return Object.assign({}, exit, point || {});
  }

  // Свободная клетка рядом с точкой. Спавн и лестница вниз не годятся:
  // переход на клетке спавна reachableExits убирает, а совпадение двух
  // лестниц сделало бы переход в одну сторону.
  function walkableNeighborOf(map, x, y, avoid) {
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (var i = 0; i < dirs.length; i++) {
      var nx = x + dirs[i][0];
      var ny = y + dirs[i][1];
      if (avoid && nx === avoid.x && ny === avoid.y) continue;
      if (RK.MapGen.isMapWalkable(map, nx, ny)) return { x: nx, y: ny };
    }
    return null;
  }

  // Выход должен быть достижим от точки спавна: недостижимые врата рисовались бы,
  // но клик по ним не вёл бы никуда. Такие выходы убираем с карты.
  function reachableExits(map) {
    return map.exits.filter(function (exit) {
      return !(exit.x === map.spawn.x && exit.y === map.spawn.y) &&
        RK.MapGen.isMapWalkable(map, exit.x, exit.y) &&
        !!RK.MapGen.findPathOnMap(map, map.spawn.x, map.spawn.y, exit.x, exit.y, null);
    });
  }

  // Сначала пробуем перегенерировать карту целиком, затем оставляем только
  // достижимые выходы: лучше локация без части выходов, чем видимый пустой переход.
  function generateLocation(loc) {
    var seed = RK.GAME && RK.GAME.runSeed ? RK.GAME.runSeed : RK.RNG.randomSeed();
    var expected = loc.exits.filter(linksToLocation).length;
    var map;
    for (var attempt = 0; attempt <= 4; attempt++) {
      map = buildLocation(loc, attempt === 0 ? seed : (seed + attempt) >>> 0);
      map.exits = reachableExits(map);
      if (map.exits.length === expected) break;
    }
    if (RK.GAME && RK.GAME.player) {
      RK.GAME.player.x = map.spawn.x;
      RK.GAME.player.y = map.spawn.y;
      RK.GAME.floor = loc.depth || 1;
    }
    return map;
  }

  // Вход в локацию: карта либо генерируется впервые, либо берётся из сохранения.
  // Возвращает true, если локация уже посещалась и её состояние восстановлено.
  function enterLocation(target, entryExitId) {
    var saved = state.visited[target.id];
    var restored = !!(saved && saved.mapSnapshot);
    if (restored) restoreState(saved, target);
    else generateLocation(target);

    if (RK.Map && RK.GAME && RK.GAME.player) {
      var entry = entryExitId
        ? RK.Map.exits.find(function (exit) { return exit.id === entryExitId; })
        : null;
      // Нет входных ворот (телепорт): герой встаёт на спавн локации — в городе
      // это центр площади. Иначе он остался бы на координатах прошлой карты.
      var spot = entry && RK.MapGen.isMapWalkable(RK.Map, entry.x, entry.y)
        ? entry
        : RK.Map.spawn;
      if (spot) {
        RK.GAME.player.x = spot.x;
        RK.GAME.player.y = spot.y;
      }
    }
    if (RK.GAME) {
      RK.GAME.locationId = target.id;
      RK.GAME.locationMode = true;
      RK.GAME.activeZone = null;
      // Партию расставляет бой: ходивший — на выход, остальные — на свободные
      // соседние клетки, иначе сосед занял бы выход и обратный переход невозможен.
      if (RK.Combat && RK.Combat.placePartyAtEntry) RK.Combat.placePartyAtEntry();
    }
    return restored;
  }

  // Сцену локации грузит бой: спавн врагов, предметы, NPC и партия.
  // Мир только переключает карту и состояние.
  function activate(restored) {
    if (RK.Combat && RK.Combat.startFloor) {
      RK.Combat.startFloor(RK.GAME ? RK.GAME.floor : 1, true, restored);
    }
  }

  // Общий путь перехода: сохранить текущую локацию, войти в целевую и разбудить бой.
  function goTo(target, entryExitId) {
    saveCurrentState();
    invalidateNetworkStateCache();
    state.current = target.id;
    var restored = enterLocation(target, entryExitId);
    activate(restored);
    // Задания на дорогу засчитываются переходом: «сходи в склеп» — это путь,
    // а не бой, поэтому прогресс даёт World, а не боевая система.
    if (RK.Combat && RK.Combat.advanceQuest) RK.Combat.advanceQuest('visit', target.id, 1);
    if (!state.visited[target.id] || !state.visited[target.id].gameSnapshot) saveCurrentState();
    invalidateNetworkStateCache();
    // Переход — точка, после которой игрок ждёт результата: сохраняем сразу,
    // а не по общему счётчику ходов.
    saveRun();
    return true;
  }

  function travel(exitId) {
    var loc = current();
    if (!loc) return false;
    var exit = loc.exits.find(function (candidate) { return candidate.id === exitId; });
    var target = exit && getLocation(exit.to);
    if (!target) return false;
    return goTo(target, exit.toExit);
  }

  // Переход без выхода на карте: телепорт в город и другие прямые перемещения.
  function travelTo(locationId) {
    var target = getLocation(locationId);
    if (!target || state.current === target.id) return false;
    return goTo(target, null);
  }

  // Босс яруса данжа: тип идёт по кругу BOSS_TYPES со сдвигом на позицию
  // локации в DUNGEON_BOSS_ORDER — правило задано в конфиге, здесь обход.
  function dungeonBoss(locationId, depth) {
    var types = RK.Entities && RK.Entities.BOSS_TYPES;
    if (!types || !types.length) return null;
    var order = C.DUNGEON_BOSS_ORDER || [];
    var index = order.indexOf(locationId);
    if (index === -1) return null;
    var d = Math.max(1, Math.min(C.DUNGEON_MAX_DEPTH, depth || 1));
    return types[(index * C.DUNGEON_MAX_DEPTH + d - 1) % types.length];
  }

  // Валидация при старте: порядок обязан покрывать не-городской граф, иначе
  // у локации не будет ярусов, а непокрытый тип босса нельзя убить за забег.
  function assertDungeonBossOrder() {
    var order = C.DUNGEON_BOSS_ORDER || [];
    var problems = [];
    listLocations().forEach(function (loc) {
      if (loc.type !== 'city' && order.indexOf(loc.id) === -1) problems.push('нет локации ' + loc.id);
    });
    order.forEach(function (id) {
      if (!getLocation(id)) problems.push('лишняя локация ' + id);
    });
    var types = RK.Entities && RK.Entities.BOSS_TYPES ? RK.Entities.BOSS_TYPES : [];
    if (order.length * C.DUNGEON_MAX_DEPTH < types.length) {
      problems.push('ярусов не хватает на ' + types.length + ' боссов');
    }
    if (problems.length) throw new Error('DUNGEON_BOSS_ORDER: ' + problems.join('; '));
  }

  // Валидация при старте не даёт стилю или выходу вести за пределы карты.
  function assertLocationsFitMapLimits() {
    var limits = C.MAP_LIMITS || { maxWidth: 0, maxHeight: 0 };
    var problems = [];
    listLocations().forEach(function (loc) {
      if (!C.MAP_STYLES[loc.style]) {
        problems.push(loc.id + ': неизвестный стиль ' + loc.style);
      }
      loc.exits.forEach(function (exit) {
        if (exit.x !== undefined && (exit.x < 0 || exit.x >= limits.maxWidth ||
            exit.y < 0 || exit.y >= limits.maxHeight)) {
          problems.push(loc.id + ': выход ' + exit.id + ' за пределами карты');
        }
      });
    });
    if (problems.length) throw new Error('Локации не влезают в карту: ' + problems.join('; '));
  }

  function init() {
    assertDungeonBossOrder();
    assertLocationsFitMapLimits();
    var start = getLocation(C.WORLD_START_LOCATION);
    if (!start || !C.LOCATION_TYPES[start.type]) return false;
    state.current = start.id;
    state.visited = Object.create(null);
    invalidateNetworkStateCache();
    var restored = enterLocation(start);
    activate(restored);
    if (!state.visited[start.id] || !state.visited[start.id].gameSnapshot) saveCurrentState();
    invalidateNetworkStateCache();
    return true;
  }

  // Снимок несёт карту и партию текущей локации отдельными полями, поэтому её
  // запись в visited не едет вовсе: state.visited хранит только остальные
  // локации, а запись текущей создаёт saveCurrentState.
  function setState(next, currentMap) {
    if (!next || !getLocation(next.current) || !next.visited || typeof next.visited !== 'object') return false;
    if (!currentMap || !Array.isArray(currentMap.tiles)) return false;
    var currentLocation = getLocation(next.current);
    var visited = Object.create(null);
    Object.keys(next.visited).forEach(function (id) {
      if (id === next.current) return;
      var record = next.visited[id];
      // Узлы данжей не в LOCATIONS, поэтому локация проверяется через getLocation.
      if (!getLocation(id) || !record || !record.mapSnapshot || !Number.isFinite(record.floor)) return;
      // Матрицы из снимка разворачиваются здесь: в state они лежат обычными
      // строками, как их ждёт restoreState.
      visited[id] = clone(restoreNetworkState(clone(record)));
    });
    state.current = next.current;
    state.visited = visited;
    refreshLocationExits(currentMap, currentLocation);
    invalidateNetworkStateCache();
    return true;
  }

  // --- Сохранение одиночного забега -----------------------------------------
  // Снимок из localStorage — недоверенный ввод: он пережил перезагрузку страницы
  // и правку руками. Поэтому читается только после проверки версии и размеров.
  function indexKey() { return C.SAVE_KEY + ':index'; }
  function runKey(id) { return C.SAVE_KEY + ':' + id; }

  function loadSaveIndex() {
    if (typeof localStorage === 'undefined') return [];
    try {
      var raw = localStorage.getItem(indexKey());
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function saveSaveIndex(index) {
    if (typeof localStorage === 'undefined') return false;
    try {
      localStorage.setItem(indexKey(), JSON.stringify(index || []));
      return true;
    } catch (error) {
      return false;
    }
  }

  function saveRun() {
    if (typeof localStorage === 'undefined' || !RK.Combat || !RK.Combat.createSnapshot) return false;
    var snapshot;
    try {
      snapshot = RK.Combat.createSnapshot();
    } catch (error) {
      return false;
    }
    if (!snapshot) return false;
    try {
      var savedAt = Date.now();
      var id = 'run_' + savedAt + '_' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(runKey(id), JSON.stringify({
        version: C.SAVE_VERSION,
        savedAt: savedAt,
        snapshot: snapshot,
      }));
      var index = loadSaveIndex();
      var player = snapshot.game && snapshot.game.player ? snapshot.game.player : {};
      index.unshift({
        id: id,
        savedAt: savedAt,
        playerName: player.name || 'Герой',
        classId: player.class || player.classId || '',
        level: player.level || 1,
        locationId: snapshot.game.locationId || '',
      });
      if (index.length > 20) index = index.slice(0, 20);
      saveSaveIndex(index);
      return true;
    } catch (error) {
      // Квота localStorage исчерпана или запись запрещена: забег продолжается,
      // просто не переживёт перезагрузку. Молча — игрок ничего не теряет сейчас.
      return false;
    }
  }

  // null — сохранения нет или оно битое; вызывающий начинает забег заново.
  function loadRun(id) {
    if (typeof localStorage === 'undefined') return null;
    var raw;
    try {
      if (id) {
        raw = localStorage.getItem(runKey(id));
      } else {
        var index = loadSaveIndex();
        if (!index.length) return null;
        raw = localStorage.getItem(runKey(index[0].id));
      }
    } catch (error) {
      return null;
    }
    if (!raw) return null;
    try {
      var saved = JSON.parse(raw);
      if (!saved || saved.version !== C.SAVE_VERSION || !saved.snapshot) return null;
      return isSnapshotUsable(saved.snapshot) ? saved.snapshot : null;
    } catch (error) {
      return null;
    }
  }

  // Проверка при чтении: снимок может быть обрезан, от другой версии игры или
  // просто руками правлен. Всё это должно молча дать новый забег, а не падение.
  function isSnapshotUsable(snapshot) {
    var map = snapshot && snapshot.map;
    var game = snapshot && snapshot.game;
    if (!game || !game.player || !map) return false;
    if (!Number.isInteger(map.w) || !Number.isInteger(map.h)) return false;
    if (map.w < 8 || map.h < 8 || map.w > C.MAP_LIMITS.maxWidth || map.h > C.MAP_LIMITS.maxHeight) return false;
    if (!map.matrices || !Array.isArray(map.matrices.tiles) || map.matrices.tiles.length !== map.h) return false;
    if (!RK.World.getLocation(game.locationId)) return false;
    if (!Array.isArray(game.players) || !game.players.length) return false;
    return true;
  }

  // Кнопка «Продолжить» появляется только если забег читается: битое
  // сохранение вело бы в сообщение о нечитаемом файле.
  function hasSavedRun() {
    if (typeof localStorage === 'undefined') return false;
    var index = loadSaveIndex();
    if (!index.length) return false;
    return loadRun(index[0].id) !== null;
  }

  function clearRun(id) {
    if (typeof localStorage === 'undefined') return;
    try {
      if (id) {
        localStorage.removeItem(runKey(id));
        var next = loadSaveIndex().filter(function (entry) { return entry.id !== id; });
        saveSaveIndex(next);
      } else {
        loadSaveIndex().forEach(function (entry) {
          try { localStorage.removeItem(runKey(entry.id)); } catch (e) {}
        });
        localStorage.removeItem(indexKey());
        localStorage.removeItem(C.SAVE_KEY);
      }
    } catch (error) {
    }
  }

  function listSaves() {
    return loadSaveIndex().slice();
  }

  RK.World = {
    init: init,
    travel: travel,
    travelTo: travelTo,
    current: current,
    getLocation: getLocation,
    listLocations: listLocations,
    getExits: getExits,
    dungeonBoss: dungeonBoss,
    // Полная копия состояния мира — только для осмотра из теста: getNetworkState
    // выбрасывает карту текущей локации, а тесту нужно видеть и её.
    getState: function () { return clone(state); },
    getNetworkState: getNetworkState,
    saveCurrentState: saveCurrentState,
    generateLocation: generateLocation,
    setState: setState,
    saveRun: saveRun,
    loadRun: loadRun,
    hasSavedRun: hasSavedRun,
    clearRun: clearRun,
    listSaves: listSaves,
  };
})();
