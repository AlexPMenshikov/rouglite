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
      RK.hoverPointer = null;
      RK.Render.draw();
    });
    window.addEventListener('keydown', onKey);
  }

  function evtToTile(ev) {
    var rect = canvas.getBoundingClientRect();
    var cx = (ev.clientX - rect.left) * (canvas.width / rect.width);
    var cy = (ev.clientY - rect.top) * (canvas.height / rect.height);
    var offset = RK.Render.getCameraOffset();
    var x = Math.floor(cx / C.TILE + offset.x);
    var y = Math.floor(cy / C.TILE + offset.y);
    var map = RK.Map;
    if (x < 0 || y < 0 || !map || x >= map.w || y >= map.h) return null;
    return { x: x, y: y };
  }

  function onMove(ev) {
    var t = evtToTile(ev);
    RK.hoverPointer = { x: ev.clientX, y: ev.clientY };
    if (!t) {
      RK.hover = null;
      RK.hoverPath = null;
      RK.Render.draw();
      return;
    }
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
    if (!ready()) return;
    var t = evtToTile(ev);
    if (!t) return;
    if (!RK.MapGen.isWalkable(t.x, t.y)) return;
    RK.UI.perform('playerAction', [t.x, t.y]);
  }

  // Режимы взаимодействия совпадают с константами из combat.js.
  var INTERACT = { USE: 'use', PICK: 'pick', FORCE: 'force' };

  // Ход разрешён, когда игра идёт и сокет не ждёт ответа сервера: за ход забег
// пересчитывается один раз, поэтому два запроса подряд нельзя. Во время
// автопрохода ввод закрыт (маршрут прерывается врагом, недостижимостью или
// смертью), и перехватывать его нельзя: в сетевой комнате шаг уже применён
// сервером, отмена на клиенте разошла бы партию.
  function ready() {
    if (!RK.GAME || RK.GAME.over) return false;
    if (RK.Network && RK.Network.isWaitingForServer()) return false;
    if (RK.Network && RK.Network.inRoom() && !RK.Network.connected()) return false;
    return !(RK.Combat.busy && RK.Combat.busy());
  }

  function onKey(ev) {
    if (!ready()) return;
    var tag = (ev.target && ev.target.tagName) ? ev.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return;
    if (!document.getElementById('screen-game') ||
        document.getElementById('screen-game').classList.contains('hidden')) {
      return;
    }

    if (ev.code === 'Numpad5' || ev.key === '.' || ev.code === 'Period') {
      ev.preventDefault();
      RK.UI.perform('skipTurn', []);
      return;
    }

    if (ev.code === 'Escape') {
      ev.preventDefault();
      if (RK.GAME && RK.GAME.debugRoom) {
        RK.UI.show('menu');
        return;
      }
    }

    if (ev.code === 'KeyR') {
      ev.preventDefault();
      RK.UI.perform('usePotion', []);
      return;
    }

    if (ev.code === 'KeyJ') {
      ev.preventDefault();
      RK.UI.showQuestLog();
      return;
    }

    if (ev.code === 'KeyQ' || ev.code === 'KeyE') {
      ev.preventDefault();
      if (ev.code === 'KeyE') RK.UI.perform('interact', [INTERACT.USE]);
      else RK.UI.perform('activateClassSkill', []);
      return;
    }

    if (ev.code === 'KeyL') {
      ev.preventDefault();
      RK.UI.perform('interact', [INTERACT.PICK]);
      return;
    }

    if (ev.code === 'KeyF') {
      ev.preventDefault();
      RK.UI.perform('interact', [INTERACT.FORCE]);
      return;
    }

    var dir = KEY_DIRS[ev.code];
    if (!dir) return;
    ev.preventDefault();
    RK.UI.perform('tryStep', dir);
  }

  RK.Input = { attach: attach };
})();
