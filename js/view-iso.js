// Вид изометрический: сетка проецируется на экран под углом, камера крутится
// в её плоскости с шагом 45°.
//
// Геометрия диметрии 2:1. Клетка (x, y) — ромб шириной ISO_TILE и вдвое ниже;
// при повороте на 45° взгляд идёт вдоль оси сетки, и ромб становится
// прямоугольником 2:1. Стена поднимается над клеткой. Порядок отрисовки — по
// глубине: ближняя клетка рисуется позже, а сама глубина зависит от угла.
// Поэтому список сцены сортируется, а не рисуется по категориям: стена должна
// закрыть того, кто за ней.
//
// Персонажи, предметы и декор — билборды: мировой спрайт ставится вертикально
// на ромб клетки. Пол и стены берутся из изо-атласа, а если его нет — рисуются
// кодом по палитре стиля локации.

(function () {
  var C = RK.CONFIG;

  var state = { zoom: 1, scale: 1, width: 1920, height: 1056, angle: 0, basis: null };
  // Сдвиг мира на экране: чтобы герой оказался в центре кадра.
  var camera = { x: 0, y: 0 };

  // Порядок внутри одной глубины: пол под стеной, стена под тем, что стоит на ней.
  var RANK = {
    cell: 0,
    water: 1,
    decal: 2,
    zone: 3,
    torch: 4,
    prop: 5,
    actor: 6,
  };

  function tileWidth(zoom, scale) {
    return Math.max(2, Math.round(C.ISO_TILE * zoom * scale));
  }

  function setup(next) {
    state.zoom = next.zoom;
    state.scale = next.scale;
    state.width = next.width;
    state.height = next.height;
    state.angle = normalizedAngle(next.angle);
    state.basis = null;
  }

  function normalizedAngle(angle) {
    var value = Number(angle);
    if (!isFinite(value)) return 0;
    return ((value % 360) + 360) % 360;
  }

  // Базис экрана: куда ложатся шаги сетки по x и по y. Считается на кадр.
  // Поворот — это поворот сетки в её плоскости: при 0/90/180/270 клетка
  // остаётся ромбом, при 45° взгляд идёт вдоль оси и ромб становится
  // прямоугольником. Поэтому угол непрерывный, а не набор из четырёх знаков.
  function computeBasis() {
    var w = tileWidth(state.zoom, state.scale);
    var h = w / 2;
    var rad = state.angle * Math.PI / 180;
    var c = Math.cos(rad);
    var s = Math.sin(rad);
    var ex = { x: (c - s) * w / 2, y: (s + c) * h / 2 };
    var ey = { x: (-s - c) * w / 2, y: (c - s) * h / 2 };
    var det = ex.x * ey.y - ey.x * ex.y;
    // Матрица переносит арт, нарисованный под стандартный ромб, в текущий
    // базис: пол и верхушки стен остаются текстурированными при повороте.
    var det0 = w * h / 2;
    return {
      w: w,
      h: h,
      ex: ex,
      ey: ey,
      depthX: s + c,
      depthY: c - s,
      det: det,
      art: {
        a: (ex.x - ey.x) * (h / 2) / det0,
        b: (ex.y - ey.y) * (h / 2) / det0,
        c: (ex.x + ey.x) * (w / 2) / det0,
        d: (ex.y + ey.y) * (w / 2) / det0,
      },
    };
  }

  function basis() {
    if (!state.basis) state.basis = computeBasis();
    return state.basis;
  }

  // Проекция непрерывных координат клетки: центр клетки — (0.5, 0.5).
  function project(x, y) {
    var b = basis();
    return { x: x * b.ex.x + y * b.ey.x, y: x * b.ex.y + y * b.ey.y };
  }

  // Глубина: чем больше, тем ближе к зрителю. Меняется вместе с поворотом.
  function depthOf(x, y) {
    var b = basis();
    return b.depthX * x + b.depthY * y;
  }

  function setCamera(pos) {
    var p = project(pos.x + 0.5, pos.y + 0.5);
    camera.x = state.width / 2 - p.x;
    camera.y = state.height / 2 - p.y;
  }

  function begin(ctx) {}

  function end(ctx) {}

  // Точка мира на экране.
  function point(x, y) {
    var p = project(x, y);
    return { x: p.x + camera.x, y: p.y + camera.y };
  }

  // Экран обратно в клетку: обратная проекция базиса.
  function pick(px, py) {
    var b = basis();
    var wx = px - camera.x;
    var wy = py - camera.y;
    return {
      x: Math.floor((wx * b.ey.y - b.ey.x * wy) / b.det),
      y: Math.floor((b.ex.x * wy - wx * b.ex.y) / b.det),
    };
  }

  function invalidate() {}

  // Клетка на экране: ромб при осевом повороте, прямоугольник при 45°.
  // scale ужимает контур вокруг центра — так рисуются вода и метки на полу.
  function cellPath(ctx, x, y, scale) {
    var b = basis();
    var s = scale == null ? 1 : scale;
    var ax = (b.ex.x + b.ey.x) * s / 2;
    var ay = (b.ex.y + b.ey.y) * s / 2;
    var bx = (b.ex.x - b.ey.x) * s / 2;
    var by = (b.ex.y - b.ey.y) * s / 2;
    ctx.beginPath();
    ctx.moveTo(x + ax, y + ay);
    ctx.lineTo(x + bx, y + by);
    ctx.lineTo(x - ax, y - ay);
    ctx.lineTo(x - bx, y - by);
    ctx.closePath();
  }

  // Клетки карты не меняются в пределах этажа: их список и порядок по глубине
  // кэшируются, заново считается только видимость. С поворотом порядок меняется,
  // поэтому в кэше лежит и угол, под который список собран.
  var cellCache = new WeakMap();

  function cellsOf(map) {
    var cached = cellCache.get(map);
    if (cached && cached.angle === state.angle) return cached.cells;
    var cells = [];
    var windowTiles = {};
    var windows = map.windows || [];
    for (var wi = 0; wi < windows.length; wi++) {
      windowTiles[windows[wi].y + ',' + windows[wi].x] = true;
    }
    for (var y = 0; y < map.h; y++) {
      for (var x = 0; x < map.w; x++) {
        var tile = map.tiles[y][x];
        var styleId = RK.Scene.styleIdAt(map, x, y);
        cells.push({
          x: x,
          y: y,
          tile: tile,
          styleId: styleId,
          shade: RK.Scene.shadeAt(map, x, y, tile, styleId),
          window: !!windowTiles[y + ',' + x],
          depth: depthOf(x, y),
          rank: tile === 1 ? RANK.cell : RANK.cell + 1,
        });
      }
    }
    cells.sort(function (a, b) {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.rank - b.rank;
    });
    cellCache.set(map, { angle: state.angle, cells: cells });
    return cells;
  }

  // Динамические объекты: их немного, и глубина у них меняется каждый ход.
  // Поле ground отличает то, что лежит на земле (пятно света, кровь, зона),
  // от того, что стоит на ней: наземное рисуется первым слоем.
  function entriesOf(scene) {
    var entries = [];
    var push = function (entry) {
      entry.depth = depthOf(entry.x, entry.y);
      entries.push(entry);
    };

    for (var i = 0; i < scene.lakes.length; i++) {
      push({ kind: 'lake', x: scene.lakes[i].x, y: scene.lakes[i].y, item: scene.lakes[i], rank: RANK.water, ground: true });
    }
    for (var s = 0; s < scene.streams.length; s++) {
      push({ kind: 'stream', x: scene.streams[s].x, y: scene.streams[s].y, item: scene.streams[s], rank: RANK.water, ground: true });
    }
    for (var d = 0; d < scene.decor.length; d++) {
      push({ kind: 'decor', x: scene.decor[d].x, y: scene.decor[d].y, item: scene.decor[d], rank: RANK.prop });
    }
    for (var b = 0; b < scene.blood.length; b++) {
      push({ kind: 'blood', x: scene.blood[b].x, y: scene.blood[b].y, item: scene.blood[b], rank: RANK.decal, ground: true });
    }
    for (var z = 0; z < scene.zones.length; z++) {
      push({ kind: 'zone', x: scene.zones[z].x, y: scene.zones[z].y, item: scene.zones[z], rank: RANK.zone, ground: true });
    }
    for (var t = 0; t < scene.torches.length; t++) {
      push({ kind: 'torchGlow', x: scene.torches[t].x, y: scene.torches[t].y, item: scene.torches[t], rank: RANK.torch, ground: true });
      push({ kind: 'torch', x: scene.torches[t].x, y: scene.torches[t].y, item: scene.torches[t], rank: RANK.torch });
    }
    for (var p = 0; p < scene.pois.length; p++) {
      push({ kind: 'poi', x: scene.pois[p].x, y: scene.pois[p].y, item: scene.pois[p], rank: RANK.decal, ground: true });
    }
    for (var e = 0; e < scene.exits.length; e++) {
      push({ kind: 'exit', x: scene.exits[e].x, y: scene.exits[e].y, item: scene.exits[e], rank: RANK.prop });
    }
    for (var dr = 0; dr < scene.doors.length; dr++) {
      push({ kind: 'door', x: scene.doors[dr].x, y: scene.doors[dr].y, item: scene.doors[dr], rank: RANK.prop });
    }
    for (var tr = 0; tr < scene.traps.length; tr++) {
      push({ kind: 'trap', x: scene.traps[tr].x, y: scene.traps[tr].y, item: scene.traps[tr], rank: RANK.decal, ground: true });
    }
    for (var ch = 0; ch < scene.chests.length; ch++) {
      push({ kind: 'chest', x: scene.chests[ch].x, y: scene.chests[ch].y, item: scene.chests[ch], rank: RANK.prop });
    }
    for (var n = 0; n < scene.npcs.length; n++) {
      push({ kind: 'npc', x: scene.npcs[n].x, y: scene.npcs[n].y, item: scene.npcs[n], rank: RANK.actor });
    }
    if (scene.stair) {
      push({ kind: 'stair', x: scene.stair.x, y: scene.stair.y, item: scene.stair, rank: RANK.prop });
    }
    for (var it = 0; it < scene.items.length; it++) {
      push({ kind: 'itemGlow', x: scene.items[it].x, y: scene.items[it].y, item: scene.items[it], rank: RANK.decal, ground: true });
      push({ kind: 'item', x: scene.items[it].x, y: scene.items[it].y, item: scene.items[it], rank: RANK.decal });
    }
    for (var en = 0; en < scene.enemies.length; en++) {
      if (scene.enemies[en].boss) {
        push({ kind: 'bossGlow', x: scene.enemies[en].x, y: scene.enemies[en].y, item: scene.enemies[en], rank: RANK.actor, ground: true });
      }
      if (scene.enemies[en].champion) {
        push({ kind: 'championRing', x: scene.enemies[en].x, y: scene.enemies[en].y, item: scene.enemies[en], rank: RANK.actor, ground: true });
      }
      push({ kind: 'enemy', x: scene.enemies[en].x, y: scene.enemies[en].y, item: scene.enemies[en], rank: RANK.actor });
    }
    for (var pa = 0; pa < scene.party.length; pa++) {
      push({ kind: 'party', x: scene.party[pa].x, y: scene.party[pa].y, item: scene.party[pa], rank: RANK.actor });
    }

    entries.sort(function (a, b) {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.rank - b.rank;
    });
    return entries;
  }

  // Отрисовка идёт тремя слоями: пол, наземные пятна, стены и всё, что стоит на
  // земле. Порядок по глубине остаётся внутри слоя стен и объектов.
  // Пятна лежат в своём слое, иначе соседняя клетка пола закрывает собой
  // половину пятна света, а круг зоны — его край.
  function drawScene(ctx, scene, T, tNow) {
    var w = tileWidth(state.zoom, state.scale);
    var h = w / 2;
    var cells = cellsOf(scene.map);
    var entries = entriesOf(scene);
    var floors = [];
    var walls = [];
    var ground = [];
    var objects = [];
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].tile === 1) floors.push(cells[i]);
      else walls.push(cells[i]);
    }
    for (var e = 0; e < entries.length; e++) {
      if (entries[e].ground) ground.push(entries[e]);
      else objects.push(entries[e]);
    }

    for (var f = 0; f < floors.length; f++) drawFloorCell(ctx, scene, floors[f], w, h);
    for (var g = 0; g < ground.length; g++) drawEntry(ctx, scene, ground[g], w, h, tNow, true);

    var wi = 0;
    var oi = 0;
    while (wi < walls.length || oi < objects.length) {
      var takeWall = oi >= objects.length;
      if (!takeWall && wi < walls.length) {
        var wall = walls[wi];
        var object = objects[oi];
        takeWall = wall.depth < object.depth || (wall.depth === object.depth && wall.rank <= object.rank);
      }
      if (takeWall) {
        drawWallCell(ctx, scene, walls[wi], w, h);
        wi++;
      } else {
        drawEntry(ctx, scene, objects[oi], w, h, tNow, false);
        oi++;
      }
    }

    // Герой поверх всего: в изометрии его иначе закрывает стена.
    if (scene.hero) drawHero(ctx, scene.hero, w, h, tNow);
  }

  // Клетка пола: тайл и затенение у стены по краю клетки.
  function drawFloorCell(ctx, scene, cell, w, h) {
    var map = scene.map;
    var explored = RK.Scene.opened(map, cell.x, cell.y);
    var visible = RK.Scene.seen(map, cell.x, cell.y);
    var x = point(cell.x + 0.5, cell.y + 0.5).x;
    var y = point(cell.x + 0.5, cell.y + 0.5).y;
    drawFloor(ctx, cell, x, y, w, h, visible, explored);
    drawFloorWallShadow(ctx, map, cell, x, y);
  }

  // Клетка стены: блок с боковыми гранями и верхушкой.
  function drawWallCell(ctx, scene, cell, w, h) {
    var map = scene.map;
    var explored = RK.Scene.opened(map, cell.x, cell.y);
    var visible = RK.Scene.seen(map, cell.x, cell.y);
    var x = point(cell.x + 0.5, cell.y + 0.5).x;
    var y = point(cell.x + 0.5, cell.y + 0.5).y;
    drawWall(ctx, scene, cell, x, y, w, h, visible, explored);
  }

  function styleColor(styleId, shade, wall) {
    var style = C.MAP_STYLES[styleId];
    if (!style) return null;
    var colors = wall ? style.wallColors : style.colors;
    if (!colors || !colors[shade]) return null;
    return colors[shade];
  }

  // Цвет стены без прозрачности: подложка атласа и стилевой оттенок.
  function solidWallColor(styleId, shade) {
    var tint = styleColor(styleId, shade, true);
    if (!tint) return null;
    var match = /rgba?\(([^)]+)\)/.exec(tint);
    if (!match) return tint;
    var parts = match[1].split(',').map(function (part) { return parseFloat(part); });
    var alpha = parts.length > 3 ? parts[3] : 1;
    var base = [110, 98, 118];
    return 'rgb(' + Math.round(base[0] * (1 - alpha) + parts[0] * alpha) + ',' +
      Math.round(base[1] * (1 - alpha) + parts[1] * alpha) + ',' +
      Math.round(base[2] * (1 - alpha) + parts[2] * alpha) + ')';
  }

  // Спрайт атласа нарисован под стандартный ромб 64×32. При повороте камеры
  // его переносит в текущий базис та же матрица, что и саму клетку.
  function drawArt(ctx, sprite, x, y, w, anchorX, anchorY) {
    var b = basis();
    var k = w / 64;
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(b.art.a, b.art.b, b.art.c, b.art.d, 0, 0);
    RK.Assets.drawIso(ctx, sprite, anchorX * k, anchorY * k, 64 * k, 64 * k);
    ctx.restore();
  }

  // Верхушка стены: у спрайта стены она занимает верхнюю половину 64×64,
  // остальное — грани. Обрезка по клетке оставляет только верхнюю грань.
  function drawWallTop(ctx, sprite, x, y, w) {
    var b = basis();
    var k = w / 64;
    ctx.save();
    cellPath(ctx, x, y, 1);
    ctx.clip();
    ctx.translate(x, y);
    ctx.transform(b.art.a, b.art.b, b.art.c, b.art.d, 0, 0);
    RK.Assets.drawIso(ctx, sprite, -32 * k, -16 * k, 64 * k, 64 * k);
    ctx.restore();
  }

  function drawFloor(ctx, cell, x, y, w, h, visible, explored) {
    var A = RK.Assets;
    var sprite = A.isoFloor ? A.isoFloor(cell.styleId, cell.shade, visible, explored) : null;
    if (sprite) {
      drawArt(ctx, sprite, x, y, w, -32, -48);
      return;
    }
    if (!explored) {
      ctx.fillStyle = '#15121f';
      cellPath(ctx, x, y, 1);
      ctx.fill();
      return;
    }
    ctx.save();
    ctx.globalAlpha = visible ? 1 : 0.45;
    ctx.fillStyle = (cell.x + cell.y) % 2 === 0 ? '#3a3550' : '#35314a';
    cellPath(ctx, x, y, 1);
    ctx.fill();
    var tint = styleColor(cell.styleId, cell.shade, false);
    if (tint) {
      ctx.fillStyle = tint;
      cellPath(ctx, x, y, 1);
      ctx.fill();
    }
    ctx.restore();
  }

  // Нижний угол клетки и два ребра из него: только эти две грани видны зрителю.
  function bottomCorner(x, y) {
    var b = basis();
    var signs = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
    var best = null;
    for (var i = 0; i < signs.length; i++) {
      var sx = signs[i][0];
      var sy = signs[i][1];
      var px = x + (sx * b.ex.x + sy * b.ey.x) / 2;
      var py = y + (sx * b.ex.y + sy * b.ey.y) / 2;
      if (!best || py > best.py) best = { sx: sx, sy: sy, px: px, py: py };
    }
    return {
      x: best.px,
      y: best.py,
      sx: best.sx,
      sy: best.sy,
      e1: { x: -best.sx * b.ex.x, y: -best.sx * b.ex.y },
      e2: { x: -best.sy * b.ey.x, y: -best.sy * b.ey.y },
    };
  }

  // Стена ли клетка: за краем карты и по нераскрытым клеткам стен нет.
  function wallAt(map, x, y) {
    if (!map || !map.tiles) return false;
    if (y < 0 || y >= map.h || x < 0 || x >= map.w) return false;
    var row = map.tiles[y];
    return !!row && row[x] !== 1;
  }

  // Пол темнеет у стыка со стеной: блок стоит на земле, а не парит над ней.
  // Тень мягкая полоса вдоль ребра: у клетки стены ровно два соседа.
  function drawFloorWallShadow(ctx, map, cell, x, y) {
    if (!map || !map.tiles) return;
    var b = basis();
    var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    var depth = b.w * 0.42;
    ctx.save();
    for (var i = 0; i < dirs.length; i++) {
      var dx = dirs[i][0];
      var dy = dirs[i][1];
      if (!wallAt(map, cell.x + dx, cell.y + dy)) continue;
      var ox;
      var oy;
      var ax;
      var ay;
      var bx;
      var by;
      // Общее ребро идёт вдоль второй оси клетки.
      if (dx) {
        ox = dx * b.ex.x / 2;
        oy = dx * b.ex.y / 2;
        ax = x + ox - b.ey.x / 2;
        ay = y + oy - b.ey.y / 2;
        bx = x + ox + b.ey.x / 2;
        by = y + oy + b.ey.y / 2;
      } else {
        ox = dy * b.ey.x / 2;
        oy = dy * b.ey.y / 2;
        ax = x + ox - b.ex.x / 2;
        ay = y + oy - b.ex.y / 2;
        bx = x + ox + b.ex.x / 2;
        by = y + oy + b.ex.y / 2;
      }
      // Полоса идёт от ребра внутрь клетки, к её центру.
      var midX = (ax + bx) / 2;
      var midY = (ay + by) / 2;
      var inX = x - midX;
      var inY = y - midY;
      var len = Math.sqrt(inX * inX + inY * inY) || 1;
      inX = inX / len * depth;
      inY = inY / len * depth;
      var gradient = ctx.createLinearGradient(midX, midY, midX + inX, midY + inY);
      gradient.addColorStop(0, 'rgba(5, 3, 9, 0.42)');
      gradient.addColorStop(1, 'rgba(5, 3, 9, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + inX, by + inY);
      ctx.lineTo(ax + inX, ay + inY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function wallFace(ctx, corner, edge, height, color, light, styleId) {
    // Грань непрозрачная и с падением вниз: стена стоит, а не просвечивает полом.
    var gradient = ctx.createLinearGradient(0, corner.y - height, 0, corner.y);
    gradient.addColorStop(0, shadeRgb(color, light ? 1.12 : 0.92));
    gradient.addColorStop(1, shadeRgb(color, light ? 0.72 : 0.54));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(corner.x, corner.y);
    ctx.lineTo(corner.x + edge.x, corner.y + edge.y);
    ctx.lineTo(corner.x + edge.x, corner.y + edge.y - height);
    ctx.lineTo(corner.x, corner.y - height);
    ctx.closePath();
    ctx.fill();
    // Кладка: ряды кирпича со смещёнными вертикальными стыками.
    ctx.save();
    ctx.clip();
    var rows = 4;
    ctx.lineWidth = 1;
    ctx.strokeStyle = light ? 'rgba(255, 235, 200, 0.16)' : 'rgba(10, 6, 12, 0.32)';
    for (var row = 1; row < rows; row++) {
      var t = row / rows;
      ctx.beginPath();
      ctx.moveTo(corner.x, corner.y - height * t);
      ctx.lineTo(corner.x + edge.x, corner.y + edge.y - height * t);
      ctx.stroke();
    }
    ctx.strokeStyle = light ? 'rgba(255, 235, 200, 0.12)' : 'rgba(10, 6, 12, 0.28)';
    for (var r = 0; r < rows; r++) {
      var offset = (r % 2) ? 0.28 : 0.64;
      var jx = corner.x + edge.x * offset;
      var jy = corner.y + edge.y * offset;
      ctx.beginPath();
      ctx.moveTo(jx, jy - height * (r / rows));
      ctx.lineTo(jx, jy - height * ((r + 1) / rows));
      ctx.stroke();
    }
    // Светлая кромка сверху: верхняя грань ловит свет и отделяет стену от верха.
    ctx.strokeStyle = light ? 'rgba(255, 240, 210, 0.22)' : 'rgba(255, 240, 210, 0.1)';
    ctx.beginPath();
    ctx.moveTo(corner.x, corner.y - height);
    ctx.lineTo(corner.x + edge.x, corner.y + edge.y - height);
    ctx.stroke();
    // Тематическая деталь на грани: лёд, магма, мох, слизь или фреска.
    if (styleId === 'magma') {
      ctx.strokeStyle = 'rgba(255, 116, 36, 0.55)';
      ctx.beginPath();
      ctx.moveTo(corner.x + edge.x * 0.2, corner.y - height * 0.18);
      ctx.lineTo(corner.x + edge.x * 0.45, corner.y + edge.y * 0.45 - height * 0.55);
      ctx.lineTo(corner.x + edge.x * 0.7, corner.y + edge.y * 0.7 - height * 0.3);
      ctx.stroke();
    } else if (styleId === 'ice') {
      ctx.strokeStyle = 'rgba(226, 250, 255, 0.3)';
      ctx.beginPath();
      ctx.moveTo(corner.x + edge.x * 0.15, corner.y - height * 0.12);
      ctx.lineTo(corner.x + edge.x * 0.6, corner.y + edge.y * 0.6 - height * 0.72);
      ctx.stroke();
    } else if (styleId === 'fungal') {
      ctx.fillStyle = 'rgba(150, 244, 182, 0.22)';
      for (var f = 1; f <= 3; f++) {
        ctx.fillRect(corner.x + edge.x * (f / 4), corner.y + edge.y * (f / 4) - height * 0.35, 2, 2);
      }
    } else if (styleId === 'forest') {
      ctx.fillStyle = 'rgba(76, 118, 62, 0.3)';
      ctx.fillRect(corner.x + edge.x * 0.12, corner.y - height * 0.28, Math.abs(edge.x) * 0.7, height * 0.28);
    } else if (styleId === 'sewer') {
      ctx.fillStyle = 'rgba(88, 164, 96, 0.18)';
      ctx.fillRect(corner.x, corner.y - height * 0.22, Math.abs(edge.x), height * 0.22);
    } else if (styleId === 'temple') {
      ctx.strokeStyle = 'rgba(247, 204, 104, 0.28)';
      ctx.beginPath();
      ctx.moveTo(corner.x + edge.x * 0.5, corner.y + edge.y * 0.5 - height * 0.8);
      ctx.lineTo(corner.x + edge.x * 0.5, corner.y + edge.y * 0.5 - height * 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Нижний край стены: тонкая тень прижимает блок к полу.
  function wallBase(ctx, corner, edge) {
    ctx.save();
    ctx.strokeStyle = 'rgba(4, 2, 8, 0.45)';
    ctx.lineWidth = Math.max(1, Math.abs(edge.x) * 0.06);
    ctx.beginPath();
    ctx.moveTo(corner.x, corner.y);
    ctx.lineTo(corner.x + edge.x, corner.y + edge.y);
    ctx.stroke();
    ctx.restore();
  }

  // Окно на боковой грани стены: спрайт ложится на грань, а не на верхушку.
  function drawWallWindow(ctx, corner, edge, height, alpha) {
    var sprite = RK.Assets.sprite ? RK.Assets.sprite('wallWindow') : null;
    if (!sprite) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Единичный квадрат спрайта раскладывается в параллелограмм грани.
    ctx.transform(edge.x * 0.4, edge.y * 0.4, 0, -height * 0.55,
      corner.x + edge.x * 0.3, corner.y + edge.y * 0.3 - height * 0.72);
    ctx.drawImage(sprite, 0, 0, 1, 1);
    ctx.restore();
  }

  function drawWall(ctx, scene, cell, x, y, w, h, visible, explored) {
    var A = RK.Assets;
    var sprite = A.isoWall ? A.isoWall(cell.styleId, cell.shade, visible, explored) : null;
    if (!explored) {
      ctx.fillStyle = '#15121f';
      cellPath(ctx, x, y, 1);
      ctx.fill();
      return;
    }
    var wallH = C.ISO_WALL_H * (w / C.ISO_TILE);
    ctx.save();
    ctx.globalAlpha = visible ? 1 : 0.45;
    var tint = solidWallColor(cell.styleId, cell.shade);
    var top = tint || '#6b5344';
    // Сначала боковые грани, потом верх: стык получается чистым.
    var corner = bottomCorner(x, y);
    var map = scene && scene.map;
    // Внутренние грани двух соседних стен не видны: их закрывает сосед.
    var hideE1 = wallAt(map, cell.x - corner.sx, cell.y);
    var hideE2 = wallAt(map, cell.x, cell.y - corner.sy);
    if (!hideE1) wallFace(ctx, corner, corner.e1, wallH, top, true, cell.styleId);
    if (!hideE2) wallFace(ctx, corner, corner.e2, wallH, top, false, cell.styleId);
    if (sprite) {
      drawWallTop(ctx, sprite, x, y - wallH, w);
    } else {
      ctx.fillStyle = top;
      cellPath(ctx, x, y - wallH, 1);
      ctx.fill();
    }
    // Окно на боковой грани: на верхушке оно лежало бы плашмя.
    if (cell.window) {
      if (!hideE1) drawWallWindow(ctx, corner, corner.e1, wallH, visible ? 0.95 : 0.4);
      else if (!hideE2) drawWallWindow(ctx, corner, corner.e2, wallH, visible ? 0.95 : 0.4);
    }
    ctx.strokeStyle = 'rgba(255, 236, 200, 0.14)';
    ctx.lineWidth = Math.max(1, w * 0.015);
    cellPath(ctx, x, y - wallH, 1);
    ctx.stroke();
    if (!hideE1) wallBase(ctx, corner, corner.e1);
    if (!hideE2) wallBase(ctx, corner, corner.e2);
    ctx.restore();
  }

  // Оттенок по яркости: цвет остаётся непрозрачным, поэтому стена не просвечивает.
  function shadeRgb(color, factor) {
    var match = /rgba?\(([^)]+)\)/.exec(color);
    if (!match) return color;
    var parts = match[1].split(',').map(function (part) { return parseFloat(part); });
    var alpha = parts.length > 3 ? parts[3] : 1;
    return 'rgba(' + Math.round(parts[0] * factor) + ',' + Math.round(parts[1] * factor) + ',' +
      Math.round(parts[2] * factor) + ',' + alpha + ')';
  }

  // Фигура на плоскости земли: рисунок задаётся в клетках и проецируется базисом,
  // поэтому пятно света, тень и радиус зоны ложатся на сетку при любом угле камеры.
  function groundShape(ctx, cx, cy, draw) {
    var b = basis();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.transform(b.ex.x, b.ex.y, b.ey.x, b.ey.y, 0, 0);
    draw();
    ctx.restore();
  }

  // Смещение внутри клетки (доли клетки) в экранные координаты.
  function groundOffset(ox, oy) {
    var b = basis();
    return { x: ox * b.ex.x + oy * b.ey.x, y: ox * b.ex.y + oy * b.ey.y };
  }

  // Мягкая тень под ногами: круг на земле, сплюснутый самой проекцией.
  function drawContactShadow(ctx, x, y, size, alpha) {
    var radius = 0.42 * size / (0.9 * tileWidth(state.zoom, state.scale));
    ctx.save();
    ctx.globalAlpha = (alpha == null ? 1 : alpha) * 0.38;
    groundShape(ctx, x, y, function () {
      var shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      shadow.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
      shadow.addColorStop(0.65, 'rgba(0, 0, 0, 0.3)');
      shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // Покачивание и наклон: шаг двигает спрайт, ожидание даёт лёгкое дыхание.
  // walk — идёт ли актёр; frame — кадр шага (0 или 1) для анимации.
  function actorMotion(item, tNow, size) {
    var cellX = item.x;
    var cellY = item.y;
    var pos = item.pos || { x: cellX, y: cellY };
    var dx = pos.x - cellX;
    var walking = Math.abs(dx) + Math.abs(pos.y - cellY) > 0.01;
    var phase = (tNow || 0) * (walking ? 0.02 : 0.002) + item.x * 0.9 + item.y * 0.5;
    var bob = walking
      ? -Math.abs(Math.sin(phase)) * size * 0.06
      : Math.sin(phase) * size * 0.012;
    // Кадр шага переключается при движении: 0 и 1 чередуются каждые ~150 мс.
    var frame = walking ? (Math.floor((tNow || 0) / 150) % 2) : 0;
    return { bob: bob, lean: walking ? dx * 0.12 : 0, walk: walking, frame: frame };
  }

  // Спрайт-билборд: мировой спрайт стоит вертикально на ромбе клетки.
  // При движении актера подменяет кадр шага: <имя>_walk1 / <имя>_walk2.
  function drawBillboard(ctx, asset, fallback, x, y, size, alpha, motion) {
    var A = RK.Assets;
    drawContactShadow(ctx, x, y, size, alpha);
    var bob = motion ? motion.bob : 0;
    var lean = motion ? motion.lean : 0;
    // Кадр шага выбирается до отрисовки, чтобы наклон и прозрачность
    // применялись к нему так же, как к базовому спрайту.
    var walkAsset = motion && motion.walk && asset
      ? asset + (motion.frame === 1 ? '_walk2' : '_walk1')
      : null;
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    if (lean) {
      ctx.translate(x, y + bob);
      ctx.transform(1, 0, lean, 1, 0, 0);
      x = 0;
      y = 0;
    } else {
      y += bob;
    }
    // Нет кадра шага — остаёмся на базовом спрайте.
    if (!walkAsset || !A.draw(ctx, walkAsset, x - size / 2, y - size, size)) {
      if (!A.draw(ctx, asset, x - size / 2, y - size, size) && fallback && fallback !== asset) {
        A.draw(ctx, fallback, x - size / 2, y - size, size);
      }
    }
    ctx.restore();
  }

  function drawEntry(ctx, scene, entry, w, h, tNow) {
    var item = entry.item;
    // Партия и боссы уже несут плавную позицию шага; клетка нужна для порядка.
    var drawX = item.pos ? item.pos.x : entry.x;
    var drawY = item.pos ? item.pos.y : entry.y;
    var pos = point(drawX + 0.5, drawY + 0.5);
    var size = w * 0.9;
    // Слой: true — лежит на земле, false — стоит на ней.
    var onGround = entry.ground;

    switch (entry.kind) {
      case 'lake':
        if (!onGround) return;
        drawWater(ctx, pos, w, h, item, tNow, true, entry.x, entry.y);
        return;
      case 'stream':
        if (!onGround) return;
        drawWater(ctx, pos, w, h, item, tNow, false, entry.x, entry.y);
        return;
      case 'decor':
        if (onGround) return;
        drawBillboard(ctx, item.asset, null, pos.x, pos.y, size, item.visible ? 1 : 0.4);
        return;
      case 'blood':
        if (!onGround) return;
        drawBlood(ctx, pos, w, h, item);
        return;
      case 'zone':
        if (!onGround) return;
        drawZone(ctx, pos, w, h, item);
        return;
      case 'torchGlow':
        if (!onGround) return;
        drawTorchGlow(ctx, pos, w, h, item, tNow, size);
        return;
      case 'torch':
        if (onGround) return;
        drawTorch(ctx, pos, w, h, item, tNow, size);
        return;
      case 'poi':
        if (!onGround) return;
        drawGroundSprite(ctx, RK.Assets, item.type === 'ruins' ? 'decorStone' : 'decorGrass', pos, w, h, 0.5);
        return;
      case 'exit':
        if (onGround) return;
        drawBillboard(ctx, item.asset || 'stairs', null, pos.x, pos.y, size, item.visible ? 1 : 0.45);
        return;
      case 'door':
        if (onGround) return;
        drawDoor(ctx, pos, w, h, item, size);
        return;
      case 'trap':
        if (!onGround) return;
        drawFlatSprite(ctx, trapSprite(item), pos, 0.7, item.visible ? 1 : 0.55);
        return;
      case 'chest':
        if (onGround) return;
        drawBillboard(ctx, item.asset || 'chest', null, pos.x, pos.y, size, item.visible ? 1 : 0.45);
        return;
      case 'npc':
        if (onGround) return;
        drawNpc(ctx, pos, w, h, item, size);
        return;
      case 'stair':
        if (onGround) return;
        drawBillboard(ctx, item.asset || 'stairs', null, pos.x, pos.y, size, 1);
        return;
      case 'itemGlow':
        if (!onGround) return;
        drawItemGlow(ctx, pos, w, h, item);
        return;
      case 'item':
        if (onGround) return;
        drawItemSprite(ctx, pos, w, h, item);
        return;
      case 'bossGlow':
        if (!onGround) return;
        drawBossGlow(ctx, pos, w, h, tNow);
        return;
      case 'championRing':
        if (!onGround) return;
        drawChampionRing(ctx, pos, w, h);
        return;
      case 'enemy':
        if (onGround) return;
        drawEnemy(ctx, pos, w, h, item, tNow, size);
        return;
      case 'party':
        if (onGround) return;
        drawPartyMember(ctx, pos, w, h, item, size, tNow);
        return;
      default:
        return;
    }
  }

  function trapSprite(trap) {
    if (trap.state === 'disarmed' || trap.state === 'triggered') return C.TRAP_SPRITES[trap.state];
    return C.TRAP_SPRITES[trap.type] || C.TRAP_SPRITES.armed;
  }

  // Плоский спрайт на земле: ловушки лежат, а не стоят. Клетка — ромб, поэтому
  // спрайт ложится на плоскость через базис и повторяет наклон сетки.
  function drawFlatSprite(ctx, asset, pos, scale, alpha) {
    if (!asset) return;
    var b = basis();
    var sprite = RK.Assets.sprite ? RK.Assets.sprite(asset) : null;
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    if (sprite) {
      ctx.translate(pos.x, pos.y);
      ctx.transform(b.ex.x, b.ex.y, b.ey.x, b.ey.y, 0, 0);
      ctx.drawImage(sprite, -0.5 * scale, -0.5 * scale, scale, scale);
    } else {
      var size = b.w * scale;
      RK.Assets.draw(ctx, asset, pos.x - size / 2, pos.y - size / 4, size);
    }
    ctx.restore();
  }

  // Плоский спрайт на земле: ловушки и метки лежат, а не стоят.
  function drawGroundSprite(ctx, A, asset, pos, w, h, scale, alpha) {
    if (!asset) return;
    var size = w * scale;
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    A.draw(ctx, asset, pos.x - size / 2, pos.y - size * 0.25, size);
    ctx.restore();
  }

  function drawWater(ctx, pos, w, h, item, tNow, isLake, cellX, cellY) {
    ctx.save();
    ctx.globalAlpha = item.visible ? 0.94 : 0.34;
    ctx.fillStyle = isLake ? '#12455f' : '#14607f';
    cellPath(ctx, pos.x, pos.y, 0.92);
    ctx.fill();
    ctx.fillStyle = 'rgba(76, 184, 196, 0.22)';
    cellPath(ctx, pos.x, pos.y - h * 0.04, 0.7);
    ctx.fill();
    // Рябь: две дуги, бегущие по воде.
    var phase = tNow * 0.001 + (item.phase || 0);
    ctx.strokeStyle = 'rgba(217, 255, 240, 0.35)';
    ctx.lineWidth = Math.max(1, w * 0.02);
    for (var i = 0; i < 2; i++) {
      var offset = ((phase + i * 0.5) % 1) * 0.4 - 0.2;
      ctx.beginPath();
      ctx.ellipse(pos.x + offset * w * 0.2, pos.y, w * (0.1 + offset * 0.3), h * (0.05 + offset * 0.15), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Пена: только на открытых краях, где у клетки нет соседней воды.
    if (isLake && cellX != null && cellY != null && item.visible) drawFoam(ctx, w, item, tNow, cellX, cellY);
    ctx.restore();
  }

  function drawFoam(ctx, w, item, tNow, cellX, cellY) {
    var corners = [
      point(cellX, cellY),
      point(cellX + 1, cellY),
      point(cellX + 1, cellY + 1),
      point(cellX, cellY + 1),
    ];
    // Рёбра ромба в порядке углов; closed — сторона без соседа.
    var edges = [
      { from: 0, to: 1, closed: !item.top },
      { from: 1, to: 2, closed: !item.right },
      { from: 2, to: 3, closed: !item.bottom },
      { from: 3, to: 0, closed: !item.left },
    ];
    var dash = Math.max(1, w * 0.045);
    var phase = (tNow || 0) * 0.00016 + (item.phase || 0);
    ctx.fillStyle = 'rgba(226, 249, 255, 0.55)';
    for (var e = 0; e < edges.length; e++) {
      if (!edges[e].closed) continue;
      var a = corners[edges[e].from];
      var b = corners[edges[e].to];
      for (var k = 0; k < 2; k++) {
        var t = (phase + k * 0.5 + e * 0.19) % 1;
        var fx = a.x + (b.x - a.x) * t;
        var fy = a.y + (b.y - a.y) * t;
        ctx.fillRect(fx - dash / 2, fy - dash / 2, dash, dash);
      }
    }
  }

  // Кровь: лужа лежит на земле, поэтому смещение внутри клетки идёт по базису.
  function drawBlood(ctx, pos, w, h, item) {
    var offset = groundOffset(item.ox, item.oy);
    var center = { x: pos.x + offset.x, y: pos.y + offset.y };
    var radius = item.r * Math.SQRT2;
    ctx.save();
    ctx.globalAlpha = item.visible ? item.a : item.a * 0.35;
    groundShape(ctx, center.x, center.y, function () {
      ctx.fillStyle = '#6a1018';
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a01828';
      ctx.beginPath();
      ctx.ellipse(-radius * 0.2, 0, radius * 0.45, radius * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // Зона: радиус задан в клетках, поэтому круг ложится на сетку.
  function drawZone(ctx, pos, w, h, item) {
    var radius = item.radius;
    var harmful = item.type === 'weakAttack' || item.type === 'weakDefense';
    ctx.save();
    groundShape(ctx, pos.x, pos.y, function () {
      var gradient = ctx.createRadialGradient(0, 0, radius * 0.12, 0, 0, radius);
      gradient.addColorStop(0, harmful ? 'rgba(255, 45, 55, 0.34)' : 'rgba(55, 255, 125, 0.30)');
      gradient.addColorStop(1, harmful ? 'rgba(255, 45, 55, 0)' : 'rgba(55, 255, 125, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // Свечение на плоскости земли: круг в клетках, сплюснутый самой проекцией.
  // Без проекции край рваный — круг вырезает эллипс, а градиент в нём круглый.
  function groundGlow(ctx, x, y, radius, stops) {
    ctx.save();
    groundShape(ctx, x, y, function () {
      var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      for (var i = 0; i < stops.length; i++) glow.addColorStop(stops[i][0], stops[i][1]);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  var FLAME_FRAMES = ['torchFlame', 'torchFlame2', 'torchFlame3'];

  // Тень и тёплое пятно факела лежат на земле, поэтому рисуются наземным слоем.
  function drawTorchGlow(ctx, pos, w, h, item, tNow, size) {
    var flicker = 0.85 + 0.15 * Math.sin(tNow * 0.012 + item.phase);
    drawContactShadow(ctx, pos.x, pos.y, size, item.visible ? 1 : 0.4);
    if (!item.visible) return;
    groundGlow(ctx, pos.x, pos.y, 1.5 * flicker, [
      [0, 'rgba(255,170,60,0.35)'],
      [0.5, 'rgba(255,100,20,0.12)'],
      [1, 'rgba(255,80,0,0)'],
    ]);
  }

  function drawTorch(ctx, pos, w, h, item, tNow, size) {
    var flicker = 0.85 + 0.15 * Math.sin(tNow * 0.012 + item.phase);
    ctx.save();
    ctx.globalAlpha = item.visible ? 1 : 0.4;
    RK.Assets.draw(ctx, item.asset || 'torch', pos.x - size / 2, pos.y - size, size);
    if (item.visible) {
      // Три кадра пламени сменяются, чтобы огонь не застывал.
      var frame = FLAME_FRAMES[Math.floor(tNow * 0.011 + (item.phase || 0)) % FLAME_FRAMES.length];
      ctx.globalAlpha = 0.55 + 0.35 * flicker;
      if (!RK.Assets.draw(ctx, frame, pos.x - size / 2, pos.y - size * 1.05, size)) {
        RK.Assets.draw(ctx, item.flameAsset || 'torchFlame', pos.x - size / 2, pos.y - size * 1.05, size);
      }
      drawEmbers(ctx, pos, w, size, item, tNow);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // Угольки: короткие искры, поднимающиеся над пламенем.
  function drawEmbers(ctx, pos, w, size, item, tNow) {
    var dot = Math.max(1, w * 0.025);
    for (var i = 0; i < 3; i++) {
      var life = (tNow * 0.00055 + (item.phase || 0) * 0.13 + i * 0.33) % 1;
      var ex = pos.x + Math.sin((life + i) * 11 + (item.phase || 0)) * w * 0.12;
      var ey = pos.y - size * 0.75 - life * size * 0.7;
      ctx.globalAlpha = (1 - life) * 0.9;
      ctx.fillStyle = i === 0 ? '#ffe9a0' : '#ff8a2a';
      ctx.fillRect(ex, ey, dot, dot);
    }
  }

  // Дверь: спрайт стоит в стене, открытая створка прижата к проёму.
  function drawDoor(ctx, pos, w, h, item, size) {
    var open = item.state === 'open' || item.state === 'broken';
    ctx.save();
    ctx.globalAlpha = item.visible ? 1 : 0.45;
    var sprite = RK.Assets.sprite ? RK.Assets.sprite(item.asset || 'door') : null;
    if (sprite) {
      var width = open ? size * 0.45 : size;
      var left = pos.x - size / 2;
      ctx.drawImage(sprite, left, pos.y - size * 0.9, width, size);
      if (item.state === 'locked') {
        // Замок на полотне: маленькая латунная пластина.
        ctx.fillStyle = '#e2bd67';
        ctx.fillRect(pos.x - size * 0.06, pos.y - size * 0.5, size * 0.12, size * 0.12);
        ctx.strokeStyle = '#3a2818';
        ctx.lineWidth = Math.max(1, size * 0.02);
        ctx.strokeRect(pos.x - size * 0.06, pos.y - size * 0.5, size * 0.12, size * 0.12);
      }
      ctx.restore();
      return;
    }
    if (!RK.Assets.draw(ctx, item.asset || 'door', pos.x - size / 2, pos.y - size * 0.9, size)) {
      ctx.fillStyle = item.state === 'locked' ? '#8b352d' : '#704b31';
      ctx.fillRect(pos.x - w * 0.12, pos.y - h * 0.9, w * 0.24, h * 0.9);
      ctx.fillStyle = '#bd8b50';
      ctx.fillRect(pos.x - w * 0.1, pos.y - h * 0.7, w * 0.2, h * 0.06);
      ctx.fillRect(pos.x - w * 0.1, pos.y - h * 0.5, w * 0.2, h * 0.06);
    }
    ctx.restore();
  }

  function drawNpc(ctx, pos, w, h, item, size) {
    var visual = item.visual;
    if (!visual) return;
    drawContactShadow(ctx, pos.x, pos.y, size, item.visible ? 1 : 0.45);
    ctx.save();
    ctx.globalAlpha = item.visible ? 1 : 0.45;
    if (!RK.Assets.draw(ctx, visual.asset, pos.x - size / 2, pos.y - size, size)) {
      // Запасная фигура: тот же силуэт, что и в виде сверху.
      var u = size / 32;
      ctx.fillStyle = visual.primary;
      ctx.fillRect(pos.x - 6 * u, pos.y - 27 * u, 12 * u, 6 * u);
      ctx.fillStyle = visual.secondary;
      ctx.fillRect(pos.x - 5 * u, pos.y - 21 * u, 10 * u, 9 * u);
      ctx.fillStyle = visual.accent;
      ctx.fillRect(pos.x - 4 * u, pos.y - 20 * u, 8 * u, 6 * u);
      ctx.fillStyle = visual.secondary;
      ctx.fillRect(pos.x - 7 * u, pos.y - 12 * u, 6 * u, 9 * u);
      ctx.fillRect(pos.x + 1 * u, pos.y - 12 * u, 6 * u, 9 * u);
    }
    ctx.restore();
  }

  // Кольцо редкости под предметом лежит на земле.
  function drawItemGlow(ctx, pos, w, h, item) {
    var rarityColor = C.RARITY_COLORS[item.rarity] || C.RARITY_COLORS.common;
    drawContactShadow(ctx, pos.x, pos.y, w * 0.55, 1);
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = rarityColor;
    cellPath(ctx, pos.x, pos.y, 0.6);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = rarityColor;
    ctx.lineWidth = Math.max(1, w * 0.03);
    cellPath(ctx, pos.x, pos.y, 0.6);
    ctx.stroke();
    ctx.restore();
  }

  function drawItemSprite(ctx, pos, w, h, item) {
    var size = w * 0.5;
    if (!RK.Assets.draw(ctx, item.asset, pos.x - size / 2, pos.y - size * 0.8, size)) {
      RK.Assets.draw(ctx, item.fallback, pos.x - size / 2, pos.y - size * 0.8, size);
    }
  }

  function drawEnemy(ctx, pos, w, h, item, tNow, size) {
    var drawSize = size;
    // Босс дышит: спрайт и свечение пульсируют в одном ритме.
    if (item.boss) drawSize = size * (1.15 + 0.025 * Math.sin(tNow * 0.006));
    else if (item.enhanced) drawSize = size * (item.sizeScale || 1.25);
    drawBillboard(ctx, item.asset, item.fallback, pos.x, pos.y, drawSize, null, actorMotion(item, tNow, drawSize));
  }

  // Кольцо чемпиона: круг на земле вокруг врага.
  function drawChampionRing(ctx, pos, w, h) {
    ctx.save();
    ctx.strokeStyle = '#f2c94c';
    ctx.lineWidth = Math.max(2, Math.round(w * 0.08));
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, w * 0.58, h * 0.58, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawBossGlow(ctx, pos, w, h, tNow) {
    var pulse = 0.5 + 0.5 * Math.sin(tNow * 0.006);
    var radius = (0.72 + pulse * 0.18) * Math.SQRT2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    groundGlow(ctx, pos.x, pos.y, radius, [
      [0, 'rgba(255, 24, 32, 0.28)'],
      [0.55, 'rgba(220, 12, 24, 0.16)'],
      [1, 'rgba(180, 0, 16, 0)'],
    ]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 48, 48, ' + (0.3 + pulse * 0.45).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, w * (0.35 + pulse * 0.25), h * (0.35 + pulse * 0.25), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPartyMember(ctx, pos, w, h, item, size, tNow) {
    // Партия уже несёт плавную позицию шага; покачивание нужно герою и врагам.
    drawBillboard(ctx, item.asset, item.fallback, pos.x, pos.y, size, null, actorMotion(item, tNow, size));
    drawGazeArrow(ctx, pos, w, item.facingX, item.facingY);
    ctx.fillStyle = '#ffd166';
    ctx.font = Math.max(8, Math.round(w * 0.28)) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(item.name, pos.x, pos.y - size - h * 0.2);
  }

  function drawHero(ctx, hero, w, h, tNow) {
    var pos = point(hero.pos.x + 0.5, hero.pos.y + 0.5);
    var size = w * 0.9;
    drawBillboard(ctx, hero.asset, hero.fallback, pos.x, pos.y, size, null, actorMotion(hero, tNow, size));
    drawGazeArrow(ctx, pos, w, hero.facingX, hero.facingY);
  }

  // Стрелка взгляда для изометрии: линия + треугольник в направлении взгляда.
  function drawGazeArrow(ctx, pos, w, facingX, facingY) {
    if (!facingX && !facingY) return;
    var len = Math.sqrt(facingX * facingX + facingY * facingY);
    var ux = facingX / len;
    var uy = facingY / len;
    var b = basis();
    var dx = ux * b.ex.x + uy * b.ey.x;
    var dy = ux * b.ex.y + uy * b.ey.y;
    var norm = Math.sqrt(dx * dx + dy * dy) || 1;
    dx = dx / norm * w * 0.28;
    dy = dy / norm * w * 0.28;
    // Боковые точки — перпендикуляр к направлению на экране.
    var side = w * 0.075;
    var dlen = Math.sqrt(dx * dx + dy * dy) || 1;
    var sx = -dy / dlen * side;
    var sy = dx / dlen * side;
    ctx.save();
    ctx.strokeStyle = C.COLORS.gaze || '#ffcc66';
    ctx.lineWidth = Math.max(1, w * 0.045);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x + dx * 0.7, pos.y + dy * 0.7);
    ctx.stroke();
    ctx.fillStyle = C.COLORS.gaze || '#ffcc66';
    ctx.beginPath();
    ctx.moveTo(pos.x + dx, pos.y + dy);
    ctx.lineTo(pos.x + dx * 0.18 + sx, pos.y + dy * 0.18 + sy);
    ctx.lineTo(pos.x + dx * 0.18 - sx, pos.y + dy * 0.18 - sy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Свет: темнота по всей карте, факелы и герой вырезают пятна на плоскости земли.
  function drawLighting(ctx, light, scene, T, tNow) {
    if (!light || !light.ctx || !scene.map.torches) return;
    var ambient = RK.View.ambientFor(scene.map);

    var lightCtx = light.ctx;
    lightCtx.clearRect(0, 0, light.canvas.width, light.canvas.height);
    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.fillStyle = 'rgba(6, 5, 12, ' + ambient.toFixed(3) + ')';
    lightCtx.fillRect(0, 0, light.canvas.width, light.canvas.height);
    lightCtx.globalCompositeOperation = 'destination-out';

    // Пятно света на земле: круг в клетках, сплюснутый самой проекцией.
    function punch(px, py, radius, strength) {
      lightCtx.save();
      groundShape(lightCtx, px, py, function () {
        var g = lightCtx.createRadialGradient(0, 0, 0, 0, 0, radius);
        g.addColorStop(0, 'rgba(0,0,0,' + strength.toFixed(3) + ')');
        g.addColorStop(0.45, 'rgba(0,0,0,' + (strength * 0.55).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        lightCtx.fillStyle = g;
        lightCtx.beginPath();
        lightCtx.arc(0, 0, radius, 0, Math.PI * 2);
        lightCtx.fill();
      });
      lightCtx.restore();
    }

    // Радиус света задан в клетках: столько клеток освещает факел.
    var baseR = (C.TORCH && C.TORCH.LIGHT_R) || 3.2;
    for (var i = 0; i < scene.torches.length; i++) {
      var tr = scene.torches[i];
      var flick = 0.88 + 0.12 * Math.sin(tNow * 0.014 + tr.phase);
      var pos = point(tr.x + 0.5 + tr.dx * 0.15, tr.y + 0.35 + tr.dy * 0.15);
      punch(pos.x, pos.y, baseR * flick, tr.visible ? 0.92 : 0.35);
    }

    if (scene.hero) {
      var heroPos = point(scene.hero.pos.x + 0.5, scene.hero.pos.y + 0.5);
      punch(heroPos.x, heroPos.y, 3.4, 0.75);
    }

    lightCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(light.canvas, 0, 0);

    ctx.globalCompositeOperation = 'lighter';
    for (var j = 0; j < scene.torches.length; j++) {
      var t2 = scene.torches[j];
      if (!t2.visible) continue;
      var f2 = 0.9 + 0.1 * Math.sin(tNow * 0.016 + t2.phase);
      var warmPos = point(t2.x + 0.5, t2.y + 0.35);
      groundGlow(ctx, warmPos.x, warmPos.y, baseR * 0.85 * f2, [
        [0, 'rgba(255,140,40,0.16)'],
        [0.5, 'rgba(255,80,20,0.06)'],
        [1, 'rgba(0,0,0,0)'],
      ]);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Подсветка клетки под курсором и маршрута автопрохода.
  function drawOverlays(ctx, scene, T) {
    var w = tileWidth(state.zoom, state.scale);
    var h = w / 2;
    if (RK.hover && RK.Scene.seen(scene.map, RK.hover.x, RK.hover.y)) {
      var hover = point(RK.hover.x + 0.5, RK.hover.y + 0.5);
      ctx.fillStyle = C.COLORS.hover;
      cellPath(ctx, hover.x, hover.y, 1);
      ctx.fill();
    }
    if (RK.hoverPath) {
      ctx.fillStyle = C.HOVER_PATH_COLOR;
      var steps = Math.min(RK.hoverPath.length, C.HOVER_PATH_MAX_STEPS);
      for (var i = 0; i < steps; i++) {
        var step = RK.hoverPath[i];
        var dot = point(step.x + 0.5, step.y + 0.5);
        var size = C.HOVER_PATH_DOT;
        ctx.beginPath();
        ctx.moveTo(dot.x, dot.y - size * 0.5);
        ctx.lineTo(dot.x + size * 0.5, dot.y);
        ctx.lineTo(dot.x, dot.y + size * 0.5);
        ctx.lineTo(dot.x - size * 0.5, dot.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Прицел дистанционной атаки: линия и кольцо вокруг врага.
    if (RK.ViewTarget && RK.ViewTarget.draw) {
      RK.ViewTarget.draw(ctx, w, function (x, y) {
        return point(x + 0.5, y + 0.5);
      });
    }
  }

  function rotateDir(sx, sy) {
    var b = basis();
    var steps = [
      { x: 1, y: 0 }, { x: -1, y: 0 },
      { x: 0, y: 1 }, { x: 0, y: -1 },
      { x: 1, y: 1 }, { x: -1, y: -1 },
      { x: 1, y: -1 }, { x: -1, y: 1 }
    ];
    var sLen = Math.sqrt(sx * sx + sy * sy) || 1;
    var nx = sx / sLen;
    var ny = sy / sLen;
    var best = null;
    var bestDot = -Infinity;
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      var vx = s.x * b.ex.x + s.y * b.ey.x;
      var vy = s.x * b.ex.y + s.y * b.ey.y;
      var vLen = Math.sqrt(vx * vx + vy * vy) || 1;
      var vnx = vx / vLen;
      var vny = vy / vLen;
      var dot = vnx * nx + vny * ny;
      if (dot > bestDot) {
        bestDot = dot;
        best = s;
      }
    }
    return best ? [best.x, best.y] : [0, 0];
  }

  RK.Views = RK.Views || {};
  RK.Views.iso = {
    name: 'iso',
    // Только этот вид умеет поворачиваться: в сеточных видах окно обзора не квадратное.
    rotatable: true,
    tileSize: tileWidth,
    setup: setup,
    setCamera: setCamera,
    begin: begin,
    end: end,
    pick: pick,
    point: point,
    invalidate: invalidate,
    drawScene: drawScene,
    drawLighting: drawLighting,
    drawOverlays: drawOverlays,
    rotateDir: rotateDir,
  };
})();
