(function () {
  var C = RK.CONFIG;

  // Пустая карта нужного размера: все клетки — стены. Её заполняют уже
  // генераторы этажей и города, поэтому матрицы заводятся в одном месте.
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

  function generate(floor, runSeed, width, height, style) {
    var seed = ((runSeed || 0) + floor * 2654435761) >>> 0;
    RK.RNG.reset(seed);
    var g = emptyMap(floor, width, height, style, seed);

    var rooms = [];
    var roomEstimate = Math.max(8, Math.min(80, Math.round(g.w * g.h / 170)));
    var roomVariation = Math.max(1, Math.round(roomEstimate * 0.2));
    var targetRooms = Math.max(6, roomEstimate + RK.RNG.int(-roomVariation, roomVariation));
    var attempts = 0;
    while (rooms.length < targetRooms && attempts < targetRooms * 60) {
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
    assignRegions(g, rooms);
    g.zones = placeZones(g);
    g.torches = placeTorches(g);
    g.floor = floor;
    g.doors = placeDoors(g);
    g.traps = placeTraps(g);
    g.decorations = placeDecorations(g);

    RK.Map = g;
    return g;
  }

  function generateLocation(type, floor, runSeed, width, height, style, exits) {
    var typeDef = C.LOCATION_TYPES[type];
    if (!typeDef) throw new Error('Неизвестный тип локации: ' + type);
    var g;
    if (type === 'city') g = generateCity(floor, runSeed, width, height, style, exits);
    else if (type === 'wilderness') g = placeWilderness(generate(1, runSeed, width, height, style));
    else g = generate(typeDef.floors ? floor : 1, runSeed, width, height, style);
    g.locationType = type;
    return g;
  }

  // Кварталы города: пять заняты NPC, остальные — жилые дома.
  var CITY_BUILDING_KINDS = [
    { kind: 'market', name: 'Торговый ряд' },
    { kind: 'forge', name: 'Кузница' },
    { kind: 'guardhouse', name: 'Караульня' },
    { kind: 'temple', name: 'Храм' },
    { kind: 'tavern', name: 'Таверна' },
    { kind: 'guild', name: 'Гильдия' },
    { kind: 'house', name: 'Жилой дом' },
    { kind: 'house', name: 'Жилой дом' },
    { kind: 'house', name: 'Жилой дом' },
  ];
  // Дом строится из квартала с отступом от улиц; меньше — места для дома нет.
  var CITY_MIN_BUILDING = 4;

  // Город: крепостная стена, кольцевая дорога, сетка улиц и дома по кварталам.
  // Проходимость обеспечена конструкцией: улицы пересекают кольцо, в каждый дом
  // ведёт открытая дверь на тротуар, а от ворот к площади идёт проспект.
  function generateCity(floor, runSeed, width, height, style, exits) {
    var seed = ((runSeed || 0) + floor * 2654435761) >>> 0;
    RK.RNG.reset(seed);
    var g = emptyMap(floor, width, height, style, seed);
    var streetWidth = Math.max(1, C.CITY_STREET_WIDTH || 1);
    var inset = Math.max(1, C.CITY_BUILDING_INSET || 1);
    var colLines = cityLines(g.w, C.CITY_STREETS_PER_AXIS || 3, streetWidth);
    var rowLines = cityLines(g.h, C.CITY_STREETS_PER_AXIS || 3, streetWidth);
    var colBlocks = blockRanges(colLines, streetWidth);
    var rowBlocks = blockRanges(rowLines, streetWidth);

    for (var x = 1; x < g.w - 1; x++) {
      g.tiles[1][x] = 1;
      g.tiles[g.h - 2][x] = 1;
    }
    for (var y = 1; y < g.h - 1; y++) {
      g.tiles[y][1] = 1;
      g.tiles[y][g.w - 2] = 1;
    }
    carveCityStreets(g, colLines, rowLines, streetWidth);

    var plazaCol = blockCenter(colBlocks.length > 2 ? colBlocks[1] : colBlocks[0]) ||
      Math.floor(g.w / 2);
    var plazaRow = blockCenter(rowBlocks.length > 2 ? rowBlocks[1] : rowBlocks[0]) ||
      Math.floor(g.h / 2);
    // Проспект от каждых ворот: клетки под дорогой исключаются из застройки.
    var avenue = Object.create(null);
    (exits || []).forEach(function (exit) {
      if (!exit || !Number.isFinite(exit.x) || !Number.isFinite(exit.y)) return;
      var ex = Math.max(2, Math.min(g.w - 3, Math.round(exit.x)));
      var ey = Math.max(2, Math.min(g.h - 3, Math.round(exit.y)));
      for (var ay = Math.min(ey, plazaRow); ay <= Math.max(ey, plazaRow); ay++) {
        g.tiles[ay][ex] = 1;
        avenue[ex + ',' + ay] = true;
      }
      for (var ax = Math.min(ex, plazaCol); ax <= Math.max(ex, plazaCol); ax++) {
        g.tiles[plazaRow][ax] = 1;
        avenue[ax + ',' + plazaRow] = true;
      }
    });

    var buildings = [];
    var plaza = null;
    for (var rowIndex = 0; rowIndex < rowBlocks.length; rowIndex++) {
      for (var colIndex = 0; colIndex < colBlocks.length; colIndex++) {
        var block = {
          x0: colBlocks[colIndex].from, x1: colBlocks[colIndex].to,
          y0: rowBlocks[rowIndex].from, y1: rowBlocks[rowIndex].to,
        };
        if (block.x1 <= block.x0 || block.y1 <= block.y0) continue;
        // Квартал — тротуар: сначала открываем его целиком, потом строим стены дома.
        for (var cy2 = block.y0; cy2 <= block.y1; cy2++) {
          for (var cx2 = block.x0; cx2 <= block.x1; cx2++) g.tiles[cy2][cx2] = 1;
        }
        var isPlaza = !plaza && colBlocks.length > 2 && rowBlocks.length > 2 &&
          colIndex === Math.floor(colBlocks.length / 2) && rowIndex === Math.floor(rowBlocks.length / 2);
        if (isPlaza) {
          // Площадь — открытый квартал: здесь стоит спавн, отсюда расходятся улицы.
          plaza = addCityRoom(g, {
            x: block.x0, y: block.y0, w: block.x1 - block.x0 + 1, h: block.y1 - block.y0 + 1,
          });
          continue;
        }
        var building = placeCityBuilding(g, block, inset, avenue);
      if (building) {
        // Kind будет присвоен позже по индексу, но заодно зададим базовое значение.
        var kindIndex = buildings.length - 1;
        var def = CITY_BUILDING_KINDS[kindIndex] || CITY_BUILDING_KINDS[CITY_BUILDING_KINDS.length - 1];
        building.kind = def ? def.kind : 'house';
        buildings.push(building);
      }
      }
    }

    // Названия зданий перемешиваются по seed: один и тот же город узнаётся,
    // но разные забеги получают разные кварталы.
    for (var shuffle = buildings.length - 1; shuffle > 0; shuffle--) {
      var swap = RK.RNG.int(0, shuffle);
      var temp = buildings[shuffle];
      buildings[shuffle] = buildings[swap];
      buildings[swap] = temp;
    }
    for (var bi = 0; bi < buildings.length; bi++) {
      var def = CITY_BUILDING_KINDS[bi] || CITY_BUILDING_KINDS[CITY_BUILDING_KINDS.length - 1];
      buildings[bi].kind = def.kind;
      buildings[bi].name = def.name;
      if (def.kind === 'tavern') {
        var hall = buildings[bi].room;
        g.tavern = { roomIndex: hall.roomIndex, x: hall.x, y: hall.y, w: hall.w, h: hall.h };
      }
    }
    g.buildings = buildings;

    if (plaza) g.spawn = { x: plaza.cx, y: plaza.cy };
    else g.spawn = { x: plazaCol, y: plazaRow };
    // Лестницы в городе нет: этажей у локации нет, переходы идут через ворота.
    g.stair = null;
    g.zones = [];
    g.traps = [];
    g.chests = [];
    g.blood = [];
    g.doors = cityDoors(buildings);
    g.floor = floor;

    for (var fy = 0; fy < g.h; fy++) {
      for (var fx = 0; fx < g.w; fx++) {
        if (g.tiles[fy][fx] === 1) g.floorTypes[fy][fx] = RK.RNG.int(0, 2);
        g.wallTypes[fy][fx] = RK.RNG.int(0, 2);
      }
    }
    assignRegions(g, g.rooms);
    g.torches = placeTorches(g);
    g.decorations = placeDecorations(g);
    // Как и generate(), генератор публикует карту сразу: её читают спавн,
    // предметы и декорации без промежуточного присваивания.
    RK.Map = g;
    return g;
  }

  // Улицы распределены равномерно между воротами: первая у северной стены,
  // последняя у южной. Полосы не наезжают на кольцевую дорогу.
  function cityLines(size, count, streetWidth) {
    var lines = [];
    var last = Math.max(2, size - 3 - (streetWidth - 1));
    for (var i = 0; i < count; i++) {
      var line = count === 1 ? 2 : Math.round(2 + (last - 2) * i / (count - 1));
      lines.push(Math.max(2, Math.min(last, line)));
    }
    return lines;
  }

  function blockRanges(lines, streetWidth) {
    var ranges = [];
    for (var i = 0; i + 1 < lines.length; i++) {
      ranges.push({ from: lines[i] + streetWidth, to: lines[i + 1] - 1 });
    }
    return ranges;
  }

  function blockCenter(block) {
    return block ? Math.floor((block.from + block.to) / 2) : 0;
  }

  function carveCityStreets(g, colLines, rowLines, streetWidth) {
    for (var ci = 0; ci < colLines.length; ci++) {
      for (var y = 1; y < g.h - 1; y++) {
        for (var dx = 0; dx < streetWidth; dx++) g.tiles[y][colLines[ci] + dx] = 1;
      }
    }
    for (var ri = 0; ri < rowLines.length; ri++) {
      for (var x = 1; x < g.w - 1; x++) {
        for (var dy = 0; dy < streetWidth; dy++) g.tiles[rowLines[ri] + dy][x] = 1;
      }
    }
  }

  function addCityRoom(g, box) {
    var room = {
      x: box.x, y: box.y, w: box.w, h: box.h,
      cx: Math.floor(box.x + box.w / 2), cy: Math.floor(box.y + box.h / 2),
      area: box.w * box.h,
    };
    room.roomIndex = g.rooms.length;
    g.rooms.push(room);
    return room;
  }

  // Дом в квартале: стены по периметру, пол внутри, дверь на тротуар.
  // Квартал, перерезанный проспектом или слишком тесный, остаётся двором.
  function placeCityBuilding(g, block, inset, avenue) {
    var x0 = block.x0 + inset;
    var y0 = block.y0 + inset;
    var x1 = block.x1 - inset;
    var y1 = block.y1 - inset;
    if (x1 - x0 + 1 < CITY_MIN_BUILDING || y1 - y0 + 1 < CITY_MIN_BUILDING) return null;
    for (var cy = block.y0; cy <= block.y1; cy++) {
      for (var cx = block.x0; cx <= block.x1; cx++) {
        if (avenue[cx + ',' + cy]) return null;
      }
    }
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var edge = x === x0 || x === x1 || y === y0 || y === y1;
        g.tiles[y][x] = edge ? 0 : 1;
      }
    }
    var room = addCityRoom(g, {
      x: x0 + 1, y: y0 + 1, w: x1 - x0 - 1, h: y1 - y0 - 1,
    });
    var building = {
      kind: 'house', name: 'Жилой дом',
      x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1,
      cx: room.cx, cy: room.cy, room: room,
    };
    building.door = cityDoorTile(building);
    // Дверь открыта: запертый дом запер бы игрока внутри или отрезал NPC.
    g.tiles[building.door.y][building.door.x] = 1;
    return building;
  }

  // Дверь посередине верхней стены: сверху от дома тротуар, а клетка прохода
  // ровно одна — в углу её не было бы.
  function cityDoorTile(building) {
    return {
      x: building.x + Math.floor((building.w - 1) / 2),
      y: building.y,
      orientation: 'vertical',
    };
  }

  function cityDoors(buildings) {
    var doors = [];
    for (var i = 0; i < buildings.length; i++) {
      var building = buildings[i];
      if (!building.door) continue;
      doors.push({
        x: building.door.x, y: building.door.y,
        asset: 'door',
        orientation: building.door.orientation,
        state: 'open',
        keyId: 'iron',
        hp: C.DOOR_HP,
        maxHp: C.DOOR_HP,
        building: building.kind,
      });
    }
    return doors;
  }

  // Здание города по назначению: NPC ищет здесь своё место.
  function getBuilding(g, kind) {
    var buildings = (g && g.buildings) || [];
    for (var i = 0; i < buildings.length; i++) {
      if (buildings[i].kind === kind) return buildings[i];
    }
    return null;
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
      var path = findPathOnMap(g, g.spawn.x, g.spawn.y, pois[pi].x, pois[pi].y, null) || [];
      for (var si = 0; si < path.length; si++) {
        var roadKey = path[si].x + ',' + path[si].y;
        if (roadKeys[roadKey]) continue;
        roadKeys[roadKey] = true;
        g.roads.push({ x: path[si].x, y: path[si].y });
      }
    }
    return g;
  }

  function placeDecorations(g, occupied) {
    var state = (g.seed ^ 0xa511e9b3) >>> 0;
    function random() {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    }

    var blocked = {};
    var groups = [g.doors, g.chests, g.traps, g.torches, occupied];
    for (var gi = 0; gi < groups.length; gi++) {
      var group = groups[gi] || [];
      for (var oi = 0; oi < group.length; oi++) {
        if (group[oi] && group[oi].x != null && group[oi].y != null) {
          blocked[group[oi].x + ',' + group[oi].y] = true;
        }
      }
    }

    var candidates = [];
    for (var y = 0; y < g.h; y++) {
      for (var x = 0; x < g.w; x++) {
        if (g.tiles[y][x] !== 1 || blocked[x + ',' + y]) continue;
        if (manhattan(x, y, g.spawn.x, g.spawn.y) < 3) continue;
        // У города лестницы нет: отступать от неё не нужно.
        if (g.stair && manhattan(x, y, g.stair.x, g.stair.y) < 2) continue;
        if (g.tavern && isInTavern(g, x, y)) continue;
        candidates.push({ x: x, y: y });
      }
    }

    function opennessAt(x, y) {
      var count = 0;
      for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
          var nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < g.w && ny < g.h && g.tiles[ny][nx] === 1) count++;
        }
      }
      return count;
    }

    for (var ci = 0; ci < candidates.length; ci++) {
      candidates[ci].openness = opennessAt(candidates[ci].x, candidates[ci].y);
    }

    for (var ci = candidates.length - 1; ci > 0; ci--) {
      var swapIndex = Math.floor(random() * (ci + 1));
      var candidate = candidates[ci];
      candidates[ci] = candidates[swapIndex];
      candidates[swapIndex] = candidate;
    }

    var types = [
      'decorStone', 'decorGrass', 'decorMoss', 'decorMushroom', 'decorPuddle',
    ];
    for (var ti = types.length - 1; ti > 0; ti--) {
      var typeSwapIndex = Math.floor(random() * (ti + 1));
      var type = types[ti];
      types[ti] = types[typeSwapIndex];
      types[typeSwapIndex] = type;
    }

    var decorations = [];
    var available = {};
    var pointByKey = {};
    for (var ai = 0; ai < candidates.length; ai++) {
      var point = candidates[ai];
      var pointKey = point.x + ',' + point.y;
      available[pointKey] = true;
      pointByKey[pointKey] = point;
    }

    function addDecoration(point, asset, extra) {
      var key = point.x + ',' + point.y;
      if (!available[key]) return false;
      delete available[key];
      var decoration = {
        x: point.x,
        y: point.y,
        asset: asset,
      };
      if (extra) {
        for (var name in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, name)) decoration[name] = extra[name];
        }
      }
      decorations.push(decoration);
      return true;
    }

    var extraTypes = g.style === 'cave'
      ? ['decorMoss', 'decorMoss', 'decorMushroom', 'decorPuddle']
      : ['decorStone', 'decorGrass', 'decorMoss', 'decorPuddle'];
    var regularTarget = Math.min(candidates.length,
      Math.max(types.length, Math.round(candidates.length * 0.04)));
    for (var di = 0; di < regularTarget; di++) {
      var asset = di < types.length ? types[di] : extraTypes[Math.floor(random() * extraTypes.length)];
      addDecoration(candidates[di], asset);
    }

    function adjacent4(point) {
      return [
        { x: point.x + 1, y: point.y },
        { x: point.x - 1, y: point.y },
        { x: point.x, y: point.y + 1 },
        { x: point.x, y: point.y - 1 },
      ];
    }

    var lakeSize = g.style === 'cave' ? 5 + Math.floor(random() * 4) : 4 + Math.floor(random() * 4);
    var lakeCells = [];
    if (candidates.length > regularTarget) {
      var lakeCandidates = [];
      var totalOpenness = 0;
      for (var ci = 0; ci < candidates.length; ci++) {
        var cand = candidates[ci];
        if (available[cand.x + ',' + cand.y]) {
          var weight = cand.openness || 1;
          lakeCandidates.push(cand);
          totalOpenness += weight;
        }
      }
      var lakeStart = null;
      if (lakeCandidates.length > 0 && totalOpenness > 0) {
        var r = random() * totalOpenness;
        var acc = 0;
        for (var li = 0; li < lakeCandidates.length; li++) {
          acc += lakeCandidates[li].openness || 1;
          if (r <= acc) {
            lakeStart = lakeCandidates[li];
            break;
          }
        }
      }
      if (lakeStart) {
        lakeCells.push(lakeStart);
        var lakeKeys = {};
        lakeKeys[lakeStart.x + ',' + lakeStart.y] = true;
        while (lakeCells.length < lakeSize) {
          var frontier = [];
          var frontierKeys = {};
          for (var lc = 0; lc < lakeCells.length; lc++) {
            var neighbors = adjacent4(lakeCells[lc]);
            for (var ln = 0; ln < neighbors.length; ln++) {
              var neighborKey = neighbors[ln].x + ',' + neighbors[ln].y;
              if (available[neighborKey] && !lakeKeys[neighborKey] && !frontierKeys[neighborKey]) {
                frontierKeys[neighborKey] = true;
                frontier.push(pointByKey[neighborKey]);
              }
            }
          }
          if (!frontier.length) break;
          var totalFrontierOpen = 0;
          for (var fi = 0; fi < frontier.length; fi++) {
            totalFrontierOpen += frontier[fi].openness || 1;
          }
          var lakePoint;
          if (totalFrontierOpen > 0) {
            var rf = random() * totalFrontierOpen;
            var accf = 0;
            for (var fi = 0; fi < frontier.length; fi++) {
              accf += frontier[fi].openness || 1;
              if (rf <= accf) {
                lakePoint = frontier[fi];
                break;
              }
            }
          } else {
            lakePoint = frontier[Math.floor(random() * frontier.length)];
          }
          lakeCells.push(lakePoint);
          lakeKeys[lakePoint.x + ',' + lakePoint.y] = true;
        }

        // Try to merge nearby available clusters into single connected body
        if (lakeCells.length < lakeSize * 1.5) {
          var merged = false;
          for (var ma = 0; ma < 6 && !merged; ma++) {
            var bestA = null;
            var bestB = null;
            var bestDist = 9999;
            for (var la = 0; la < lakeCells.length; la++) {
              for (var lb = 0; lb < lakeCells.length; lb++) {
                if (la === lb) continue;
                var d = Math.max(Math.abs(lakeCells[la].x - lakeCells[lb].x), Math.abs(lakeCells[la].y - lakeCells[lb].y));
                if (d < bestDist && d >= 2 && d <= 3) {
                  bestDist = d;
                  bestA = lakeCells[la];
                  bestB = lakeCells[lb];
                }
              }
            }
            if (!bestA || !bestB) break;
            var stepCount = bestDist;
            var sx = bestA.x;
            var sy = bestA.y;
            var tx = bestB.x;
            var ty = bestB.y;
            var dxStep = (tx - sx) / stepCount;
            var dyStep = (ty - sy) / stepCount;
            var pathBridge = [];
            for (var st = 1; st < stepCount; st++) {
              var bx = Math.round(sx + dxStep * st);
              var by = Math.round(sy + dyStep * st);
              var bkey = bx + ',' + by;
              if (available[bkey] && !lakeKeys[bkey]) {
                pathBridge.push(pointByKey[bkey]);
              }
            }
            if (pathBridge.length > 0) {
              for (var pb = 0; pb < pathBridge.length; pb++) {
                var pk = pathBridge[pb].x + ',' + pathBridge[pb].y;
                lakeCells.push(pathBridge[pb]);
                lakeKeys[pk] = true;
                if (lakeCells.length >= lakeSize + 2) break;
              }
              merged = true;
            } else {
              break;
            }
          }
        }

        for (var li = 0; li < lakeCells.length; li++) {
          addDecoration(lakeCells[li], 'decorLake', { waterPhase: random() * Math.PI * 2 });
        }
      }
    }

    var streamSize = g.style === 'cave' ? 10 + Math.floor(random() * 4) : 8 + Math.floor(random() * 4);
    var bestStream = [];
    var streamAttempts = Math.min(20, candidates.length);
    var directions4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];

    // Возвращает индекс направления в directions4. Ненормированные направления
    // (их даёт «волна», прибавляющая единицу к координате) дают 0 — как и
    // раньше; нормализовать их здесь нельзя, это меняет форму потоков.
    function dir4ToIndex(dx, dy) {
      if (dx === 1 && dy === 0) return 0;
      if (dx === 0 && dy === 1) return 1;
      if (dx === -1 && dy === 0) return 2;
      if (dx === 0 && dy === -1) return 3;
      return 0;
    }

    for (var sa = 0; sa < streamAttempts && bestStream.length < streamSize; sa++) {
      var streamCandidates = [];
      var totalStreamOpen = 0;
      for (var ci = 0; ci < candidates.length; ci++) {
        var cand = candidates[ci];
        var ck = cand.x + ',' + cand.y;
        if (available[ck]) {
          var weight = cand.openness || 1;
          streamCandidates.push(cand);
          totalStreamOpen += weight;
        }
      }
      var streamStart = null;
      if (streamCandidates.length > 0 && totalStreamOpen > 0) {
        var r = random() * totalStreamOpen;
        var acc = 0;
        for (var si = 0; si < streamCandidates.length; si++) {
          acc += streamCandidates[si].openness || 1;
          if (r <= acc) {
            streamStart = streamCandidates[si];
            break;
          }
        }
      }
      if (!streamStart) continue;
      var skStart = streamStart.x + ',' + streamStart.y;
      if (!available[skStart]) continue;
      var path = [streamStart];
      var used = {};
      used[skStart] = true;

      var curDir = directions4[Math.floor(random() * 4)];
      var dirIdx = dir4ToIndex(curDir[0], curDir[1]);

      var steps = 0;
      while (path.length < streamSize && steps < streamSize * 2) {
        steps++;
        var prev = path[path.length - 1];

        var dirChoices = [];
        dirChoices.push([curDir[0], curDir[1]]);

        // gentle turns
        if (random() < 0.35) dirChoices.push([directions4[(dirIdx + 1) % 4][0], directions4[(dirIdx + 1) % 4][1]]);
        if (random() < 0.35) dirChoices.push([directions4[(dirIdx + 3) % 4][0], directions4[(dirIdx + 3) % 4][1]]);

        // occasional sharper curve
        if (random() < 0.25) dirChoices.push([directions4[(dirIdx + 2) % 4][0], directions4[(dirIdx + 2) % 4][1]]);

        // wave bias
        if (random() < 0.4) dirChoices.push([curDir[0] + (random() < 0.5 ? 1 : -1), curDir[1]]);
        if (random() < 0.4) dirChoices.push([curDir[0], curDir[1] + (random() < 0.5 ? 1 : -1)]);

        dirChoices.push([prev.x < g.w / 2 ? 1 : -1, 0]);
        dirChoices.push([0, prev.y < g.h / 2 ? 1 : -1]);

        var candidatesNext = [];
        for (var dc = 0; dc < dirChoices.length; dc++) {
          var dd = dirChoices[dc];
          for (var stepLen = 1; stepLen <= 2; stepLen++) {
            var nx = prev.x + dd[0] * stepLen;
            var ny = prev.y + dd[1] * stepLen;
            if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
            var nk = nx + ',' + ny;
            if (available[nk] && !used[nk]) {
              var distFromLast = Math.abs(nx - prev.x) + Math.abs(ny - prev.y);
              if (distFromLast > 2) continue;
              var cand = pointByKey[nk];
              var weight = (cand && cand.openness) ? cand.openness : 1;
              candidatesNext.push({ x: nx, y: ny, dx: dd[0], dy: dd[1], d: distFromLast, weight: weight });
            }
          }
        }

        if (candidatesNext.length === 0) {
          // try to find any adjacent available not used
          for (var dyc = -1; dyc <= 1; dyc++) {
            for (var dxc = -1; dxc <= 1; dxc++) {
              if (dxc === 0 && dyc === 0) continue;
              var nnx = prev.x + dxc;
              var nny = prev.y + dyc;
              if (nnx < 0 || nny < 0 || nnx >= g.w || nny >= g.h) continue;
              var nnk = nnx + ',' + nny;
              if (available[nnk] && !used[nnk]) {
                candidatesNext.push({ x: nnx, y: nny, dx: dxc, dy: dyc, d: 1 });
              }
            }
          }
        }

        if (candidatesNext.length === 0) break;
        var totalWeight = 0;
        for (var cn = 0; cn < candidatesNext.length; cn++) {
          totalWeight += candidatesNext[cn].weight || 1;
        }
        var chosen;
        if (totalWeight > 0) {
          var r = random() * totalWeight;
          var acc = 0;
          for (var cn = 0; cn < candidatesNext.length; cn++) {
            acc += candidatesNext[cn].weight || 1;
            if (r <= acc) {
              chosen = candidatesNext[cn];
              break;
            }
          }
        } else {
          chosen = candidatesNext[Math.floor(random() * candidatesNext.length)];
        }
        path.push({ x: chosen.x, y: chosen.y });
        used[chosen.x + ',' + chosen.y] = true;
        var ndir = chosen.dx !== 0 || chosen.dy !== 0 ? [chosen.dx, chosen.dy] : curDir;
        curDir = ndir;
        // Повороты следующего шага отсчитываются от направления, в которое
        // поток пошёл сейчас, а не от того, с чего он начался.
        dirIdx = dir4ToIndex(curDir[0], curDir[1]);
      }

      if (path.length > bestStream.length) bestStream = path;
    }

    for (var si = 0; si < bestStream.length; si++) {
      addDecoration(bestStream[si], 'decorStream', { flowIndex: si });
    }

    return decorations;
  }

  function assignRegions(g, rooms) {
    var styleIds = Object.keys(C.MAP_STYLES);
    var mainStyle = C.MAP_STYLES[g.style] ? g.style : styleIds[0];
    g.regionStyles = [mainStyle];

    for (var ri = 0; ri < rooms.length; ri++) {
      rooms[ri].region = 0;
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
        if (manhattan(candidate.x, candidate.y, doors[i].x, doors[i].y) < 8) {
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

  function getDoorAt(x, y) {
    var doors = RK.Map && RK.Map.doors ? RK.Map.doors : [];
    for (var i = 0; i < doors.length; i++) {
      if (doors[i].x === x && doors[i].y === y) return doors[i];
    }
    return null;
  }

  function getChestAt(x, y) {
    var chests = RK.Map && RK.Map.chests ? RK.Map.chests : [];
    for (var i = 0; i < chests.length; i++) {
      if (chests[i].x === x && chests[i].y === y) return chests[i];
    }
    return null;
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
      if (RK.MapGen.manhattan(x, y, g.spawn.x, g.spawn.y) < 4) continue;
      if (RK.MapGen.manhattan(x, y, g.stair.x, g.stair.y) < 3) continue;
      if (getDoorAt(x, y) || getChestAt(x, y)) continue;
      var occupied = false;
      for (var i = 0; i < traps.length; i++) {
        if (traps[i].x === x && traps[i].y === y) {
          occupied = true;
          break;
        }
      }
      if (occupied) continue;
      var kinds = ['spike', 'needle', 'flame'];
      traps.push({
        x: x,
        y: y,
        asset: 'trap',
        type: kinds[RK.RNG.int(0, kinds.length - 1)],
        state: 'armed',
        damage: Math.max(2, 3 + Math.floor(g.floor * 1.3)),
      });
    }
    return traps;
  }

  function placeZones(g) {
    var zones = [];
    var count = Math.max(3, Math.min(9, Math.round(g.w * g.h / 700)));
    var kinds = ['regen', 'attack', 'weakAttack', 'weakDefense'];
    for (var i = 0; i < count; i++) {
      var center = null;
      var radius = RK.RNG.int(2, 4);
      for (var attempt = 0; attempt < 60 && !center; attempt++) {
        var candidate = randomFloorFromMap(g, g.spawn.x, g.spawn.y, Math.max(g.w, g.h), 7);
        if (!candidate || manhattan(candidate.x, candidate.y, g.stair.x, g.stair.y) < 6) continue;
        var separated = true;
        for (var zi = 0; zi < zones.length; zi++) {
          if (manhattan(candidate.x, candidate.y, zones[zi].x, zones[zi].y) <
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
        if (getDoorAt(x, y) || getChestAt(x, y) || getTrapAt(x, y)) continue;
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

  function getTrapAt(x, y) {
    var traps = RK.Map && RK.Map.traps ? RK.Map.traps : [];
    for (var i = 0; i < traps.length; i++) {
      if (traps[i].x === x && traps[i].y === y) return traps[i];
    }
    return null;
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

  function getTavern(g) {
    return g && g.tavern ? g.tavern : null;
  }

  // Корректировка координат точки входа/выхода: если заданная клетка непроходима,
  // ищем ближайшую проходимую по расширяющимся кольцам. Радиус не ограничен тремя
  // клетками: выход у края карты иначе оставался бы в стене, и локация считалась бы
  // недостижимой. Спавн и лестница исключаются, иначе выход совпал бы с ними.
  function snapExitToWalkable(g, x, y) {
    if (x >= 0 && y >= 0 && x < g.w && y < g.h && isMapWalkable(g, x, y)) {
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

  function isInTavern(g, x, y) {
    var t = getTavern(g);
    if (!t) return false;
    return x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h;
  }

  // Матрицы карты в снимке жмутся run-length: пара [значение, длина] на
  // серию одинаковых клеток. tiles, regions и explored сжимаются в разы,
  // поэтому снимок на каждый шаг перестаёт весить десятки килобайт.
  // wallTypes не кодируется: стены чередуются почти везде и RLE раздувает поле.
  var MATRIX_FIELDS = ['tiles', 'floorTypes', 'regions', 'explored'];

  function encodeMatrix(matrix) {
    var encoded = [];
    for (var y = 0; y < matrix.length; y++) {
      var row = matrix[y];
      var runs = [];
      var value = row[0];
      var length = 1;
      for (var x = 1; x <= row.length; x++) {
        if (x < row.length && row[x] === value) {
          length++;
          continue;
        }
        runs.push(value, length);
        value = row[x];
        length = 1;
      }
      encoded.push(runs);
    }
    return encoded;
  }

  // Строка должна ровно заполнить width клеток: иначе снимок либо раздувает
  // карту, либо оставляет дыры, и рендер читает за границей.
  function decodeMatrix(encoded, width, height) {
    var matrix = [];
    if (!Array.isArray(encoded) || encoded.length !== height) return null;
    for (var y = 0; y < height; y++) {
      var runs = encoded[y];
      if (!Array.isArray(runs) || runs.length % 2 !== 0) return null;
      var row = [];
      for (var i = 0; i < runs.length; i += 2) {
        var value = runs[i];
        var length = runs[i + 1];
        if (typeof value !== 'boolean' && typeof value !== 'number') return null;
        if (!Number.isInteger(length) || length < 1) return null;
        for (var x = 0; x < length; x++) row.push(value);
      }
      if (row.length !== width) return null;
      matrix.push(row);
    }
    return matrix;
  }

  function encodeMatrices(map) {
    var out = {};
    MATRIX_FIELDS.forEach(function (field) {
      if (Array.isArray(map[field])) out[field] = encodeMatrix(map[field]);
    });
    return out;
  }

  function decodeMatrices(encoded, width, height) {
    if (!encoded || typeof encoded !== 'object') return null;
    var out = {};
    for (var i = 0; i < MATRIX_FIELDS.length; i++) {
      var field = MATRIX_FIELDS[i];
      if (!encoded[field]) continue;
      var matrix = decodeMatrix(encoded[field], width, height);
      if (!matrix) return null;
      out[field] = matrix;
    }
    return out;
  }

  RK.Map = null;
  RK.MapGen = {
    generate: generate,
    encodeMatrix: encodeMatrix,
    decodeMatrix: decodeMatrix,
    encodeMatrices: encodeMatrices,
    decodeMatrices: decodeMatrices,
    placeDecorations: placeDecorations,
    isInside: isInside,
    isWalkable: isWalkable,
    manhattan: manhattan,
    findPath: findPath,
    findPathNear: findPathNear,
    randomFloorNear: randomFloorNear,
    addBlood: addBlood,
    getDoorAt: getDoorAt,
    getChestAt: getChestAt,
    getTrapAt: getTrapAt,
    getTavern: getTavern,
    isInTavern: isInTavern,
    snapExitToWalkable: snapExitToWalkable,
    findPathOnMap: findPathOnMap,
    isMapWalkable: isMapWalkable,
    generateLocation: generateLocation,
    getBuilding: getBuilding,
  };
})();