// Граф локаций мира. Локация — сцена с профилем MapGen + системами (NPC, квесты,
// спавн, правила перехода). Мир — граф локаций: игрок перемещается по рёбрам
// (пути, порталы, двери). Состояние каждой локации сохраняется при уходе и
// восстанавливается при возврате.
(function () {
  var C = RK.CONFIG;

  // Определение локации: профиль генерации + точки входа/выхода.
  function LocationDef(id, type, name, gen, exits) {
    this.id = id;
    this.type = type;
    this.name = name;
    this.gen = gen; // { width, height, style, floors }
    this.exits = exits || []; // [{ id, x, y, to, toExit, label, asset }]
  }

  // Реестр локаций мира.
  var LOCATIONS = {
    city_start: new LocationDef('city_start', 'city', 'Город Арген', {
      width: 48, height: 34, style: 'stone', floors: false,
    }, [
      { id: 'gate_north', x: 24, y: 1, to: 'wilderness_forest', toExit: 'gate_south', label: 'Ворота на север', asset: 'stairs' },
    ]),
    wilderness_forest: new LocationDef('wilderness_forest', 'wilderness', 'Лес Ворона', {
      width: 64, height: 46, style: 'cave', floors: false,
    }, [
      { id: 'gate_south', x: 32, y: 44, to: 'city_start', toExit: 'gate_north', label: 'Ворота на юг', asset: 'stairs' },
      { id: 'cave_entrance', x: 50, y: 10, to: 'dungeon_crypt', toExit: 'stairs_up', label: 'Вход в склеп', asset: 'stairs' },
    ]),
    dungeon_crypt: new LocationDef('dungeon_crypt', 'crypt', 'Склеп Тёмного', {
      width: 48, height: 34, style: 'crypt', floors: true,
    }, [
      { id: 'stairs_up', x: 24, y: 1, to: 'wilderness_forest', toExit: 'cave_entrance', label: 'Вход в склеп', asset: 'stairs' },
    ]),
  };

  // Состояние мира: текущая локация + снимки состояния посещённых локаций.
  var state = {
    current: null,
    visited: {}, // id -> { floor, playerPos, mapSnapshot }
  };

  // Получить определение локации по id.
  function getLocation(id) {
    return LOCATIONS[id] || null;
  }

  // Список всех локаций.
  function listLocations() {
    return Object.keys(LOCATIONS).map(function (id) { return LOCATIONS[id]; });
  }

  // Точки входа/выхода локации.
  function getExits(locationId) {
    var loc = getLocation(locationId);
    return loc ? loc.exits : [];
  }

  // Переход в другую локацию через точку выхода.
  function travel(exitId) {
    var loc = getLocation(state.current);
    if (!loc) return false;
    var exit = null;
    for (var i = 0; i < loc.exits.length; i++) {
      if (loc.exits[i].id === exitId) { exit = loc.exits[i]; break; }
    }
    if (!exit) return false;
    var target = getLocation(exit.to);
    if (!target) return false;

    // Сохраняем состояние текущей локации.
    saveCurrentState();

    // Переходим в целевую локацию.
    state.current = target.id;
    var visited = state.visited[target.id];
    if (visited) {
      // Восстанавливаем состояние.
      restoreState(visited);
    } else {
      // Первый визит — генерируем локацию.
      generateLocation(target);
    }
    return true;
  }

  // Сохранить состояние текущей локации.
  function saveCurrentState() {
    if (!state.current) return;
    var loc = getLocation(state.current);
    if (!loc) return;
    var g = RK.Map;
    var p = RK.GAME && RK.GAME.player;
    state.visited[state.current] = {
      floor: RK.GAME ? RK.GAME.floor : 1,
      playerPos: p ? { x: p.x, y: p.y } : null,
      mapSnapshot: g ? {
        rooms: g.rooms,
        doors: g.doors,
        chests: g.chests,
        traps: g.traps,
        torches: g.torches,
        decorations: g.decorations,
        zones: g.zones,
        blood: g.blood,
        explored: g.explored,
      } : null,
    };
  }

  // Восстановить состояние локации.
  function restoreState(visited) {
    if (!visited) return;
    if (RK.GAME) RK.GAME.floor = visited.floor;
    if (visited.mapSnapshot && RK.Map) {
      var g = RK.Map;
      g.rooms = visited.mapSnapshot.rooms;
      g.doors = visited.mapSnapshot.doors;
      g.chests = visited.mapSnapshot.chests;
      g.traps = visited.mapSnapshot.traps;
      g.torches = visited.mapSnapshot.torches;
      g.decorations = visited.mapSnapshot.decorations;
      g.zones = visited.mapSnapshot.zones;
      g.blood = visited.mapSnapshot.blood;
      g.explored = visited.mapSnapshot.explored;
    }
  }

  // Сгенерировать локацию впервые.
  function generateLocation(loc) {
    var g = RK.MapGen.generate(1, RK.RNG.randomSeed(), loc.gen.width, loc.gen.height, loc.gen.style);
    g.locationId = loc.id;
    g.locationName = loc.name;
    g.locationType = loc.type;
    // Корректируем координаты точек выхода: они должны быть на проходимых клетках.
    g.exits = loc.exits.map(function (exit) {
      var snapped = RK.MapGen.snapExitToWalkable(g, exit.x, exit.y);
      if (!snapped) return exit;
      return Object.assign({}, exit, { x: snapped.x, y: snapped.y });
    });
    // Устанавливаем игрока на стартовую позицию.
    if (RK.GAME && RK.GAME.player) {
      RK.GAME.player.x = g.spawn.x;
      RK.GAME.player.y = g.spawn.y;
    }
    return g;
  }

  // Инициализация мира: первая локация.
  function init() {
    var startId = C.WORLD_START_LOCATION || 'city_start';
    state.current = startId;
    state.visited = {};
    var loc = getLocation(startId);
    if (!loc) return false;
    generateLocation(loc);
    return true;
  }

  // Текущая локация.
  function current() {
    return state.current ? getLocation(state.current) : null;
  }

  // Состояние мира (для отладки/сохранения).
  function getState() {
    return state;
  }

  RK.World = {
    init: init,
    travel: travel,
    current: current,
    getLocation: getLocation,
    listLocations: listLocations,
    getExits: getExits,
    getState: getState,
    saveCurrentState: saveCurrentState,
    restoreState: restoreState,
    generateLocation: generateLocation,
  };
})();
