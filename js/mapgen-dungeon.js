// Генератор подземелья: комнаты, коридоры, двери, ловушки, зоны и лестница.
(function () {
  var C = RK.CONFIG;

  function generate(floor, runSeed, width, height, style, locationType) {
    var profile = RK.MapBase.locationProfile(locationType);
    var seed = ((runSeed || 0) + floor * 2654435761) >>> 0;
    RK.RNG.reset(seed);
    var g = RK.MapBase.emptyMap(floor, width, height, style, seed);
    g.locationType = locationType || null;

    var rooms = [];
    var roomEstimate = Math.max(8, Math.min(80,
      Math.round(g.w * g.h / 170 * profile.roomCountScale)));
    var roomVariation = Math.max(1, Math.round(roomEstimate * 0.2));
    var targetRooms = Math.max(6, roomEstimate + RK.RNG.int(-roomVariation, roomVariation));
    // Размер комнаты ограничен картой: профиль может требовать комнату шире, чем есть.
    var maxRoomW = Math.max(C.ROOM_MIN_W, Math.min(g.w - 4, Math.round(C.ROOM_MAX_W * profile.roomScale)));
    var maxRoomH = Math.max(C.ROOM_MIN_H, Math.min(g.h - 4, Math.round(C.ROOM_MAX_H * profile.roomScale)));
    // Крупные комнаты влезают в карту реже, поэтому и попыток подбора больше.
    var attemptBudget = Math.max(1, Math.round(targetRooms * 60 * profile.roomScale));
    var attempts = 0;
    while (rooms.length < targetRooms && attempts < attemptBudget) {
      attempts++;
      var rw = RK.RNG.int(Math.min(C.ROOM_MIN_W, maxRoomW), maxRoomW);
      var rh = RK.RNG.int(Math.min(C.ROOM_MIN_H, maxRoomH), maxRoomH);
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
        area: rw * rh,
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

    var extraLinks = RK.RNG.int(0, profile.extraLinks);
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
        var dist = RK.Pathfind.manhattan(rooms[spawnIdx].cx, rooms[spawnIdx].cy, rooms[si].cx, rooms[si].cy);
        if (dist > bestD) {
          bestD = dist;
          best = si;
        }
      }
      stairIdx = best;
    }
    g.spawn = { x: rooms[spawnIdx].cx, y: rooms[spawnIdx].cy };
    g.stair = { x: rooms[stairIdx].cx, y: rooms[stairIdx].cy, asset: 'stairs' };
    if (n === 1) {
      var only = rooms[0];
      g.stair = { x: only.x + only.w - 1, y: only.y + only.h - 1, asset: 'stairs' };
      if (g.stair.x === g.spawn.x && g.stair.y === g.spawn.y) {
        g.stair.x = only.x;
        g.stair.y = only.y;
      }
    }

    g.tavern = chooseTavern(g, rooms, spawnIdx, stairIdx);

    g.blood = [];
    for (var fy = 0; fy < g.h; fy++) {
      for (var fx = 0; fx < g.w; fx++) {
        if (g.tiles[fy][fx] === 1) g.floorTypes[fy][fx] = RK.RNG.int(0, 2);
        g.wallTypes[fy][fx] = RK.RNG.int(0, 2);
      }
    }
    RK.MapBase.assignRegions(g, rooms);
    g.zones = placeZones(g);
    g.torches = RK.MapBase.placeTorches(g);
    g.floor = floor;
    g.doors = placeDoors(g);
    g.traps = placeTraps(g);
    g.decorations = RK.MapDecor.placeDecorations(g);

    RK.Map = g;
    return g;
  }

  function placeDoors(g) {
    var candidates = [];
    for (var y = 1; y < g.h - 1; y++) {
      for (var x = 1; x < g.w - 1; x++) {
        if (g.tiles[y][x] !== 1 || inRoom(g.rooms, x, y)) continue;
        var vertical = g.tiles[y - 1][x] === 1 && g.tiles[y + 1][x] === 1 &&
          g.tiles[y][x - 1] === 0 && g.tiles[y][x + 1] === 0;
        var horizontal = g.tiles[y][x - 1] === 1 && g.tiles[y][x + 1] === 1 &&
          g.tiles[y - 1][x] === 0 && g.tiles[y + 1][x] === 0;
        if (!vertical && !horizontal) continue;
        if ((x === g.spawn.x && y === g.spawn.y) || (x === g.stair.x && y === g.stair.y)) continue;
        candidates.push({ x: x, y: y, orientation: vertical ? 'vertical' : 'horizontal' });
      }
    }
    var doors = [];
    var target = Math.min(3, Math.floor(g.rooms.length / 4), candidates.length);
    while (doors.length < target && candidates.length) {
      var index = RK.RNG.int(0, candidates.length - 1);
      var candidate = candidates.splice(index, 1)[0];
      var separated = true;
      for (var i = 0; i < doors.length; i++) {
        if (RK.Pathfind.manhattan(candidate.x, candidate.y, doors[i].x, doors[i].y) < 8) {
          separated = false;
          break;
        }
      }
      if (!separated) continue;
      var locked = doors.length === 0 && RK.RNG.chance(0.3);
      doors.push({
        x: candidate.x,
        y: candidate.y,
        asset: 'door',
        orientation: candidate.orientation,
        state: locked ? 'locked' : 'closed',
        keyId: 'iron',
        hp: 6 + Math.floor(g.floor * 0.5),
        maxHp: 6 + Math.floor(g.floor * 0.5),
      });
    }
    return doors;
  }

  function inRoom(rooms, x, y) {
    for (var i = 0; i < rooms.length; i++) {
      var room = rooms[i];
      if (x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h) return true;
    }
    return false;
  }

  function placeTraps(g) {
    var traps = [];
    if (!g.rooms.length) return traps;
    var target = Math.max(2, Math.min(8, Math.floor(g.rooms.length / 3) + Math.max(0, g.floor - 1)));
    var attempts = 0;
    while (traps.length < target && attempts < target * 80) {
      attempts++;
      var room = g.rooms[RK.RNG.int(0, g.rooms.length - 1)];
      var x = RK.RNG.int(room.x, room.x + room.w - 1);
      var y = RK.RNG.int(room.y, room.y + room.h - 1);
      if (g.tiles[y][x] !== 1) continue;
      if (RK.Pathfind.manhattan(x, y, g.spawn.x, g.spawn.y) < C.SPAWN_CLEARANCE) continue;
      if (RK.Pathfind.manhattan(x, y, g.stair.x, g.stair.y) < C.STAIR_CLEARANCE) continue;
      if (RK.MapObjects.getDoorAt(x, y) || RK.MapObjects.getChestAt(x, y)) continue;
      var occupied = false;
      for (var i = 0; i < traps.length; i++) {
        if (traps[i].x === x && traps[i].y === y) {
          occupied = true;
          break;
        }
      }
      if (occupied) continue;
      var kinds = C.TRAP_TYPES;
      traps.push({
        x: x,
        y: y,
        asset: 'trap',
        type: kinds[RK.RNG.int(0, kinds.length - 1)],
        state: 'armed',
        damage: C.trapDamage(g.floor),
      });
    }
    return traps;
  }

  function placeZones(g) {
    var zones = [];
    var count = Math.max(3, Math.min(9, Math.round(g.w * g.h / 700)));
    var kinds = Object.keys(C.ZONES);
    for (var i = 0; i < count; i++) {
      var center = null;
      var radius = RK.RNG.int(2, 4);
      for (var attempt = 0; attempt < 60 && !center; attempt++) {
        var candidate = RK.Pathfind.randomFloorFromMap(g, g.spawn.x, g.spawn.y, Math.max(g.w, g.h), 7);
        if (!candidate || RK.Pathfind.manhattan(candidate.x, candidate.y, g.stair.x, g.stair.y) < 6) continue;
        var separated = true;
        for (var zi = 0; zi < zones.length; zi++) {
          if (RK.Pathfind.manhattan(candidate.x, candidate.y, zones[zi].x, zones[zi].y) <
              radius + zones[zi].radius + 2) {
            separated = false;
            break;
          }
        }
        if (separated) center = candidate;
      }
      if (!center) continue;
      var type = kinds[i % kinds.length];
      var zone = { type: type, x: center.x, y: center.y, radius: radius };
      if (type === 'regen') zone.name = 'зону регенерации';
      else if (type === 'attack') zone.name = 'зону усиления атаки';
      else if (type === 'weakAttack') zone.name = 'зону ослабления атаки';
      else zone.name = 'зону ослабления защиты';
      zones.push(zone);
    }
    return zones;
  }

  function chooseTavern(g, rooms, spawnIdx, stairIdx) {
    var bestRoom = null;
    var bestArea = -1;
    for (var ri = 0; ri < rooms.length; ri++) {
      if (ri === spawnIdx || ri === stairIdx) continue;
      var room = rooms[ri];
      if (room.area >= C.TAVERN_MIN_ROOM_AREA && room.area > bestArea) {
        bestArea = room.area;
        bestRoom = room;
      }
    }
    if (!bestRoom) return null;
    return {
      roomIndex: rooms.indexOf(bestRoom),
      x: bestRoom.x,
      y: bestRoom.y,
      w: bestRoom.w,
      h: bestRoom.h,
    };
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

  RK.MapGenDungeon = {
    generate: generate,
  };
})();
