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
    return LOCATIONS[id] || null;
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
        merchant: clone(game.merchant),
        blacksmith: clone(game.blacksmith),
        merchantOffer: clone(game.merchantOffer),
        placedLocationItems: clone(game.placedLocationItems),
        quests: clone(game.quests),
        quest: clone(game.quest),
        questSeq: game.questSeq,
      } : null,
    };
  }

  function restoreState(visited) {
    if (!visited || !visited.mapSnapshot) return false;
    RK.Map = clone(visited.mapSnapshot);
    if (!RK.GAME) return true;
    var game = visited.gameSnapshot || {};
    RK.GAME.floor = visited.floor;
    RK.GAME.enemies = clone(game.enemies || []);
    RK.GAME.items = clone(game.items || []);
    RK.GAME.merchant = clone(game.merchant);
    RK.GAME.blacksmith = clone(game.blacksmith);
    RK.GAME.merchantOffer = clone(game.merchantOffer);
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

  function generateLocation(loc) {
    var seed = RK.GAME && RK.GAME.runSeed ? RK.GAME.runSeed : RK.RNG.randomSeed();
    var map = RK.MapGen.generateLocation(loc.type, 1, seed, loc.gen.width, loc.gen.height, loc.gen.style);
    map.locationId = loc.id;
    map.locationName = loc.name;
    map.exits = loc.exits.map(function (exit) {
      var point = RK.MapGen.snapExitToWalkable(map, exit.x, exit.y);
      return Object.assign({}, exit, point || {});
    });
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
        }
        return map;
      }
      if (attempt === 4) break;
      map = RK.MapGen.generateLocation(loc.type, 1, (seed + attempt + 1) >>> 0,
        loc.gen.width, loc.gen.height, loc.gen.style);
      map.locationId = loc.id;
      map.locationName = loc.name;
      map.exits = loc.exits.map(function (exit) {
        var point = RK.MapGen.snapExitToWalkable(map, exit.x, exit.y);
        return Object.assign({}, exit, point || {});
      });
    }
    throw new Error('Не удалось найти проходимые выходы локации ' + loc.id);
  }

  function enterLocation(target, entryExitId) {
    var visited = state.visited[target.id];
    if (visited) restoreState(visited);
    else generateLocation(target);

    if (visited && RK.GAME && RK.GAME.players) {
      for (var playerIndex = 0; playerIndex < RK.GAME.players.length; playerIndex++) {
        var member = RK.GAME.players[playerIndex];
        if (member.id !== RK.GAME.player.id) {
          member.x = RK.GAME.player.x;
          member.y = RK.GAME.player.y;
        }
      }
    }
    if (entryExitId && RK.Map && RK.GAME && RK.GAME.player) {
      var entry = RK.Map.exits.find(function (exit) { return exit.id === entryExitId; });
      var from = visited ? RK.GAME.player : RK.Map.spawn;
      if (entry && RK.MapGen.isMapWalkable(RK.Map, entry.x, entry.y) &&
          (from.x === entry.x && from.y === entry.y ||
            RK.MapGen.findPathOnMap(RK.Map, from.x, from.y, entry.x, entry.y, null))) {
        RK.GAME.player.x = entry.x;
        RK.GAME.player.y = entry.y;
      }
    }
    if (RK.GAME) {
      RK.GAME.locationId = target.id;
      RK.GAME.locationMode = true;
      RK.GAME.activeZone = null;
    }
    return true;
  }

  function travel(exitId) {
    var loc = current();
    if (!loc) return false;
    var exit = loc.exits.find(function (candidate) { return candidate.id === exitId; });
    var target = exit && getLocation(exit.to);
    if (!target) return false;

    var targetState = state.visited[target.id];
    if (!targetState) {
      generateLocation(target);
      targetState = { floor: 1, mapSnapshot: clone(RK.Map), gameSnapshot: null };
    }
    saveCurrentState();
    state.current = target.id;
    state.visited[target.id] = targetState;
    enterLocation(target, exit.toExit);
    if (!state.visited[target.id].gameSnapshot) saveCurrentState();
    return true;
  }

  function init() {
    var start = getLocation(C.WORLD_START_LOCATION || 'city_start');
    if (!start || !C.LOCATION_TYPES[start.type]) return false;
    state.current = start.id;
    state.visited = Object.create(null);
    return enterLocation(start);
  }

  function setState(next) {
    if (!next || !getLocation(next.current) || !next.visited || typeof next.visited !== 'object') return false;
    var visited = Object.create(null);
    Object.keys(next.visited).forEach(function (id) {
      var record = next.visited[id];
      if (LOCATIONS[id] && record && record.mapSnapshot &&
          Array.isArray(record.mapSnapshot.tiles) && Number.isFinite(record.floor)) {
        visited[id] = clone(record);
      }
    });
    if (!visited[next.current]) return false;
    state.current = next.current;
    state.visited = visited;
    return true;
  }

  RK.World = {
    init: init,
    travel: travel,
    current: current,
    getLocation: getLocation,
    listLocations: listLocations,
    getExits: getExits,
    getState: function () { return clone(state); },
    saveCurrentState: saveCurrentState,
    restoreState: restoreState,
    generateLocation: generateLocation,
    setState: setState,
  };
})();
