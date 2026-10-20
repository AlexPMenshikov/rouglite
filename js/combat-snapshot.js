(function () {
  // Кодек снимка живёт здесь: кодировать (createSnapshot) и
  // разворачивать (restoreMap) нужно рядом, иначе список полей разойдётся.
  // createSnapshot читает состояние забега через RK.GAME — локальной M у нас нет,
  // зато единый источник состояния есть у combat.

  // Поля карты, которые меняет игра: исследованное, открытые двери и сундуки,
  // разлитая кровь, положенные ловушки и зоны событий. Остальное принадлежит
  // генератору и не меняется, пока карта та же самая, поэтому снимок делится
  // надвое: неизменная часть едет один раз на локацию, а эта — на каждый шаг.
  // Список живёт в map.js рядом с MATRIX_FIELDS: карта и её снимок описаны
  // в одном месте, и новое поле нельзя забыть внести.
  var MAP_STATE_FIELDS = RK.MapGen.MAP_STATE_FIELDS;

  // Отрезает от карты то, что меняет игра, и возвращает отдельной частью.
  // explored тоже уходит сюда: он растёт с каждым шагом и один только делал бы
  // карту «изменившейся». Отрезание и сборка живут здесь, поэтому половины не
  // разойдутся: новое поле добавляется в MAP_STATE_FIELDS один раз.
  function splitMapState(map) {
    var state = Object.create(null);
    if (Array.isArray(map.explored)) state.explored = RK.MapGen.encodeMatrix(map.explored);
    for (var i = 0; i < MAP_STATE_FIELDS.length; i++) {
      var field = MAP_STATE_FIELDS[i];
      if (map[field] !== undefined) state[field] = map[field];
    }
    delete map.explored;
    for (var j = 0; j < MAP_STATE_FIELDS.length; j++) delete map[MAP_STATE_FIELDS[j]];
    return state;
  }

  function createSnapshot() {
    if (!RK.GAME || !RK.Map) return null;
    var M = RK.GAME;
    var map = JSON.parse(JSON.stringify(RK.Map));
    var mapState = splitMapState(map);
    // Матрицы карты жмутся в map.matrices: в разы меньше символов, а снимок
    // уходит на каждый шаг. Разворачивает их restoreMap.
    var matrices = RK.MapGen.encodeMatrices(map);
    RK.MapGen.MATRIX_FIELDS.forEach(function (field) { delete map[field]; });
    // vis в снимок не едет: он посчитан для того, кто ходил, а каждый клиент
    // пересчитывает обзор от своего героя (js/render.js).
    delete map.vis;
    map.matrices = matrices;
    var game = JSON.parse(JSON.stringify({ game: M, map: map, mapState: mapState }));
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
    if (ctx.walk) {
      ctx.walk.steps = Object.create(null);
      ctx.walk.auto = false;
      ctx.walk.autoSeen = [];
    }
    if (ctx.setGame) ctx.setGame(snapshot.game); else RK.GAME = snapshot.game;
    var M = RK.GAME;
    RK.Map = restoreMap(snapshot.map, snapshot.mapState);
    if (!RK.Map) return false;
    if (snapshot.world && RK.World && !RK.World.setState(snapshot.world, RK.Map)) return false;
    M.locationMode = !!M.locationMode;
    M.players = M.players || [M.player];
    M.player = M.players.find(function (player) { return player.id === localPlayerId; }) || M.players[0];
    if (!M.player) return false;
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

  // Собирает карту из двух частей снимка: неизменимой геометрии (map) и того,
  // что наделала игра (mapState). Обе обязаны развернуться ровно в w × h,
  // иначе снимок считается битым.
  //
  // Формат принимает оба вида:
  //   * новый — map без explored, а mapState с explored сжатой и полями игры;
  //   * старый (localStorage, файлы комнат до релиза) — map с explored внутри
  //     matrices, без mapState. Отсутствие mapState — не ошибка: explored возьмётся
  //     из matrices.
  //   * явно переданный, но не объект mapState (подделка из сокета) — отвергается.
  function restoreMap(snapshotMap, snapshotMapState) {
    var map = decodeMatrices(snapshotMap);
    if (!map) return null;
    if (snapshotMapState !== undefined &&
        (snapshotMapState === null || typeof snapshotMapState !== "object" || Array.isArray(snapshotMapState))) {
      return null;
    }
    var mapState = restoreMapState(snapshotMapState, map.w, map.h);
    if (!mapState) return null;
    Object.assign(map, mapState);
    delete map.matrices;
    if (!Array.isArray(map.vis)) map.vis = emptyGrid(map.w, map.h);
    if (!Array.isArray(map.explored)) map.explored = emptyGrid(map.w, map.h);
    return map;
  }

  function restoreMapState(mapState, width, height) {
    var out = Object.create(null);
    if (!mapState) return out;
    for (var i = 0; i < MAP_STATE_FIELDS.length; i++) {
      var field = MAP_STATE_FIELDS[i];
      if (mapState[field] !== undefined) out[field] = mapState[field];
    }
    // explored в снимке сжат тем же кодеком, что и остальные матрицы.
    if (mapState.explored !== undefined) {
      var explored = RK.MapGen.decodeMatrix(mapState.explored, width, height);
      if (!explored) return null;
      out.explored = explored;
    }
    return out;
  }

  function decodeMatrices(snapshotMap) {
    var map = snapshotMap;
    var matrices = map.matrices;
    if (!matrices) return map;
    var width = Number.isInteger(map.w) ? map.w : 0;
    var height = Number.isInteger(map.h) ? map.h : 0;
    if (!width || !height) return null;
    var decoded = RK.MapGen.decodeMatrices(matrices, width, height);
    if (!decoded) return null;
    return Object.assign({}, map, decoded);
  }

  function emptyGrid(width, height) {
    var grid = [];
    for (var y = 0; y < height; y++) grid.push(new Array(width).fill(false));
    return grid;
  }

  // Отдельный модуль + патч RK.Combat: combat держит старый API, внешние
  // вызовы получают перенесённую реализацию без дубликата.
  var api = {
    createSnapshot: createSnapshot,
    applySnapshot: applySnapshot,
    animateSnapshotSteps: animateSnapshotSteps,
    restoreMap: restoreMap,
    MAP_STATE_FIELDS: MAP_STATE_FIELDS,
  };
  RK.CombatSnapshot = api;
  RK.Combat = RK.Combat || {};
  RK.Combat.createSnapshot = createSnapshot;
  RK.Combat.animateSnapshotSteps = animateSnapshotSteps;
  RK.Combat.restoreMap = restoreMap;
  // applySnapshot остаётся во wrapper в combat.js (он знает локальный M).
})();