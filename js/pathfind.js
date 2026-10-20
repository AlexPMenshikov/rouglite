// Проходимость и путь: по ним бой ищет дорогу, а мир — доступные выходы.
(function () {

  function isMapWalkable(mm, x, y) {
    if (!mm || x < 0 || y < 0 || x >= mm.w || y >= mm.h || mm.tiles[y][x] !== 1) return false;
    var doors = mm.doors || [];
    for (var i = 0; i < doors.length; i++) {
      if (doors[i].x === x && doors[i].y === y && doors[i].state !== 'open' && doors[i].state !== 'broken') return false;
    }
    var chests = mm.chests || [];
    for (var j = 0; j < chests.length; j++) {
      if (chests[j].x === x && chests[j].y === y && chests[j].state !== 'open' && chests[j].state !== 'broken') return false;
    }
    return true;
  }

  function isWalkable(x, y) {
    return isMapWalkable(RK.Map, x, y);
  }

  function manhattan(x0, y0, x1, y1) {
    return Math.abs(x0 - x1) + Math.abs(y0 - y1);
  }

  function findPath(sx, sy, tx, ty, occ) {
    return findPathOnMap(RK.Map, sx, sy, tx, ty, occ);
  }

  function findPathOnMap(mm, sx, sy, tx, ty, occ) {
    if (!mm || !isMapWalkable(mm, tx, ty) || sx < 0 || sy < 0 || sx >= mm.w || sy >= mm.h) return null;
    if (occ && occ(tx, ty)) return null;
    if (sx === tx && sy === ty) return [];

    var prev = Object.create(null);
    var startKey = sx + ',' + sy;
    prev[startKey] = null;
    var q = [{ x: sx, y: sy }];
    var qs = 0;
    var found = null;
    var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    while (qs < q.length) {
      var cur = q[qs++];
      if (cur.x === tx && cur.y === ty) { found = cur; break; }
      for (var i = 0; i < 4; i++) {
        var nx = cur.x + nb[i][0];
        var ny = cur.y + nb[i][1];
        if (nx < 0 || ny < 0 || nx >= mm.w || ny >= mm.h) continue;
        var nk = nx + ',' + ny;
        if (Object.prototype.hasOwnProperty.call(prev, nk)) continue;
        if (!isMapWalkable(mm, nx, ny) || (occ && occ(nx, ny))) continue;
        prev[nk] = cur;
        q.push({ x: nx, y: ny });
      }
    }
    if (!found) return null;

    var path = [];
    var node = found;
    while (node) {
      path.push(node);
      node = prev[node.x + ',' + node.y];
    }
    path.reverse();
    path.shift();
    return path;
  }

  function findPathNear(sx, sy, tx, ty, occ) {
    var direct = findPath(sx, sy, tx, ty, occ);
    if (direct) return direct;
    var best = null;
    var bestLen = Infinity;
    var bestR = Infinity;
    for (var r = 1; r <= 3; r++) {
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          var nx = tx + dx;
          var ny = ty + dy;
          if (!isWalkable(nx, ny)) continue;
          if (occ && occ(nx, ny)) continue;
          if (nx === sx && ny === sy) return [];
          var p = findPath(sx, sy, nx, ny, occ);
          if (!p) continue;
          if (p.length < bestLen || (p.length === bestLen && r < bestR)) {
            bestLen = p.length;
            bestR = r;
            best = p;
          }
        }
      }
    }
    return best;
  }

  function randomFloorNear(cx, cy, radius, minDist) {
    var mm = RK.Map;
    if (!mm) return null;
    var candidates = [];
    var x0 = Math.max(0, cx - radius);
    var x1 = Math.min(mm.w - 1, cx + radius);
    var y0 = Math.max(0, cy - radius);
    var y1 = Math.min(mm.h - 1, cy + radius);
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        if (mm.tiles[y][x] !== 1) continue;
        var d = manhattan(x, y, cx, cy);
        if (d > radius) continue;
        if (RK.MapObjects.getDoorAt(x, y) || RK.MapObjects.getChestAt(x, y) || RK.MapObjects.getTrapAt(x, y)) continue;
        if (minDist && d < minDist) continue;
        if (mm.stair && x === mm.stair.x && y === mm.stair.y) continue;
        if (mm.spawn && x === mm.spawn.x && y === mm.spawn.y) continue;
        if (RK.Combat && RK.Combat.getEnemyAt && RK.Combat.getEnemyAt(x, y)) continue;
        candidates.push({ x: x, y: y });
      }
    }
    if (!candidates.length) return null;
    return candidates[RK.RNG.int(0, candidates.length - 1)];
  }

  function randomFloorFromMap(g, cx, cy, radius, minDist) {
    var candidates = [];
    var x0 = Math.max(0, cx - radius);
    var x1 = Math.min(g.w - 1, cx + radius);
    var y0 = Math.max(0, cy - radius);
    var y1 = Math.min(g.h - 1, cy + radius);
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        if (g.tiles[y][x] !== 1 || manhattan(x, y, cx, cy) < minDist) continue;
        if ((x === g.stair.x && y === g.stair.y) || (x === g.spawn.x && y === g.spawn.y)) continue;
        candidates.push({ x: x, y: y });
      }
    }
    if (!candidates.length) return null;
    return candidates[RK.RNG.int(0, candidates.length - 1)];
  }

  // Корректировка координат точки входа/выхода: если заданная клетка непроходима,
  // ищем ближайшую проходимую по расширяющимся кольцам. Радиус не ограничен тремя
  // клетками: выход у края карты иначе оставался бы в стене, и локация считалась бы
  // недостижимой. Спавн и лестница исключаются, иначе выход совпал бы с ними.
  function snapExitToWalkable(g, x, y) {
    // Прямое попадание тоже проверяем: ворота на спавне или на лестнице данжа
    // совпали бы с переходом и перехватили бы клик.
    var free = !(g.spawn && x === g.spawn.x && y === g.spawn.y) &&
      !(g.stair && x === g.stair.x && y === g.stair.y);
    if (x >= 0 && y >= 0 && x < g.w && y < g.h && isMapWalkable(g, x, y) && free) {
      return { x: x, y: y };
    }
    var limit = Math.max(g.w, g.h);
    for (var r = 1; r <= limit; r++) {
      var candidates = [];
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          var nx = x + dx;
          var ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
          if (g.spawn && nx === g.spawn.x && ny === g.spawn.y) continue;
          if (g.stair && nx === g.stair.x && ny === g.stair.y) continue;
          if (g.tiles[ny][nx] === 1 && isMapWalkable(g, nx, ny)) candidates.push({ x: nx, y: ny });
        }
      }
      candidates.sort(function (a, b) {
        var adx = a.x - x, ady = a.y - y;
        var bdx = b.x - x, bdy = b.y - y;
        var aa = Math.abs(adx) >= Math.abs(ady) ? (adx > 0 ? 0 : 2) : (ady > 0 ? 1 : 3);
        var ba = Math.abs(bdx) >= Math.abs(bdy) ? (bdx > 0 ? 0 : 2) : (bdy > 0 ? 1 : 3);
        return aa - ba;
      });
      if (candidates.length) return candidates[0];
    }
    return null;
  }

  RK.Pathfind = {
    isMapWalkable: isMapWalkable,
    isWalkable: isWalkable,
    manhattan: manhattan,
    findPath: findPath,
    findPathOnMap: findPathOnMap,
    findPathNear: findPathNear,
    randomFloorNear: randomFloorNear,
    // Зоны берут свободную клетку по той же карте, что и остальные.
    randomFloorFromMap: randomFloorFromMap,
    snapExitToWalkable: snapExitToWalkable,
  };
})();
