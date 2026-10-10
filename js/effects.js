(function () {
  var C = RK.CONFIG;
  var list = [];
  var flashUntil = 0;

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function add(x, y, color, opts) {
    list.push({
      kind: 'ring',
      x: x,
      y: y,
      color: color,
      born: now(),
      life: (opts && opts.life) || C.EFFECT.LIFE,
      maxR: (opts && opts.maxR) || C.EFFECT.MAX_R,
    });
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
    return list.length > 0 || now() < flashUntil;
  }

  function draw(ctx, T, cameraX, cameraY) {
    var t = now();
    cameraX = cameraX || 0;
    cameraY = cameraY || 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var prog = (t - e.born) / e.life;
      if (prog < 0 || prog > 1) continue;
      var alpha = 1 - prog;
      var cx = (e.x - cameraX) * T + T / 2;
      var cy = (e.y - cameraY) * T + T / 2;

      if (e.kind === 'damage') {
        var ty = cy - prog * T * 0.75;
        ctx.globalAlpha = alpha;
        ctx.font = Math.max(6, Math.round(T * (typeof e.text === 'string' && e.text.length > 3 ? 0.22 : 0.28))) + 'px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,' + (0.55 * alpha).toFixed(3) + ')';
        ctx.fillText(e.text, cx + 1, ty + 1);
        ctx.fillStyle = e.color;
        ctx.fillText(e.text, cx, ty);
        ctx.globalAlpha = 1;
        continue;
      }

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
    notePlayerHit: notePlayerHit,
    tick: tick,
    active: active,
    draw: draw,
  };
})();