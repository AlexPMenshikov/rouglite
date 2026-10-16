(function () {
  var C = RK.CONFIG;
  var canvas = null;
  var ctx = null;
  var lightCanvas = null;
  var lightCtx = null;
  var floorCanvas = null;
  var floorCtx = null;
  var floorCacheKey = null;
  var floorCacheMap = null;
  var camera = { x: 0, y: 0 };

  var ENEMY_GLYPHS = {
    slime: 's',
    rat: 'r',
    skeleton: 'S',
    archer: 'a',
    bat: 'b',
    demon: 'D',
    wolf: 'w',
    spider: 'x',
    eagle: 'e',
    goat: 'g',
    scorpion: 'c',
    mummy: 'm',
    cultist: 'p',
    zombie: 'z',
    ghost: 'h',
    ghoul: 'o',
    golem: 'G',
    croc: 'k',
  };

  var STAT_NAMES = { atk: 'Урон', def: 'Защита', hp: 'Здоровье', heal: 'Лечение', luck: 'Удача' };

  var TYPE_GLYPHS = { weapon: '/', sword: '/', axe: '7', spear: '|', bow: '(', crossbow: ')', armor: ']', shield: ']', ring: 'o', amulet: 'o', boots: '=' };

  var ASCII_DOOR = {
    open: { glyph: '/', color: '#d9b36c' },
    broken: { glyph: '/', color: '#d9b36c' },
    locked: { glyph: '*', color: '#ff8a80' },
    closed: { glyph: '+', color: '#d9b36c' },
  };
  var ASCII_CHEST = {
    open: { glyph: 'o', color: '#d9b36c' },
    broken: { glyph: 'o', color: '#d9b36c' },
    locked: { glyph: 'X', color: '#ff8a80' },
    closed: { glyph: 'C', color: '#d9b36c' },
  };
  // Декорации в текстовом режиме: набор спрайтов без картинки должен оставаться читаемым.
  var ASCII_DECOR = {
    decorTree: { glyph: '♣', color: '#6fbf5e' },
    decorPine: { glyph: '♠', color: '#57a05c' },
    decorBush: { glyph: '*', color: '#7cc46a' },
    decorCactus: { glyph: '{', color: '#6fbf5e' },
    decorSand: { glyph: '-', color: '#e8cd93' },
    decorCoffin: { glyph: '=', color: '#c9a86a' },
    decorCross: { glyph: '†', color: '#b8a7cc' },
    decorBones: { glyph: 'o', color: '#d8d0bc' },
    decorStone: { glyph: 'o', color: '#8a8a95' },
    decorGrass: { glyph: ',', color: '#71b85d' },
    decorMoss: { glyph: ',', color: '#4f8b56' },
    decorMushroom: { glyph: 'n', color: '#c94c58' },
    decorPuddle: { glyph: '.', color: '#347fa0' },
    decorLake: { glyph: '~', color: '#28799a' },
    decorStream: { glyph: '~', color: '#28799a' },
  };
  var ASCII_DECOR_FALLBACK = { glyph: '.', color: '#8a8a95' };

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
      floorCacheKey = null;
    }
  }

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function isVisible(mm, x, y) {
    return !!(mm && mm.vis && mm.vis[y] && mm.vis[y][x]);
  }

  function isExplored(mm, x, y) {
    return !!(mm && mm.explored && mm.explored[y] && mm.explored[y][x]);
  }

  // Палитра пола: в мире — тинт стиля локации, в legacy-этажах — по номеру этажа.
  function floorDepthTint(mm, floor) {
    var t = RK.Assets.floorGrayAmount ? RK.Assets.floorGrayAmount(floor) : 0;
    var style = isLocationMap(mm) ? C.MAP_STYLES[mm.style] : null;
    var palette = (style && style.tint) || C.FLOOR_PALETTES[((floor || 1) - 1) % C.FLOOR_PALETTES.length];
    return {
      gray: t,
      overlay: 'rgba(' + Math.round(70 + t * 40) + ',' + Math.round(72 + t * 35) + ',' + Math.round(78 + t * 30) + ',' + (t * 0.42).toFixed(3) + ')',
      cool: 'rgba(20, 24, 36, ' + (t * 0.18).toFixed(3) + ')',
      palette: palette,
    };
  }

  // Карта мира помнит тип локации или её id; иначе это legacy-этаж.
  function isLocationMap(mm) {
    return !!(mm && (mm.locationType || mm.locationId));
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
    var style = isLocationMap(mm) ? C.MAP_STYLES[mm.style] : null;
    if (style && typeof style.light === 'number') {
      // Свет по типу локации: ярче пустыня и горы, темнее склеп и канализация.
      ambient = Math.max(0.32, Math.min(0.78, 1 - style.light));
    } else {
      var floor = (RK.GAME && RK.GAME.floor) || 1;
      var depth = RK.Assets.floorGrayAmount ? RK.Assets.floorGrayAmount(floor) : 0;
      ambient = Math.min(0.78, ambient + depth * 0.12);
    }

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

  function trapSenseRadius(player) {
    if (RK.Classes && RK.Classes.trapSenseRadius && player) return RK.Classes.trapSenseRadius(player);
    return 1;
  }

  // Лучники чувствуют взведённые ловушки за две клетки, сквозь стены.
  function trapVisible(trap, mm, player) {
    if (!trap || !player) return false;
    var radius = trapSenseRadius(player);
    if (Math.max(Math.abs(player.x - trap.x), Math.abs(player.y - trap.y)) > radius) return false;
    if (mm.vis[trap.y] && mm.vis[trap.y][trap.x]) return true;
    return radius > 1;
  }

function trapTooltip(trap, player) {
    var text = C.TRAP_NAMES[trap.type] || 'Ловушка';
    if (player && trap.owner && trap.owner === player.id) return text + '\nВаша ловушка, взведена';
    if (trap.state === 'disarmed') return text + '\nОбезврежена';
    if (trap.state === 'triggered') return text + '\nУже сработала';
    return text + '\nНажмите L, чтобы обезвредить';
  }

  function itemGlyph(item) {
    if (item.kind === 'key') return '+';
    if (item.kind === 'trap') return 'v';
    if (item.kind === 'gold' || item.type === 'gold') return '$';
    if (item.type === 'potion') return '!';
    if (item.weaponType === 'bow' || item.type === 'bow') return '(';
    if (item.weaponType === 'crossbow' || item.type === 'crossbow') return ')';
    return TYPE_GLYPHS[item.type] || '?';
  }

  function enemyGlyph(enemy) {
    if (enemy.behavior === 'boss') return 'B';
    return ENEMY_GLYPHS[enemy.type] || 'e';
  }

// Подсветка клетки под курсором и маршрута автопрохода — общий код для обоих режимов.
  function drawOverlays(mm, T) {
    if (RK.hover && isVisible(mm, RK.hover.x, RK.hover.y)) {
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

  // Эффекты рисуются поверх сцены; тултип уходит в DOM через ui.refreshTooltip, поэтому canvas не трогает layout в каждом кадре.
  function drawSceneOverlays(mm, T) {
    RK.Effects.draw(ctx, T, camera.x, camera.y);
    if (RK.UI && RK.UI.refreshTooltip) RK.UI.refreshTooltip(mm);
  }

  function drawAsciiList(mm, T, list, styleOf) {
    for (var i = 0; i < (list || []).length; i++) {
      var object = list[i];
      if (!isExplored(mm, object.x, object.y)) continue;
      var style = styleOf(object);
      drawAsciiGlyph(T, object.x, object.y, style.glyph, style.color,
        isVisible(mm, object.x, object.y) ? 1 : C.EXPLORED_ALPHA);
    }
  }

  function drawAsciiTraps(mm, T, hero) {
    var traps = mm.traps || [];
    for (var i = 0; i < traps.length; i++) {
      var trap = traps[i];
      if (!trapVisible(trap, mm, hero)) continue;
      var seen = isVisible(mm, trap.x, trap.y);
      drawAsciiGlyph(T, trap.x, trap.y,
        trap.state === 'disarmed' ? '_' : (trap.type === 'flame' ? '~' : '^'),
        trap.state === 'disarmed' ? '#8878a0' : '#ff8a80', seen ? 1 : 0.55);
    }
  }

  function drawAscii(mm, T, hero, drawPos) {
    ctx.save();
    ctx.translate(-camera.x * T, -camera.y * T);

    for (var y = 0; y < mm.h; y++) {
      for (var x = 0; x < mm.w; x++) {
        if (!isExplored(mm, x, y)) continue;
        var visible = isVisible(mm, x, y);
        drawAsciiGlyph(T, x, y, mm.tiles[y][x] === 1 ? '.' : '#',
          mm.tiles[y][x] === 1 ? '#b8a7cc' : '#8a769f', visible ? 1 : 0.38);
      }
    }

    drawAsciiList(mm, T, mm.doors, function (door) {
      return ASCII_DOOR[door.state] || ASCII_DOOR.closed;
    });
    drawAsciiList(mm, T, mm.chests, function (chest) {
      return ASCII_CHEST[chest.state] || ASCII_CHEST.closed;
    });
    drawAsciiTraps(mm, T, hero);
    drawAsciiList(mm, T, mm.torches, function () {
      return { glyph: 'i', color: '#ffd166' };
    });
    drawAsciiList(mm, T, mm.decorations, function (decoration) {
      return ASCII_DECOR[decoration.asset] || ASCII_DECOR_FALLBACK;
    });

    var game = RK.GAME || {};
    var npcs = game.npcs || [];
    for (var npcIndex = 0; npcIndex < npcs.length; npcIndex++) {
      var npcVisual = RK.Npc.visual(npcs[npcIndex].kind);
      drawAsciiNpc(mm, T, npcs[npcIndex], npcVisual.glyph, npcVisual.color);
    }
    drawAsciiPois(mm, T);

    var stair = RK.Map && RK.Map.stair;
    if (stair && isVisible(mm, stair.x, stair.y)) {
      drawAsciiGlyph(T, stair.x, stair.y, '>', '#ffd166');
    }

    drawAsciiExits(mm, T);
    var items = game.items || [];
    for (var itemIndex = 0; itemIndex < items.length; itemIndex++) {
      var item = items[itemIndex];
      if (isVisible(mm, item.x, item.y)) {
        drawAsciiGlyph(T, item.x, item.y, itemGlyph(item), '#f3d36a');
      }
    }

    var enemies = game.enemies || [];
    for (var enemyIndex = 0; enemyIndex < enemies.length; enemyIndex++) {
      var enemy = enemies[enemyIndex];
      if (enemy.alive && isVisible(mm, enemy.x, enemy.y)) {
        drawAsciiGlyph(T, enemy.x, enemy.y, enemyGlyph(enemy), '#ff8a80');
      }
    }

    var party = game.players || (game.player ? [game.player] : []);
    var focusedId = game.player && game.player.id;
    for (var playerIndex = 0; playerIndex < party.length; playerIndex++) {
      var member = party[playerIndex];
      if (!member || member.id === focusedId || member.hp <= 0) continue;
      if (isVisible(mm, member.x, member.y)) {
        var pos = RK.Combat.getDrawPos ? RK.Combat.getDrawPos(member) : { x: member.x, y: member.y };
        drawAsciiGlyph(T, pos.x, pos.y, '&', '#ffd166');
      }
    }
    drawAsciiGlyph(T, drawPos.x, drawPos.y, '@', '#7ae582');
    ctx.restore();

    drawOverlays(mm, T);
    drawSceneOverlays(mm, T);
  }

  function drawAsciiNpc(mm, T, npc, glyph, color) {
    if (!npc || !isExplored(mm, npc.x, npc.y)) return;
    drawAsciiGlyph(T, npc.x, npc.y, glyph, color,
      isVisible(mm, npc.x, npc.y) ? 1 : C.EXPLORED_ALPHA);
  }

  function drawAsciiPois(mm, T) {
    var pois = RK.Map && RK.Map.pois ? RK.Map.pois : [];
    for (var i = 0; i < pois.length; i++) {
      var poi = pois[i];
      if (!isExplored(mm, poi.x, poi.y)) continue;
      var glyph = poi.type === 'ruins' ? 'R' : poi.type === 'clearing' ? 'o' : '♣';
      drawAsciiGlyph(T, poi.x, poi.y, glyph, '#9bd17c',
        isVisible(mm, poi.x, poi.y) ? 1 : C.EXPLORED_ALPHA);
    }
  }

  function drawAsciiExits(mm, T) {
    var exits = RK.Map && RK.Map.exits ? RK.Map.exits : [];
    for (var i = 0; i < exits.length; i++) {
      var exit = exits[i];
      if (!isExplored(mm, exit.x, exit.y)) continue;
      drawAsciiGlyph(T, exit.x, exit.y, '>', '#8ee3ef',
        isVisible(mm, exit.x, exit.y) ? 1 : C.EXPLORED_ALPHA);
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
    drawLakeTiles(lakeTiles, mm, T, tNow);
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

  function drawLakeTiles(lakeTiles, mm, T, tNow) {
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
      var phase = tile.waterPhase || 0;
      var wave = Math.sin(tNow * 0.0014 + phase);
      var shimmerY = y + T * (0.28 + ((wave + 1) * 0.1));
      var visibility = mm && mm.vis[tile.y] && mm.vis[tile.y][tile.x] ? 1 : 0.34;
      ctx.globalAlpha = 0.94 * visibility;

      var deep = ctx.createLinearGradient(x, y, x + T, y + T);
      deep.addColorStop(0, '#123c5b');
      deep.addColorStop(0.52, '#176383');
      deep.addColorStop(1, '#0e344f');
      ctx.fillStyle = deep;
      traceRoundedRect(x + left, y + top, width, height, T * 0.18);
      ctx.fill();

      ctx.save();
      traceRoundedRect(x + left + T * 0.04, y + top + T * 0.04,
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

      // Путь строится один раз и переиспользуется всеми обводками: раньше он собирался и здесь, и внутри traceFlowPath,
      // объявленной в теле цикла — то есть на каждый ручей в каждом кадре.
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

// Пол и стены не меняются в пределах этажа, поэтому заливка печётся один раз в offscreen-канвас:
// на карте 96×68 это до 26 000 fillRect на кадр.
// Стиль зала берётся по индексу региона; битый или неизвестный стиль
// откатывается к стилю карты, а индекс вне палитры — к нулевому цвету.
  function regionStyleAt(mm, x, y) {
    var styles = C.MAP_STYLES;
    var row = mm.regions && mm.regions[y];
    var id = mm.regionStyles && row ? mm.regionStyles[row[x]] : null;
    if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(styles, id)) return styles[id];
    return typeof mm.style === 'string' && Object.prototype.hasOwnProperty.call(styles, mm.style)
      ? styles[mm.style] : null;
  }

  function paletteColor(style, palette, index) {
    var colors = style && style[palette];
    if (!Array.isArray(colors) || !colors.length) return null;
    return Number.isInteger(index) && index >= 0 && index < colors.length ? colors[index] : colors[0];
  }

  function bakeFloorLayer(mm, T) {
    var game = RK.GAME;
    var floor = game.floor || 1;
    var key = [mm.w, mm.h, T, floor, mm.style, game.mapStyle,
      mm.rooms && mm.rooms.length, mm.tavern && mm.tavern.x,
      mm.regions && mm.regions.length].join('|');
    if (floorCacheKey === key && floorCacheMap === mm && floorCanvas) return;

    if (!floorCanvas || floorCanvas.width !== mm.w * T || floorCanvas.height !== mm.h * T) {
      floorCanvas = document.createElement('canvas');
      floorCanvas.width = mm.w * T;
      floorCanvas.height = mm.h * T;
      floorCtx = floorCanvas.getContext('2d');
    }
    var A = RK.Assets;
    var tint = floorDepthTint(mm, floor);
    var baked = floorCtx;
    baked.clearRect(0, 0, floorCanvas.width, floorCanvas.height);

    for (var y = 0; y < mm.h; y++) {
      for (var x = 0; x < mm.w; x++) {
        var explored = isExplored(mm, x, y);
        var tile = mm.tiles[y][x];
        A.drawFloorTile(baked, floor, tile, isVisible(mm, x, y), explored, x * T, y * T, T);
        var regionStyle = regionStyleAt(mm, x, y);
        if (tile === 1 && mm.floorTypes && mm.floorTypes[y]) {
          var floorColor = paletteColor(regionStyle, 'colors', mm.floorTypes[y][x]);
          if (floorColor) {
            baked.fillStyle = floorColor;
            baked.fillRect(x * T, y * T, T, T);
          }
        } else if (tile === 0 && mm.wallTypes && mm.wallTypes[y]) {
          var wallColor = paletteColor(regionStyle, 'wallColors', mm.wallTypes[y][x]);
          if (wallColor) {
            baked.fillStyle = wallColor;
            baked.fillRect(x * T, y * T, T, T);
          }
        }
        if (explored) {
          if (floor <= 3 && tile === 1 && tint.gray > 0.01) {
            baked.fillStyle = tint.overlay;
            baked.fillRect(x * T, y * T, T, T);
            if (isVisible(mm, x, y)) {
              baked.fillStyle = tint.cool;
              baked.fillRect(x * T, y * T, T, T);
            }
          }
          baked.fillStyle = 'rgba(' + tint.palette + ',' + (tile === 1 ? '0.16' : '0.12') + ')';
          baked.fillRect(x * T, y * T, T, T);
          if (tile === 1 && mm.tavern && inRect(mm.tavern, x, y)) {
            baked.fillStyle = 'rgba(255, 209, 102, 0.08)';
            baked.fillRect(x * T, y * T, T, T);
          }
        }
      }
    }
floorCacheKey = key;
    floorCacheMap = mm;
  }

  function inRect(rect, x, y) {
    return rect.x <= x && x < rect.x + rect.w && rect.y <= y && y < rect.y + rect.h;
  }

  // При смене тайлсета запечённый слой сбрасывается: он нарисован прежними текстурами.
  function invalidateFloorLayer() {
    floorCacheKey = null;
    floorCacheMap = null;
  }

  function drawItems(mm, T) {
    var A = RK.Assets;
    var items = RK.GAME.items;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!isVisible(mm, it.x, it.y)) continue;
      if (it.kind === 'key') {
        if (!A.draw(ctx, it.asset || 'key', it.x * T, it.y * T, T)) drawKey(it.x * T, it.y * T, T);
        continue;
      }
      var rarityColor = C.RARITY_COLORS[it.rarity || 'common'] || C.RARITY_COLORS.common;
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
  }

  function drawEnemies(mm, T, tNow) {
    var A = RK.Assets;
    var enemies = RK.GAME.enemies;
    for (var i = 0; i < enemies.length; i++) {
      var en = enemies[i];
      if (!en.alive || !isVisible(mm, en.x, en.y)) continue;
      var key = en.type in (RK.Entities.DEFS || {}) ? en.type : 'slime';
      if (en.behavior === 'boss') {
        drawBossHighlight(en, T, tNow);
        if (!A.draw(ctx, en.asset || key, en.x * T - 2, en.y * T - 2, T + 4)) {
          A.draw(ctx, key, en.x * T - 2, en.y * T - 2, T + 4);
        }
      } else if (en.enhanced) {
        var size = T * (en.sizeScale || 1.25);
        var x = en.x * T + (T - size) / 2;
        var y = en.y * T + (T - size) / 2;
        if (!A.draw(ctx, en.asset || key, x, y, size)) A.draw(ctx, en.baseAsset || key, x, y, size);
      } else if (!A.draw(ctx, en.asset || key, en.x * T, en.y * T, T)) {
        A.draw(ctx, key, en.x * T, en.y * T, T);
      }
      if (en.isChampion) {
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
  // В ASCII-режиме не рисуется, там герой остаётся глифом.
  function drawGazeCone(player, pos, T) {
    var fx = player.facingX || 0;
    var fy = player.facingY || 0;
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

  function drawParty(mm, T, p, drawPos) {
    var A = RK.Assets;
    var party = RK.GAME.players || (p ? [p] : []);
    var focusedId = p && p.id;
    for (var i = 0; i < party.length; i++) {
      var member = party[i];
      if (!member || member.id === focusedId || member.hp <= 0) continue;
      if (!isVisible(mm, member.x, member.y)) continue;
      // У соседей по партии та же анимация шага, что у героя этого клиента, поэтому позиция берётся из неё, а не из клетки в снимке.
      var pos = RK.Combat.getDrawPos ? RK.Combat.getDrawPos(member) : { x: member.x, y: member.y };
      A.draw(ctx, member.asset || 'player', pos.x * T, pos.y * T, T) || A.draw(ctx, 'player', pos.x * T, pos.y * T, T);
      drawGazeCone(member, pos, T);
      ctx.fillStyle = '#ffd166';
      ctx.font = Math.max(8, Math.round(T * 0.28)) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(member.name || 'Игрок', (pos.x + 0.5) * T, pos.y * T - 2);
    }
    if (p) {
      A.draw(ctx, p.asset || 'player', drawPos.x * T, drawPos.y * T, T) || A.draw(ctx, 'player', drawPos.x * T, drawPos.y * T, T);
      drawGazeCone(p, drawPos, T);
    }
  }

  function drawStair(mm, T) {
    var stair = RK.Map.stair;
    if (!stair || !isVisible(mm, stair.x, stair.y)) return;
    RK.Assets.draw(ctx, stair.asset || 'stairs', stair.x * T, stair.y * T, T);
  }

  function exitHoverText(exit) {
    var target = RK.World && RK.World.getLocation(exit.to);
    return exit.label + (target ? '\nПереход: ' + target.name : '') + '\nЛКМ: идти к переходу';
  }

  function drawExits(mm, T) {
    var exits = RK.Map.exits || [];
    for (var i = 0; i < exits.length; i++) {
      var exit = exits[i];
      if (!isExplored(mm, exit.x, exit.y)) continue;
      var x = exit.x * T;
      var y = exit.y * T;
      ctx.save();
      ctx.globalAlpha = isVisible(mm, exit.x, exit.y) ? 1 : C.EXPLORED_ALPHA;
      if (!RK.Assets.draw(ctx, exit.asset || 'stairs', x, y, T)) {
        ctx.fillStyle = '#8ee3ef';
        ctx.fillRect(x + T * 0.2, y + T * 0.2, T * 0.6, T * 0.6);
      }
      ctx.restore();
    }
  }

  function drawPoiMarkers(mm, T) {
    var pois = RK.Map.pois || [];
    for (var i = 0; i < pois.length; i++) {
      var poi = pois[i];
      if (!isExplored(mm, poi.x, poi.y)) continue;
      var x = poi.x * T;
      var y = poi.y * T;
      ctx.save();
      ctx.globalAlpha = isVisible(mm, poi.x, poi.y) ? 1 : C.EXPLORED_ALPHA;
      var asset = poi.type === 'ruins' ? 'decorStone' : 'decorGrass';
      if (!RK.Assets.draw(ctx, asset, x, y, T)) {
        ctx.fillStyle = '#9bd17c';
        ctx.fillRect(x + T * 0.3, y + T * 0.3, T * 0.4, T * 0.4);
      }
      ctx.restore();
    }
  }

  function draw() {
    ensure();
    if (!ctx) return;
    var T = C.TILE;
    var tNow = now();

    ctx.fillStyle = C.COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var mm = RK.Map;
    if (!mm || !RK.GAME) return;

    var p = RK.GAME.player;
    var drawPos = RK.Combat.getDrawPos ? RK.Combat.getDrawPos() : { x: p.x, y: p.y };
    camera = cameraOffset(drawPos);
    if (RK.Fov && RK.Fov.computeVisibility) {
      // Снимок из сети несёт обзор, посчитанный на сервере для того, кто ходил. Каждый клиент смотрит из своего
      // героя, поэтому видимость пересчитывается локально; карта при этом остаётся общей.
      mm = Object.create(mm);
      mm.vis = RK.Fov.computeVisibility(p.x, p.y);
      // Обзор нужен и наведению: getHoverInfo читает его из RK.Map, а applySnapshot
      // оставляет vis пустым (обзор считает рендер). Снимок карты не портим — это один объект.
      RK.Map.vis = mm.vis;
      mm.explored = mm.explored.map(function (row, y) {
        return row.map(function (explored, x) {
          return explored || mm.vis[y][x];
        });
      });
    }
    if (getMode() === 'ascii') {
      drawAscii(mm, T, p, drawPos);
      return;
    }

    ctx.save();
    ctx.translate(-camera.x * T, -camera.y * T);

    bakeFloorLayer(mm, T);
    ctx.drawImage(floorCanvas, 0, 0);

    drawDecorations(mm, T, tNow);
    drawZones(mm, T);
    drawBlood(mm, T);
    drawTorches(mm, T, tNow);
    drawPoiMarkers(mm, T);
    drawExits(mm, T);
    drawInteractiveObjects(mm, T, p, tNow);
    drawNpcs(mm, T);
    drawStair(mm, T);
    drawItems(mm, T);
    drawEnemies(mm, T, tNow);
    drawParty(mm, T, p, drawPos);

    ctx.restore();
    drawLighting(mm, T, tNow, drawPos, camera.x, camera.y);

    drawOverlays(mm, T);
    drawSceneOverlays(mm, T);
}

  // NPC рисуются после интерактивных объектов, но до предметов и врагов: раньше функции были
  // вложены в draw() и объявлены после вызова, из-за чего NPC оказывались под предметами и врагами.
  function drawNpcs(mm, T) {
    var npcs = (RK.GAME && RK.GAME.npcs) || [];
    for (var i = 0; i < npcs.length; i++) drawNpcSprite(mm, T, npcs[i], RK.Npc.visual(npcs[i].kind));
  }

  function drawNpcSprite(mm, T, npc, visual) {
    if (!npc || !isExplored(mm, npc.x, npc.y)) return;
    var x = npc.x * T;
    var y = npc.y * T;
    ctx.save();
    ctx.globalAlpha = isVisible(mm, npc.x, npc.y) ? 1 : C.EXPLORED_ALPHA;
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
  function sensedTrapInfo(tile) {
    var player = RK.GAME && RK.GAME.player;
    var radius = trapSenseRadius(player);
    if (!player || !tile || radius <= 1) return '';
    if (Math.max(Math.abs(player.x - tile.x), Math.abs(player.y - tile.y)) > radius) return '';
    var trap = RK.MapGen.getTrapAt(tile.x, tile.y);
    if (!trap) return '';
    return trapTooltip(trap, player) + '\nЧувствуете ловушку (радиус ' + radius + ')';
  }

// getHoverInfo вызывается на каждый mousemove, поэтому объекты карты (двери, сундуки, ловушки, NPC)
  // складываются в индекс. Ключ — RK.Map, внутри сверяются длины списков: снимок из сети подменяет
  // карту целиком, но списки могут пересоздаваться на месте.
  var mapObjectIndex = new WeakMap();

  function tileKey(x, y) {
    return x + ',' + y;
  }

  function mapSignature(mm, game) {
    return [
      (mm.doors || []).length, (mm.chests || []).length, (mm.traps || []).length,
      (game.npcs || []).length,
    ].join('|');
  }

  function rebuildMapIndex(mm, game) {
    var index = new Map();
    var push = function (kind, object) {
      if (!object) return;
      var key = tileKey(object.x, object.y);
      var bucket = index.get(key);
      if (!bucket) index.set(key, bucket = []);
      bucket.push({ kind: kind, object: object });
    };
    var doors = mm.doors || [];
    for (var d = 0; d < doors.length; d++) push('door', doors[d]);
    var chests = mm.chests || [];
    for (var c = 0; c < chests.length; c++) push('chest', chests[c]);
    var traps = mm.traps || [];
    for (var t = 0; t < traps.length; t++) push('trap', traps[t]);
    var npcs = game.npcs || [];
    for (var n = 0; n < npcs.length; n++) push('npc', npcs[n]);
    // Лестница этажа — тоже переход, и по ней кликают так же, как по вратам.
    if (mm.stair) push('stair', mm.stair);
    return { signature: mapSignature(mm, game), entries: index };
  }

  function mapEntriesAt(mm, game, x, y) {
    var signature = mapSignature(mm, game);
    var cached = mapObjectIndex.get(mm);
    if (!cached || cached.signature !== signature) {
      mapObjectIndex.set(mm, cached = rebuildMapIndex(mm, game));
    }
    return cached.entries.get(tileKey(x, y));
  }

  function enemyHoverText(enemy) {
    var definition = RK.Entities.DEFS[enemy.type] || {};
    return (enemy.name || definition.name || enemy.type) +
      '\nHP: ' + enemy.hp + '/' + enemy.maxHp +
      '\nУрон: ' + enemy.atk;
  }

  function itemHoverText(item) {
    var description = (item.name || 'Предмет') +
      '\nРедкость: ' + (C.RARITY_NAMES_FEMININE[item.rarity] || C.RARITY_NAMES_FEMININE.common);
    var itemStats = item.stats || {};
    var statLines = [];
    for (var stat in STAT_NAMES) {
      if (itemStats[stat]) statLines.push('+' + itemStats[stat] + ' ' + STAT_NAMES[stat]);
    }
    if (statLines.length) description += '\n' + statLines.join(', ');
    else if (item.summary) description += '\n' + item.summary;
    else if (item.amt) description += '\n' + item.amt + ' монет';
    return { text: description, rarity: item.rarity || 'common' };
  }

  // Приоритет отображения при нескольких объектах в одной клетке.
  var HOVER_STATIC_TEXT = {
    door: 'Дверь — E: взаимодействовать',
    chest: 'Сундук — E: открыть',
    stair: 'Лестница вниз — ЛКМ: идти к переходу',
  };

  function findEnemyAt(list, x, y) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].alive && list[i].x === x && list[i].y === y) return list[i];
    }
    return null;
  }

  function findItemAt(list, x, y) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].x === x && list[i].y === y) return list[i];
    }
    return null;
  }

  function getHoverInfo(tile) {
    var mm = RK.Map;
    var game = RK.GAME || {};
    if (!tile || !mm || !isVisible(mm, tile.x, tile.y)) return sensedTrapInfo(tile);
    var exit = findItemAt(mm.exits || [], tile.x, tile.y);
    if (exit) return exitHoverText(exit);
    var poi = findItemAt(mm.pois || [], tile.x, tile.y);
    if (poi) return poi.name + (poi.description ? '\n' + poi.description : '');
    var enemy = findEnemyAt(game.enemies || [], tile.x, tile.y);
    if (enemy) return enemyHoverText(enemy);
    var item = findItemAt(game.items || [], tile.x, tile.y);
    if (item) return itemHoverText(item);
    var entries = mapEntriesAt(mm, game, tile.x, tile.y);
    if (!entries) return '';
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].kind === 'trap') return trapTooltip(entries[i].object, game.player);
      if (entries[i].kind === 'npc') {
        return RK.Npc.nameOf(entries[i].object) + ' — ' + RK.Npc.hoverHint(entries[i].object.kind);
      }
      if (HOVER_STATIC_TEXT[entries[i].kind]) return HOVER_STATIC_TEXT[entries[i].kind];
    }
    return '';
  }

  function drawInteractiveObjects(mm, T, hero, tNow) {
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
      if (!trapVisible(trap, mm, hero)) continue;
      var trapSeen = mm.vis[trap.y] && mm.vis[trap.y][trap.x];
      var tx = trap.x * T;
      var ty = trap.y * T;
      var sprite = trap.state === 'disarmed' || trap.state === 'triggered'
        ? C.TRAP_SPRITES[trap.state]
        : C.TRAP_SPRITES[trap.type] || C.TRAP_SPRITES.armed;
      ctx.save();
      if (!trapSeen) ctx.globalAlpha = 0.55;
      A.draw(ctx, sprite, tx, ty, T);
      var phase = tNow / 180;
      if (trap.owner && hero && trap.owner === hero.id) {
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
    invalidateFloorLayer: invalidateFloorLayer,
  };
})();
