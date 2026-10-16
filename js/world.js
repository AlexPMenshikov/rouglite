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
      { id: 'gate_east', x: 46, y: 17, to: 'wilderness_desert', toExit: 'gate_west', label: 'Ворота на восток', asset: 'stairs' },
      { id: 'gate_west', x: 2, y: 17, to: 'wilderness_mountains', toExit: 'gate_east', label: 'Ворота на запад', asset: 'stairs' },
    ]),
    wilderness_forest: location('wilderness_forest', 'wilderness', 'Лес Ворона', {
      width: 64, height: 46, style: 'forest',
    }, [
      { id: 'gate_south', x: 32, y: 44, to: 'city_start', toExit: 'gate_north', label: 'Ворота на юг', asset: 'stairs' },
      { id: 'cave_entrance', x: 50, y: 10, to: 'dungeon_crypt', toExit: 'stairs_up', label: 'Вход в склеп', asset: 'stairs' },
      { id: 'swamp_path', x: 8, y: 38, to: 'wilderness_swamp', toExit: 'forest_path', label: 'Тропа к болоту', asset: 'stairs' },
      { id: 'ruins_entrance', x: 58, y: 8, to: 'dungeon_ruins', toExit: 'ruins_exit', label: 'Вход в руины', asset: 'stairs' },
      { id: 'mountain_trail', x: 12, y: 5, to: 'wilderness_mountains', toExit: 'forest_trail', label: 'Тропа в горы', asset: 'stairs' },
    ]),
    dungeon_crypt: location('dungeon_crypt', 'crypt', 'Склеп Тёмного', {
      width: 48, height: 34, style: 'crypt',
    }, [
      { id: 'stairs_up', x: 24, y: 1, to: 'wilderness_forest', toExit: 'cave_entrance', label: 'Вход в склеп', asset: 'stairs' },
      { id: 'stairs_down', x: 24, y: 32, to: 'dungeon_crypt_deep', toExit: 'stairs_up', label: 'Нижний ярус', asset: 'stairs' },
    ]),
    dungeon_crypt_deep: location('dungeon_crypt_deep', 'crypt', 'Склеп Тёмного: Глубины', {
      width: 52, height: 38, style: 'crypt',
    }, [
      { id: 'stairs_up', x: 26, y: 1, to: 'dungeon_crypt', toExit: 'stairs_down', label: 'Верхний ярус', asset: 'stairs' },
    ]),
    wilderness_swamp: location('wilderness_swamp', 'wilderness', 'Болото Теней', {
      width: 60, height: 42, style: 'cave',
    }, [
      { id: 'forest_path', x: 30, y: 40, to: 'wilderness_forest', toExit: 'swamp_path', label: 'Тропа в лес', asset: 'stairs' },
      { id: 'ruins_path', x: 55, y: 10, to: 'dungeon_ruins', toExit: 'swamp_entrance', label: 'Путь к руинам', asset: 'stairs' },
      { id: 'sewer_entrance', x: 5, y: 20, to: 'dungeon_sewers', toExit: 'swamp_exit', label: 'Вход в канализацию', asset: 'stairs' },
    ]),
    dungeon_ruins: location('dungeon_ruins', 'ruins', 'Руины Старой Крепости', {
      width: 52, height: 38, style: 'ruins',
    }, [
      { id: 'ruins_exit', x: 26, y: 1, to: 'wilderness_forest', toExit: 'ruins_entrance', label: 'Выход в лес', asset: 'stairs' },
      { id: 'swamp_entrance', x: 48, y: 36, to: 'wilderness_swamp', toExit: 'ruins_path', label: 'Выход к болоту', asset: 'stairs' },
      { id: 'sewer_entrance', x: 4, y: 36, to: 'dungeon_sewers', toExit: 'ruins_exit', label: 'Вход в канализацию', asset: 'stairs' },
      { id: 'deep_entrance', x: 26, y: 36, to: 'dungeon_ruins_deep', toExit: 'stairs_up', label: 'Нижний уровень', asset: 'stairs' },
    ]),
    dungeon_ruins_deep: location('dungeon_ruins_deep', 'ruins', 'Руины: Заброшенные Кладовые', {
      width: 48, height: 34, style: 'ruins',
    }, [
      { id: 'stairs_up', x: 24, y: 1, to: 'dungeon_ruins', toExit: 'deep_entrance', label: 'Верхний уровень', asset: 'stairs' },
    ]),
    wilderness_mountains: location('wilderness_mountains', 'mountains', 'Горы Ветра', {
      width: 60, height: 44, style: 'mountain',
    }, [
      { id: 'gate_east', x: 58, y: 22, to: 'city_start', toExit: 'gate_west', label: 'Ворота в город', asset: 'stairs' },
      { id: 'forest_trail', x: 10, y: 8, to: 'wilderness_forest', toExit: 'mountain_trail', label: 'Тропа в лес', asset: 'stairs' },
      { id: 'cave_entrance', x: 30, y: 40, to: 'dungeon_mountain_cave', toExit: 'mountain_exit', label: 'Пещерный вход', asset: 'stairs' },
      { id: 'desert_pass', x: 30, y: 4, to: 'wilderness_desert', toExit: 'mountain_pass', label: 'Перевал в пустыню', asset: 'stairs' },
    ]),
    dungeon_mountain_cave: location('dungeon_mountain_cave', 'dungeon', 'Пещеры Ветра', {
      width: 48, height: 34, style: 'cave',
    }, [
      { id: 'mountain_exit', x: 24, y: 1, to: 'wilderness_mountains', toExit: 'cave_entrance', label: 'Выход в горы', asset: 'stairs' },
      { id: 'deep_entrance', x: 24, y: 32, to: 'dungeon_mountain_deep', toExit: 'stairs_up', label: 'Глубокие пещеры', asset: 'stairs' },
    ]),
    dungeon_mountain_deep: location('dungeon_mountain_deep', 'dungeon', 'Пещеры: Магмовые Залы', {
      width: 52, height: 38, style: 'cave',
    }, [
      { id: 'stairs_up', x: 26, y: 1, to: 'dungeon_mountain_cave', toExit: 'deep_entrance', label: 'Верхний уровень', asset: 'stairs' },
    ]),
    wilderness_desert: location('wilderness_desert', 'desert', 'Пустыня Песков', {
      width: 64, height: 46, style: 'desert',
    }, [
      { id: 'gate_west', x: 2, y: 23, to: 'city_start', toExit: 'gate_east', label: 'Ворота в город', asset: 'stairs' },
      { id: 'mountain_pass', x: 10, y: 10, to: 'wilderness_mountains', toExit: 'desert_pass', label: 'Перевал в горы', asset: 'stairs' },
      { id: 'ruins_entrance', x: 55, y: 12, to: 'dungeon_desert_ruins', toExit: 'desert_exit', label: 'Руины в песках', asset: 'stairs' },
      { id: 'oasis', x: 32, y: 40, to: 'wilderness_oasis', toExit: 'desert_path', label: 'Оазис', asset: 'stairs' },
    ]),
    wilderness_oasis: location('wilderness_oasis', 'wilderness', 'Оазис Жизни', {
      width: 40, height: 30, style: 'forest',
    }, [
      { id: 'desert_path', x: 20, y: 2, to: 'wilderness_desert', toExit: 'oasis', label: 'Путь в пустыню', asset: 'stairs' },
      { id: 'sewer_entrance', x: 5, y: 15, to: 'dungeon_sewers', toExit: 'oasis_exit', label: 'Скрытый вход', asset: 'stairs' },
    ]),
    dungeon_desert_ruins: location('dungeon_desert_ruins', 'ruins', 'Песчаные Руины', {
      width: 48, height: 34, style: 'ruins',
    }, [
      { id: 'desert_exit', x: 24, y: 1, to: 'wilderness_desert', toExit: 'ruins_entrance', label: 'Выход в пустыню', asset: 'stairs' },
      { id: 'deep_entrance', x: 24, y: 32, to: 'dungeon_desert_deep', toExit: 'stairs_up', label: 'Подземные залы', asset: 'stairs' },
    ]),
    dungeon_desert_deep: location('dungeon_desert_deep', 'ruins', 'Руины: Запечатанные Сокровищницы', {
      width: 52, height: 38, style: 'ruins',
    }, [
      { id: 'stairs_up', x: 26, y: 1, to: 'dungeon_desert_ruins', toExit: 'deep_entrance', label: 'Верхний уровень', asset: 'stairs' },
    ]),
    dungeon_sewers: location('dungeon_sewers', 'sewers', 'Канализация Аргена', {
      width: 56, height: 40, style: 'sewer',
    }, [
      { id: 'swamp_exit', x: 10, y: 5, to: 'wilderness_swamp', toExit: 'sewer_entrance', label: 'Выход в болото', asset: 'stairs' },
      { id: 'ruins_exit', x: 46, y: 5, to: 'dungeon_ruins', toExit: 'sewer_entrance', label: 'Выход в руины', asset: 'stairs' },
      { id: 'oasis_exit', x: 28, y: 38, to: 'wilderness_oasis', toExit: 'sewer_entrance', label: 'Выход в оазис', asset: 'stairs' },
      { id: 'city_entrance', x: 28, y: 2, to: 'city_start', toExit: 'sewer_entrance', label: 'Секретный ход в город', asset: 'stairs' },
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

  // Задания — состояние забега, а не локации: прогресс, набранный в лесу,
  // не должен откатываться при возвращении в город.
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
    return true;
  }

  // Пустой переход — выход без локации за ним: на карту он не попадает,
  // иначе клик по вратам не уводил бы никуда.
  function linksToLocation(exit) {
    return !!getLocation(exit.to);
  }

  // Карта локации с её выходами: координаты ворот подгоняются
  // под сгенерированную карту, иначе выход вёл бы в стену.
  function buildLocation(loc, seed) {
    var map = RK.MapGen.generateLocation(loc.type, 1, seed, loc.gen.width, loc.gen.height,
      loc.gen.style);
    map.locationId = loc.id;
    map.locationName = loc.name;
    map.exits = loc.exits.filter(linksToLocation).map(function (exit) {
      var point = RK.MapGen.snapExitToWalkable(map, exit.x, exit.y);
      return Object.assign({}, exit, point || {});
    });
    return map;
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
      RK.GAME.floor = 1;
    }
    return map;
  }

  // Вход в локацию: карта либо генерируется впервые, либо берётся из сохранения.
  // Возвращает true, если локация уже посещалась и её состояние восстановлено.
  function enterLocation(target, entryExitId) {
    var saved = state.visited[target.id];
    var restored = !!(saved && saved.mapSnapshot);
    if (restored) restoreState(saved);
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
    state.current = target.id;
    var restored = enterLocation(target, entryExitId);
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
        if (index.length) raw = localStorage.getItem(runKey(index[0].id));
        else raw = localStorage.getItem(C.SAVE_KEY);
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
    if (!map.matrices || !Array.isArray(map.matrices.tiles)) return false;
    if (!Array.isArray(map.matrices.tiles) || map.matrices.tiles.length !== map.h) return false;
    if (!RK.World.getLocation(game.locationId)) return false;
    if (!Array.isArray(game.players) || !game.players.length) return false;
    return true;
  }

  function hasSavedRun() {
    if (typeof localStorage === 'undefined') return false;
    if (loadSaveIndex().length) return true;
    return loadRun() !== null;
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
    listSaves: listSaves,
  };
})();
