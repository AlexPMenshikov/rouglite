// Прицел дистанционных атак: линия от героя до цели и подсветка врага.
// Состояние считает игра, а рисует вид через переданный ему перевод клетки в экран.
(function () {
  function enemyAt(x, y) {
    return RK.Combat && RK.Combat.getEnemyAt ? RK.Combat.getEnemyAt(x, y) : null;
  }

  function inSight(x, y) {
    return !RK.Scene || !RK.Map || RK.Scene.seen(RK.Map, x, y);
  }

  // Что показать под курсором: активное заклинание важнее обычного выстрела.
  function aim() {
    var p = RK.GAME && RK.GAME.player;
    if (!p || RK.GAME.over || !RK.hover) return null;
    var hx = RK.hover.x;
    var hy = RK.hover.y;
    if (!inSight(hx, hy)) return null;
    var enemy = enemyAt(hx, hy);
    var canReach = RK.Classes && RK.Classes.canReachTarget
      ? RK.Classes.canReachTarget(p, hx, hy)
      : false;
    if (p.pendingSpell === 'fireball' || p.pendingSpell === 'mass_fireball') {
      return {
        from: { x: p.x, y: p.y },
        to: { x: hx, y: hy },
        enemy: enemy,
        color: canReach ? '#ffb347' : '#8a8a8a',
      };
    }
    if (enemy && RK.Classes && RK.Classes.canShoot && RK.Classes.canShoot(p) && canReach) {
      return {
        from: { x: p.x, y: p.y },
        to: { x: hx, y: hy },
        enemy: enemy,
        color: '#c8f0a0',
      };
    }
    return null;
  }

  // Линия с наконечником и кольцо вокруг врага. point(x, y) — центр клетки.
  function draw(ctx, T, point) {
    var state = aim();
    if (!state) return;
    var from = point(state.from.x, state.from.y);
    var to = point(state.to.x, state.to.y);
    var width = Math.max(1, T * 0.045);
    var head = Math.min(T * 0.24, Math.max(5, T * 0.2));
    var angle = Math.atan2(to.y - from.y, to.x - from.x);
    var pulse = 0.65 + 0.35 * Math.sin(Date.now() * 0.006);

    ctx.save();
    ctx.strokeStyle = state.color;
    ctx.fillStyle = state.color;
    ctx.lineWidth = width;
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([T * 0.14, T * 0.1]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    // Наконечник стрелки показывает, куда уйдёт выстрел.
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - Math.cos(angle - 0.5) * head, to.y - Math.sin(angle - 0.5) * head);
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - Math.cos(angle + 0.5) * head, to.y - Math.sin(angle + 0.5) * head);
    ctx.stroke();

    if (state.enemy) {
      ctx.globalAlpha = pulse;
      ctx.lineWidth = Math.max(1.5, T * 0.06);
      ctx.beginPath();
      ctx.arc(to.x, to.y, T * 0.44, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  RK.ViewTarget = {
    aim: aim,
    draw: draw,
  };
})();
