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

  function compute(px, py) {
    var mm = RK.Map;
    if (!mm) return;
    for (var y = 0; y < mm.h; y++) {
      for (var x = 0; x < mm.w; x++) {
        mm.vis[y][x] = false;
      }
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
        mm.vis[yy][xx] = true;
        mm.explored[yy][xx] = true;
      }
    }
  }

  RK.Fov = {
    lineOk: lineOk,
    compute: compute,
  };
})();