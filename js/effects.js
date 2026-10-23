(function () {
  var C = RK.CONFIG;
  var list = [];
  var flashUntil = 0;
  // Тряска живёт отдельно от вспышки: её включает настройка, а силу задаёт удар.
  var shake = { until: 0, power: 0 };
  var qualityFallback = 'full';
  var shakeFallback = true;

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function metaData() {
    return (RK.Meta && RK.Meta.data) ? RK.Meta.data : null;
  }

  // Качество и тряска хранятся в Meta; до её загрузки работают значения по умолчанию.
  function quality() {
    var data = metaData();
    if (data && C.EFFECT_QUALITIES.indexOf(data.effectsQuality) >= 0) qualityFallback = data.effectsQuality;
    return qualityFallback;
  }

  function shakeEnabled() {
    var data = metaData();
    if (data) shakeFallback = data.screenShake !== false;
    return shakeFallback;
  }

  function noteShake(power) {
    var amount = typeof power === 'number' ? power : 2.6;
    shake.until = now() + C.EFFECT.SHAKE_MS;
    shake.power = Math.max(shake.power, Math.max(0.5, amount));
  }

  // Смещение кадра: затухающая синусоида, чтобы тряска не выглядела рывком.
  function shakeOffset(t) {
    if (!shakeEnabled() || quality() === 'off') return { x: 0, y: 0 };
    t = t || now();
    var left = shake.until - t;
    if (left <= 0) return { x: 0, y: 0 };
    var fade = left / C.EFFECT.SHAKE_MS;
    var amp = shake.power * fade * fade;
    return { x: Math.sin(t * 0.11) * amp, y: Math.cos(t * 0.14) * amp };
  }

  function add(x, y, color, opts) {
    var hit = !!(opts && opts.hit);
    list.push({
      kind: 'ring',
      x: x,
      y: y,
      color: color,
      born: now(),
      life: (opts && opts.life) || C.EFFECT.LIFE,
      maxR: (opts && opts.maxR) || C.EFFECT.MAX_R,
      hit: hit,
      blood: hit && !!(opts && opts.blood),
    });
    if (hit && opts && opts.shake) noteShake(opts.shake);
  }

  function addDamage(x, y, value, color) {
    list.push({
      kind: 'damage',
      x: x,
      y: y,
      text: String(value),
      color: color || '#ffffff',
      born: now(),
      life: C.EFFECT.DAMAGE_LIFE,
    });
  }

  function addShot(x0, y0, x1, y1, color, opts) {
    list.push({
      kind: 'shot',
      x: x0,
      y: y0,
      x1: x1,
      y1: y1,
      color: color || '#ffe9a8',
      born: now(),
      life: (opts && opts.life) || 220,
    });
  }

  // Летящий огненный шар с хвостом частиц.
  function addFireball(x0, y0, x1, y1, opts) {
    list.push({
      kind: 'fireball',
      x: x0,
      y: y0,
      x1: x1,
      y1: y1,
      color: '#ff8a3d',
      born: now(),
      life: (opts && opts.life) || 350,
    });
  }

  // Зигзаг-молния с искрами.
  function addLightning(x0, y0, x1, y1, opts) {
    list.push({
      kind: 'lightning',
      x: x0,
      y: y0,
      x1: x1,
      y1: y1,
      color: '#ffe97a',
      born: now(),
      life: (opts && opts.life) || 300,
    });
  }

  function notePlayerHit() {
    flashUntil = now() + C.EFFECT.LIFE;
  }

  function tick(ts) {
    var t = ts || now();
    for (var i = list.length - 1; i >= 0; i--) {
      if (t - list[i].born > list[i].life) list.splice(i, 1);
    }
  }

  function active() {
    return list.length > 0 || now() < flashUntil || now() < shake.until;
  }

  // Фоновые частицы: у локации свой характер — пыль, листья, песок или угольки.
  var AMBIENT_STYLES = {
    dust: { color: 'rgba(214,206,186,', count: 24, size: 2, speed: 7, drift: 10, horizontal: false },
    leaves: { color: 'rgba(146,196,96,', count: 18, size: 3, speed: 14, drift: 22, horizontal: false },
    sand: { color: 'rgba(232,202,126,', count: 26, size: 2, speed: 26, drift: 18, horizontal: true },
    embers: { color: 'rgba(255,152,58,', count: 20, size: 2, speed: -18, drift: 8, horizontal: false },
  };

  function hash(value) {
    var x = Math.sin(value * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function wrap(value, size) {
    return ((value % size) + size) % size;
  }

  // Живой фон рисуется в экранных координатах: частицы не привязаны к клеткам.
  function drawAmbient(ctx, kind, tNow) {
    if (!kind || quality() === 'off') return;
    var style = AMBIENT_STYLES[kind] || AMBIENT_STYLES.dust;
    var w = ctx.canvas.width;
    var h = ctx.canvas.height;
    var count = quality() === 'lite' ? Math.round(style.count / 2) : style.count;
    var t = (tNow || 0) * 0.001;
    ctx.save();
    for (var i = 0; i < count; i++) {
      var size = style.size;
      var x = hash(i + 1) * w;
      var y = hash(i + 101) * h;
      if (style.horizontal) {
        x = wrap(x + t * style.speed * 12, w + size) - size;
        y += Math.sin(t * 1.3 + i) * style.drift;
      } else {
        y = wrap(y + t * style.speed * 12, h + size) - size;
        x += Math.sin(t * 0.9 + i * 1.7) * style.drift;
      }
      ctx.globalAlpha = 0.18 + 0.3 * hash(i + 7);
      ctx.fillStyle = style.color + '1)';
      ctx.fillRect(x, y, style.horizontal ? size * 2 : size, kind === 'leaves' ? size : size);
    }
    ctx.restore();
  }

  // Удар: белая вспышка, искры, дуга замаха и капли крови.
  function drawHit(ctx, e, cx, cy, prog, alpha, T) {
    var lite = quality() === 'lite';
    var radius = e.maxR * (0.5 + 0.5 * prog);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    if (!lite) {
      var sparks = 6;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = Math.max(1, T * 0.06);
      for (var i = 0; i < sparks; i++) {
        var angle = (i / sparks) * Math.PI * 2 + prog * 1.4;
        var near = e.maxR * (0.25 + prog * 0.35);
        var far = e.maxR * (0.8 + prog * 0.5);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * near, cy + Math.sin(angle) * near * 0.6);
        ctx.lineTo(cx + Math.cos(angle) * far, cy + Math.sin(angle) * far * 0.6);
        ctx.stroke();
      }
    }

    // Дуга замаха: короткая белая полоса поверх вспышки.
    ctx.globalAlpha = alpha * 0.85;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, T * 0.07);
    ctx.beginPath();
    ctx.arc(cx, cy, e.maxR * 0.95, -1.05 + prog * 0.5, 0.45 + prog * 0.5);
    ctx.stroke();

    if (e.blood) {
      ctx.fillStyle = '#8f1420';
      ctx.globalAlpha = alpha;
      for (var b = 0; b < 4; b++) {
        var bloodAngle = (b / 4) * Math.PI * 2 + 0.6;
        var distance = e.maxR * (0.4 + prog * 0.9);
        var bx = cx + Math.cos(bloodAngle) * distance;
        var by = cy + Math.sin(bloodAngle) * distance * 0.5 + prog * prog * T * 0.45;
        var dot = Math.max(1, Math.round(T * 0.05));
        ctx.fillRect(bx, by, dot, dot);
      }
    }
    ctx.restore();
  }

  // Проекция задаётся видом: у него своя геометрия (сетка или изометрия).
  function draw(ctx, projector) {
    var t = now();
    var T = projector.tile;
    drawAmbient(ctx, projector.ambient, t);
    // Точка клетки на экране: центр клетки — (0.5, 0.5).
    function at(x, y) {
      return projector.point(x + 0.5, y + 0.5);
    }
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var prog = (t - e.born) / e.life;
      if (prog < 0 || prog > 1) continue;
      var alpha = 1 - prog;
      var center = at(e.x, e.y);
      var cx = center.x;
      var cy = center.y;

      if (e.kind === 'damage') {
        var ty = cy - prog * T * 0.75;
        ctx.globalAlpha = alpha;
        ctx.font = Math.max(7, Math.round(T * (typeof e.text === 'string' && e.text.length > 3 ? 0.22 : 0.28) * 1.1)) + 'px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,' + (0.55 * alpha).toFixed(3) + ')';
        ctx.fillText(e.text, cx + 1, ty + 1);
        ctx.fillStyle = e.color;
        ctx.fillText(e.text, cx, ty);
        ctx.globalAlpha = 1;
        continue;
      }

      if (e.kind === 'shot') {
        var start = at(e.x, e.y);
        var finish = at(e.x1, e.y1);
        var sx = start.x;
        var sy = start.y;
        var ex = finish.x;
        var ey = finish.y;
        var head = Math.min(1, prog * 1.5);
        var tail = Math.max(0, head - 0.35);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx + (ex - sx) * tail, sy + (ey - sy) * tail);
        ctx.lineTo(sx + (ex - sx) * head, sy + (ey - sy) * head);
        ctx.stroke();
        ctx.fillStyle = e.color;
        ctx.fillRect(sx + (ex - sx) * head - 2, sy + (ey - sy) * head - 2, 4, 4);
        ctx.globalAlpha = 1;
        continue;
      }

      if (e.kind === 'ring') {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(cx, cy, e.maxR * (0.35 + 0.65 * prog), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, e.maxR + 4, 0, Math.PI * 2);
        ctx.stroke();
        if (e.hit && quality() !== 'off') drawHit(ctx, e, cx, cy, prog, alpha, T);
        ctx.globalAlpha = 1;
        continue;
      }

      if (e.kind === 'fireball') {
        var fStart = at(e.x, e.y);
        var fFinish = at(e.x1, e.y1);
        var sx = fStart.x;
        var sy = fStart.y;
        var ex = fFinish.x;
        var ey = fFinish.y;
        var head = Math.min(1, prog * 1.4);
        var tail = Math.max(0, head - 0.5);
        ctx.globalAlpha = alpha;
        // Хвост — уменьшающиеся круги.
        for (var ti = 0; ti < 5; ti++) {
          var tt = tail + (head - tail) * (ti / 5);
          var tx = sx + (ex - sx) * tt;
          var ty = sy + (ey - sy) * tt;
          var tr = T * 0.18 * (1 - ti / 6);
          ctx.fillStyle = ti < 2 ? '#ff5a1f' : '#ff8a3d';
          ctx.beginPath();
          ctx.arc(tx, ty, Math.max(1, tr), 0, Math.PI * 2);
          ctx.fill();
        }
        // Голова шара.
        ctx.fillStyle = '#ffcc66';
        ctx.beginPath();
        ctx.arc(sx + (ex - sx) * head, sy + (ey - sy) * head, T * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff0a0';
        ctx.beginPath();
        ctx.arc(sx + (ex - sx) * head, sy + (ey - sy) * head, T * 0.14, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }

      if (e.kind === 'lightning') {
        var lStart = at(e.x, e.y);
        var lFinish = at(e.x1, e.y1);
        var lx0 = lStart.x;
        var ly0 = lStart.y;
        var lx1 = lFinish.x;
        var ly1 = lFinish.y;
        // Зигзаг из 5 сегментов.
        var segs = 5;
        var pts = [];
        for (var si = 0; si <= segs; si++) {
          var st = si / segs;
          var px = lx0 + (lx1 - lx0) * st;
          var py = ly0 + (ly1 - ly0) * st;
          if (si > 0 && si < segs) {
            px += (si % 2 === 0 ? -1 : 1) * T * 0.15;
            py += (si % 2 === 1 ? -1 : 1) * T * 0.1;
          }
          pts.push({ x: px, y: py });
        }
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var pi = 1; pi < pts.length; pi++) ctx.lineTo(pts[pi].x, pts[pi].y);
        ctx.stroke();
        // Искры в точке попадания.
        ctx.fillStyle = '#fff2a8';
        for (var spi = 0; spi < 4; spi++) {
          var ang = (spi / 4) * Math.PI * 2 + prog * 2;
          var sr = T * 0.35 * (1 - prog * 0.5);
          ctx.beginPath();
          ctx.arc(lx1 + Math.cos(ang) * sr, ly1 + Math.sin(ang) * sr, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        continue;
      }

      ctx.globalAlpha = 1;
    }

    var vp = (flashUntil - t) / C.EFFECT.LIFE;
    if (vp > 0) {
      var cw = ctx.canvas.width;
      var ch = ctx.canvas.height;
      var grd = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.4, cw / 2, ch / 2, Math.max(cw, ch) * 0.72);
      grd.addColorStop(0, 'rgba(255,40,40,0)');
      grd.addColorStop(1, 'rgba(255,40,40,' + (0.3 * vp).toFixed(3) + ')');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, cw, ch);
    }
  }

  RK.Effects = {
    add: add,
    addDamage: addDamage,
    addShot: addShot,
    addFireball: addFireball,
    addLightning: addLightning,
    notePlayerHit: notePlayerHit,
    tick: tick,
    active: active,
    draw: draw,
    quality: quality,
    shakeOffset: shakeOffset,
    ambientActive: function () { return quality() !== 'off'; },
  };
})();