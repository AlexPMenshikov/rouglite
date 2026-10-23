// Виды: как мир нарисован на экране.
//
// Вид решает только «как»: куда попадает клетка, как выглядит пол и что делает
// курсор. Правила игры (что видно, кто где) живут в сцене, а не здесь.

(function () {
  var C = RK.CONFIG;

  // Камера сетки: герой в центре, обзор — C.COLS × C.ROWS клеток.
  function gridCamera(pos, zoom) {
    return {
      x: pos.x + 0.5 - (C.COLS / zoom) / 2,
      y: pos.y + 0.5 - (C.ROWS / zoom) / 2,
    };
  }

  function gridTileSize(zoom, scale) {
    return Math.max(1, Math.round(C.TILE * zoom * scale));
  }

  function gridBegin(ctx, T, camera) {
    ctx.save();
    ctx.translate(-camera.x * T, -camera.y * T);
  }

  function gridEnd(ctx) {
    ctx.restore();
  }

  // Пиксель обратно в клетку: обычная сетка.
  function gridPick(px, py, T, camera) {
    return { x: Math.floor(px / T + camera.x), y: Math.floor(py / T + camera.y) };
  }

  // Подсветка клетки под курсором и маршрута автопрохода — общий код для видов сетки.
  function drawGridOverlays(ctx, scene, T, camera) {
    if (RK.hover && RK.Scene.seen(scene.map, RK.hover.x, RK.hover.y)) {
      ctx.fillStyle = C.COLORS.hover;
      ctx.fillRect((RK.hover.x - camera.x) * T, (RK.hover.y - camera.y) * T, T, T);
    }
    if (!RK.hoverPath) return;
    ctx.fillStyle = C.HOVER_PATH_COLOR;
    var steps = Math.min(RK.hoverPath.length, C.HOVER_PATH_MAX_STEPS);
    for (var i = 0; i < steps; i++) {
      var step = RK.hoverPath[i];
      var dot = C.HOVER_PATH_DOT;
      ctx.fillRect(
        (step.x - camera.x) * T + T / 2 - dot / 2,
        (step.y - camera.y) * T + T / 2 - dot / 2,
        dot,
        dot,
      );
    }
  }

  // Плотность темноты для карты: тип локации важнее стиля тайлов.
  // Город и открытые локации светлее, подземелья темнее.
  function ambientFor(map) {
    var base = (C.TORCH && C.TORCH.AMBIENT != null) ? C.TORCH.AMBIENT : 0.58;
    if (!map) return base;
    if (RK.Fov && RK.Fov.isAlwaysVisible && RK.Fov.isAlwaysVisible(map)) return 0;
    var type = map.locationType && C.LOCATION_TYPES[map.locationType];
    if (type && typeof type.ambient === 'number') {
      return Math.max(0, Math.min(0.78, type.ambient));
    }
    var style = map.style && C.MAP_STYLES[map.style];
    if (style && typeof style.light === 'number') {
      return Math.max(0.32, Math.min(0.78, 1 - style.light));
    }
    var floor = (RK.GAME && RK.GAME.floor) || 1;
    var depth = RK.Assets && RK.Assets.floorGrayAmount ? RK.Assets.floorGrayAmount(floor) : 0;
    return Math.min(0.78, base + depth * 0.12);
  }

  // Частицы в воздухе по типу локации: у каждой местности свой характер.
  function ambientParticlesFor(map) {
    var type = map && map.locationType;
    if (type === 'wilderness') return 'leaves';
    if (type === 'desert') return 'sand';
    if (type === 'dungeon' || type === 'crypt' || type === 'sewers' || type === 'ruins') return 'embers';
    return 'dust';
  }

  RK.View = {
    gridCamera: gridCamera,
    gridTileSize: gridTileSize,
    gridBegin: gridBegin,
    gridEnd: gridEnd,
    gridPick: gridPick,
    drawGridOverlays: drawGridOverlays,
    ambientFor: ambientFor,
    ambientParticlesFor: ambientParticlesFor,
    get: function (name) {
      return (RK.Views && RK.Views[name]) || null;
    },
  };
})();
