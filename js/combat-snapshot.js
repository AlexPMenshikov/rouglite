(function () {
  // Разворот сжатой карты из снимка: матрицы превращаются в обычные строки,
  // a vis остаётся пустой сеткой — обзор каждый клиент считает сам.
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

  RK.Combat = RK.Combat || {};
  RK.Combat.restoreMap = restoreMap;
})();