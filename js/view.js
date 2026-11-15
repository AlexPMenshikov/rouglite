// Виды: как мир нарисован на экране.
//
// Вид решает только «как»: куда попадает клетка, как выглядит пол и что делает
// курсор. Правила игры (что видно, кто где) живут в сцене, а не здесь.

(function () {
  var C = RK.CONFIG;

  // Камера сетки: герой в центре, обзор — столько клеток, сколько влезло в кадр.
  // Виды сетки передают размер канваса: поле занимает окно, а не фиксированный
  // прямоугольник, поэтому обзор зависит от размера окна.
  function gridCamera(pos, zoom, visibleCols, visibleRows) {
    var cols = visibleCols || (C.COLS / zoom);
    var rows = visibleRows || (C.ROWS / zoom);
    return {
      x: pos.x + 0.7 - cols / 2,
      y: pos.y + 0.7 - rows / 2,
    };
  }

  // Сколько клеток влезло в кадр: размер канваса делим на размер тайла.
  function visibleCells(width, height, tile) {
    if (!tile || !width || !height) return null;
    return { cols: width / tile, rows: height / tile };
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
    if (RK.hoverPath) {
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
    // Прицел дистанционной атаки: общий код для текстового вида.
    if (RK.ViewTarget && RK.ViewTarget.draw) {
      RK.ViewTarget.draw(ctx, T, function (x, y) {
        return { x: (x + 0.5 - camera.x) * T, y: (y + 0.5 - camera.y) * T };
      });
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
  // Новые темы ярусов перекрывают тип: в магме летят угольки, в ледяных гротах — снег.
  function ambientParticlesFor(map) {
    var styleId = map && map.style;
    if (styleId === 'magma') return 'embers';
    if (styleId === 'ice') return 'snow';
    if (styleId === 'fungal') return 'spores';
    var type = map && map.locationType;
    if (type === 'wilderness') return 'leaves';
    if (type === 'desert') return 'sand';
    if (type === 'dungeon' || type === 'crypt' || type === 'sewers' || type === 'ruins') return 'embers';
    return 'dust';
  }

  // Прямоугольник содержимого спрайта предмета на экране.
  // Рамка 256×256 у предметов пустая по краям, поэтому рисуется только
  // содержимое: его нижняя точка и есть опора предмета.
  // anchor 'ground': нижний центр содержимого в точке (x, y) — предмет стоит на клетке.
  // anchor 'center': центр содержимого в точке (x, y) — предмет лежит в клетке.
  function itemRect(name, x, y, size, anchor) {
    var A = RK.Assets;
    if (!A || !A.sprite) return null;
    var sprite = A.sprite(name);
    if (!sprite) return null;
    var box = A.spriteBox ? A.spriteBox(name) : null;
    var cw = box ? box.x1 - box.x0 + 1 : (sprite.width || A.SPRITE);
    var ch = box ? box.y1 - box.y0 + 1 : (sprite.height || A.SPRITE);
    var scale = size / Math.max(cw, ch);
    var w = cw * scale;
    var h = ch * scale;
    if (anchor === 'center') return { x: x - w / 2, y: y - h / 2, w: w, h: h };
    return { x: x - w / 2, y: y - h, w: w, h: h };
  }

  // Пометки на спрайте предмета: пипсы уровня улучшения и знак зачарования.
  // Цвет редкости и цвет зачарования берутся из правил, а не из картинки.
  function drawItemMarks(ctx, item, rect, rarityColor) {
    if (!item || !rect) return;
    var level = item.upgradeLevel || 0;
    var color = rarityColor || '#f0f0f0';
    var side = Math.min(rect.w, rect.h);
    ctx.save();
    ctx.strokeStyle = 'rgba(12, 10, 18, 0.75)';
    ctx.lineWidth = 1;
    if (level > 0) {
      var pip = Math.max(1.5, side * 0.08);
      var x = rect.x + pip;
      var y = rect.y + rect.h - pip;
      ctx.fillStyle = color;
      for (var i = 0; i < Math.min(level, 5); i++) {
        ctx.beginPath();
        ctx.moveTo(x, y - pip);
        ctx.lineTo(x + pip, y);
        ctx.lineTo(x, y + pip);
        ctx.lineTo(x - pip, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        x += pip * 2.6;
      }
    }
    if (item.enchantId) {
      var enchants = RK.Items && RK.Items.ENCHANTMENTS;
      var enchant = enchants && enchants[item.enchantId];
      var glow = enchant && enchant.color ? enchant.color : '#ffd166';
      var r = Math.max(2, side * 0.11);
      var cx = rect.x + rect.w - r;
      var cy = rect.y + r;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.quadraticCurveTo(cx, cy, cx + r, cy);
      ctx.quadraticCurveTo(cx, cy, cx, cy + r);
      ctx.quadraticCurveTo(cx, cy, cx - r, cy);
      ctx.quadraticCurveTo(cx, cy, cx, cy - r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // Цвет подкраски предмета: свой цвет вещи, а у обычной добычи он и есть
  // цвет редкости. У материалов цвет свой — по нему видно, что это за материал.
  function itemTintColor(item) {
    if (!item || !item.rarity || item.rarity === 'common') return null;
    var color = item.color;
    if (!color || color === C.RARITY_COLORS.common) color = C.RARITY_COLORS[item.rarity];
    return color || null;
  }

  RK.View = {
    gridCamera: gridCamera,
    visibleCells: visibleCells,
    gridTileSize: gridTileSize,
    gridBegin: gridBegin,
    gridEnd: gridEnd,
    gridPick: gridPick,
    drawGridOverlays: drawGridOverlays,
    itemRect: itemRect,
    itemTintColor: itemTintColor,
    drawItemMarks: drawItemMarks,
    ambientFor: ambientFor,
    ambientParticlesFor: ambientParticlesFor,
    get: function (name) {
      return (RK.Views && RK.Views[name]) || null;
    },
  };
})();
