(function () {
  var C = RK.CONFIG;
  var canvas = null;

  var KEY_DIRS = {
    KeyW: [0, -1],
    ArrowUp: [0, -1],
    Numpad8: [0, -1],
    KeyS: [0, 1],
    ArrowDown: [0, 1],
    Numpad2: [0, 1],
    KeyA: [-1, 0],
    ArrowLeft: [-1, 0],
    Numpad4: [-1, 0],
    KeyD: [1, 0],
    ArrowRight: [1, 0],
    Numpad6: [1, 0],
    Numpad7: [-1, -1],
    Numpad9: [1, -1],
    Numpad1: [-1, 1],
    Numpad3: [1, 1],
  };

  function attach(cv) {
    canvas = cv;
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mouseleave', function () {
      RK.hover = null;
      RK.hoverPath = null;
      RK.Render.draw();
    });
    window.addEventListener('keydown', onKey);
  }

  function evtToTile(ev) {
    var rect = canvas.getBoundingClientRect();
    var cx = (ev.clientX - rect.left) * (canvas.width / rect.width);
    var cy = (ev.clientY - rect.top) * (canvas.height / rect.height);
    var x = Math.floor(cx / C.TILE);
    var y = Math.floor(cy / C.TILE);
    if (x < 0 || y < 0 || x >= C.COLS || y >= C.ROWS) return null;
    return { x: x, y: y };
  }

  function onMove(ev) {
    var t = evtToTile(ev);
    if (!t) return;
    RK.hover = t;
    if (RK.GAME && RK.GAME.player) {
      var p = RK.GAME.player;
      if (!RK.MapGen.isWalkable(t.x, t.y)) {
        RK.hoverPath = null;
        RK.Render.draw();
        return;
      }
      var occ = function (x, y) {
        return RK.Combat.getEnemyAt(x, y) != null || (x === p.x && y === p.y);
      };
      RK.hoverPath = RK.MapGen.findPathNear(p.x, p.y, t.x, t.y, occ);
    }
    RK.Render.draw();
  }

  function onClick(ev) {
    if (RK.Combat.busy && RK.Combat.busy()) return;
    var t = evtToTile(ev);
    if (!t) return;
    if (!RK.MapGen.isWalkable(t.x, t.y)) return;
    RK.Combat.playerAction(t.x, t.y);
  }

  function onKey(ev) {
    if (!RK.GAME || RK.GAME.over) return;
    if (RK.Combat.busy && RK.Combat.busy()) return;
    var tag = (ev.target && ev.target.tagName) ? ev.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return;
    if (!document.getElementById('screen-game') ||
        document.getElementById('screen-game').classList.contains('hidden')) {
      return;
    }

    if (ev.code === 'Numpad5' || ev.key === '.' || ev.code === 'Period') {
      ev.preventDefault();
      RK.Combat.skipTurn();
      return;
    }

    var dir = KEY_DIRS[ev.code];
    if (!dir) return;
    ev.preventDefault();
    RK.Combat.tryStep(dir[0], dir[1]);
  }

  RK.Input = { attach: attach };
})();
