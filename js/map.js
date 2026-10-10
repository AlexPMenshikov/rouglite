(function () {
  var C = RK.CONFIG;

  function generate(floor, runSeed) {
    var seed = ((runSeed || 0) + floor * 2654435761) >>> 0;
    RK.RNG.reset(seed);
    var g = {
      w: C.COLS,
      h: C.ROWS,
      tiles: [],
      rooms: [],
      stair: null,
      spawn: null,
      explored: [],
      vis: [],
      seed: seed,
    };
    for (var y = 0; y < g.h; y++) {
      g.tiles[y] = [];
      g.explored[y] = [];
      g.vis[y] = [];
      for (var x = 0; x < g.w; x++) {
        g.tiles[y][x] = 0;
        g.explored[y][x] = false;
        g.vis[y][x] = false;
      }
    }

    var rooms = [];
    var targetRooms = RK.RNG.int(6, 11);
    var attempts = 0;
    while (rooms.length < targetRooms && attempts < 320) {
      attempts++;
      var rw = RK.RNG.int(C.ROOM_MIN_W, C.ROOM_MAX_W);
      var rh = RK.RNG.int(C.ROOM_MIN_H, C.ROOM_MAX_H);
      var rx = RK.RNG.int(1, g.w - rw - 2);
      var ry = RK.RNG.int(1, g.h - rh - 2);
      var overlapped = false;
      for (var i = 0; i < rooms.length; i++) {
        var o = rooms[i];
        if (rx < o.x + o.w + 1 && rx + rw + 1 > o.x && ry < o.y + o.h + 1 && ry + rh + 1 > o.y) {
          overlapped = true;
          break;
        }
      }
      if (overlapped) continue;
      var room = {
        x: rx,
        y: ry,
        w: rw,
        h: rh,
        cx: Math.floor(rx + rw / 2),
        cy: Math.floor(ry + rh / 2),
      };
      carve(g, room);
      rooms.push(room);
    }

    var n = rooms.length;
    for (var c = 1; c < n; c++) {
      var a = rooms[c - 1];
      var b = rooms[c];
      if (RK.RNG.chance(0.5)) {
        connectH(g, a.cx, b.cx, a.cy);
        connectV(g, a.cy, b.cy, b.cx);
      } else {
        connectV(g, a.cy, b.cy, a.cx);
        connectH(g, a.cx, b.cx, b.cy);
      }
    }

    var extraLinks = RK.RNG.int(0, 2);
    for (var link = 0; link < extraLinks && n > 2; link++) {
      var ri = RK.RNG.int(0, n - 1);
      var rj = RK.RNG.int(0, n - 1);
      if (ri === rj) continue;
      var ra = rooms[ri];
      var rb = rooms[rj];
      if (RK.RNG.chance(0.5)) {
        connectH(g, ra.cx, rb.cx, ra.cy);
        connectV(g, ra.cy, rb.cy, rb.cx);
      } else {
        connectV(g, ra.cy, rb.cy, ra.cx);
        connectH(g, ra.cx, rb.cx, rb.cy);
      }
    }

    g.rooms = rooms;
    var spawnIdx = 0;
    var stairIdx = n - 1;
    if (n > 1) {
      var best = 1;
      var bestD = -1;
      for (var si = 1; si < n; si++) {
        var dist = manhattan(rooms[spawnIdx].cx, rooms[spawnIdx].cy, rooms[si].cx, rooms[si].cy);
        if (dist > bestD) {
          bestD = dist;
          best = si;
        }
      }
      stairIdx = best;
    }
    g.spawn = { x: rooms[spawnIdx].cx, y: rooms[spawnIdx].cy };
    g.stair = { x: rooms[stairIdx].cx, y: rooms[stairIdx].cy };
    if (n === 1) {
      var only = rooms[0];
      g.stair = { x: only.x + only.w - 1, y: only.y + only.h - 1 };
      if (g.stair.x === g.spawn.x && g.stair.y === g.spawn.y) {
        g.stair.x = only.x;
        g.stair.y = only.y;
      }
    }

    g.blood = [];
    g.torches = placeTorches(g);
    g.floor = floor;

    RK.Map = g;
    return g;
  }

  function placeTorches(g) {
    var list = [];
    var spacing = C.TORCH ? C.TORCH.SPACING : 5;
    var candidates = [];

    for (var ri = 0; ri < g.rooms.length; ri++) {
      var room = g.rooms[ri];
      var corners = [
        [{ x: room.x - 1, y: room.y, dx: 1, dy: 0 }, { x: room.x, y: room.y - 1, dx: 0, dy: 1 }],
        [{ x: room.x + room.w, y: room.y, dx: -1, dy: 0 }, { x: room.x + room.w - 1, y: room.y - 1, dx: 0, dy: 1 }],
        [{ x: room.x - 1, y: room.y + room.h - 1, dx: 1, dy: 0 }, { x: room.x, y: room.y + room.h, dx: 0, dy: -1 }],
        [{ x: room.x + room.w, y: room.y + room.h - 1, dx: -1, dy: 0 }, { x: room.x + room.w - 1, y: room.y + room.h, dx: 0, dy: -1 }],
      ];
      for (var ci = 0; ci < corners.length; ci++) {
        var choices = corners[ci];
        if (RK.RNG.chance(0.5)) {
          var first = choices[0];
          choices[0] = choices[1];
          choices[1] = first;
        }
        for (var choiceIndex = 0; choiceIndex < choices.length; choiceIndex++) {
          var corner = choices[choiceIndex];
          if (corner.x < 1 || corner.y < 1 || corner.x >= g.w - 1 || corner.y >= g.h - 1) continue;
          if (g.tiles[corner.y][corner.x] !== 0 ||
              g.tiles[corner.y + corner.dy][corner.x + corner.dx] !== 1) continue;
          if (RK.RNG.chance(0.42)) candidates.push(corner);
          break;
        }
      }
    }

    for (var ci2 = candidates.length - 1; ci2 > 0; ci2--) {
      var swap = RK.RNG.int(0, ci2);
      var temp = candidates[ci2];
      candidates[ci2] = candidates[swap];
      candidates[swap] = temp;
    }
    for (var i = 0; i < candidates.length; i++) {
      var t = candidates[i];
      if (list.length && !RK.RNG.chance(0.65)) continue;
      var near = false;
      for (var j = 0; j < list.length; j++) {
        if (manhattan(t.x, t.y, list[j].x, list[j].y) < spacing) {
          near = true;
          break;
        }
      }
      if (near) continue;
      list.push({
        x: t.x + t.dx,
        y: t.y + t.dy,
        dx: t.dx,
        dy: t.dy,
        phase: ((t.x + t.dx) * 17 + (t.y + t.dy) * 31) % 100,
      });
    }
    if (!list.length && candidates.length) {
      var fallback = candidates[RK.RNG.int(0, candidates.length - 1)];
      list.push({
        x: fallback.x + fallback.dx,
        y: fallback.y + fallback.dy,
        dx: fallback.dx,
        dy: fallback.dy,
        phase: ((fallback.x + fallback.dx) * 17 + (fallback.y + fallback.dy) * 31) % 100,
      });
    }
    return list;
  }

  function addBlood(x, y, strength) {
    var mm = RK.Map;
    if (!mm || !mm.blood) return;
    if (!isInside(x, y) || mm.tiles[y][x] !== 1) return;
    var amt = strength == null ? 1 : strength;
    var max = C.BLOOD_MAX || 180;
    mm.blood.push({
      x: x,
      y: y,
      ox: (RK.RNG.rand() - 0.5) * 0.55,
      oy: (RK.RNG.rand() - 0.5) * 0.55,
      r: 0.18 + RK.RNG.rand() * 0.28 * amt,
      a: 0.35 + RK.RNG.rand() * 0.4,
      kind: RK.RNG.int(0, 2),
    });
    while (mm.blood.length > max) mm.blood.shift();
  }

  function carve(g, room) {
    for (var y = room.y; y < room.y + room.h; y++) {
      for (var x = room.x; x < room.x + room.w; x++) {
        g.tiles[y][x] = 1;
      }
    }
  }

  function connectH(g, x0, x1, y) {
    var from = Math.min(x0, x1);
    var to = Math.max(x0, x1);
    for (var x = from; x <= to; x++) g.tiles[y][x] = 1;
  }

  function connectV(g, y0, y1, x) {
    var from = Math.min(y0, y1);
    var to = Math.max(y0, y1);
    for (var y = from; y <= to; y++) g.tiles[y][x] = 1;
  }

  function isInside(x, y) {
    var mm = RK.Map;
    return mm && x >= 0 && y >= 0 && x < mm.w && y < mm.h;
  }

  function isWalkable(x, y) {
    return isInside(x, y) && RK.Map.tiles[y][x] === 1;
  }

  function manhattan(x0, y0, x1, y1) {
    return Math.abs(x0 - x1) + Math.abs(y0 - y1);
  }

  function findPath(sx, sy, tx, ty, occ) {
    var mm = RK.Map;
    if (!mm || !isWalkable(tx, ty)) return null;
    if (occ && occ(tx, ty)) return null;
    if (sx === tx && sy === ty) return [];

    var prev = {};
    prev[sx + ',' + sy] = null;
    var q = [{ x: sx, y: sy }];
    var qs = 0;
    var found = null;
    var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    while (qs < q.length) {
      var cur = q[qs++];
      var ck = cur.x + ',' + cur.y;
      if (cur.x === tx && cur.y === ty) {
        found = cur;
        break;
      }
      for (var i = 0; i < 4; i++) {
        var nx = cur.x + nb[i][0];
        var ny = cur.y + nb[i][1];
        if (!isInside(nx, ny)) continue;
        var nk = nx + ',' + ny;
        if (prev[nk] !== undefined) continue;
        if (mm.tiles[ny][nx] !== 1) continue;
        if (occ && occ(nx, ny)) continue;
        prev[nk] = cur;
        q.push({ x: nx, y: ny });
      }
    }
    if (!found) return null;

    var path = [];
    var node = found;
    while (node) {
      path.push(node);
      var k2 = node.x + ',' + node.y;
      node = prev[k2];
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

  RK.Map = null;
  RK.MapGen = {
    generate: generate,
    isInside: isInside,
    isWalkable: isWalkable,
    manhattan: manhattan,
    findPath: findPath,
    findPathNear: findPathNear,
    randomFloorNear: randomFloorNear,
    addBlood: addBlood,
  };
})();