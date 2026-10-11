(function () {
  var C = RK.CONFIG;
  var canvas = null;
  var ctx = null;
  var lightCanvas = null;
  var lightCtx = null;
  var camera = { x: 0, y: 0 };

  function ensure() {
    if (!canvas) {
      canvas = document.getElementById('game');
      ctx = canvas ? canvas.getContext('2d') : null;
      if (ctx) ctx.imageSmoothingEnabled = false;
    }
    if (canvas && (!lightCanvas || lightCanvas.width !== canvas.width)) {
      lightCanvas = document.createElement('canvas');
      lightCanvas.width = canvas.width;
      lightCanvas.height = canvas.height;
      lightCtx = lightCanvas.getContext('2d');
    }
  }

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function floorDepthTint(floor) {
    var t = RK.Assets.floorGrayAmount ? RK.Assets.floorGrayAmount(floor) : 0;
    var palettes = [
      '116,72,62', '74,112,70', '56,105,118', '77,76,143', '130,70,118',
      '146,91,48', '62,113,109', '118,65,52', '86,91,133', '126,112,62',
    ];
    var palette = palettes[((floor || 1) - 1) % palettes.length];
    return {
      gray: t,
      overlay: 'rgba(' + Math.round(70 + t * 40) + ',' + Math.round(72 + t * 35) + ',' + Math.round(78 + t * 30) + ',' + (t * 0.42).toFixed(3) + ')',
      cool: 'rgba(20, 24, 36, ' + (t * 0.18).toFixed(3) + ')',
      palette: palette,
    };
  }

  function drawBlood(mm, T) {
    if (!mm.blood || !mm.blood.length) return;
    for (var i = 0; i < mm.blood.length; i++) {
      var b = mm.blood[i];
      if (!mm.explored[b.y] || !mm.explored[b.y][b.x]) continue;
      var vis = mm.vis[b.y] && mm.vis[b.y][b.x];
      var cx = (b.x + 0.5 + b.ox) * T;
      var cy = (b.y + 0.5 + b.oy) * T;
      var r = b.r * T;
      ctx.globalAlpha = (vis ? b.a : b.a * 0.35);
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

  function drawTorches(mm, T, tNow) {
    if (!mm.torches) return;
    var A = RK.Assets;
    for (var i = 0; i < mm.torches.length; i++) {
      var tr = mm.torches[i];
      var explored = mm.explored[tr.y] && mm.explored[tr.y][tr.x];
      if (!explored) continue;
      var vis = mm.vis[tr.y] && mm.vis[tr.y][tr.x];
      var flicker = 0.85 + 0.15 * Math.sin(tNow * 0.012 + tr.phase);
      var bob = Math.sin(tNow * 0.018 + tr.phase * 0.7) * 1.2;
      ctx.globalAlpha = vis ? 1 : 0.4;
      A.draw(ctx, tr.asset || 'torch', tr.x * T, tr.y * T, T);
      if (vis) {
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

  function drawLighting(mm, T, tNow, playerPos, cameraX, cameraY) {
    if (!lightCtx || !mm.torches) return;
    var ambient = (C.TORCH && C.TORCH.AMBIENT != null) ? C.TORCH.AMBIENT : 0.58;
    var floor = (RK.GAME && RK.GAME.floor) || 1;
    var depth = RK.Assets.floorGrayAmount ? RK.Assets.floorGrayAmount(floor) : 0;
    ambient = Math.min(0.78, ambient + depth * 0.12);

    lightCtx.clearRect(0, 0, lightCanvas.width, lightCanvas.height);
    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.fillStyle = 'rgba(6, 5, 12, ' + ambient.toFixed(3) + ')';
    lightCtx.fillRect(0, 0, lightCanvas.width, lightCanvas.height);
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
    for (var i = 0; i < mm.torches.length; i++) {
      var tr = mm.torches[i];
      if (!mm.explored[tr.y] || !mm.explored[tr.y][tr.x]) continue;
      var vis = mm.vis[tr.y] && mm.vis[tr.y][tr.x];
      var flick = 0.88 + 0.12 * Math.sin(tNow * 0.014 + tr.phase);
      var lx = (tr.x + 0.5 + tr.dx * 0.15 - cameraX) * T;
      var ly = (tr.y + 0.35 + tr.dy * 0.15 - cameraY) * T;
      punch(lx, ly, baseR * flick, vis ? 0.92 : 0.35);
    }

    if (playerPos) {
      punch((playerPos.x + 0.5 - cameraX) * T, (playerPos.y + 0.5 - cameraY) * T, T * 2.4, 0.75);
    }

    lightCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(lightCanvas, 0, 0);

    ctx.globalCompositeOperation = 'lighter';
    for (var j = 0; j < mm.torches.length; j++) {
      var t2 = mm.torches[j];
      if (!mm.vis[t2.y] || !mm.vis[t2.y][t2.x]) continue;
      var f2 = 0.9 + 0.1 * Math.sin(tNow * 0.016 + t2.phase);
      var wx = (t2.x + 0.5 - cameraX) * T;
      var wy = (t2.y + 0.35 - cameraY) * T;
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

  function drawBossHighlight(enemy, T, tNow) {
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

  function cameraOffset(playerPos) {
    return {
      x: playerPos.x + 0.5 - C.COLS / 2,
      y: playerPos.y + 0.5 - C.ROWS / 2,
    };
  }

  function drawAsciiGlyph(T, x, y, glyph, color, alpha) {
    if (!glyph) return;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color;
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, (x + 0.5) * T, (y + 0.5) * T);
    ctx.globalAlpha = 1;
  }

  function itemGlyph(item) {
    if (item.kind === 'key') return '+';
    if (item.kind === 'gold' || item.type === 'gold') return '$';
    if (item.type === 'potion') return '!';
    if (item.type === 'weapon') return '/';
    if (item.type === 'armor') return ']';
    if (item.type === 'ring') return 'o';
    if (item.type === 'boots') return '=';
    return '?';
  }

  function enemyGlyph(enemy) {
    if (enemy.behavior === 'boss') return 'B';
    var glyphs = {
      slime: 's',
      rat: 'r',
      skeleton: 'S',
      archer: 'a',
      bat: 'b',
      demon: 'D',
    };
    return glyphs[enemy.type] || 'e';
  }

  function drawAscii(mm, T, focusPlayer, drawPos) {
    ctx.save();
    ctx.translate(-camera.x * T, -camera.y * T);

    for (var y = 0; y < mm.h; y++) {
      for (var x = 0; x < mm.w; x++) {
        if (!mm.explored[y][x]) continue;
        var visible = mm.vis[y][x];
        drawAsciiGlyph(T, x, y, mm.tiles[y][x] === 1 ? '.' : '#',
          mm.tiles[y][x] === 1 ? '#b8a7cc' : '#8a769f', visible ? 1 : 0.38);
      }
    }

    var doors = mm.doors || [];
    for (var doorIndex = 0; doorIndex < doors.length; doorIndex++) {
      var door = doors[doorIndex];
      if (!mm.explored[door.y][door.x]) continue;
      drawAsciiGlyph(T, door.x, door.y,
        door.state === 'open' || door.state === 'broken' ? '/' : (door.state === 'locked' ? '*' : '+'),
        door.state === 'locked' ? '#ff8a80' : '#d9b36c',
        mm.vis[door.y][door.x] ? 1 : 0.42);
    }

    var chests = mm.chests || [];
    for (var chestIndex = 0; chestIndex < chests.length; chestIndex++) {
      var chest = chests[chestIndex];
      if (!mm.explored[chest.y][chest.x]) continue;
      drawAsciiGlyph(T, chest.x, chest.y,
        chest.state === 'open' || chest.state === 'broken' ? 'o' : (chest.state === 'locked' ? 'X' : 'C'),
        chest.state === 'locked' ? '#ff8a80' : '#d9b36c',
        mm.vis[chest.y][chest.x] ? 1 : 0.42);
    }

    var traps = mm.traps || [];
    for (var trapIndex = 0; trapIndex < traps.length; trapIndex++) {
      var trap = traps[trapIndex];
      if (!focusPlayer || Math.max(Math.abs(focusPlayer.x - trap.x), Math.abs(focusPlayer.y - trap.y)) > 1 ||
          !mm.vis[trap.y][trap.x]) continue;
      drawAsciiGlyph(T, trap.x, trap.y,
        trap.state === 'disarmed' ? '_' : (trap.type === 'flame' ? '~' : '^'),
        trap.state === 'disarmed' ? '#8878a0' : '#ff8a80');
    }

    if (mm.torches) {
      for (var torchIndex = 0; torchIndex < mm.torches.length; torchIndex++) {
        var torch = mm.torches[torchIndex];
        if (mm.explored[torch.y][torch.x]) {
          drawAsciiGlyph(T, torch.x, torch.y, 'i', '#ffd166',
            mm.vis[torch.y][torch.x] ? 1 : 0.42);
        }
      }
    }

    var merchant = RK.GAME && RK.GAME.merchant;
    if (merchant && mm.explored[merchant.y][merchant.x]) {
      drawAsciiGlyph(T, merchant.x, merchant.y, 'M', '#7ae582',
        mm.vis[merchant.y][merchant.x] ? 1 : 0.42);
    }

    var stair = RK.Map && RK.Map.stair;
    if (stair && mm.vis[stair.y] && mm.vis[stair.y][stair.x]) {
      drawAsciiGlyph(T, stair.x, stair.y, '>', '#ffd166');
    }

    var items = RK.GAME.items || [];
    for (var itemIndex = 0; itemIndex < items.length; itemIndex++) {
      var item = items[itemIndex];
      if (mm.vis[item.y] && mm.vis[item.y][item.x]) {
        drawAsciiGlyph(T, item.x, item.y, itemGlyph(item), '#f3d36a');
      }
    }

    var enemies = RK.GAME.enemies || [];
    for (var enemyIndex = 0; enemyIndex < enemies.length; enemyIndex++) {
      var enemy = enemies[enemyIndex];
      if (enemy.alive && mm.vis[enemy.y] && mm.vis[enemy.y][enemy.x]) {
        drawAsciiGlyph(T, enemy.x, enemy.y, enemyGlyph(enemy), '#ff8a80');
      }
    }

    var party = RK.GAME.players || [RK.GAME.player];
    for (var playerIndex = 0; playerIndex < party.length; playerIndex++) {
      var partyMember = party[playerIndex];
      if (!partyMember || partyMember.id === (RK.GAME.player && RK.GAME.player.id) || partyMember.hp <= 0) continue;
      if (mm.vis[partyMember.y] && mm.vis[partyMember.y][partyMember.x]) {
        drawAsciiGlyph(T, partyMember.x, partyMember.y, '&', '#ffd166');
      }
    }
    drawAsciiGlyph(T, drawPos.x, drawPos.y, '@', '#7ae582');
    ctx.restore();

    if (RK.hover && mm.vis[RK.hover.y] && mm.vis[RK.hover.y][RK.hover.x]) {
      ctx.fillStyle = C.COLORS.hover;
      ctx.fillRect((RK.hover.x - camera.x) * T, (RK.hover.y - camera.y) * T, T, T);
    }
    if (RK.hoverPath) {
      ctx.fillStyle = 'rgba(255,224,120,0.45)';
      var max = Math.min(RK.hoverPath.length, 5);
      for (var pathIndex = 0; pathIndex < max; pathIndex++) {
        var step = RK.hoverPath[pathIndex];
        ctx.fillRect((step.x - camera.x) * T + T / 2 - 2, (step.y - camera.y) * T + T / 2 - 2, 4, 4);
      }
    }
    RK.Effects.draw(ctx, T, camera.x, camera.y);
    if (RK.UI && RK.UI.gameTooltip) {
      var pointer = RK.hoverPointer;
      var hoverInfo = pointer && RK.hover ? getHoverInfo(RK.hover) : '';
      RK.UI.gameTooltip(
        typeof hoverInfo === 'string' ? hoverInfo : hoverInfo.text,
        pointer ? pointer.x : 0,
        pointer ? pointer.y : 0,
        typeof hoverInfo === 'string' ? null : hoverInfo.rarity,
      );
    }
  }

  function drawZones(mm, T) {
    if (!mm.zones) return;
    for (var i = 0; i < mm.zones.length; i++) {
      var zone = mm.zones[i];
      if (!mm.explored[zone.y] || !mm.explored[zone.y][zone.x]) continue;
      var cx = (zone.x + 0.5) * T;
      var cy = (zone.y + 0.5) * T;
      var radius = zone.radius * T;
      var minX = Math.max(0, zone.x - zone.radius);
      var maxX = Math.min(mm.w - 1, zone.x + zone.radius);
      var minY = Math.max(0, zone.y - zone.radius);
      var maxY = Math.min(mm.h - 1, zone.y + zone.radius);
      ctx.save();
      ctx.beginPath();
      for (var y = minY; y <= maxY; y++) {
        for (var x = minX; x <= maxX; x++) {
          if (mm.tiles[y][x] === 1 && mm.explored[y][x]) {
            ctx.rect(x * T, y * T, T, T);
          }
        }
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

  function drawDecorations(mm, T, tNow) {
    var decorations = mm.decorations || [];
    var A = RK.Assets;
    var lakeTiles = {};
    var streamTiles = [];
    for (var i = 0; i < decorations.length; i++) {
      var decoration = decorations[i];
      if (!mm.tiles[decoration.y] || mm.tiles[decoration.y][decoration.x] !== 1 ||
          !mm.explored[decoration.y] || !mm.explored[decoration.y][decoration.x]) continue;
      if (decoration.asset === 'decorLake') {
        lakeTiles[decoration.x + ',' + decoration.y] = decoration;
        continue;
      }
      if (decoration.asset === 'decorStream') {
        streamTiles.push(decoration);
        continue;
      }
      if (!A || typeof A.draw !== 'function') continue;
      ctx.save();
      ctx.globalAlpha = mm.vis[decoration.y][decoration.x] ? 0.92 : 0.34;
      A.draw(ctx, decoration.asset, decoration.x * T, decoration.y * T, T);
      ctx.restore();
    }
    drawLakeTiles(lakeTiles, T, tNow);
    drawStreamTiles(streamTiles, mm, T, tNow);
  }

  function traceRoundedRect(x, y, width, height, radius) {
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

  function drawLakeTiles(lakeTiles, T, tNow) {
    for (var key in lakeTiles) {
      if (!Object.prototype.hasOwnProperty.call(lakeTiles, key)) continue;
      var tile = lakeTiles[key];
      var x = tile.x * T;
      var y = tile.y * T;
      var overlap = Math.max(1, T * 0.04);
      var margin = T * 0.14;
      var left = (lakeTiles[(tile.x - 1) + ',' + tile.y] || lakeTiles[(tile.x - 1) + ',' + (tile.y - 1)] || lakeTiles[(tile.x - 1) + ',' + (tile.y + 1)]) ? -overlap : margin;
      var right = (lakeTiles[(tile.x + 1) + ',' + tile.y] || lakeTiles[(tile.x + 1) + ',' + (tile.y - 1)] || lakeTiles[(tile.x + 1) + ',' + (tile.y + 1)]) ? -overlap : margin;
      var top = (lakeTiles[tile.x + ',' + (tile.y - 1)] || lakeTiles[(tile.x - 1) + ',' + (tile.y - 1)] || lakeTiles[(tile.x + 1) + ',' + (tile.y - 1)]) ? -overlap : margin;
      var bottom = (lakeTiles[tile.x + ',' + (tile.y + 1)] || lakeTiles[(tile.x - 1) + ',' + (tile.y + 1)] || lakeTiles[(tile.x + 1) + ',' + (tile.y + 1)]) ? -overlap : margin;
      var width = T - left - right;
      var height = T - top - bottom;

      ctx.save();
      ctx.globalAlpha = 0.94;
      ctx.fillStyle = '#164967';
      traceRoundedRect(x + left, y + top, width, height, T * 0.18);
      ctx.fill();
      ctx.fillStyle = '#287f9a';
      traceRoundedRect(x + left + T * 0.06, y + top + T * 0.06,
        width - T * 0.12, height - T * 0.12, T * 0.13);
      ctx.fill();
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = '#a4e3dc';
      var phase = tile.waterPhase || 0;
      var shimmerY = y + T * (0.28 + ((Math.sin(tNow * 0.001 + phase) + 1) * 0.1));
      ctx.fillRect(x + T * 0.3, shimmerY, T * 0.2, Math.max(1, T * 0.045));
      ctx.restore();
    }
  }

  function drawStreamTiles(streamTiles, mm, T, tNow) {
    if (!streamTiles.length) return;
    streamTiles.sort(function (a, b) { return a.flowIndex - b.flowIndex; });
    var runs = [];
    var run = [];
    for (var i = 0; i < streamTiles.length; i++) {
      var tile = streamTiles[i];
      if (!mm.explored[tile.y] || !mm.explored[tile.y][tile.x]) {
        if (run.length) runs.push(run);
        run = [];
        continue;
      }
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
        if (!mm.vis[path[vi].y] || !mm.vis[path[vi].y][path[vi].x]) visible = false;
      }
      ctx.globalAlpha = visible ? 0.95 : 0.36;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (var pi = 0; pi < path.length; pi++) {
        var px = (path[pi].x + 0.5) * T;
        var py = (path[pi].y + 0.5) * T;
        if (pi === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      if (path.length === 1) {
        ctx.moveTo((path[0].x + 0.5) * T + T * 0.18, (path[0].y + 0.5) * T);
        ctx.lineTo((path[0].x + 0.5) * T - T * 0.18, (path[0].y + 0.5) * T);
      }
      ctx.strokeStyle = '#164967';
      ctx.lineWidth = T * 0.44;
      ctx.stroke();
      ctx.strokeStyle = '#2b91aa';
      ctx.lineWidth = T * 0.3;
      ctx.stroke();

      ctx.beginPath();
      for (var hi = 0; hi < path.length; hi++) {
        var hx = (path[hi].x + 0.5) * T;
        var hy = (path[hi].y + 0.5) * T;
        if (hi === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      if (path.length === 1) {
        ctx.moveTo((path[0].x + 0.5) * T + T * 0.18, (path[0].y + 0.5) * T);
        ctx.lineTo((path[0].x + 0.5) * T - T * 0.18, (path[0].y + 0.5) * T);
      }
      ctx.setLineDash([T * 0.12, T * 0.25]);
      ctx.lineDashOffset = -tNow * 0.018;
      ctx.strokeStyle = '#b3eee0';
      ctx.lineWidth = Math.max(1.5, T * 0.055);
      ctx.stroke();
      ctx.restore();
    }
  }

  function draw() {
    ensure();
    if (!ctx) return;
    var T = C.TILE;
    var A = RK.Assets;
    var tNow = now();

    ctx.fillStyle = C.COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var mm = RK.Map;
    if (!mm || !RK.GAME) return;

    var p = RK.GAME.player;
    var drawPos = RK.Combat.getDrawPos ? RK.Combat.getDrawPos() : { x: p.x, y: p.y };
    var focusPlayer = RK.Network && RK.Network.focusPlayer ? RK.Network.focusPlayer() : p;
    var focusPos = focusPlayer === p ? drawPos : focusPlayer;
    camera = cameraOffset(focusPos);
    if (focusPlayer && focusPlayer !== p && RK.Fov && RK.Fov.computeVisibility) {
      mm = Object.create(mm);
      mm.vis = RK.Fov.computeVisibility(focusPlayer.x, focusPlayer.y);
      mm.explored = mm.explored.map(function (row, y) {
        return row.map(function (explored, x) {
          return explored || mm.vis[y][x];
        });
      });
    }
    if (getMode() === 'ascii') {
      drawAscii(mm, T, focusPlayer, drawPos);
      return;
    }
    ctx.save();
    ctx.translate(-camera.x * T, -camera.y * T);

    var tint = floorDepthTint(RK.GAME.floor || 1);

    for (var y = 0; y < mm.h; y++) {
      for (var x = 0; x < mm.w; x++) {
        var v = mm.vis[y][x];
        var e = mm.explored[y][x];
        var tile = mm.tiles[y][x];
        A.drawFloorTile(ctx, RK.GAME.floor || 1, tile, v, e, x * T, y * T, T);
        var regionStyleId = mm.regionStyles && mm.regionStyles[mm.regions[y][x]];
        var regionStyle = C.MAP_STYLES[regionStyleId] || C.MAP_STYLES[mm.style];
        if (tile === 1 && (v || e) && mm.floorTypes && regionStyle) {
          ctx.fillStyle = regionStyle.colors[mm.floorTypes[y][x]];
          ctx.fillRect(x * T, y * T, T, T);
        } else if (tile === 0 && e && regionStyle && regionStyle.wallColors) {
          ctx.fillStyle = regionStyle.wallColors[mm.wallTypes[y][x]];
          ctx.fillRect(x * T, y * T, T, T);
        }
        if ((RK.GAME.floor || 1) <= 3 && tile === 1 && e && tint.gray > 0.01) {
          ctx.fillStyle = tint.overlay;
          ctx.fillRect(x * T, y * T, T, T);
          if (v) {
            ctx.fillStyle = tint.cool;
            ctx.fillRect(x * T, y * T, T, T);
          }
        }
        if (e) {
          ctx.fillStyle = 'rgba(' + tint.palette + ',' + (tile === 1 ? '0.16' : '0.12') + ')';
          ctx.fillRect(x * T, y * T, T, T);
        }
      }
    }

    drawDecorations(mm, T, tNow);
    drawZones(mm, T);
    drawBlood(mm, T);
    drawTorches(mm, T, tNow);
    drawInteractiveObjects(mm, T, focusPlayer, tNow);
    drawMerchant(mm, T);

    if (RK.GAME.player && mm.vis[RK.Map.stair.y] && mm.vis[RK.Map.stair.y][RK.Map.stair.x]) {
      A.draw(ctx, RK.Map.stair.asset || 'stairs', RK.Map.stair.x * T, RK.Map.stair.y * T, T);
    }

    function drawMerchant(mm, T) {
      var merchant = RK.GAME && RK.GAME.merchant;
      if (!merchant || !mm.explored[merchant.y] || !mm.explored[merchant.y][merchant.x]) return;
      var x = merchant.x * T;
      var y = merchant.y * T;
      ctx.save();
      ctx.globalAlpha = mm.vis[merchant.y][merchant.x] ? 1 : 0.42;
      if (!A.draw(ctx, merchant.asset || 'merchant', x, y, T)) {
        ctx.fillStyle = '#e0b875';
        ctx.fillRect(x + 10, y + 5, 12, 6);
        ctx.fillStyle = '#6a3f8d';
        ctx.fillRect(x + 11, y + 11, 10, 9);
        ctx.fillStyle = '#d7b17b';
        ctx.fillRect(x + 12, y + 12, 8, 6);
        ctx.fillStyle = '#6a3f8d';
        ctx.fillRect(x + 9, y + 20, 6, 9);
        ctx.fillRect(x + 17, y + 20, 6, 9);
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(x + 4, y + 3, 5, 5);
        ctx.fillRect(x + 23, y + 4, 5, 5);
      }
      ctx.restore();
    }

    for (var ii = 0; ii < RK.GAME.items.length; ii++) {
      var it = RK.GAME.items[ii];
      if (!mm.vis[it.y] || !mm.vis[it.y][it.x]) continue;
      if (it.kind === 'key') {
        if (!A.draw(ctx, it.asset || 'key', it.x * T, it.y * T, T)) drawKey(it.x * T, it.y * T, T);
        continue;
      }
      var rarityColor = RK.Items.RARITY_COLORS[it.rarity || 'common'] || RK.Items.RARITY_COLORS.common;
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = rarityColor;
      ctx.fillRect(it.x * T + 2, it.y * T + 2, T - 4, T - 4);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = rarityColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(it.x * T + 2, it.y * T + 2, T - 4, T - 4);
      ctx.restore();
      if (!A.draw(ctx, it.asset || it.type, it.x * T, it.y * T, T)) {
        A.draw(ctx, it.type, it.x * T, it.y * T, T);
      }
    }

    for (var ie = 0; ie < RK.GAME.enemies.length; ie++) {
      var en = RK.GAME.enemies[ie];
      if (!en.alive) continue;
      if (!mm.vis[en.y] || !mm.vis[en.y][en.x]) continue;
      var key = en.type in (RK.Entities.DEFS || {}) ? en.type : 'slime';
      if (en.behavior === 'boss') {
        drawBossHighlight(en, T, tNow);
        if (!A.draw(ctx, en.asset || key, en.x * T - 2, en.y * T - 2, T + 4)) {
          A.draw(ctx, key, en.x * T - 2, en.y * T - 2, T + 4);
        }
      } else if (en.enhanced) {
        var enemySize = T * (en.sizeScale || 1.25);
        var enemyX = en.x * T + (T - enemySize) / 2;
        var enemyY = en.y * T + (T - enemySize) / 2;
        if (!A.draw(ctx, en.asset || key, enemyX, enemyY, enemySize)) {
          A.draw(ctx, en.baseAsset || key, enemyX, enemyY, enemySize);
        }
      } else {
        if (!A.draw(ctx, en.asset || key, en.x * T, en.y * T, T)) A.draw(ctx, key, en.x * T, en.y * T, T);
      }
    }

    var party = RK.GAME.players || [p];
    for (var playerIndex = 0; playerIndex < party.length; playerIndex++) {
      var partyMember = party[playerIndex];
      if (!partyMember || partyMember.id === (p && p.id) || partyMember.hp <= 0) continue;
      if (!mm.vis[partyMember.y] || !mm.vis[partyMember.y][partyMember.x]) continue;
      A.draw(ctx, partyMember.asset || 'player', partyMember.x * T, partyMember.y * T, T);
      ctx.fillStyle = '#ffd166';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(partyMember.name || 'Игрок', (partyMember.x + 0.5) * T, partyMember.y * T - 2);
    }
    A.draw(ctx, (p && p.asset) || 'player', drawPos.x * T, drawPos.y * T, T);

    ctx.restore();
    drawLighting(mm, T, tNow, drawPos, camera.x, camera.y);

    if (RK.hover && mm.vis[RK.hover.y] && mm.vis[RK.hover.y][RK.hover.x]) {
      ctx.fillStyle = C.COLORS.hover;
      ctx.fillRect((RK.hover.x - camera.x) * T, (RK.hover.y - camera.y) * T, T, T);
    }

    if (RK.hoverPath) {
      ctx.fillStyle = 'rgba(255,224,120,0.45)';
      var max = Math.min(RK.hoverPath.length, 5);
      for (var i2 = 0; i2 < max; i2++) {
        var s = RK.hoverPath[i2];
        ctx.fillRect((s.x - camera.x) * T + T / 2 - 2, (s.y - camera.y) * T + T / 2 - 2, 4, 4);
      }
    }

    RK.Effects.draw(ctx, T, camera.x, camera.y);
    if (RK.UI && RK.UI.gameTooltip) {
      var pointer = RK.hoverPointer;
      var hoverInfo = pointer && RK.hover ? getHoverInfo(RK.hover) : '';
      RK.UI.gameTooltip(
        typeof hoverInfo === 'string' ? hoverInfo : hoverInfo.text,
        pointer ? pointer.x : 0,
        pointer ? pointer.y : 0,
        typeof hoverInfo === 'string' ? null : hoverInfo.rarity,
      );
    }
  }

  function getHoverInfo(tile) {
    var mm = RK.Map;
    if (!tile || !mm || !mm.vis[tile.y] || !mm.vis[tile.y][tile.x]) return '';
    var enemies = RK.GAME && RK.GAME.enemies || [];
    for (var i = 0; i < enemies.length; i++) {
      var enemy = enemies[i];
      if (!enemy.alive || enemy.x !== tile.x || enemy.y !== tile.y) continue;
      var definition = RK.Entities.DEFS[enemy.type] || {};
      return (enemy.name || definition.name || enemy.type) +
        '\nHP: ' + enemy.hp + '/' + enemy.maxHp +
        '\nУрон: ' + enemy.atk;
    }
    var items = RK.GAME && RK.GAME.items || [];
    var rarityNames = { common: 'Обычная', rare: 'Редкая', epic: 'Эпическая', legendary: 'Легендарная' };
    var statNames = { atk: 'Урон', def: 'Защита', hp: 'Здоровье', heal: 'Лечение', luck: 'Удача' };
    for (var itemIndex = 0; itemIndex < items.length; itemIndex++) {
      var item = items[itemIndex];
      if (item.x !== tile.x || item.y !== tile.y) continue;
      var description = (item.name || 'Предмет') +
        '\nРедкость: ' + (rarityNames[item.rarity] || 'Обычная');
      var itemStats = item.stats || {};
      var statLines = [];
      for (var stat in statNames) {
        if (itemStats[stat]) statLines.push('+' + itemStats[stat] + ' ' + statNames[stat]);
      }
      if (statLines.length) description += '\n' + statLines.join(', ');
      else if (item.summary) description += '\n' + item.summary;
      else if (item.amt) description += '\n' + item.amt + ' монет';
      return { text: description, rarity: item.rarity || 'common' };
    }
    var traps = mm.traps || [];
    for (var trapIndex = 0; trapIndex < traps.length; trapIndex++) {
      var trap = traps[trapIndex];
      if (trap.x !== tile.x || trap.y !== tile.y) continue;
      var trapNames = {
        spike: 'Шипованная ловушка',
        needle: 'Ловушка с иглами',
        flame: 'Огненная ловушка',
      };
      var trapDescription = trapNames[trap.type] || 'Ловушка';
      if (trap.state === 'disarmed') return trapDescription + '\nОбезврежена';
      if (trap.state === 'triggered') return trapDescription + '\nУже сработала';
      return trapDescription + '\nНажмите L, чтобы обезвредить';
    }
    var doors = mm.doors || [];
    for (var doorIndex = 0; doorIndex < doors.length; doorIndex++) {
      if (doors[doorIndex].x === tile.x && doors[doorIndex].y === tile.y) {
        return 'Дверь — E: взаимодействовать';
      }
    }
    var chests = mm.chests || [];
    for (var chestIndex = 0; chestIndex < chests.length; chestIndex++) {
      if (chests[chestIndex].x === tile.x && chests[chestIndex].y === tile.y) {
        return 'Сундук — E: открыть';
      }
    }
    var merchant = RK.GAME && RK.GAME.merchant;
    if (merchant && merchant.x === tile.x && merchant.y === tile.y) {
      return 'Торговец — E: торговля';
    }
    return '';
  }

  function drawInteractiveObjects(mm, T, focusPlayer, tNow) {
    var A = RK.Assets;
    var traps = mm.traps || [];
    var doors = mm.doors || [];
    var chests = mm.chests || [];
    for (var i = 0; i < doors.length; i++) {
      var door = doors[i];
      if (!mm.explored[door.y] || !mm.explored[door.y][door.x]) continue;
      var x = door.x * T;
      var y = door.y * T;
      var open = door.state === 'open' || door.state === 'broken';
      ctx.save();
      ctx.globalAlpha = mm.vis[door.y][door.x] ? 1 : 0.42;
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
      if (door.state === 'locked' && mm.vis[door.y][door.x]) {
        ctx.fillStyle = '#f3d36a';
        ctx.fillRect(x + T / 2 - 2, y + T / 2 - 2, 4, 4);
      }
      ctx.restore();
    }

    for (var ti = 0; ti < traps.length; ti++) {
      var trap = traps[ti];
      if (!focusPlayer || Math.max(Math.abs(focusPlayer.x - trap.x), Math.abs(focusPlayer.y - trap.y)) > 1 ||
          !mm.vis[trap.y] || !mm.vis[trap.y][trap.x]) continue;
      var tx = trap.x * T;
      var ty = trap.y * T;
      var sprite = trap.state === 'disarmed'
        ? 'trapDisarmed'
        : trap.state === 'triggered'
          ? 'trapTriggered'
          : trap.type === 'flame'
            ? 'trapFlame'
            : trap.type === 'needle'
              ? 'trapNeedle'
              : 'trapSpike';
      ctx.save();
      A.draw(ctx, sprite, tx, ty, T);
      var phase = tNow / 180;
      if (trap.state === 'armed' && trap.type === 'flame') {
        var flicker = (Math.sin(phase) + 1) / 2;
        ctx.globalAlpha = 0.45 + flicker * 0.4;
        ctx.fillStyle = flicker > 0.5 ? '#ffd84a' : '#ff6025';
        ctx.beginPath();
        ctx.moveTo(tx + T * 0.5, ty + T * (0.42 - flicker * 0.08));
        ctx.lineTo(tx + T * (0.37 - flicker * 0.03), ty + T * 0.66);
        ctx.lineTo(tx + T * (0.63 + flicker * 0.03), ty + T * 0.66);
        ctx.closePath();
        ctx.fill();
      } else if (trap.state === 'armed') {
        var glint = (Math.sin(phase) + 1) / 2;
        ctx.globalAlpha = 0.25 + glint * 0.65;
        ctx.fillStyle = '#f7f4d8';
        ctx.fillRect(tx + T * 0.47, ty + T * 0.31, 2, 3);
      }
      ctx.restore();
    }

    for (var ci = 0; ci < chests.length; ci++) {
      var chest = chests[ci];
      if (!mm.explored[chest.y] || !mm.explored[chest.y][chest.x]) continue;
      var cx = chest.x * T;
      var cy = chest.y * T;
      ctx.save();
      ctx.globalAlpha = mm.vis[chest.y][chest.x] ? 1 : 0.42;
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

  function drawKey(x, y, T) {
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

  function getCameraOffset() {
    return { x: camera.x, y: camera.y };
  }

  function getMode() {
    return RK.Meta && RK.Meta.data && RK.Meta.data.renderMode === 'ascii' ? 'ascii' : 'graphics';
  }

  function setMode(mode) {
    if (mode !== 'graphics' && mode !== 'ascii') return false;
    if (!RK.Meta || !RK.Meta.data) return false;
    RK.Meta.data.renderMode = mode;
    var saved = RK.Meta.save ? RK.Meta.save() : false;
    draw();
    return saved;
  }

  function hasVisibleBoss() {
    var mm = RK.Map;
    var enemies = RK.GAME && RK.GAME.enemies;
    if (!mm || !enemies) return false;
    for (var i = 0; i < enemies.length; i++) {
      var enemy = enemies[i];
      if (enemy.alive && enemy.behavior === 'boss' && mm.vis[enemy.y] && mm.vis[enemy.y][enemy.x]) return true;
    }
    return false;
  }

  RK.Render = {
    draw: draw,
    getMode: getMode,
    setMode: setMode,
    hasVisibleBoss: hasVisibleBoss,
    getCameraOffset: getCameraOffset,
    getHoverInfo: getHoverInfo,
  };
})();
