// Вид сверху: клетки в ряд, тайлы квадратные.
//
// Рисует сцену (перечень того, что видно) так же, как это делалось до появления
// сцены: та же лепка, тот же порядок категорий, тот же запечённый пол.

(function () {
  var C = RK.CONFIG;

  var state = { zoom: 1, scale: 1, width: 0, height: 0 };
  var camera = { x: 0, y: 0 };
  var floorCanvas = null;
  var floorCtx = null;
  var floorCacheKey = null;
  var floorCacheMap = null;

  function tileSize(zoom, scale) {
    return Math.max(1, Math.round(C.TILE * zoom * scale));
  }

  function setup(next) {
    state.zoom = next.zoom;
    state.scale = next.scale;
    state.width = next.width;
    state.height = next.height;
  }

  function setCamera(pos) {
    camera.x = pos.x + 0.5 - (C.COLS / state.zoom) / 2;
    camera.y = pos.y + 0.5 - (C.ROWS / state.zoom) / 2;
  }

  function begin(ctx) {
    var T = tileSize(state.zoom, state.scale);
    ctx.save();
    ctx.translate(-camera.x * T, -camera.y * T);
  }

  function end(ctx) {
    ctx.restore();
  }

  // Пиксель обратно в клетку: вид сверху — обычная сетка.
  function pick(px, py) {
    var T = tileSize(state.zoom, state.scale);
    return { x: Math.floor(px / T + camera.x), y: Math.floor(py / T + camera.y) };
  }

  // Точка мира на экране: непрерывные координаты клетки, центр клетки — (0.5, 0.5).
  function point(x, y) {
    var T = tileSize(state.zoom, state.scale);
    return { x: (x - camera.x) * T, y: (y - camera.y) * T };
  }

  function invalidate() {
    floorCacheKey = null;
    floorCacheMap = null;
  }

  // Палитра пола: в мире — тинт стиля локации, в legacy-этажах — по номеру этажа.
  function floorDepthTint(map, floor) {
    var t = RK.Assets.floorGrayAmount ? RK.Assets.floorGrayAmount(floor) : 0;
    var style = isLocationMap(map) ? C.MAP_STYLES[map.style] : null;
    var palette = (style && style.tint) || C.FLOOR_PALETTES[((floor || 1) - 1) % C.FLOOR_PALETTES.length];
    return {
      gray: t,
      overlay: 'rgba(' + Math.round(70 + t * 40) + ',' + Math.round(72 + t * 35) + ',' + Math.round(78 + t * 30) + ',' + (t * 0.42).toFixed(3) + ')',
      cool: 'rgba(20, 24, 36, ' + (t * 0.18).toFixed(3) + ')',
      palette: palette,
    };
  }

  // Карта мира помнит тип локации или её id; иначе это legacy-этаж.
  function isLocationMap(map) {
    return !!(map && (map.locationType || map.locationId));
  }

  function inRect(rect, x, y) {
    return rect.x <= x && x < rect.x + rect.w && rect.y <= y && y < rect.y + rect.h;
  }

  // Пол и стены не меняются в пределах этажа, поэтому заливка печётся в offscreen-канвас.
  function bakeFloorLayer(ctx, scene, T) {
    var map = scene.map;
    var game = RK.GAME;
    var floor = game.floor || 1;
    var key = [map.w, map.h, T, floor, map.style, game.mapStyle,
      map.rooms && map.rooms.length, map.tavern && map.tavern.x,
      map.regions && map.regions.length].join('|');
    if (floorCacheKey === key && floorCacheMap === map && floorCanvas) return;

    if (!floorCanvas || floorCanvas.width !== map.w * T || floorCanvas.height !== map.h * T) {
      floorCanvas = document.createElement('canvas');
      floorCanvas.width = map.w * T;
      floorCanvas.height = map.h * T;
      floorCtx = floorCanvas.getContext('2d');
    }
    var A = RK.Assets;
    var tint = floorDepthTint(map, floor);
    var baked = floorCtx;
    baked.clearRect(0, 0, floorCanvas.width, floorCanvas.height);

    for (var y = 0; y < map.h; y++) {
      for (var x = 0; x < map.w; x++) {
        var explored = RK.Scene.opened(map, x, y);
        var tile = map.tiles[y][x];
        // Цвет стиля запечён в тайле, поэтому полупрозрачный оверлей поверх клетки не нужен.
        var styleId = RK.Scene.styleIdAt(map, x, y);
        A.drawFloorTile(baked, floor, tile, RK.Scene.seen(map, x, y), explored, x * T, y * T, T,
          styleId, RK.Scene.shadeAt(map, x, y, tile, styleId));
        if (explored) {
          if (floor <= 3 && tile === 1 && tint.gray > 0.01) {
            baked.fillStyle = tint.overlay;
            baked.fillRect(x * T, y * T, T, T);
            if (RK.Scene.seen(map, x, y)) {
              baked.fillStyle = tint.cool;
              baked.fillRect(x * T, y * T, T, T);
            }
          }
          baked.fillStyle = 'rgba(' + tint.palette + ',' + (tile === 1 ? '0.16' : '0.12') + ')';
          baked.fillRect(x * T, y * T, T, T);
          if (tile === 1 && map.tavern && inRect(map.tavern, x, y)) {
            baked.fillStyle = 'rgba(255, 209, 102, 0.08)';
            baked.fillRect(x * T, y * T, T, T);
          }
        }
      }
    }
    floorCacheKey = key;
    floorCacheMap = map;
  }

  function drawScene(ctx, scene, T, tNow) {
    bakeFloorLayer(ctx, scene, T);
    ctx.drawImage(floorCanvas, 0, 0);

    drawDecorations(ctx, scene, T, tNow);
    drawZones(ctx, scene, T);
    drawBlood(ctx, scene, T);
    drawTorches(ctx, scene, T, tNow);
    drawPoiMarkers(ctx, scene, T);
    drawExits(ctx, scene, T);
    drawInteractiveObjects(ctx, scene, T, tNow);
    drawNpcs(ctx, scene, T);
    drawStair(ctx, scene, T);
    drawItems(ctx, scene, T);
    drawEnemies(ctx, scene, T, tNow);
    drawParty(ctx, scene, T);
  }

  function drawDecorations(ctx, scene, T, tNow) {
    var A = RK.Assets;
    var decor = scene.decor;
    for (var i = 0; i < decor.length; i++) {
      var decoration = decor[i];
      if (!A || typeof A.draw !== 'function') continue;
      ctx.save();
      ctx.globalAlpha = decoration.visible ? 0.92 : 0.34;
      A.draw(ctx, decoration.asset, decoration.x * T, decoration.y * T, T);
      ctx.restore();
    }
    drawLakeTiles(ctx, scene, T, tNow);
    drawStreamTiles(ctx, scene, T, tNow);
  }

  function traceRoundedRect(ctx, x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawLakeTiles(ctx, scene, T, tNow) {
    var lakes = scene.lakes;
    for (var i = 0; i < lakes.length; i++) {
      var tile = lakes[i];
      var x = tile.x * T;
      var y = tile.y * T;
      var overlap = Math.max(1, T * 0.04);
      var margin = T * 0.14;
      var left = tile.left ? -overlap : margin;
      var right = tile.right ? -overlap : margin;
      var top = tile.top ? -overlap : margin;
      var bottom = tile.bottom ? -overlap : margin;
      var width = T - left - right;
      var height = T - top - bottom;

      ctx.save();
      var phase = tile.phase;
      var wave = Math.sin(tNow * 0.0014 + phase);
      var shimmerY = y + T * (0.28 + ((wave + 1) * 0.1));
      var visibility = tile.visible ? 1 : 0.34;
      ctx.globalAlpha = 0.94 * visibility;

      var deep = ctx.createLinearGradient(x, y, x + T, y + T);
      deep.addColorStop(0, '#123c5b');
      deep.addColorStop(0.52, '#176383');
      deep.addColorStop(1, '#0e344f');
      ctx.fillStyle = deep;
      traceRoundedRect(ctx, x + left, y + top, width, height, T * 0.18);
      ctx.fill();

      ctx.save();
      traceRoundedRect(ctx, x + left + T * 0.04, y + top + T * 0.04,
        width - T * 0.08, height - T * 0.08, T * 0.13);
      ctx.clip();
      var sheen = ctx.createLinearGradient(x, y + T * 0.08, x + T, y + T * 0.92);
      sheen.addColorStop(0, 'rgba(76, 184, 196, 0.24)');
      sheen.addColorStop(0.45, 'rgba(48, 140, 168, 0.1)');
      sheen.addColorStop(1, 'rgba(7, 35, 62, 0.32)');
      ctx.fillStyle = sheen;
      ctx.fillRect(x + left, y + top, width, height);

      ctx.globalAlpha *= 0.75;
      ctx.strokeStyle = '#9ae8df';
      ctx.lineWidth = Math.max(1, T * 0.035);
      ctx.lineCap = 'round';
      for (var ripple = 0; ripple < 3; ripple++) {
        var rippleX = x + T * (0.22 + ((ripple * 0.27 + (phase * 0.03) % 0.2 + (tNow * 0.00007) % 0.22) % 0.68));
        var rippleY = y + T * (0.28 + ripple * 0.2 + Math.sin(tNow * 0.001 + phase + ripple) * 0.035);
        ctx.globalAlpha = (0.32 + ripple * 0.1) * visibility;
        ctx.beginPath();
        ctx.moveTo(rippleX, rippleY);
        ctx.quadraticCurveTo(rippleX + T * 0.06, rippleY - T * 0.025, rippleX + T * 0.12, rippleY);
        ctx.stroke();
      }

      ctx.globalAlpha = 0.62 * visibility;
      ctx.fillStyle = '#d3fff0';
      ctx.fillRect(x + T * 0.27, shimmerY, T * 0.18, Math.max(1, T * 0.035));
      ctx.globalAlpha = 0.3 * visibility;
      ctx.fillRect(x + T * 0.56, shimmerY + T * 0.12, T * 0.11, Math.max(1, T * 0.025));
      ctx.restore();

      ctx.globalAlpha = visibility;
      ctx.strokeStyle = 'rgba(133, 226, 220, 0.55)';
      ctx.lineWidth = Math.max(1, T * 0.035);
      ctx.beginPath();
      ctx.moveTo(x + left + T * 0.18, y + top + T * 0.12);
      ctx.lineTo(x + left + width - T * 0.2, y + top + T * 0.12);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawStreamTiles(ctx, scene, T, tNow) {
    var streamTiles = scene.streams.slice();
    if (!streamTiles.length) return;
    streamTiles.sort(function (a, b) { return a.flowIndex - b.flowIndex; });
    var runs = [];
    var run = [];
    for (var i = 0; i < streamTiles.length; i++) {
      var tile = streamTiles[i];
      var previous = run.length ? run[run.length - 1] : null;
      if (previous) {
        var flowGap = tile.flowIndex !== previous.flowIndex + 1;
        var dist = Math.max(Math.abs(previous.x - tile.x), Math.abs(previous.y - tile.y));
        var manh = Math.abs(previous.x - tile.x) + Math.abs(previous.y - tile.y);
        if (flowGap || dist > 2 || manh > 3) {
          runs.push(run);
          run = [];
        }
      }
      run.push(tile);
    }
    if (run.length) runs.push(run);

    for (var ri = 0; ri < runs.length; ri++) {
      var path = runs[ri];
      var visible = true;
      ctx.save();
      for (var vi = 0; vi < path.length; vi++) {
        if (!path[vi].visible) visible = false;
      }
      ctx.globalAlpha = visible ? 0.95 : 0.36;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Путь строится один раз и переиспользуется всеми обводками.
      function traceFlowPath() {
        ctx.beginPath();
        for (var pointIndex = 0; pointIndex < path.length; pointIndex++) {
          var point = path[pointIndex];
          var pointX = (point.x + 0.5) * T;
          var pointY = (point.y + 0.5) * T;
          if (pointIndex === 0) ctx.moveTo(pointX, pointY);
          else ctx.lineTo(pointX, pointY);
        }
        if (path.length === 1) {
          var loneX = (path[0].x + 0.5) * T;
          var loneY = (path[0].y + 0.5) * T;
          ctx.moveTo(loneX - T * 0.18, loneY);
          ctx.lineTo(loneX + T * 0.18, loneY);
        }
      }

      traceFlowPath();
      ctx.strokeStyle = 'rgba(6, 30, 52, 0.72)';
      ctx.lineWidth = T * 0.48;
      ctx.stroke();
      traceFlowPath();
      ctx.strokeStyle = '#12506f';
      ctx.lineWidth = T * 0.38;
      ctx.stroke();
      traceFlowPath();
      var streamGradient = ctx.createLinearGradient(0, 0, 0, T);
      streamGradient.addColorStop(0, '#247c98');
      streamGradient.addColorStop(0.5, '#36a4b0');
      streamGradient.addColorStop(1, '#1c6b89');
      ctx.strokeStyle = streamGradient;
      ctx.lineWidth = T * 0.27;
      ctx.stroke();

      traceFlowPath();
      ctx.setLineDash([T * 0.08, T * 0.2]);
      ctx.lineDashOffset = -tNow * 0.025;
      ctx.strokeStyle = 'rgba(177, 246, 230, 0.7)';
      ctx.lineWidth = Math.max(1.5, T * 0.045);
      ctx.stroke();
      ctx.setLineDash([]);

      for (var foam = 0; foam < path.length; foam += 3) {
        var foamTile = path[foam];
        var foamX = (foamTile.x + 0.5) * T;
        var foamY = (foamTile.y + 0.5) * T;
        var drift = ((tNow * 0.00012 + foamTile.flowIndex * 0.17) % 1) - 0.5;
        ctx.globalAlpha = (visible ? 0.58 : 0.2) * (0.6 + Math.sin(tNow * 0.004 + foam) * 0.2);
        ctx.fillStyle = '#d3fff0';
        ctx.beginPath();
        ctx.ellipse(foamX + drift * T * 0.3, foamY, T * 0.055, T * 0.025, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawZones(ctx, scene, T) {
    var zones = scene.zones;
    for (var i = 0; i < zones.length; i++) {
      var zone = zones[i];
      var cx = (zone.x + 0.5) * T;
      var cy = (zone.y + 0.5) * T;
      var radius = zone.radius * T;
      ctx.save();
      ctx.beginPath();
      for (var c = 0; c < zone.cells.length; c++) {
        var cell = zone.cells[c];
        ctx.rect(cell[0] * T, cell[1] * T, T, T);
      }
      ctx.clip();
      var gradient = ctx.createRadialGradient(cx, cy, T * 0.25, cx, cy, radius);
      var harmful = zone.type === 'weakAttack' || zone.type === 'weakDefense';
      gradient.addColorStop(0, harmful ? 'rgba(255, 45, 55, 0.34)' : 'rgba(55, 255, 125, 0.30)');
      gradient.addColorStop(1, harmful ? 'rgba(255, 45, 55, 0)' : 'rgba(55, 255, 125, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      ctx.restore();
    }
  }

  function drawBlood(ctx, scene, T) {
    var blood = scene.blood;
    for (var i = 0; i < blood.length; i++) {
      var b = blood[i];
      var cx = (b.x + 0.5 + b.ox) * T;
      var cy = (b.y + 0.5 + b.oy) * T;
      var r = b.r * T;
      ctx.globalAlpha = (b.visible ? b.a : b.a * 0.35);
      if (b.kind === 0) {
        ctx.fillStyle = '#6a1018';
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(0.4);
        ctx.scale(1.2, 0.75);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#a01828';
        ctx.beginPath();
        ctx.arc(cx - r * 0.2, cy - r * 0.1, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.kind === 1) {
        ctx.fillStyle = '#801420';
        ctx.fillRect(cx - r, cy - r * 0.35, r * 2, r * 0.7);
        ctx.fillStyle = '#b02030';
        ctx.fillRect(cx - r * 0.4, cy - r * 0.7, r * 0.55, r * 1.1);
      } else {
        ctx.fillStyle = '#701018';
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c02838';
        ctx.beginPath();
        ctx.arc(cx + r * 0.35, cy + r * 0.2, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawTorches(ctx, scene, T, tNow) {
    var A = RK.Assets;
    var torches = scene.torches;
    for (var i = 0; i < torches.length; i++) {
      var tr = torches[i];
      var flicker = 0.85 + 0.15 * Math.sin(tNow * 0.012 + tr.phase);
      var bob = Math.sin(tNow * 0.018 + tr.phase * 0.7) * 1.2;
      ctx.globalAlpha = tr.visible ? 1 : 0.4;
      A.draw(ctx, tr.asset || 'torch', tr.x * T, tr.y * T, T);
      if (tr.visible) {
        ctx.globalAlpha = 0.55 + 0.35 * flicker;
        A.draw(ctx, tr.flameAsset || 'torchFlame', tr.x * T, tr.y * T + bob * 0.15 - 1, T);
        var gx = (tr.x + 0.5) * T;
        var gy = (tr.y + 0.35) * T;
        var glow = ctx.createRadialGradient(gx, gy, 1, gx, gy, T * 1.1 * flicker);
        glow.addColorStop(0, 'rgba(255,170,60,0.35)');
        glow.addColorStop(0.5, 'rgba(255,100,20,0.12)');
        glow.addColorStop(1, 'rgba(255,80,0,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(gx, gy, T * 1.1 * flicker, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawPoiMarkers(ctx, scene, T) {
    var pois = scene.pois;
    for (var i = 0; i < pois.length; i++) {
      var poi = pois[i];
      var x = poi.x * T;
      var y = poi.y * T;
      ctx.save();
      ctx.globalAlpha = poi.visible ? 1 : C.EXPLORED_ALPHA;
      var asset = poi.type === 'ruins' ? 'decorStone' : 'decorGrass';
      if (!RK.Assets.draw(ctx, asset, x, y, T)) {
        ctx.fillStyle = '#9bd17c';
        ctx.fillRect(x + T * 0.3, y + T * 0.3, T * 0.4, T * 0.4);
      }
      ctx.restore();
    }
  }

  function drawExits(ctx, scene, T) {
    var exits = scene.exits;
    for (var i = 0; i < exits.length; i++) {
      var exit = exits[i];
      var x = exit.x * T;
      var y = exit.y * T;
      ctx.save();
      ctx.globalAlpha = exit.visible ? 1 : C.EXPLORED_ALPHA;
      if (!RK.Assets.draw(ctx, exit.asset || 'stairs', x, y, T)) {
        ctx.fillStyle = '#8ee3ef';
        ctx.fillRect(x + T * 0.2, y + T * 0.2, T * 0.6, T * 0.6);
      }
      ctx.restore();
    }
  }

  function drawInteractiveObjects(ctx, scene, T, tNow) {
    var A = RK.Assets;
    var doors = scene.doors;
    for (var i = 0; i < doors.length; i++) {
      var door = doors[i];
      var x = door.x * T;
      var y = door.y * T;
      var open = door.state === 'open' || door.state === 'broken';
      ctx.save();
      ctx.globalAlpha = door.visible ? 1 : 0.42;
      if (A.draw(ctx, door.asset || 'door', x, y, T)) {
        ctx.restore();
        continue;
      }
      ctx.strokeStyle = '#c69a60';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 3, y + 3, T - 6, T - 6);
      ctx.fillStyle = door.state === 'locked' ? '#8b352d' : '#704b31';
      if (door.orientation === 'vertical') {
        if (open) {
          ctx.fillRect(x + 4, y + 4, 5, T - 8);
          ctx.fillRect(x + T - 9, y + 4, 5, T - 8);
        } else {
          ctx.fillRect(x + 4, y + 11, T - 8, 10);
          ctx.fillStyle = '#bd8b50';
          ctx.fillRect(x + 8, y + 13, T - 16, 2);
          ctx.fillRect(x + 8, y + 18, T - 16, 2);
        }
      } else if (open) {
        ctx.fillRect(x + 4, y + 4, T - 8, 5);
        ctx.fillRect(x + 4, y + T - 9, T - 8, 5);
      } else {
        ctx.fillRect(x + 11, y + 4, 10, T - 8);
        ctx.fillStyle = '#bd8b50';
        ctx.fillRect(x + 13, y + 8, 2, T - 16);
        ctx.fillRect(x + 18, y + 8, 2, T - 16);
      }
      if (door.state === 'locked' && door.visible) {
        ctx.fillStyle = '#f3d36a';
        ctx.fillRect(x + T / 2 - 2, y + T / 2 - 2, 4, 4);
      }
      ctx.restore();
    }

    var traps = scene.traps;
    for (var ti = 0; ti < traps.length; ti++) {
      var trap = traps[ti];
      var trapSeen = trap.visible;
      var tx = trap.x * T;
      var ty = trap.y * T;
      var sprite = trap.state === 'disarmed' || trap.state === 'triggered'
        ? C.TRAP_SPRITES[trap.state]
        : C.TRAP_SPRITES[trap.type] || C.TRAP_SPRITES.armed;
      ctx.save();
      if (!trapSeen) ctx.globalAlpha = 0.55;
      A.draw(ctx, sprite, tx, ty, T);
      var phase = tNow / 180;
      if (trap.mine) {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#8ee3ef';
        ctx.lineWidth = 1;
        ctx.strokeRect(tx + 1, ty + 1, T - 2, T - 2);
      }
      if (trap.state === 'armed' && trap.type === 'flame') {
        var flicker = (Math.sin(phase) + 1) / 2;
        ctx.globalAlpha = (trapSeen ? 1 : 0.55) * (0.45 + flicker * 0.4);
        ctx.fillStyle = flicker > 0.5 ? '#ffd84a' : '#ff6025';
        ctx.beginPath();
        ctx.moveTo(tx + T * 0.5, ty + T * (0.42 - flicker * 0.08));
        ctx.lineTo(tx + T * (0.37 - flicker * 0.03), ty + T * 0.66);
        ctx.lineTo(tx + T * (0.63 + flicker * 0.03), ty + T * 0.66);
        ctx.closePath();
        ctx.fill();
      } else if (trap.state === 'armed') {
        var glint = (Math.sin(phase) + 1) / 2;
        ctx.globalAlpha = (trapSeen ? 1 : 0.55) * (0.25 + glint * 0.65);
        ctx.fillStyle = '#f7f4d8';
        ctx.fillRect(tx + T * 0.47, ty + T * 0.31, 2, 3);
      }
      ctx.restore();
    }

    var chests = scene.chests;
    for (var ci = 0; ci < chests.length; ci++) {
      var chest = chests[ci];
      var cx = chest.x * T;
      var cy = chest.y * T;
      ctx.save();
      ctx.globalAlpha = chest.visible ? 1 : 0.42;
      if (A.draw(ctx, chest.asset || 'chest', cx, cy, T)) {
        ctx.restore();
        continue;
      }
      ctx.fillStyle = chest.state === 'locked' ? '#8b352d' : '#79502e';
      ctx.fillRect(cx + 5, cy + 12, T - 10, T - 17);
      ctx.fillStyle = chest.state === 'open' || chest.state === 'broken' ? '#25180f' : '#a9753d';
      ctx.fillRect(cx + 4, cy + 8, T - 8, 8);
      ctx.fillStyle = '#e2bd67';
      ctx.fillRect(cx + T / 2 - 2, cy + 13, 4, 6);
      ctx.strokeStyle = '#38251a';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx + 5, cy + 12, T - 10, T - 17);
      ctx.restore();
    }
  }

  function drawNpcs(ctx, scene, T) {
    var npcs = scene.npcs;
    for (var i = 0; i < npcs.length; i++) {
      drawNpcSprite(ctx, scene, T, npcs[i]);
    }
  }

  function drawNpcSprite(ctx, scene, T, npc) {
    var visual = npc.visual;
    if (!npc || !visual) return;
    var x = npc.x * T;
    var y = npc.y * T;
    ctx.save();
    ctx.globalAlpha = npc.visible ? 1 : C.EXPLORED_ALPHA;
    if (RK.Assets.draw(ctx, visual.asset, x, y, T)) {
      ctx.restore();
      return;
    }
    // Запасная пиксельная отрисовка; координаты относительно размера тайла, чтобы масштабировалась вместе с C.TILE.
    var u = T / 32;
    ctx.fillStyle = visual.primary;
    ctx.fillRect(x + 10 * u, y + 5 * u, 12 * u, 6 * u);
    ctx.fillStyle = visual.secondary;
    ctx.fillRect(x + 11 * u, y + 11 * u, 10 * u, 9 * u);
    ctx.fillStyle = visual.accent;
    ctx.fillRect(x + 12 * u, y + 12 * u, 8 * u, 6 * u);
    ctx.fillStyle = visual.secondary;
    ctx.fillRect(x + 9 * u, y + 20 * u, 6 * u, 9 * u);
    ctx.fillRect(x + 17 * u, y + 20 * u, 6 * u, 9 * u);
    ctx.fillStyle = visual.trim;
    ctx.fillRect(x + 4 * u, y + 3 * u, 5 * u, 5 * u);
    ctx.fillRect(x + 23 * u, y + 4 * u, 5 * u, 5 * u);
    ctx.restore();
  }

  function drawStair(ctx, scene, T) {
    var stair = scene.stair;
    if (!stair || !stair.visible) return;
    RK.Assets.draw(ctx, stair.asset || 'stairs', stair.x * T, stair.y * T, T);
  }

  function drawItems(ctx, scene, T) {
    var A = RK.Assets;
    var items = scene.items;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.kind === 'key') {
        if (!A.draw(ctx, it.asset || 'key', it.x * T, it.y * T, T)) drawKey(ctx, it.x * T, it.y * T, T);
        continue;
      }
      var rarityColor = C.RARITY_COLORS[it.rarity] || C.RARITY_COLORS.common;
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = rarityColor;
      ctx.fillRect(it.x * T + 2, it.y * T + 2, T - 4, T - 4);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = rarityColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(it.x * T + 2, it.y * T + 2, T - 4, T - 4);
      ctx.restore();
      if (!A.draw(ctx, it.asset, it.x * T, it.y * T, T)) {
        A.draw(ctx, it.fallback, it.x * T, it.y * T, T);
      }
    }
  }

  function drawKey(ctx, x, y, T) {
    ctx.save();
    ctx.fillStyle = '#f3d36a';
    ctx.strokeStyle = '#6b532b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + T * 0.36, y + T * 0.44, T * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(x + T * 0.47, y + T * 0.4, T * 0.34, T * 0.09);
    ctx.fillRect(x + T * 0.67, y + T * 0.47, T * 0.07, T * 0.13);
    ctx.restore();
  }

  function drawBossHighlight(ctx, scene, T, tNow) {
    var enemies = scene.enemies;
    for (var i = 0; i < enemies.length; i++) {
      var enemy = enemies[i];
      if (!enemy.boss) continue;
      var cx = (enemy.x + 0.5) * T;
      var cy = (enemy.y + 0.5) * T;
      var pulse = 0.5 + 0.5 * Math.sin(tNow * 0.006);
      var radius = T * (0.72 + pulse * 0.18);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var glow = ctx.createRadialGradient(cx, cy, T * 0.12, cx, cy, radius);
      glow.addColorStop(0, 'rgba(255, 24, 32, 0.28)');
      glow.addColorStop(0.55, 'rgba(220, 12, 24, 0.16)');
      glow.addColorStop(1, 'rgba(180, 0, 16, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 48, 48, ' + (0.3 + pulse * 0.45).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(cx, cy, T * (0.35 + pulse * 0.25), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawEnemies(ctx, scene, T, tNow) {
    var A = RK.Assets;
    var enemies = scene.enemies;
    drawBossHighlight(ctx, scene, T, tNow);
    for (var i = 0; i < enemies.length; i++) {
      var en = enemies[i];
      if (en.boss) {
        if (!A.draw(ctx, en.asset, en.x * T - 2, en.y * T - 2, T + 4)) {
          A.draw(ctx, en.fallback, en.x * T - 2, en.y * T - 2, T + 4);
        }
      } else if (en.enhanced) {
        var size = T * (en.sizeScale || 1.25);
        var x = en.x * T + (T - size) / 2;
        var y = en.y * T + (T - size) / 2;
        if (!A.draw(ctx, en.asset, x, y, size)) A.draw(ctx, en.fallback, x, y, size);
      } else if (!A.draw(ctx, en.asset, en.x * T, en.y * T, T)) {
        A.draw(ctx, en.fallback, en.x * T, en.y * T, T);
      }
      if (en.champion) {
        ctx.save();
        ctx.strokeStyle = '#f2c94c';
        ctx.lineWidth = Math.max(2, Math.round(T * 0.08));
        ctx.beginPath();
        ctx.arc(en.x * T + T / 2, en.y * T + T / 2, T * 0.58, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Конус взгляда: бордовый треугольник от центра клетки в сторону facingX/Y.
  function drawGazeCone(ctx, actor, pos, T) {
    var fx = actor.facingX || 0;
    var fy = actor.facingY || 0;
    if (!fx && !fy) return;
    var len = Math.sqrt(fx * fx + fy * fy);
    var ux = fx / len;
    var uy = fy / len;
    // Перпендикуляр задаёт ширину основания конуса.
    var px = -uy;
    var py = ux;
    var cx = (pos.x + 0.5) * T;
    var cy = (pos.y + 0.5) * T;
    var reach = T * 0.6;
    var half = T * 0.16;
    ctx.fillStyle = C.COLORS.gaze;
    ctx.beginPath();
    ctx.moveTo(cx + ux * reach, cy + uy * reach);
    ctx.lineTo(cx + px * half, cy + py * half);
    ctx.lineTo(cx - px * half, cy - py * half);
    ctx.closePath();
    ctx.fill();
  }

  function drawParty(ctx, scene, T) {
    var A = RK.Assets;
    var party = scene.party;
    for (var i = 0; i < party.length; i++) {
      var member = party[i];
      var pos = member.pos;
      if (!A.draw(ctx, member.asset, pos.x * T, pos.y * T, T)) A.draw(ctx, member.fallback, pos.x * T, pos.y * T, T);
      drawGazeCone(ctx, member, pos, T);
      ctx.fillStyle = '#ffd166';
      ctx.font = Math.max(8, Math.round(T * 0.28)) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(member.name, (pos.x + 0.5) * T, pos.y * T - 2);
    }
    var hero = scene.hero;
    if (hero) {
      var heroPos = hero.pos;
      if (!A.draw(ctx, hero.asset, heroPos.x * T, heroPos.y * T, T)) {
        A.draw(ctx, hero.fallback, heroPos.x * T, heroPos.y * T, T);
      }
      drawGazeCone(ctx, hero, heroPos, T);
    }
  }

  // Подсветка клетки под курсором и маршрута автопрохода.
  function drawOverlays(ctx, scene, T) {
    if (RK.hover && RK.Scene.seen(scene.map, RK.hover.x, RK.hover.y)) {
      ctx.fillStyle = C.COLORS.hover;
      ctx.fillRect((RK.hover.x - camera.x) * T, (RK.hover.y - camera.y) * T, T, T);
    }
    if (!RK.hoverPath) return;
    ctx.fillStyle = C.HOVER_PATH_COLOR;
    var steps = Math.min(RK.hoverPath.length, C.HOVER_PATH_MAX_STEPS);
    for (var i = 0; i < steps; i++) {
      var step = RK.hoverPath[i];
      var dot = C.HOVER_PATH_DOT;
      ctx.fillRect(
        (step.x - camera.x) * T + T / 2 - dot / 2,
        (step.y - camera.y) * T + T / 2 - dot / 2,
        dot,
        dot,
      );
    }
  }

  // Свет: темнота по всей карте, факелы и герой вырезают круги.
  function drawLighting(ctx, light, scene, T, tNow) {
    if (!light || !light.ctx || !scene.map.torches) return;
    var map = scene.map;
    var ambient = (C.TORCH && C.TORCH.AMBIENT != null) ? C.TORCH.AMBIENT : 0.58;
    var style = isLocationMap(map) ? C.MAP_STYLES[map.style] : null;
    if (RK.Fov && RK.Fov.isAlwaysVisible && RK.Fov.isAlwaysVisible(map)) {
      // В городе темноты нет: дальние кварталы иначе читались бы как неразведанные.
      ambient = 0;
    } else if (style && typeof style.light === 'number') {
      // Свет по типу локации: ярче пустыня и горы, темнее склеп и канализация.
      ambient = Math.max(0.32, Math.min(0.78, 1 - style.light));
    } else {
      var floor = (RK.GAME && RK.GAME.floor) || 1;
      var depth = RK.Assets.floorGrayAmount ? RK.Assets.floorGrayAmount(floor) : 0;
      ambient = Math.min(0.78, ambient + depth * 0.12);
    }

    var lightCtx = light.ctx;
    lightCtx.clearRect(0, 0, light.canvas.width, light.canvas.height);
    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.fillStyle = 'rgba(6, 5, 12, ' + ambient.toFixed(3) + ')';
    lightCtx.fillRect(0, 0, light.canvas.width, light.canvas.height);
    lightCtx.globalCompositeOperation = 'destination-out';

    function punch(px, py, radius, strength) {
      var g = lightCtx.createRadialGradient(px, py, 0, px, py, radius);
      g.addColorStop(0, 'rgba(0,0,0,' + strength.toFixed(3) + ')');
      g.addColorStop(0.45, 'rgba(0,0,0,' + (strength * 0.55).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lightCtx.fillStyle = g;
      lightCtx.beginPath();
      lightCtx.arc(px, py, radius, 0, Math.PI * 2);
      lightCtx.fill();
    }

    var baseR = ((C.TORCH && C.TORCH.LIGHT_R) || 3.2) * T;
    for (var i = 0; i < scene.torches.length; i++) {
      var tr = scene.torches[i];
      var flick = 0.88 + 0.12 * Math.sin(tNow * 0.014 + tr.phase);
      var lx = (tr.x + 0.5 + tr.dx * 0.15 - camera.x) * T;
      var ly = (tr.y + 0.35 + tr.dy * 0.15 - camera.y) * T;
      punch(lx, ly, baseR * flick, tr.visible ? 0.92 : 0.35);
    }

    if (scene.hero) {
      var heroPos = scene.hero.pos;
      punch((heroPos.x + 0.5 - camera.x) * T, (heroPos.y + 0.5 - camera.y) * T, T * 2.4, 0.75);
    }

    lightCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(light.canvas, 0, 0);

    ctx.globalCompositeOperation = 'lighter';
    for (var j = 0; j < scene.torches.length; j++) {
      var t2 = scene.torches[j];
      if (!t2.visible) continue;
      var f2 = 0.9 + 0.1 * Math.sin(tNow * 0.016 + t2.phase);
      var wx = (t2.x + 0.5 - camera.x) * T;
      var wy = (t2.y + 0.35 - camera.y) * T;
      var warm = ctx.createRadialGradient(wx, wy, 0, wx, wy, baseR * 0.85 * f2);
      warm.addColorStop(0, 'rgba(255,140,40,0.16)');
      warm.addColorStop(0.5, 'rgba(255,80,20,0.06)');
      warm.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = warm;
      ctx.beginPath();
      ctx.arc(wx, wy, baseR * 0.85 * f2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  RK.Views = RK.Views || {};
  RK.Views.topdown = {
    name: 'topdown',
    tileSize: tileSize,
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
  };
})();
