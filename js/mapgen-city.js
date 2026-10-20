// Генератор города: улицы, кварталы, здания и двери.
(function () {
  var C = RK.CONFIG;

  // Кварталы города: первые заняты под службы, остальные — жилые дома.
  // Служебный набор фиксирован и раздаётся по порядку, поэтому при любом
  // раскладе кварталов здание есть у каждого NPC из NPC_KINDS.
  var CITY_SERVICE_KINDS = [
    { kind: 'market', name: 'Торговый ряд' },
    { kind: 'forge', name: 'Кузница' },
    { kind: 'guardhouse', name: 'Караульня' },
    { kind: 'temple', name: 'Храм' },
    { kind: 'tavern', name: 'Таверна' },
    { kind: 'guild', name: 'Гильдия' },
  ];
  var CITY_HOUSE_KIND = { kind: 'house', name: 'Жилой дом' };
  // Дом строится из квартала с отступом от улиц; меньше — места для дома нет.
  var CITY_MIN_BUILDING = 4;

  // Город: крепостная стена, кольцевая дорога, сетка улиц и дома по кварталам.
  // Проходимость обеспечена конструкцией: кольцо и улицы пересекаются, в каждый дом
  // ведёт открытая дверь на тротуар, а площадь открыта целиком.
  function generateCity(floor, runSeed, width, height, style, locationType) {
    var seed = ((runSeed || 0) + floor * 2654435761) >>> 0;
    RK.RNG.reset(seed);
    var g = RK.MapBase.emptyMap(floor, width, height, style, seed);
    g.locationType = locationType || null;
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
        var building = placeCityBuilding(g, block, inset);
        if (building) buildings.push(building);
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
    var cityMaterialCount = (RK.CONFIG.MAP_STYLES && RK.CONFIG.MAP_STYLES.stone && RK.CONFIG.MAP_STYLES.stone.colors)
      ? RK.CONFIG.MAP_STYLES.stone.colors.length : 3;
    var cityFurniture = [];
    function pushFurniture(x, y, asset) {
      if (x <= 0 || y <= 0 || x >= g.w - 1 || y >= g.h - 1) return;
      if (g.tiles[y][x] !== 1) return;
      cityFurniture.push({ x: x, y: y, asset: asset, furniture: true });
    }
    for (var bi = 0; bi < buildings.length; bi++) {
      var def = CITY_SERVICE_KINDS[bi] || CITY_HOUSE_KIND;
      buildings[bi].kind = def.kind;
      buildings[bi].name = def.name;
      buildings[bi].material = bi % cityMaterialCount;
      var room = buildings[bi].room;
      if (room) {
        var rcx = room.x + Math.floor((room.w - 1) / 2);
        var rcy = room.y + Math.floor((room.h - 1) / 2);
        if (def.kind === 'house') {
          pushFurniture(room.x + 1, room.y + 1, 'fireplace');
        } else if (def.kind === 'temple') {
          pushFurniture(rcx, rcy, 'churchCross');
          pushFurniture(room.x + 1, rcy, 'bench');
          pushFurniture(room.x + room.w - 2, rcy, 'bench');
          pushFurniture(rcx - 1, room.y + room.h - 2, 'bench');
        } else if (def.kind === 'forge') {
          pushFurniture(room.x + room.w - 2, room.y + room.h - 2, 'forgeFurnace');
          pushFurniture(room.x + 1, room.y + room.h - 2, 'anvil');
        } else if (def.kind === 'market') {
          pushFurniture(rcx, room.y + room.h - 2, 'counterGoods');
        } else if (def.kind === 'tavern') {
          pushFurniture(rcx, rcy, 'tavernTable');
          pushFurniture(room.x + 1, rcy, 'tavernChair');
          pushFurniture(room.x + room.w - 2, rcy, 'tavernChair');
          pushFurniture(room.x + 1, room.y + room.h - 2, 'beerBarrel');
          pushFurniture(room.x + room.w - 2, room.y + room.h - 2, 'wineBottle');
        } else if (def.kind === 'guild' || def.kind === 'guardhouse') {
          pushFurniture(rcx, rcy, 'bench');
        }
      }
      if (def.kind === 'tavern') {
        var hall = buildings[bi].room;
        g.tavern = { roomIndex: hall.roomIndex, x: hall.x, y: hall.y, w: hall.w, h: hall.h };
      }
    }
    g.buildings = buildings;

    if (plaza) g.spawn = { x: plaza.cx, y: plaza.cy };
    else g.spawn = {
      x: blockCenter(colBlocks[0]),
      y: blockCenter(rowBlocks[0]),
    };

    // Лестницы в городе нет: этажей у локации нет, переходы идут через ворота.
    g.stair = null;
    g.zones = [];
    g.traps = [];
    g.chests = [];
    g.blood = [];
    g.doors = cityDoors(buildings);
    g.floor = floor;

    // Уникальный материал пола/стен для каждого здания: сетка materialGrid хранит индекс цвета здания или -1.
    var materialGrid = [];
    for (var mfy = 0; mfy < g.h; mfy++) {
      var mrow = [];
      for (var mfx = 0; mfx < g.w; mfx++) mrow.push(-1);
      materialGrid.push(mrow);
    }
    for (var mbi = 0; mbi < buildings.length; mbi++) {
      var mb = buildings[mbi];
      var mm = (typeof mb.material === 'number') ? mb.material : -1;
      for (var my = mb.y; my < mb.y + mb.h; my++) {
        for (var mx = mb.x; mx < mb.x + mb.w; mx++) {
          if (my >= 0 && my < g.h && mx >= 0 && mx < g.w) materialGrid[my][mx] = mm;
        }
      }
    }
    for (var fy = 0; fy < g.h; fy++) {
      for (var fx = 0; fx < g.w; fx++) {
        var tileMaterial = materialGrid[fy][fx];
        if (g.tiles[fy][fx] === 1) {
          g.floorTypes[fy][fx] = (tileMaterial >= 0) ? tileMaterial : RK.RNG.int(0, 2);
        }
        g.wallTypes[fy][fx] = (tileMaterial >= 0) ? tileMaterial : RK.RNG.int(0, 2);
      }
    }
    RK.MapBase.assignRegions(g, g.rooms);
    g.torches = RK.MapBase.placeTorches(g);
    g.decorations = RK.MapDecor.placeDecorations(g).concat(cityFurniture);
    // Центральная площадь: фонтан, деревья и клумбы.
    if (plaza) {
      var pcx = (g.spawn && g.spawn.x != null) ? g.spawn.x : plaza.cx;
      var pcy = (g.spawn && g.spawn.y != null) ? g.spawn.y : plaza.cy;
      var plazaDecor = [];
      function pushPlazaDecor(px, py, asset) {
        if (px <= 0 || py <= 0 || px >= g.w - 1 || py >= g.h - 1) return;
        if (g.tiles[py][px] !== 1) return;
        plazaDecor.push({ x: px, y: py, asset: asset, furniture: true });
      }
      pushPlazaDecor(pcx, pcy, 'decorFountain');
      pushPlazaDecor(pcx - 2, pcy - 1, 'decorTree');
      pushPlazaDecor(pcx + 2, pcy - 1, 'decorTree');
      pushPlazaDecor(pcx - 2, pcy + 1, 'decorTree');
      pushPlazaDecor(pcx + 2, pcy + 1, 'decorTree');
      pushPlazaDecor(pcx - 1, pcy, 'decorMushroom');
      pushPlazaDecor(pcx + 1, pcy, 'decorMushroom');
      pushPlazaDecor(pcx, pcy - 1, 'decorMushroom');
      pushPlazaDecor(pcx, pcy + 1, 'decorMushroom');
      g.decorations = (g.decorations || []).concat(plazaDecor);
    }
    // Как и RK.MapGenDungeon.generate(), генератор публикует карту сразу: её читают спавн,
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
  // Квартал, слишком тесный для дома, остаётся двором.
  function placeCityBuilding(g, block, inset) {
    var x0 = block.x0 + inset;
    var y0 = block.y0 + inset;
    var x1 = block.x1 - inset;
    var y1 = block.y1 - inset;
    if (x1 - x0 + 1 < CITY_MIN_BUILDING || y1 - y0 + 1 < CITY_MIN_BUILDING) return null;
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

  RK.MapGenCity = {
    generateCity: generateCity,
    getBuilding: getBuilding,
  };
})();
