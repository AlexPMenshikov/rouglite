(function () {
  // Кодек снимка карты живёт здесь: кодировать (createSnapshot) и
  // разворачивать (restoreMap) нужно рядом, иначе список полей разойдётся.
  // createSnapshot читает состояние забега через RK.GAME — локальной M у нас нет,
  // зато единый источник состояния есть у combat.

  function createSnapshot() {
    if (!RK.GAME || !RK.Map) return null;
    var M = RK.GAME;
    var map = JSON.parse(JSON.stringify(RK.Map));
    // Матрицы карты жмутся в map.matrices: в разы меньше символов, а снимок
    // уходит на каждый шаг. Разворачивает их restoreMap.
    var matrices = RK.MapGen.encodeMatrices(map);
    RK.MapGen.MATRIX_FIELDS.forEach(function (field) { delete map[field]; });
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

  function restoreMap(snapshotMap) {
    var map = snapshotMap;
    var matrices = map.matrices;
    if (!matrices) return map;
    var width = Number.isInteger(map.w) ? map.w : 0;
    var height = Number.isInteger(map.h) ? map.h : 0;
    if (!width || !height) return null;
    var decoded = RK.MapGen.decodeMatrices(matrices, width, height);
    if (!decoded) return null;
    map = Object.assign({}, map, decoded);
    delete map.matrices;
    if (!Array.isArray(map.vis)) {
      var vis = [];
      for (var y = 0; y < height; y++) vis.push(new Array(width).fill(false));
      map.vis = vis;
    }
    return map;
  }

  // Отдельный модуль + патч RK.Combat: combat держит старый API, внешние
  // вызовы получают перенесённую реализацию без дубликата.
  var api = { createSnapshot: createSnapshot, restoreMap: restoreMap };
  RK.CombatSnapshot = api;
  RK.Combat = RK.Combat || {};
  RK.Combat.createSnapshot = createSnapshot;
  RK.Combat.restoreMap = restoreMap;
})();