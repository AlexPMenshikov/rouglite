(function () {
  // Кодек снимка карты живёт здесь: кодировать (createSnapshot) и
  // разворачивать (restoreMap) нужно рядом, иначе список полей разойдётся.
  // createSnapshot читает состояние забега через RK.GAME — локальной M у нас нет,
  // зато единый источник состояния есть у combat.

  function createSnapshot() {
    if (!RK.GAME || !RK.Map) return null;
    var M = RK.GAME;
    var map = JSON.parse(JSON.stringify(RK.Map));
    // Матрицы карты жмутся в map.matrices: в разы меньше символов, а снимок
    // уходит на каждый шаг. Разворачивает их restoreMap.
    var matrices = RK.MapGen.encodeMatrices(map);
    RK.MapGen.MATRIX_FIELDS.forEach(function (field) { delete map[field]; });
    // vis в снимок не едет: он посчитан для того, кто ходил, а каждый клиент
    // пересчитывает обзор от своего героя (js/render.js).
    delete map.vis;
    map.matrices = matrices;
    var game = JSON.parse(JSON.stringify({ game: M, map: map }));
    if (M.locationMode && RK.World) {
      RK.World.saveCurrentState();
      // Карта текущей локации едет полем map, матрицы сжаты в map.matrices,
      // а visited несёт только остальные локации: снимок уходит на каждый
      // шаг, поэтому повторы карты там стоили бы десятков килобайт.
      game.world = RK.World.getNetworkState();
    }
    return game;
  }

  function animateSnapshotSteps(previousPositions) {
    var partyFn = RK.Combat && RK.Combat.party;
    var startStepFn = RK.Combat && RK.Combat.startStep;
    var walkState = RK.Combat && RK.Combat.walk;
    if (!partyFn || !startStepFn || !walkState || !previousPositions) return false;
    walkState.steps = Object.create(null);
    walkState.auto = false;
    walkState.autoSeen = [];
    var members = partyFn();
    var animated = false;
    for (var i = 0; i < members.length; i++) {
      var member = members[i];
      var from = previousPositions[member.id];
      if (!from || member.hp <= 0) continue;
      var distance = Math.abs(member.x - from.x) + Math.abs(member.y - from.y);
      // Ровно одна клетка — шаг. Остальное (смена этажа, телепорт) показывается сразу.
      if (distance !== 1) continue;
      startStepFn(member, from.x, from.y, member.x, member.y, null);
      animated = true;
    }
    return animated;
  }

  function applySnapshot(snapshot, localPlayerId, ctx) {
    ctx = ctx || {};
    if (!snapshot || !snapshot.game || !snapshot.map) return false;
    // Прежние позиции партии: по ним запускается анимация шага — своего героя и
    // соседей, иначе они телепортировались бы между кадрами.
    var previousPositions = Object.create(null);
    var previousGame = typeof ctx.getGame === 'function' ? ctx.getGame() : RK.GAME;
    var previousParty = previousGame && previousGame.players ? previousGame.players : [];
    for (var pi = 0; pi < previousParty.length; pi++) {
      previousPositions[previousParty[pi].id] = { x: previousParty[pi].x, y: previousParty[pi].y };
    }
    var previousPlayer = previousParty.length
      ? previousParty.find(function (player) { return player.id === localPlayerId; })
      : null;
    var previousCooldown = previousPlayer ? previousPlayer.classSkillCooldown : null;
    if (ctx.walk) {
      ctx.walk.steps = Object.create(null);
      ctx.walk.auto = false;
      ctx.walk.autoSeen = [];
    }
    if (ctx.setGame) ctx.setGame(snapshot.game); else RK.GAME = snapshot.game;
    var M = RK.GAME;
    RK.Map = restoreMap(snapshot.map);
    if (!RK.Map) return false;
    if (snapshot.world && RK.World && !RK.World.setState(snapshot.world, RK.Map)) return false;
    M.locationMode = !!M.locationMode;
    M.players = M.players || [M.player];
    M.player = M.players.find(function (player) { return player.id === localPlayerId; }) || M.players[0];
    if (!M.player) return false;
    if (previousCooldown === 0 && M.player.classSkillCooldown > 0 && RK.Effects) {
      RK.Effects.add(M.player.x, M.player.y, RK.Classes.skillColor(M.player.classId), { maxR: 24, life: 480 });
    }
    M.mapWidth = RK.Map.w;
    M.mapHeight = RK.Map.h;
    // Забег, записанный до списка NPC (файл комнаты на диске): город населяется
    // заново — расстановка по зданиям детерминирована и даёт тот же результат.
    if (!Array.isArray(M.npcs)) {
      var currentLoc = M.locationMode && RK.World ? RK.World.current() : null;
      M.npcs = currentLoc && currentLoc.type === 'city'
        ? RK.Npc.placeCityNpcs(RK.Map, M.floor)
        : [];
    }
    if (M.locationMode && RK.World && RK.World.current()) M.locationId = RK.World.current().id;
    // Запись текущей локации не едет в снимке (её несёт map), поэтому
    // пересобирается из присланной карты и партии — иначе возврат сюда
    // восстановил бы пустую локацию.
    if (M.locationMode && RK.World) RK.World.saveCurrentState();
    if (typeof ctx.resizeCanvas === 'function') ctx.resizeCanvas();
    animateSnapshotSteps(previousPositions);
    if (RK.UI && typeof RK.UI.syncNetworkState === 'function') RK.UI.syncNetworkState();
    else if (RK.UI && typeof RK.UI.refresh === 'function') RK.UI.refresh();
    return true;
  }

  function restoreMap(snapshotMap) {
    var map = snapshotMap;
    var matrices = map.matrices;
    if (!matrices) return map;
    var width = Number.isInteger(map.w) ? map.w : 0;
    var height = Number.isInteger(map.h) ? map.h : 0;
    if (!width || !height) return null;
    var decoded = RK.MapGen.decodeMatrices(matrices, width, height);
    if (!decoded) return null;
    map = Object.assign({}, map, decoded);
    delete map.matrices;
    if (!Array.isArray(map.vis)) {
      var vis = [];
      for (var y = 0; y < height; y++) vis.push(new Array(width).fill(false));
      map.vis = vis;
    }
    return map;
  }

  // Отдельный модуль + патч RK.Combat: combat держит старый API, внешние
  // вызовы получают перенесённую реализацию без дубликата.
  var api = {
    createSnapshot: createSnapshot,
    applySnapshot: applySnapshot,
    animateSnapshotSteps: animateSnapshotSteps,
    restoreMap: restoreMap,
  };
  RK.CombatSnapshot = api;
  RK.Combat = RK.Combat || {};
  RK.Combat.createSnapshot = createSnapshot;
  RK.Combat.animateSnapshotSteps = animateSnapshotSteps;
  RK.Combat.restoreMap = restoreMap;
  // applySnapshot остаётся во wrapper в combat.js (он знает локальный M).
  RK.CombatSnapshot = RK.CombatSnapshot || api;
})();