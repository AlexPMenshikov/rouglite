// Фасад карты: локация целиком и общий доступ к модулям генерации.
// Каждый модуль отвечает за своё: кодек матриц, объекты карты, путь,
// декорации, подземелье, город. Здесь они собираются в один RK.MapGen,
// потому что его набор имён — контракт для остальной игры.
(function () {
  var C = RK.CONFIG;

  function generateLocation(type, floor, runSeed, width, height, style) {
    var typeDef = C.LOCATION_TYPES[type];
    if (!typeDef) throw new Error('Неизвестный тип локации: ' + type);
    if (type === 'city') return RK.MapGenCity.generateCity(floor, runSeed, width, height, style, type);
    // Ярус участвует в зерне: каждый этаж данжа получает свою планировку.
    if (type === 'wilderness' || type === 'mountains' || type === 'desert') {
      return placeWilderness(RK.MapGenDungeon.generate(floor, runSeed, width, height, style, type));
    }
    return RK.MapGenDungeon.generate(floor, runSeed, width, height, style, type);
  }

  function placeWilderness(g) {
    var biomes = ['forest', 'clearing', 'ruins'];
    var roomCenters = g.rooms.slice().sort(function (a, b) {
      return a.cy - b.cy || a.cx - b.cx;
    });
    var pois = [];
    var used = Object.create(null);
    for (var i = 0; i < roomCenters.length && pois.length < 3; i++) {
      var room = roomCenters[i];
      var key = room.cx + ',' + room.cy;
      if (used[key] || (g.spawn.x === room.cx && g.spawn.y === room.cy)) continue;
      used[key] = true;
      pois.push({
        id: 'poi_' + (pois.length + 1),
        x: room.cx,
        y: room.cy,
        type: biomes[pois.length],
        name: ['Лесная поляна', 'Заросшая роща', 'Древние руины'][pois.length],
      });
    }
    g.pois = pois;

    // Дороги по уже проходимым коридорам соединяют спавн с тремя точками интереса.
    g.roads = [];
    var roadKeys = Object.create(null);
    for (var pi = 0; pi < pois.length; pi++) {
      var path = RK.Pathfind.findPathOnMap(g, g.spawn.x, g.spawn.y, pois[pi].x, pois[pi].y, null) || [];
      for (var si = 0; si < path.length; si++) {
        var roadKey = path[si].x + ',' + path[si].y;
        if (roadKeys[roadKey]) continue;
        roadKeys[roadKey] = true;
        g.roads.push({ x: path[si].x, y: path[si].y });
      }
    }
    return g;
  }

  RK.Map = null;
  RK.MapGen = {
    generateLocation: generateLocation,
    MATRIX_FIELDS: RK.MapCodec.MATRIX_FIELDS,
    MAP_STATE_FIELDS: RK.MapCodec.MAP_STATE_FIELDS,
    MAP_STATIC_FIELDS: RK.MapCodec.MAP_STATIC_FIELDS,
    encodeMatrix: RK.MapCodec.encodeMatrix,
    decodeMatrix: RK.MapCodec.decodeMatrix,
    encodeMatrices: RK.MapCodec.encodeMatrices,
    decodeMatrices: RK.MapCodec.decodeMatrices,
    isInside: RK.MapObjects.isInside,
    getDoorAt: RK.MapObjects.getDoorAt,
    getChestAt: RK.MapObjects.getChestAt,
    getTrapAt: RK.MapObjects.getTrapAt,
    getTavern: RK.MapObjects.getTavern,
    isInTavern: RK.MapObjects.isInTavern,
    addBlood: RK.MapObjects.addBlood,
    isMapWalkable: RK.Pathfind.isMapWalkable,
    isWalkable: RK.Pathfind.isWalkable,
    manhattan: RK.Pathfind.manhattan,
    findPath: RK.Pathfind.findPath,
    findPathOnMap: RK.Pathfind.findPathOnMap,
    findPathNear: RK.Pathfind.findPathNear,
    randomFloorNear: RK.Pathfind.randomFloorNear,
    snapExitToWalkable: RK.Pathfind.snapExitToWalkable,
    placeDecorations: RK.MapDecor.placeDecorations,
    generate: RK.MapGenDungeon.generate,
    getBuilding: RK.MapGenCity.getBuilding,
  };
})();
