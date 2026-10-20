(function () {
  var C = RK.CONFIG;

  function lineOk(x0, y0, x1, y1) {
    var mm = RK.Map;
    var dx = Math.abs(x1 - x0);
    var dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1;
    var sy = y0 < y1 ? 1 : -1;
    var err = dx - dy;
    var cx = x0;
    var cy = y0;
    while (!(cx === x1 && cy === y1)) {
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
      if (!RK.MapGen.isInside(cx, cy)) return false;
      if (cx === x1 && cy === y1) return true;
      if (mm.tiles[cy][cx] === 0) return false;
      var door = RK.MapGen.getDoorAt(cx, cy);
      var chest = RK.MapGen.getChestAt(cx, cy);
      if (door && door.state !== 'open' && door.state !== 'broken') return false;
      if (chest && chest.state !== 'open' && chest.state !== 'broken') return false;
    }
    return true;
  }

  // Локация без тумана войны: видно всю карту сразу. Правило живёт в конфиге,
  // поэтому сервер и каждый клиент считают обзор одинаково — иначе в комнате
  // один игрок видел бы город целиком, а другой по своему обзору.
  function isAlwaysVisible(map) {
    var type = map && map.locationType && C.LOCATION_TYPES[map.locationType];
    return !!(type && type.alwaysVisible);
  }

  function computeVisibility(px, py) {
    var mm = RK.Map;
    if (!mm) return [];
    var visible = [];
    for (var y = 0; y < mm.h; y++) visible.push(new Array(mm.w).fill(false));
    if (isAlwaysVisible(mm)) {
      for (var vy = 0; vy < mm.h; vy++) visible[vy].fill(true);
      return visible;
    }
    var r = C.VIEW_RADIUS;
    if (RK.Narrator && RK.GAME) {
      r = Math.max(3, r + RK.Narrator.getMods(RK.GAME.turn).viewDelta);
    }
    for (var yy = py - r; yy <= py + r; yy++) {
      for (var xx = px - r; xx <= px + r; xx++) {
        if (!RK.MapGen.isInside(xx, yy)) continue;
        var d = (xx - px) * (xx - px) + (yy - py) * (yy - py);
        if (d > (r + 0.5) * (r + 0.5)) continue;
        if (!lineOk(px, py, xx, yy)) continue;
        visible[yy][xx] = true;
      }
    }
    return visible;
  }

  function compute(px, py) {
    var mm = RK.Map;
    if (!mm) return;
    var visible = computeVisibility(px, py);
    for (var y = 0; y < mm.h; y++) {
      for (var x = 0; x < mm.w; x++) {
        mm.vis[y][x] = visible[y][x];
        if (visible[y][x]) mm.explored[y][x] = true;
      }
    }
  }

  RK.Fov = {
    lineOk: lineOk,
    compute: compute,
    computeVisibility: computeVisibility,
    isAlwaysVisible: isAlwaysVisible,
  };
})();