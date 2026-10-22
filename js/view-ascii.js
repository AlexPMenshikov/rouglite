// Вид текстовый: вместо картинок глифы.
//
// Раньше этот вид перечислял объекты сам, мимо общих правил видимости.
// Теперь он берёт ту же сцену, что и графический вид: глиф рисуется там же,
// где стояла бы картинка.

(function () {
  var C = RK.CONFIG;

  var state = { zoom: 1, scale: 1, width: 0, height: 0 };
  var camera = { x: 0, y: 0 };

  var ENEMY_GLYPHS = {
    slime: 's',
    rat: 'r',
    skeleton: 'S',
    archer: 'a',
    bat: 'b',
    demon: 'D',
    wolf: 'w',
    spider: 'x',
    eagle: 'e',
    goat: 'g',
    scorpion: 'c',
    mummy: 'm',
    cultist: 'p',
    zombie: 'z',
    ghost: 'h',
    ghoul: 'o',
    golem: 'G',
    croc: 'k',
  };

  var TYPE_GLYPHS = {
    weapon: '/', sword: '/', axe: '7', spear: '|', bow: '(', crossbow: ')',
    staff: '|', magicStaff: '|', druidStaff: '|', wand: '/', fetish: '?', magicOrb: 'o',
    cloak: ']', mantle: ']', burka: ']',
    armor: ']', shield: ']', ring: 'o', amulet: 'o', boots: '=',
  };

  var ASCII_DOOR = {
    open: { glyph: '/', color: '#d9b36c' },
    broken: { glyph: '/', color: '#d9b36c' },
    locked: { glyph: '*', color: '#ff8a80' },
    closed: { glyph: '+', color: '#d9b36c' },
  };
  var ASCII_CHEST = {
    open: { glyph: 'o', color: '#d9b36c' },
    broken: { glyph: 'o', color: '#d9b36c' },
    locked: { glyph: 'X', color: '#ff8a80' },
    closed: { glyph: 'C', color: '#d9b36c' },
  };
  // Хранилище — шкаф: не путается с ларём «C».
  var ASCII_STORAGE = { glyph: '≡', color: '#8fd0ff' };
  // Декорации в текстовом режиме: набор спрайтов без картинки должен оставаться читаемым.
  var ASCII_DECOR = {
    decorTree: { glyph: '♣', color: '#6fbf5e' },
    decorPine: { glyph: '♠', color: '#57a05c' },
    decorBush: { glyph: '*', color: '#7cc46a' },
    decorCactus: { glyph: '{', color: '#6fbf5e' },
    decorSand: { glyph: '-', color: '#e8cd93' },
    decorCoffin: { glyph: '=', color: '#c9a86a' },
    decorCross: { glyph: '†', color: '#b8a7cc' },
    decorBones: { glyph: 'o', color: '#d8d0bc' },
    decorStone: { glyph: 'o', color: '#8a8a95' },
    decorGrass: { glyph: ',', color: '#71b85d' },
    decorMoss: { glyph: ',', color: '#4f8b56' },
    decorMushroom: { glyph: 'n', color: '#c94c58' },
    decorPuddle: { glyph: '.', color: '#347fa0' },
    decorLake: { glyph: '~', color: '#28799a' },
    decorStream: { glyph: '~', color: '#28799a' },
  };
  var ASCII_DECOR_FALLBACK = { glyph: '.', color: '#8a8a95' };

  function setup(next) {
    state.zoom = next.zoom;
    state.scale = next.scale;
    state.width = next.width;
    state.height = next.height;
  }

  function setCamera(pos) {
    camera = RK.View.gridCamera(pos, state.zoom);
  }

  function begin(ctx) {
    RK.View.gridBegin(ctx, tileSize(), camera);
  }

  function end(ctx) {
    RK.View.gridEnd(ctx);
  }

  function tileSize() {
    return RK.View.gridTileSize(state.zoom, state.scale);
  }

  function pick(px, py) {
    return RK.View.gridPick(px, py, tileSize(), camera);
  }

  function point(x, y) {
    var T = tileSize();
    return { x: (x - camera.x) * T, y: (y - camera.y) * T };
  }

  function drawGlyph(ctx, T, x, y, glyph, color, alpha) {
    if (!glyph) return;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color;
    // Глиф растёт вместе с тайлом: при чёткости 2× прежние 16px выглядели бы точкой.
    ctx.font = 'bold ' + Math.max(8, Math.round(T / 3)) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, (x + 0.5) * T, (y + 0.5) * T);
    ctx.globalAlpha = 1;
  }

  function itemGlyph(item) {
    if (item.kind === 'key') return '+';
    if (item.kind === 'trap') return 'v';
    if (item.kind === 'gold' || item.type === 'gold') return '$';
    if (item.type === 'potion') return '!';
    if (item.weaponType === 'bow' || item.type === 'bow') return '(';
    if (item.weaponType === 'crossbow' || item.type === 'crossbow') return ')';
    return TYPE_GLYPHS[item.type] || '?';
  }

  function enemyGlyph(enemy) {
    if (enemy.boss) return 'B';
    return ENEMY_GLYPHS[enemy.type] || 'e';
  }

  function drawScene(ctx, scene, T) {
    var map = scene.map;
    ctx.save();
    ctx.translate(-camera.x * T, -camera.y * T);

    for (var y = 0; y < map.h; y++) {
      for (var x = 0; x < map.w; x++) {
        if (!RK.Scene.opened(map, x, y)) continue;
        var visible = RK.Scene.seen(map, x, y);
        drawGlyph(ctx, T, x, y, map.tiles[y][x] === 1 ? '.' : '#',
          map.tiles[y][x] === 1 ? '#b8a7cc' : '#8a769f', visible ? 1 : 0.38);
      }
    }

    var doors = scene.doors;
    for (var d = 0; d < doors.length; d++) {
      var door = doors[d];
      var doorStyle = ASCII_DOOR[door.state] || ASCII_DOOR.closed;
      drawGlyph(ctx, T, door.x, door.y, doorStyle.glyph, doorStyle.color,
        door.visible ? 1 : C.EXPLORED_ALPHA);
    }

    var chests = scene.chests;
    for (var c = 0; c < chests.length; c++) {
      var chest = chests[c];
      var chestStyle = chest.storage ? ASCII_STORAGE : (ASCII_CHEST[chest.state] || ASCII_CHEST.closed);
      drawGlyph(ctx, T, chest.x, chest.y, chestStyle.glyph, chestStyle.color,
        chest.visible ? 1 : C.EXPLORED_ALPHA);
    }

    var traps = scene.traps;
    for (var t = 0; t < traps.length; t++) {
      var trap = traps[t];
      drawGlyph(ctx, T, trap.x, trap.y,
        trap.state === 'disarmed' ? '_' : (trap.type === 'flame' ? '~' : '^'),
        trap.state === 'disarmed' ? '#8878a0' : '#ff8a80', trap.visible ? 1 : 0.55);
    }

    var torches = scene.torches;
    for (var ti = 0; ti < torches.length; ti++) {
      drawGlyph(ctx, T, torches[ti].x, torches[ti].y, 'i', '#ffd166',
        torches[ti].visible ? 1 : C.EXPLORED_ALPHA);
    }

    var decor = scene.decor;
    for (var di = 0; di < decor.length; di++) {
      var decoration = decor[di];
      var decorStyle = ASCII_DECOR[decoration.asset] || ASCII_DECOR_FALLBACK;
      drawGlyph(ctx, T, decoration.x, decoration.y, decorStyle.glyph, decorStyle.color,
        decoration.visible ? 1 : C.EXPLORED_ALPHA);
    }

    var lakes = scene.lakes;
    for (var li = 0; li < lakes.length; li++) {
      var lakeStyle = ASCII_DECOR.decorLake;
      drawGlyph(ctx, T, lakes[li].x, lakes[li].y, lakeStyle.glyph, lakeStyle.color,
        lakes[li].visible ? 1 : C.EXPLORED_ALPHA);
    }

    var streams = scene.streams;
    for (var si = 0; si < streams.length; si++) {
      var streamStyle = ASCII_DECOR.decorStream;
      drawGlyph(ctx, T, streams[si].x, streams[si].y, streamStyle.glyph, streamStyle.color,
        streams[si].visible ? 1 : C.EXPLORED_ALPHA);
    }

    var npcs = scene.npcs;
    for (var n = 0; n < npcs.length; n++) {
      var npc = npcs[n];
      if (!npc.visual) continue;
      drawGlyph(ctx, T, npc.x, npc.y, npc.visual.glyph, npc.visual.color,
        npc.visible ? 1 : C.EXPLORED_ALPHA);
    }

    var pois = scene.pois;
    for (var p = 0; p < pois.length; p++) {
      var poi = pois[p];
      var glyph = poi.type === 'ruins' ? 'R' : poi.type === 'clearing' ? 'o' : '♣';
      drawGlyph(ctx, T, poi.x, poi.y, glyph, '#9bd17c', poi.visible ? 1 : C.EXPLORED_ALPHA);
    }

    if (scene.stair && scene.stair.visible) {
      drawGlyph(ctx, T, scene.stair.x, scene.stair.y, '>', '#ffd166');
    }

    var exits = scene.exits;
    for (var e = 0; e < exits.length; e++) {
      drawGlyph(ctx, T, exits[e].x, exits[e].y, '>', '#8ee3ef',
        exits[e].visible ? 1 : C.EXPLORED_ALPHA);
    }

    var items = scene.items;
    for (var i = 0; i < items.length; i++) {
      drawGlyph(ctx, T, items[i].x, items[i].y, itemGlyph(items[i]), '#f3d36a');
    }

    var enemies = scene.enemies;
    for (var en = 0; en < enemies.length; en++) {
      drawGlyph(ctx, T, enemies[en].x, enemies[en].y, enemyGlyph(enemies[en]), '#ff8a80');
    }

    var party = scene.party;
    for (var pm = 0; pm < party.length; pm++) {
      var member = party[pm];
      drawGlyph(ctx, T, member.pos.x, member.pos.y, '&', '#ffd166');
    }

    if (scene.hero) {
      drawGlyph(ctx, T, scene.hero.pos.x, scene.hero.pos.y, '@', '#7ae582');
    }
    ctx.restore();
  }

  // В текстовом виде темноты нет: всё, что открыто, и так читается.
  function drawLighting() {}

  function drawOverlays(ctx, scene, T) {
    RK.View.drawGridOverlays(ctx, scene, T, camera);
  }

  RK.Views = RK.Views || {};
  RK.Views.ascii = {
    name: 'ascii',
    tileSize: function (zoom, scale) { return RK.View.gridTileSize(zoom, scale); },
    setup: setup,
    setCamera: setCamera,
    begin: begin,
    end: end,
    pick: pick,
    point: point,
    invalidate: function () {},
    drawScene: drawScene,
    drawLighting: drawLighting,
    drawOverlays: drawOverlays,
    typeGlyphs: function () { return TYPE_GLYPHS; },
  };
})();
