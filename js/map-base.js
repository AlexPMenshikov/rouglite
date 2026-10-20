// Общее для генераторов: пустая карта, профиль локации, зоны и факелы.
(function () {
  var C = RK.CONFIG;

  function emptyMap(floor, width, height, style, seed) {
    var g = {
      w: width || C.COLS,
      h: height || C.ROWS,
      style: style || 'stone',
      tiles: [],
      floorTypes: [],
      regions: [],
      wallTypes: [],
      regionStyles: [],
      rooms: [],
      stair: null,
      spawn: null,
      doors: [],
      chests: [],
      traps: [],
      explored: [],
      vis: [],
      seed: seed,
    };
    for (var y = 0; y < g.h; y++) {
      g.tiles[y] = [];
      g.floorTypes[y] = [];
      g.regions[y] = [];
      g.wallTypes[y] = [];
      g.explored[y] = [];
      g.vis[y] = [];
      for (var x = 0; x < g.w; x++) {
        g.tiles[y][x] = 0;
        g.floorTypes[y][x] = 0;
        g.regions[y][x] = 0;
        g.wallTypes[y][x] = 0;
        g.explored[y][x] = false;
        g.vis[y][x] = false;
      }
    }
    return g;
  }

  // Профиль берётся по типу локации; этажи вне мира (legacy-режим, отладка)
  // генерируются с базовым профилем.
  function locationProfile(type) {
    return (type && C.LOCATION_GEN[type]) || C.DEFAULT_LOCATION_GEN;
  }

  // Локальная случайность по seed карты: не трогает RK.RNG, поэтому расстановка
  // ловушек, зон и врагов не сдвигается, когда меняется только оформление.
  function seededRandom(seed, salt) {
    var state = (seed ^ salt) >>> 0;
    return function () {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  // Регионы-залы: внутри локации 2–3 стиля оформления. Первый — стиль самой
  // локации, остальные берутся из профиля типа. Стартовые комнаты выбирает
  // локальная случайность по seed, остальные приписываются к ближайшему старту,
  // поэтому оформление меняется залами, а не отдельными клетками.
  function assignRegions(g, rooms) {
    var styleIds = Object.keys(C.MAP_STYLES);
    var mainStyle = C.MAP_STYLES[g.style] ? g.style : styleIds[0];
    var profile = C.LOCATION_GEN[g.locationType] || C.DEFAULT_LOCATION_GEN;
    var styles = regionStyleList(mainStyle, profile.regionStyles);
    var count = Math.min(styles.length, rooms.length);
    g.regionStyles = styles.slice(0, Math.max(1, count));

    for (var ri = 0; ri < rooms.length; ri++) rooms[ri].region = 0;
    if (count <= 1) return;

    var starts = pickRegionStarts(rooms, count, seededRandom(g.seed, 0x5f356495));
    for (var rj = 0; rj < rooms.length; rj++) {
      rooms[rj].region = nearestStartRegion(rooms, starts, rooms[rj]);
    }

    for (var y = 0; y < g.h; y++) {
      for (var x = 0; x < g.w; x++) {
        var bestRoom = null;
        var bestDistance = Infinity;
        for (var roomIndex = 0; roomIndex < rooms.length; roomIndex++) {
          var room = rooms[roomIndex];
          var dx = Math.max(room.x - x, 0, x - (room.x + room.w - 1));
          var dy = Math.max(room.y - y, 0, y - (room.y + room.h - 1));
          var distance = dx + dy;
          if (distance < bestDistance) {
            bestDistance = distance;
            bestRoom = room;
          }
        }
        if (bestRoom) g.regions[y][x] = bestRoom.region;
      }
    }
  }

  // Стили залов: стиль локации первым, дальше допустимые стили профиля без повторов.
  function regionStyleList(mainStyle, candidates) {
    var styles = [mainStyle];
    if (candidates) {
      for (var i = 0; i < candidates.length; i++) {
        if (C.MAP_STYLES[candidates[i]] && styles.indexOf(candidates[i]) < 0) styles.push(candidates[i]);
      }
    }
    return styles;
  }

  // K комнат-стартов: позиция в возвращённом списке — номер региона.
  function pickRegionStarts(rooms, count, random) {
    var order = [];
    for (var i = 0; i < rooms.length; i++) order.push(i);
    for (var j = order.length - 1; j > 0; j--) {
      var swap = Math.floor(random() * (j + 1));
      var tmp = order[j];
      order[j] = order[swap];
      order[swap] = tmp;
    }
    return order.slice(0, count);
  }

  // Ближайший старт по центрам комнат; его позиция — номер региона комнаты.
  function nearestStartRegion(rooms, starts, room) {
    var best = 0;
    var bestDistance = Infinity;
    for (var i = 0; i < starts.length; i++) {
      var start = rooms[starts[i]];
      var distance = Math.abs(start.cx - room.cx) + Math.abs(start.cy - room.cy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    return best;
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
        if (RK.Pathfind.manhattan(t.x, t.y, list[j].x, list[j].y) < spacing) {
          near = true;
          break;
        }
      }
      if (near) continue;
      list.push({
        x: t.x + t.dx,
        y: t.y + t.dy,
        asset: 'torch',
        flameAsset: 'torchFlame',
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
        asset: 'torch',
        flameAsset: 'torchFlame',
        dx: fallback.dx,
        dy: fallback.dy,
        phase: ((fallback.x + fallback.dx) * 17 + (fallback.y + fallback.dy) * 31) % 100,
      });
    }
    return list;
  }

  RK.MapBase = {
    emptyMap: emptyMap,
    locationProfile: locationProfile,
    // seededRandom берут декорации и разбиение на регионы: свой генератор
    // нужен им обоим, иначе декорации зависели бы от порядка розыгрышей.
    seededRandom: seededRandom,
    assignRegions: assignRegions,
    placeTorches: placeTorches,
  };
})();
