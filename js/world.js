// Граф локаций: узлы описывают сцены, переходы соединяют их выходами.
(function () {
  var C = RK.CONFIG;

  function location(id, type, name, gen, exits) {
    return { id: id, type: type, name: name, gen: gen, exits: exits };
  }

  var LOCATIONS = {
    city_start: location('city_start', 'city', 'Город Арген', {
      width: 48, height: 34, style: 'stone',
    }, [
      { id: 'gate_north', x: 24, y: 1, to: 'wilderness_forest', toExit: 'gate_south', label: 'Ворота на север', asset: 'stairs' },
    ]),
    wilderness_forest: location('wilderness_forest', 'wilderness', 'Лес Ворона', {
      width: 64, height: 46, style: 'cave',
    }, [
      { id: 'gate_south', x: 32, y: 44, to: 'city_start', toExit: 'gate_north', label: 'Ворота на юг', asset: 'stairs' },
      { id: 'cave_entrance', x: 50, y: 10, to: 'dungeon_crypt', toExit: 'stairs_up', label: 'Вход в склеп', asset: 'stairs' },
    ]),
    dungeon_crypt: location('dungeon_crypt', 'crypt', 'Склеп Тёмного', {
      width: 48, height: 34, style: 'crypt',
    }, [
      { id: 'stairs_up', x: 24, y: 1, to: 'wilderness_forest', toExit: 'cave_entrance', label: 'Вход в склеп', asset: 'stairs' },
    ]),
  };

  var state = { current: null, visited: Object.create(null) };

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function getLocation(id) {
    // Свой ключ объекта, а не LOCATIONS[id]: идентификатор '__proto__' вернул бы
    // Object.prototype — и в граф попал бы несуществующий узел.
    return Object.prototype.hasOwnProperty.call(LOCATIONS, id) ? LOCATIONS[id] : null;
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

  function saveCurrentState() {
    var id = state.current;
    if (!id || !RK.Map) return;
    var game = RK.GAME;
    state.visited[id] = {
      floor: game ? game.floor : 1,
      mapSnapshot: clone(RK.Map),
      gameSnapshot: game ? {
        enemies: clone(game.enemies),
        items: clone(game.items),
        placedLocationItems: clone(game.placedLocationItems),
        npcs: clone(game.npcs),
        quests: clone(game.quests),
        quest: clone(game.quest),
        questSeq: game.questSeq,
      } : null,
    };
  }

  // Состояние для снимка. В памяти карты лежат как есть — их читает
  // restoreState, — но наружу уходят сжатыми: снимок едет на каждый шаг.
  function getNetworkState() {
    var next = clone(state);
    Object.keys(next.visited).forEach(function (id) {
      var record = next.visited[id];
      if (!record || !record.mapSnapshot) return;
      var map = record.mapSnapshot;
      if (!map.matrices) {
        map.matrices = RK.MapGen.encodeMatrices(map);
        var fields = ['tiles', 'floorTypes', 'regions', 'explored'];
        for (var i = 0; i < fields.length; i++) delete map[fields[i]];
      }
    });
    if (next.visited[next.current]) delete next.visited[next.current].mapSnapshot;
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

  function restoreState(visited) {
    if (!visited || !visited.mapSnapshot) return false;
    RK.Map = clone(visited.mapSnapshot);
    if (!RK.GAME) return true;
    var game = visited.gameSnapshot || {};
    RK.GAME.floor = visited.floor;
    RK.GAME.enemies = clone(game.enemies || []);
    RK.GAME.items = clone(game.items || []);
    RK.GAME.npcs = clone(game.npcs || []);
    RK.GAME.placedLocationItems = clone(game.placedLocationItems || []);
    RK.GAME.quests = clone(game.quests || []);
    RK.GAME.quest = RK.GAME.quests.length
      ? RK.GAME.quests.find(function (quest) {
        return game.quest && quest.type === game.quest.type && quest.kind === game.quest.kind;
      }) || RK.GAME.quests[0]
      : null;
    RK.GAME.questSeq = game.questSeq || 0;
    return true;
  }

  // Карта локации с её выходами: координаты выходов из графа подгоняются
  // под сгенерированную карту, а генератору города они нужны, чтобы
  // пробить проспект от ворот к площади.
  function buildLocation(loc, seed) {
    var map = RK.MapGen.generateLocation(loc.type, 1, seed, loc.gen.width, loc.gen.height,
      loc.gen.style, loc.exits);
    map.locationId = loc.id;
    map.locationName = loc.name;
    map.exits = loc.exits.map(function (exit) {
      var point = RK.MapGen.snapExitToWalkable(map, exit.x, exit.y);
      return Object.assign({}, exit, point || {});
    });
    return map;
  }

  function generateLocation(loc) {
    var seed = RK.GAME && RK.GAME.runSeed ? RK.GAME.runSeed : RK.RNG.randomSeed();
    var map = buildLocation(loc, seed);
    for (var attempt = 0; attempt <= 4; attempt++) {
      var connected = map.exits.every(function (exit) {
        return (exit.x !== map.spawn.x || exit.y !== map.spawn.y) &&
          RK.MapGen.isMapWalkable(map, exit.x, exit.y) &&
          !!RK.MapGen.findPathOnMap(map, map.spawn.x, map.spawn.y, exit.x, exit.y, null);
      });
      if (connected) {
        if (RK.GAME && RK.GAME.player) {
          RK.GAME.player.x = map.spawn.x;
          RK.GAME.player.y = map.spawn.y;
          RK.GAME.floor = 1;
        }
        return map;
      }
      if (attempt === 4) break;
      map = buildLocation(loc, (seed + attempt + 1) >>> 0);
    }
    throw new Error('Не удалось найти проходимые выходы локации ' + loc.id);
  }

  // Вход в локацию: карта либо генерируется впервые, либо берётся из сохранения.
  // Возвращает true, если локация уже посещалась и её состояние восстановлено.
  function enterLocation(target, entryExitId) {
    var saved = state.visited[target.id];
    var restored = !!(saved && saved.mapSnapshot);
    if (restored) restoreState(saved);
    else generateLocation(target);

    if (entryExitId && RK.Map && RK.GAME && RK.GAME.player) {
      var entry = RK.Map.exits.find(function (exit) { return exit.id === entryExitId; });
      if (entry && RK.MapGen.isMapWalkable(RK.Map, entry.x, entry.y)) {
        RK.GAME.player.x = entry.x;
        RK.GAME.player.y = entry.y;
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

  function travel(exitId) {
    var loc = current();
    if (!loc) return false;
    var exit = loc.exits.find(function (candidate) { return candidate.id === exitId; });
    var target = exit && getLocation(exit.to);
    if (!target) return false;

    saveCurrentState();
    state.current = target.id;
    var restored = enterLocation(target, exit.toExit);
    activate(restored);
    // Задания на дорогу засчитываются переходом: «сходи в склеп» — это путь,
    // а не бой, поэтому прогресс даёт World, а не боевая система.
    if (RK.Combat && RK.Combat.advanceQuest) RK.Combat.advanceQuest('visit', target.id, 1);
    if (!state.visited[target.id] || !state.visited[target.id].gameSnapshot) saveCurrentState();
    // Переход — точка, после которой игрок ждёт результата: сохраняем сразу,
    // а не по общему счётчику ходов.
    saveRun();
    return true;
  }

  function init() {
    var start = getLocation(C.WORLD_START_LOCATION || 'city_start');
    if (!start || !C.LOCATION_TYPES[start.type]) return false;
    state.current = start.id;
    state.visited = Object.create(null);
    var restored = enterLocation(start);
    activate(restored);
    if (!state.visited[start.id] || !state.visited[start.id].gameSnapshot) saveCurrentState();
    return true;
  }

  // Снимок несёт карту и партию текущей локации отдельными полями, поэтому её
  // запись в visited не дублируется: state.visited хранит только остальные
  // локации, а запись текущей создаёт saveCurrentState.
  function setState(next, currentMap) {
    if (!next || !getLocation(next.current) || !next.visited || typeof next.visited !== 'object') return false;
    if (!currentMap || !Array.isArray(currentMap.tiles)) return false;
    var visited = Object.create(null);
    Object.keys(next.visited).forEach(function (id) {
      if (id === next.current) return;
      var record = next.visited[id];
      if (!LOCATIONS[id] || !record || !record.mapSnapshot || !Number.isFinite(record.floor)) return;
      // Матрицы из снимка разворачиваются здесь: в state они лежат обычными
      // строками, как их ждёт restoreState.
      visited[id] = clone(restoreNetworkState(clone(record)));
    });
    state.current = next.current;
    state.visited = visited;
    return true;
  }

  // --- Сохранение одиночного забега -----------------------------------------
  // Снимок из localStorage — недоверенный ввод: он пережил перезагрузку страницы
  // и правку руками. Поэтому читается только после проверки версии и размеров.
  var storageKey = function () { return C.SAVE_KEY; };

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
      localStorage.setItem(storageKey(), JSON.stringify({
        version: C.SAVE_VERSION,
        snapshot: snapshot,
      }));
      return true;
    } catch (error) {
      // Квота localStorage исчерпана или запись запрещена: забег продолжается,
      // просто не переживёт перезагрузку. Молча — игрок ничего не теряет сейчас.
      return false;
    }
  }

  // null — сохранения нет или оно битое; вызывающий начинает забег заново.
  function loadRun() {
    if (typeof localStorage === 'undefined') return null;
    var raw;
    try {
      raw = localStorage.getItem(storageKey());
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
    if (!map.matrices || !Array.isArray(map.matrices.tiles)) return false;
    if (!Array.isArray(map.matrices.tiles) || map.matrices.tiles.length !== map.h) return false;
    if (!RK.World.getLocation(game.locationId)) return false;
    if (!Array.isArray(game.players) || !game.players.length) return false;
    return true;
  }

  function hasSavedRun() {
    return loadRun() !== null;
  }

  function clearRun() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(storageKey());
    } catch (error) {
      // Удаление может быть запрещено: переживёт, следующая запись перезапишет.
    }
  }

  RK.World = {
    init: init,
    travel: travel,
    current: current,
    getLocation: getLocation,
    listLocations: listLocations,
    getExits: getExits,
    getState: function () { return clone(state); },
    getNetworkState: getNetworkState,
    saveCurrentState: saveCurrentState,
    restoreState: restoreState,
    generateLocation: generateLocation,
    setState: setState,
    saveRun: saveRun,
    loadRun: loadRun,
    hasSavedRun: hasSavedRun,
    clearRun: clearRun,
  };
})();
