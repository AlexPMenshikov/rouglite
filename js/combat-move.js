// Движение: шаг, анимация перехода и автопроход.
(function () {
  var C = RK.CONFIG;

  // Анимация шага хранится на каждого участника партии: соседи по кооперативу
  // переезжают плавно, а не скачком. onDone есть только у шага своего героя;
  // шаги остальных приходят снимком — их двигает отрисовка.
  var walk = {
    steps: Object.create(null),
    auto: false,
    autoTx: 0,
    autoTy: 0,
    autoSeen: [],
    // Действие после автопрохода: клик по двери или сундуку сначала ведёт к ним.
    autoDone: null,
    done: 0,
  };

  // Свободная клетка рядом с партией: ею бой расставляет соседей при переходе
  // между локациями, чтобы никто не вставал на клетку выхода. Ищет ближе,
  // чем findFreeSpawnTile, но с меньшим числом проверок.
  function findFreeTileNear(x, y, exceptId) {
    var tile = RK.Spawn.findFreeSpawnTile(x, y, exceptId);
    if (tile) return tile;
    return RK.Spawn.spiralSearch(x, y, 2, function (cx, cy) {
      return RK.MapGen.isWalkable(cx, cy);
    });
  }

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function stepOf(player) {
    return player ? walk.steps[player.id] || null : null;
  }

  function stepsActive() {
    for (var id in walk.steps) {
      if (walk.steps[id]) return true;
    }
    return false;
  }

  // Ход занят во время анимации своего героя: за ход забег пересчитывается один раз.
  function busy() {
    return !!stepOf(RK.GAME && RK.GAME.player);
  }

  function getDrawPos(player) {
    player = player || (RK.GAME && RK.GAME.player);
    if (!player) return { x: 0, y: 0 };
    var step = stepOf(player);
    if (!step) return { x: player.x, y: player.y };
    var t = (now() - step.t0) / step.duration;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    t = t * t * (3 - 2 * t);
    return {
      x: step.sx + (step.ex - step.sx) * t,
      y: step.sy + (step.ey - step.sy) * t,
    };
  }

  function startStep(player, sx, sy, ex, ey, done) {
    walk.steps[player.id] = {
      sx: sx,
      sy: sy,
      ex: ex,
      ey: ey,
      t0: now(),
      duration: C.WALK_MS || 95,
      onDone: done || null,
    };
  }

  function startStepAnim(nx, ny, done) {
    var p = RK.GAME.player;
    startStep(p, p.x, p.y, nx, ny, done);
  }

  // Счётчик завершённых шагов: сетевой забег публикует снимок после каждого шага,
  // иначе автопроход пришёл бы на клиент одним прыжком.
  function stepsDone() {
    return walk.done;
  }

  function tickWalk(ts) {
    var at = ts || now();
    var finished = null;
    for (var id in walk.steps) {
      var step = walk.steps[id];
      if ((at - step.t0) / step.duration < 1) continue;
      if (!finished) finished = [];
      finished.push(id);
    }
    if (finished) {
      for (var i = 0; i < finished.length; i++) {
        var done = walk.steps[finished[i]];
        delete walk.steps[finished[i]];
        walk.done++;
        if (done.onDone) done.onDone();
      }
    }
    return stepsActive();
  }

  // Клик по полу — команда идти: автопроход идёт весь путь и останавливается только
  // при новом враге в поле зрения, достижении цели или перекрытии пути.
  function beginAutoWalk(tx, ty, onArrive) {
    walk.auto = true;
    walk.autoTx = tx;
    walk.autoTy = ty;
    walk.autoSeen = RK.CombatRun.visibleEnemies();
    walk.autoDone = onArrive || null;
    continueAutoWalk();
  }

  // Остановка без действия: прерывание врагом, смертью или перекрытым путём.
  function stopAutoWalk() {
    walk.auto = false;
    walk.autoDone = null;
  }

  // Цель достигнута: сначала снимаем автопроход, потом выполняем отложенное действие.
  function finishAutoWalk() {
    var done = walk.autoDone;
    stopAutoWalk();
    if (done) done();
  }

  // Клетка занята, если там враг, сам герой или другой участник партии.
  // Предикат общий для автопрохода и движения к цели.
  function makeOccupancy(player) {
    return function (x, y) {
      return RK.CombatRun.getEnemyAt(x, y) != null ||
        (x === player.x && y === player.y);
    };
  }

  function continueAutoWalk() {
    if (!RK.GAME || RK.GAME.over || !walk.auto) {
      stopAutoWalk();
      return;
    }
    var p = RK.GAME.player;
    if (p.x === walk.autoTx && p.y === walk.autoTy) {
      finishAutoWalk();
      return;
    }
    if (RK.CombatRun.hasNewVisibleEnemy()) {
      stopAutoWalk();
      return;
    }
    var path = RK.MapGen.findPathNear(p.x, p.y, walk.autoTx, walk.autoTy, makeOccupancy(p));
    if (!path || !path.length) {
      stopAutoWalk();
      return;
    }
    var s = path[0];
    if (RK.CombatRun.getEnemyAt(s.x, s.y)) {
      stopAutoWalk();
      return;
    }
    var floorBefore = RK.GAME.floor;
    // Взгляд обновляем на каждый шаг автопрохода: иначе герой смотрит туда,
    // куда повернулся последним ручным шагом.
    setFacing(s.x - p.x, s.y - p.y);
    startStepAnim(s.x, s.y, function () {
      movePlayer(s.x, s.y);
      if (RK.GAME.over || RK.GAME.floor !== floorBefore) {
        stopAutoWalk();
        return;
      }
      if (p.x === walk.autoTx && p.y === walk.autoTy) {
        finishAutoWalk();
        return;
      }
      if (RK.CombatRun.hasNewVisibleEnemy()) {
        stopAutoWalk();
        return;
      }
      continueAutoWalk();
    });
  }

  function adjacent(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;
  }

  function tryStep(dx, dy) {
    if (!RK.GAME || RK.GAME.over || busy()) return false;
    if (!dx && !dy) {
      RK.Combat.skipTurn();
      return true;
    }
    interruptCampIfActive('Вы покидаете лагерь.');
    var p = RK.GAME.player;
    var nx = p.x + dx;
    var ny = p.y + dy;
    setFacing(dx, dy);
    if (!RK.MapGen.isWalkable(nx, ny)) return false;
    var e = RK.CombatRun.getEnemyAt(nx, ny);
    if (e) {
      if (adjacent(p, e)) {
        if (RK.Classes.canShoot(p)) RK.CombatHit.doRangedAttack(e);
        else RK.CombatHit.doAttack(p, e, true);
        RK.CombatRun.finishTurn();
        return true;
      }
      return false;
    }
    startStepAnim(nx, ny, function () {
      movePlayer(nx, ny);
    });
    return true;
  }

  function tryMoveToward(tx, ty) {
    if (busy()) return;
    interruptCampIfActive('Вы покидаете лагерь.');
    var p = RK.GAME.player;
    var path = RK.MapGen.findPathNear(p.x, p.y, tx, ty, makeOccupancy(p));
    if (path && path.length) {
      var s = path[0];
      setFacing(s.x - p.x, s.y - p.y);
      var e = RK.CombatRun.getEnemyAt(s.x, s.y);
      if (e) {
        if (adjacent(p, e)) {
          if (RK.Classes.canShoot(p)) RK.CombatHit.doRangedAttack(e);
          else RK.CombatHit.doAttack(p, e, true);
          RK.CombatRun.finishTurn();
        }
        return;
      }
      startStepAnim(s.x, s.y, function () {
        movePlayer(s.x, s.y);
      });
    }
  }

  function setFacing(dx, dy) {
    var p = RK.GAME && RK.GAME.player;
    if (!p || (!dx && !dy)) return;
    p.facingX = Math.max(-1, Math.min(1, dx));
    p.facingY = Math.max(-1, Math.min(1, dy));
  }

  function movePlayer(x, y) {
    var p = RK.GAME.player;
    interruptCampIfActive('Вы покидаете лагерь.');
    p.x = x;
    p.y = y;
    if (RK.Audio) RK.Audio.playStep();
    RK.CombatRun.updatePlayerZone();
    RK.Inventory.handlePickup();
    if (!RK.GAME.over) RK.CombatHit.triggerTrapOnTile(p.x, p.y, p);
    if (!RK.GAME.over) RK.CombatRun.checkStairs();
    if (RK.GAME.over) return;
    RK.CombatRun.finishTurn();
  }

  // Любое перемещение или атака гасят лагерь: привал — это неподвижный отдых.
  function interruptCampIfActive(reason) {
    if (RK.Camp && RK.Camp.leave && RK.GAME && RK.GAME.camp && RK.GAME.camp.active) {
      RK.Camp.leave(reason);
    }
  }

  RK.CombatMove = {
    busy: busy,
    tickWalk: tickWalk,
    getDrawPos: getDrawPos,
    stepsDone: stepsDone,
    walk: walk,
    startStep: startStep,
    startStepAnim: startStepAnim,
    tryStep: tryStep,
    movePlayer: movePlayer,
    adjacent: adjacent,
    interruptCampIfActive: interruptCampIfActive,
    beginAutoWalk: beginAutoWalk,
    stopAutoWalk: stopAutoWalk,
    continueAutoWalk: continueAutoWalk,
    setFacing: setFacing,
    makeOccupancy: makeOccupancy,
    findFreeTileNear: findFreeTileNear,
    now: now,
    stepOf: stepOf,
    stepsActive: stepsActive,
  };
})();
