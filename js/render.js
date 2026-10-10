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
      A.draw(ctx, 'torch', tr.x * T, tr.y * T, T);
      if (vis) {
        ctx.globalAlpha = 0.55 + 0.35 * flicker;
        A.draw(ctx, 'torchFlame', tr.x * T, tr.y * T + bob * 0.15 - 1, T);
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
    camera = cameraOffset(drawPos);
    ctx.save();
    ctx.translate(-camera.x * T, -camera.y * T);

    var tint = floorDepthTint(RK.GAME.floor || 1);

    for (var y = 0; y < mm.h; y++) {
      for (var x = 0; x < mm.w; x++) {
        var v = mm.vis[y][x];
        var e = mm.explored[y][x];
        var tile = mm.tiles[y][x];
        A.drawFloorTile(ctx, RK.GAME.floor || 1, tile, v, e, x * T, y * T, T);
        if (tile === 1 && v && mm.floorTypes && C.MAP_STYLES[mm.style]) {
          ctx.fillStyle = C.MAP_STYLES[mm.style].colors[mm.floorTypes[y][x]];
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

    drawZones(mm, T);
    drawBlood(mm, T);
    drawTorches(mm, T, tNow);

    if (RK.GAME.player && mm.vis[RK.Map.stair.y] && mm.vis[RK.Map.stair.y][RK.Map.stair.x]) {
      A.draw(ctx, 'stairs', RK.Map.stair.x * T, RK.Map.stair.y * T, T);
    }

    for (var ii = 0; ii < RK.GAME.items.length; ii++) {
      var it = RK.GAME.items[ii];
      if (!mm.vis[it.y] || !mm.vis[it.y][it.x]) continue;
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
      A.draw(ctx, it.type, it.x * T, it.y * T, T);
    }

    for (var ie = 0; ie < RK.GAME.enemies.length; ie++) {
      var en = RK.GAME.enemies[ie];
      if (!en.alive) continue;
      if (!mm.vis[en.y] || !mm.vis[en.y][en.x]) continue;
      var key = en.type in (RK.Entities.DEFS || {}) ? en.type : 'slime';
      if (en.behavior === 'boss') {
        drawBossHighlight(en, T, tNow);
        A.draw(ctx, key, en.x * T - 2, en.y * T - 2, T + 4);
      } else {
        A.draw(ctx, key, en.x * T, en.y * T, T);
      }
    }

    A.draw(ctx, 'player', drawPos.x * T, drawPos.y * T, T);

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
  }

  function getCameraOffset() {
    return { x: camera.x, y: camera.y };
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

  RK.Render = { draw: draw, hasVisibleBoss: hasVisibleBoss, getCameraOffset: getCameraOffset };
})();
