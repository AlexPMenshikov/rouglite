(function () {
  var C = RK.CONFIG;

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
      var needDraw = walking ||
        (RK.Effects.active && RK.Effects.active()) ||
        (RK.Render && RK.Render.hasVisibleBoss && RK.Render.hasVisibleBoss()) ||
        (RK.GAME && RK.Map && RK.Map.torches && RK.Map.torches.length);
      if (needDraw) RK.Render.draw();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  });
})();