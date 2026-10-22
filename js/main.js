(function () {
  var C = RK.CONFIG;

  // Сцена меняется сама (анимация шага, эффекты, мерцание факелов и босса, движение
// воды и горящих ловушек) — нужен кадр. Остальное перерисовывается по событиям combat.js.
  function needsAnimationFrame() {
    var map = RK.Map;
    var game = RK.GAME;
    if (!map || !game) return false;
    if (map.torches && map.torches.length) return true;
    if (map.traps && map.traps.some(function (trap) { return trap.state === 'armed'; })) return true;
    if (map.decorations && map.decorations.some(function (decoration) {
      return decoration.asset === 'decorLake' || decoration.asset === 'decorStream';
    })) return true;
    if (RK.Render.isAnimating && RK.Render.isAnimating()) return true;
    return !!RK.Render.hasVisibleBoss();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var canvas = document.getElementById('game');
    RK.Meta.load();
    // Размер канваса знает только рендер: он же учитывает выбранную чёткость.
    RK.Render.resizeCanvas();
    RK.UI.init();
    RK.Input.attach(canvas);

    RK.Assets.init(function () {
      var source = RK.Assets.source();
      RK.UI.refreshTilesetControl(RK.Assets.enabled()
        ? (source === 'builtin' ? 'Тайлсет не найден — используются встроенные тайлы.' : 'Внешний тайлсет включён.')
        : 'Встроенные тайлы включены.', true);
      // Спрайты появились только сейчас — иконки кнопок до этого были пустыми.
      RK.UI.refreshIcons();
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