(function () {
  var C = RK.CONFIG;

  // Признаки того, что сцена сама меняется и нужен перерисованный кадр:
  // анимация шага, эффекты, мерцание факелов и босса, движение воды и горящих
  // ловушек. Всё остальное перерисовывается по событиям из combat.js.
  function needsAnimationFrame() {
    var map = RK.Map;
    var game = RK.GAME;
    if (!map || !game) return false;
    if (map.torches && map.torches.length) return true;
    if (map.traps && map.traps.some(function (trap) { return trap.state === 'armed'; })) return true;
    if (map.decorations && map.decorations.some(function (decoration) {
      return decoration.asset === 'decorLake' || decoration.asset === 'decorStream';
    })) return true;
    return !!RK.Render.hasVisibleBoss();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var canvas = document.getElementById('game');
    canvas.width = C.TILE * C.COLS;
    canvas.height = C.TILE * C.ROWS;

    RK.Meta.load();
    RK.UI.init();
    RK.Input.attach(canvas);

    RK.Assets.init(function () {
      var source = RK.Assets.source();
      RK.UI.refreshTilesetControl(RK.Assets.enabled()
        ? (source === 'builtin' ? 'Тайлсет не найден — используются встроенные тайлы.' : 'Внешний тайлсет включён.')
        : 'Встроенные тайлы включены.', true);
      RK.UI.show('menu');
      RK.Render.draw();
      RK.Network.reconnect();
    });

    function loop(ts) {
      RK.Effects.tick(ts);
      var walking = RK.Combat && RK.Combat.tickWalk && RK.Combat.tickWalk(ts);
      if (walking || (RK.Effects.active && RK.Effects.active()) || needsAnimationFrame()) {
        RK.Render.draw();
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  });
})();