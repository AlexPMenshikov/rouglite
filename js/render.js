// Рендер: канвас, режимы и кадр.
//
// Раньше здесь жила вся отрисовка мира. Теперь за вид отвечают модули видов
// (view-topdown, view-ascii, view-iso), а этот файл держит канвас, камеру,
// переключение режима и подсказки под курсором.

(function () {
  var C = RK.CONFIG;
  var canvas = null;
  var ctx = null;
  var lightCanvas = null;
  var lightCtx = null;
  // Динамическое приближение: 1 = обычный масштаб (48 px/тайл), до 4 = крупно.
  var zoom = 1;
  // Угол поворота камеры: восемь положений по 45°. Значит, на сколько
  // градусов карта провернулась на экране: по часовой стрелке — положительные.
  // Между положениями камера доворачивается плавно.
  var cameraAngle = 0;
  var CAMERA_STEPS = 45;
  var CAMERA_TURN_MS = 320;
  // Текущий переход: от угла from на delta градусов, начатый в started.
  var cameraAnim = null;

  var STAT_NAMES = { atk: 'Урон', def: 'Защита', hp: 'Здоровье', heal: 'Лечение', luck: 'Удача', spellPower: 'к способностям' };

  function ensure() {
    if (!canvas) {
      canvas = document.getElementById('game');
      ctx = canvas ? canvas.getContext('2d') : null;
      if (ctx) ctx.imageSmoothingEnabled = false;
    }
    if (canvas && (!lightCanvas || lightCanvas.width !== canvas.width)) {
      lightCanvas = document.createElement('canvas');
      lightCanvas.width = canvas.width;
      lightCanvas.height = canvas.height;
      lightCtx = lightCanvas.getContext('2d');
    }
  }

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function syncZoomFromMeta() {
    try {
      if (RK.Meta && RK.Meta.data && Number.isFinite(RK.Meta.data.zoom)) {
        zoom = clampZoom(RK.Meta.data.zoom);
      }
    } catch (e) {}
  }
  function syncCameraAngleFromMeta() {
    try {
      if (RK.Meta && RK.Meta.data && Number.isFinite(RK.Meta.data.cameraAngle)) {
        cameraAngle = clampAngle(RK.Meta.data.cameraAngle);
      }
    } catch (e) {}
  }
  try {
    if (RK.Meta && RK.Meta.data && Number.isFinite(RK.Meta.data.zoom)) zoom = RK.Meta.data.zoom;
    if (RK.Meta && RK.Meta.data && Number.isFinite(RK.Meta.data.cameraAngle)) {
      cameraAngle = clampAngle(RK.Meta.data.cameraAngle);
    }
  } catch (e) {}

  // Режимы показа: графика сверху, текст и изометрия.
  var MODES = C.RENDER_MODES;

  function getMode() {
    var saved = RK.Meta && RK.Meta.data ? RK.Meta.data.renderMode : null;
    return MODES.indexOf(saved) >= 0 ? saved : 'graphics';
  }

  function setMode(mode) {
    if (MODES.indexOf(mode) < 0) return false;
    if (!RK.Meta || !RK.Meta.data) return false;
    RK.Meta.data.renderMode = mode;
    var saved = RK.Meta.save ? RK.Meta.save() : false;
    draw();
    return saved;
  }

  // Вид по режиму: у каждого режима свой вид, запасной — графика сверху.
  function activeView() {
    var mode = getMode();
    var view = mode === 'ascii' ? RK.Views.ascii : (mode === 'iso' ? RK.Views.iso : RK.Views.topdown);
    return view || RK.Views.topdown;
  }

  function clampZoom(value) {
    if (!Number.isFinite(value)) return zoom;
    if (value < 1) return 1;
    if (value > 4) return 4;
    return value;
  }

  function getZoom() {
    return zoom;
  }

  function setZoom(value) {
    zoom = clampZoom(value);
    try {
      if (RK.Meta && RK.Meta.data) {
        RK.Meta.data.zoom = zoom;
        if (typeof RK.Meta.save === 'function') RK.Meta.save();
      }
    } catch (e) {}
    draw();
    return zoom;
  }

  function zoomIn() {
    setZoom(zoom + 0.25);
  }

  function zoomOut() {
    setZoom(zoom - 0.25);
  }

  // Поворот камеры живёт рядом с зумом: оба значения сохраняются в Meta.
  // Целевой угол кратен 45°, между положениями камера проходит промежуточные.
  function clampAngle(value) {
    if (!Number.isFinite(value)) return cameraAngle;
    var angle = Math.round(value / CAMERA_STEPS) * CAMERA_STEPS;
    return ((angle % 360) + 360) % 360;
  }

  // Ближайший поворот: +90 вместо -270, чтобы камера не крутилась вокруг.
  function shortestDelta(from, to) {
    var delta = ((to - from) % 360 + 360) % 360;
    if (delta > 180) delta -= 360;
    return delta;
  }

  // Угол на экране: во время перехода он между старым и новым положением.
  function cameraViewAngle(ts) {
    if (!cameraAnim) return cameraAngle;
    var t = (ts - cameraAnim.started) / CAMERA_TURN_MS;
    if (t >= 1) {
      cameraAnim = null;
      return cameraAngle;
    }
    if (t < 0) t = 0;
    // Плавный старт и остановка: резкий поворот выглядит рывком.
    var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    return ((cameraAnim.from + cameraAnim.delta * eased) % 360 + 360) % 360;
  }

  // Идёт ли доворот: цикл кадров спрашивает это, чтобы не уснуть на середине.
  function cameraAnimating() {
    return !!cameraAnim;
  }

  function getCameraAngle() {
    syncCameraAngleFromMeta();
    return cameraAngle;
  }

  function setCameraAngle(value) {
    var next = clampAngle(value);
    var from = cameraViewAngle(now());
    cameraAngle = next;
    cameraAnim = { from: from, delta: shortestDelta(from, next), started: now() };
    try {
      if (RK.Meta && RK.Meta.data) {
        RK.Meta.data.cameraAngle = cameraAngle;
        if (typeof RK.Meta.save === 'function') RK.Meta.save();
      }
    } catch (e) {}
    draw();
    return cameraAngle;
  }

  // Поворот на шаг: положительный — по часовой стрелке.
  function rotateCamera(delta) {
    var step = Number.isFinite(delta) ? delta : 0;
    return setCameraAngle(getCameraAngle() + step);
  }

  // Поворачивает вид только изометрия: в сеточных видах окно обзора не квадратное.
  function supportsRotation() {
    var view = activeView();
    return !!(view && view.rotatable);
  }

  // Чёткость отрисовки: пресеты живут здесь, кнопки в настройках строит ui.js.
  var RESOLUTION_SCALES = [1, 1.5, 2];

  function resolutionScales() {
    return RESOLUTION_SCALES.slice();
  }

  function resolutionScale() {
    try {
      var saved = RK.Meta && RK.Meta.data ? RK.Meta.data.resolutionScale : null;
      if (RESOLUTION_SCALES.indexOf(saved) >= 0) return saved;
    } catch (e) {}
    return 1;
  }

  // Единственное место, где canvas подстраивается под тайл и чёткость отрисовки.
  function resizeCanvas() {
    ensure();
    if (!canvas) return;
    var scale = resolutionScale();
    canvas.width = Math.round(C.TILE * C.COLS * scale);
    canvas.height = Math.round(C.TILE * C.ROWS * scale);
    // Смена размера сбрасывает настройки контекста, а запечённый пол — прежнего размера.
    ctx.imageSmoothingEnabled = false;
    invalidateFloorLayer();
  }

  function setResolutionScale(value) {
    if (RESOLUTION_SCALES.indexOf(value) < 0) return false;
    if (!RK.Meta || !RK.Meta.data) return false;
    // Обзор (C.COLS × C.ROWS в клетках) не меняется: растёт только разрешение канваса,
    // поэтому картинка чётче, а нагрузка на процессор выше.
    RK.Meta.data.resolutionScale = value;
    var saved = RK.Meta.save ? RK.Meta.save() : false;
    resizeCanvas();
    draw();
    return saved;
  }

  // Размер тайла на экране: у каждого вида своя геометрия.
  function getTileSize() {
    syncZoomFromMeta();
    var view = activeView();
    return view.tileSize(zoom, resolutionScale());
  }

  function heroPos() {
    var p = RK.GAME && RK.GAME.player;
    if (!p) return { x: 0, y: 0 };
    return (RK.Combat && RK.Combat.getDrawPos) ? RK.Combat.getDrawPos() : { x: p.x, y: p.y };
  }

  // Камера сетки: нужна подсказкам и старому контракту камеры.
  function getCameraOffset() {
    return RK.View.gridCamera(heroPos(), zoom);
  }

  // Пиксель обратно в клетку: вид сам знает свою геометрию.
  function pickTile(px, py) {
    var view = activeView();
    var tile = view.pick(px, py);
    var map = RK.Map;
    if (!tile || tile.x < 0 || tile.y < 0 || !map || tile.x >= map.w || tile.y >= map.h) return null;
    return tile;
  }

  // При смене тайлсета запечённый слой сбрасывается: он нарисован прежними текстурами.
  function invalidateFloorLayer() {
    if (RK.Views.topdown && RK.Views.topdown.invalidate) RK.Views.topdown.invalidate();
  }

  // Виньетка: края кадра мягко уходят в темноту, карта не обрывается в чёрное.
  function drawAtmosphere() {
    var view = activeView();
    if (!view || view.name === 'ascii') return;
    var w = canvas.width;
    var h = canvas.height;
    var inner = Math.min(w, h) * 0.34;
    var outer = Math.max(w, h) * 0.72;
    var vignette = ctx.createRadialGradient(w / 2, h / 2, inner, w / 2, h / 2, outer);
    vignette.addColorStop(0, 'rgba(5, 3, 10, 0)');
    vignette.addColorStop(0.65, 'rgba(5, 3, 10, 0.14)');
    vignette.addColorStop(1, 'rgba(3, 2, 7, 0.48)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  // Эффекты рисуются поверх сцены; тултип уходит в DOM через ui.refreshTooltip, поэтому canvas не трогает layout в каждом кадре.
  function drawSceneOverlays(scene, T) {
    var view = activeView();
    RK.Effects.draw(ctx, {
      point: function (x, y) { return view.point(x, y); },
      tile: T,
    });
    if (RK.UI && RK.UI.refreshTooltip) RK.UI.refreshTooltip(scene.map);
  }

  function draw() {
    ensure();
    if (!ctx) return;
    var T = getTileSize();
    var tNow = now();

    ctx.fillStyle = C.COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var mm = RK.Map;
    if (!mm || !RK.GAME) return;

    var p = RK.GAME.player;
    var drawPos = heroPos();
    if (RK.Fov && RK.Fov.computeVisibility) {
      // Снимок из сети несёт обзор, посчитанный на сервере для того, кто ходил. Каждый клиент смотрит из своего
      // героя, поэтому видимость пересчитывается локально; карта при этом остаётся общей.
      mm = Object.create(mm);
      mm.vis = RK.Fov.computeVisibility(p.x, p.y);
      // Обзор нужен и наведению: getHoverInfo читает его из RK.Map, а applySnapshot
      // оставляет vis пустым (обзор считает рендер). Снимок карты не портим — это один объект.
      RK.Map.vis = mm.vis;
      mm.explored = mm.explored.map(function (row, y) {
        return row.map(function (explored, x) {
          return explored || mm.vis[y][x];
        });
      });
    }

    var scene = RK.Scene.build(mm, RK.GAME);
    var view = activeView();
    syncCameraAngleFromMeta();
    view.setup({
      zoom: zoom,
      scale: resolutionScale(),
      width: canvas.width,
      height: canvas.height,
      angle: cameraViewAngle(tNow),
    });
    view.setCamera(drawPos);
    view.begin(ctx);
    view.drawScene(ctx, scene, T, tNow);
    view.end(ctx);
    view.drawLighting(ctx, { canvas: lightCanvas, ctx: lightCtx }, scene, T, tNow);
    drawAtmosphere();
    view.drawOverlays(ctx, scene, T);
    drawSceneOverlays(scene, T);
  }

  // Приоритет отображения при нескольких объектах в одной клетке.
  var HOVER_STATIC_TEXT = {
    door: 'Дверь — E: взаимодействовать',
    chest: 'Сундук — E: открыть',
    stair: 'Лестница вниз — ЛКМ: идти к переходу',
  };

  function tileKey(x, y) {
    return x + ',' + y;
  }

  function mapSignature(mm, game) {
    return [
      (mm.doors || []).length, (mm.chests || []).length, (mm.traps || []).length,
      (game.npcs || []).length,
    ].join('|');
  }

  function rebuildMapIndex(mm, game) {
    var index = new Map();
    var push = function (kind, object) {
      if (!object) return;
      var key = tileKey(object.x, object.y);
      var bucket = index.get(key);
      if (!bucket) index.set(key, bucket = []);
      bucket.push({ kind: kind, object: object });
    };
    var doors = mm.doors || [];
    for (var d = 0; d < doors.length; d++) push('door', doors[d]);
    var chests = mm.chests || [];
    for (var c = 0; c < chests.length; c++) push('chest', chests[c]);
    var traps = mm.traps || [];
    for (var t = 0; t < traps.length; t++) push('trap', traps[t]);
    var npcs = game.npcs || [];
    for (var n = 0; n < npcs.length; n++) push('npc', npcs[n]);
    // Лестница этажа — тоже переход, и по ней кликают так же, как по вратам.
    if (mm.stair) push('stair', mm.stair);
    return { signature: mapSignature(mm, game), entries: index };
  }

  // getHoverInfo вызывается на каждый mousemove, поэтому объекты карты (двери, сундуки, ловушки, NPC)
  // складываются в индекс. Ключ — RK.Map, внутри сверяются длины списков: снимок из сети подменяет
  // карту целиком, но списки могут пересоздаваться на месте.
  var mapObjectIndex = new WeakMap();

  function mapEntriesAt(mm, game, x, y) {
    var signature = mapSignature(mm, game);
    var cached = mapObjectIndex.get(mm);
    if (!cached || cached.signature !== signature) {
      mapObjectIndex.set(mm, cached = rebuildMapIndex(mm, game));
    }
    return cached.entries.get(tileKey(x, y));
  }

  function findEnemyAt(list, x, y) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].alive && list[i].x === x && list[i].y === y) return list[i];
    }
    return null;
  }

  function findItemAt(list, x, y) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].x === x && list[i].y === y) return list[i];
    }
    return null;
  }

  function enemyHoverText(enemy) {
    var definition = RK.Entities.DEFS[enemy.type] || {};
    return (enemy.name || definition.name || enemy.type) +
      '\nHP: ' + enemy.hp + '/' + enemy.maxHp +
      '\nУрон: ' + enemy.atk;
  }

  function itemHoverText(item) {
    var description = (item.name || 'Предмет') +
      '\nРедкость: ' + (C.RARITY_NAMES_FEMININE[item.rarity] || C.RARITY_NAMES_FEMININE.common);
    var itemStats = item.stats || {};
    var statLines = [];
    for (var stat in STAT_NAMES) {
      if (itemStats[stat]) statLines.push('+' + itemStats[stat] + ' ' + STAT_NAMES[stat]);
    }
    if (statLines.length) description += '\n' + statLines.join(', ');
    else if (item.summary) description += '\n' + item.summary;
    else if (item.amt) description += '\n' + item.amt + ' монет';
    return { text: description, rarity: item.rarity || 'common' };
  }

  function trapTooltip(trap, player) {
    var text = C.TRAP_NAMES[trap.type] || 'Ловушка';
    if (player && trap.owner && trap.owner === player.id) return text + '\nВаша ловушка, взведена';
    if (trap.state === 'disarmed') return text + '\nОбезврежена';
    if (trap.state === 'triggered') return text + '\nУже сработала';
    return text + '\nНажмите L, чтобы обезвредить';
  }

  function trapSenseRadius(player) {
    if (RK.Classes && RK.Classes.trapSenseRadius && player) return RK.Classes.trapSenseRadius(player);
    return 1;
  }

  // Лучники чувствуют взведённые ловушки за две клетки, сквозь стены.
  function trapVisible(trap, mm, player) {
    if (!trap || !player) return false;
    var radius = trapSenseRadius(player);
    if (Math.max(Math.abs(player.x - trap.x), Math.abs(player.y - trap.y)) > radius) return false;
    if (mm.vis[trap.y] && mm.vis[trap.y][trap.x]) return true;
    return radius > 1;
  }

  function sensedTrapInfo(tile) {
    var player = RK.GAME && RK.GAME.player;
    var radius = trapSenseRadius(player);
    if (!player || !tile || radius <= 1) return '';
    if (Math.max(Math.abs(player.x - tile.x), Math.abs(player.y - tile.y)) > radius) return '';
    var trap = RK.MapGen.getTrapAt(tile.x, tile.y);
    if (!trap) return '';
    return trapTooltip(trap, player) + '\nЧувствуете ловушку (радиус ' + radius + ')';
  }

  function exitHoverText(exit) {
    var target = RK.World && RK.World.getLocation(exit.to);
    return exit.label + (target ? '\nПереход: ' + target.name : '') + '\nЛКМ: идти к переходу';
  }

  function getHoverInfo(tile) {
    var mm = RK.Map;
    var game = RK.GAME || {};
    if (!tile || !mm || !RK.Scene.seen(mm, tile.x, tile.y)) return sensedTrapInfo(tile);
    var exit = findItemAt(mm.exits || [], tile.x, tile.y);
    if (exit) return exitHoverText(exit);
    var poi = findItemAt(mm.pois || [], tile.x, tile.y);
    if (poi) return poi.name + (poi.description ? '\n' + poi.description : '');
    var enemy = findEnemyAt(game.enemies || [], tile.x, tile.y);
    if (enemy) return enemyHoverText(enemy);
    var item = findItemAt(game.items || [], tile.x, tile.y);
    if (item) return itemHoverText(item);
    var entries = mapEntriesAt(mm, game, tile.x, tile.y);
    if (!entries) return '';
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].kind === 'trap') return trapTooltip(entries[i].object, game.player);
      if (entries[i].kind === 'npc') {
        return RK.Npc.nameOf(entries[i].object) + ' — ' + RK.Npc.hoverHint(entries[i].object.kind);
      }
      if (entries[i].kind === 'chest' && entries[i].object.storage) return 'Хранилище — E: открыть';
      if (HOVER_STATIC_TEXT[entries[i].kind]) return HOVER_STATIC_TEXT[entries[i].kind];
    }
    return '';
  }

  function hasVisibleBoss() {
    var mm = RK.Map;
    var enemies = RK.GAME && RK.GAME.enemies;
    if (!mm || !enemies) return false;
    for (var i = 0; i < enemies.length; i++) {
      var enemy = enemies[i];
      if (enemy.alive && enemy.behavior === 'boss' && mm.vis[enemy.y] && mm.vis[enemy.x]) return true;
    }
    return false;
  }

  RK.Render = {
    draw: draw,
    getMode: getMode,
    setMode: setMode,
    modes: function () { return MODES.slice(); },
    hasVisibleBoss: hasVisibleBoss,
    getCameraOffset: getCameraOffset,
    pickTile: pickTile,
    getHoverInfo: getHoverInfo,
    invalidateFloorLayer: invalidateFloorLayer,
    getTileSize: getTileSize,
    resizeCanvas: resizeCanvas,
    resolutionScale: resolutionScale,
    resolutionScales: resolutionScales,
    setResolutionScale: setResolutionScale,
    getZoom: getZoom,
    setZoom: setZoom,
    zoomIn: zoomIn,
    zoomOut: zoomOut,
    getCameraAngle: getCameraAngle,
    getCameraViewAngle: function () { return cameraViewAngle(now()); },
    setCameraAngle: setCameraAngle,
    rotateCamera: rotateCamera,
    isAnimating: cameraAnimating,
    supportsRotation: supportsRotation,
    // Глифы вещей: список отдаётся наружу, чтобы тест ловил вид без глифа.
    typeGlyphs: function () { return RK.Views.ascii.typeGlyphs(); },
  };
})();
