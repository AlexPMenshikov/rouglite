// Сцена: перечень того, что видно на карте.
//
// Раньше каждая проверка «что и когда рисуется» жила в render.js, а ASCII-режим
// повторял её своим списком. Теперь перечень один: сцена собирает факты о мире
// (кто где, что видно, какой спрайт), а вид решает только «как это нарисовать».
// Новый вид (изометрия) не переписывает правила игры, а берёт готовые факты.

(function () {
  var C = RK.CONFIG;

  function seen(map, x, y) {
    return !!(map && map.vis && map.vis[y] && map.vis[y][x]);
  }

  function opened(map, x, y) {
    return !!(map && map.explored && map.explored[y] && map.explored[y][x]);
  }

  function trapSenseRadius(player) {
    if (RK.Classes && RK.Classes.trapSenseRadius && player) return RK.Classes.trapSenseRadius(player);
    return 1;
  }

  // Ловушку видно, если игрок чувствует её или она попала в поле зрения.
  function trapInSight(trap, map, player) {
    if (!trap || !player) return false;
    var radius = trapSenseRadius(player);
    if (Math.max(Math.abs(player.x - trap.x), Math.abs(player.y - trap.y)) > radius) return false;
    if (seen(map, trap.x, trap.y)) return true;
    return radius > 1;
  }

  // Спрайт врага: свой asset, а если его нет — по типу из реестра, иначе общий запасной.
  function enemySprites(enemy) {
    var defs = (RK.Entities && RK.Entities.DEFS) || {};
    var key = enemy.type in defs ? enemy.type : 'slime';
    return { asset: enemy.asset || key, fallback: key };
  }

  function drawPos(actor) {
    if (RK.Combat && RK.Combat.getDrawPos) return RK.Combat.getDrawPos(actor);
    return { x: actor.x, y: actor.y };
  }

  function buildDecor(map, scene) {
    var decorations = map.decorations || [];
    for (var i = 0; i < decorations.length; i++) {
      var decoration = decorations[i];
      if (!map.tiles[decoration.y] || map.tiles[decoration.y][decoration.x] !== 1) continue;
      if (!opened(map, decoration.x, decoration.y)) continue;
      var visible = seen(map, decoration.x, decoration.y);
      if (decoration.asset === 'decorLake') {
        scene.lakes.push({
          x: decoration.x,
          y: decoration.y,
          phase: decoration.waterPhase || 0,
          visible: visible,
        });
        continue;
      }
      if (decoration.asset === 'decorStream') {
        scene.streams.push({
          x: decoration.x,
          y: decoration.y,
          flowIndex: decoration.flowIndex || 0,
          visible: visible,
        });
        continue;
      }
      scene.decor.push({
        x: decoration.x,
        y: decoration.y,
        asset: decoration.asset,
        visible: visible,
      });
    }
  }

  // Озеро красится как продолжение соседнего: края ровные там, где рядом ещё вода.
  function markLakeNeighbours(scene) {
    var index = {};
    for (var i = 0; i < scene.lakes.length; i++) {
      index[scene.lakes[i].x + ',' + scene.lakes[i].y] = scene.lakes[i];
    }
    function has(x, y) {
      return !!index[x + ',' + y];
    }
    for (var k = 0; k < scene.lakes.length; k++) {
      var lake = scene.lakes[k];
      lake.left = has(lake.x - 1, lake.y) || has(lake.x - 1, lake.y - 1) || has(lake.x - 1, lake.y + 1);
      lake.right = has(lake.x + 1, lake.y) || has(lake.x + 1, lake.y - 1) || has(lake.x + 1, lake.y + 1);
      lake.top = has(lake.x, lake.y - 1) || has(lake.x - 1, lake.y - 1) || has(lake.x + 1, lake.y - 1);
      lake.bottom = has(lake.x, lake.y + 1) || has(lake.x - 1, lake.y + 1) || has(lake.x + 1, lake.y + 1);
    }
  }

  function buildZones(map, scene) {
    var zones = map.zones || [];
    for (var i = 0; i < zones.length; i++) {
      var zone = zones[i];
      if (!opened(map, zone.x, zone.y)) continue;
      var minX = Math.max(0, zone.x - zone.radius);
      var maxX = Math.min(map.w - 1, zone.x + zone.radius);
      var minY = Math.max(0, zone.y - zone.radius);
      var maxY = Math.min(map.h - 1, zone.y + zone.radius);
      var cells = [];
      for (var y = minY; y <= maxY; y++) {
        for (var x = minX; x <= maxX; x++) {
          if (map.tiles[y][x] === 1 && opened(map, x, y)) cells.push([x, y]);
        }
      }
      scene.zones.push({
        x: zone.x,
        y: zone.y,
        radius: zone.radius,
        type: zone.type,
        cells: cells,
      });
    }
  }

  function buildTorches(map, scene) {
    var torches = map.torches || [];
    for (var i = 0; i < torches.length; i++) {
      var torch = torches[i];
      if (!opened(map, torch.x, torch.y)) continue;
      scene.torches.push({
        x: torch.x,
        y: torch.y,
        dx: torch.dx || 0,
        dy: torch.dy || 0,
        phase: torch.phase || 0,
        asset: torch.asset,
        flameAsset: torch.flameAsset,
        visible: seen(map, torch.x, torch.y),
      });
    }
  }

  function buildDoors(map, scene) {
    var doors = map.doors || [];
    for (var i = 0; i < doors.length; i++) {
      var door = doors[i];
      if (!opened(map, door.x, door.y)) continue;
      scene.doors.push({
        x: door.x,
        y: door.y,
        state: door.state,
        orientation: door.orientation,
        asset: door.asset,
        visible: seen(map, door.x, door.y),
      });
    }
  }

  function buildTraps(map, scene, player) {
    var traps = map.traps || [];
    for (var i = 0; i < traps.length; i++) {
      var trap = traps[i];
      if (!trapInSight(trap, map, player)) continue;
      scene.traps.push({
        x: trap.x,
        y: trap.y,
        state: trap.state,
        type: trap.type,
        owner: trap.owner,
        mine: !!(player && trap.owner && trap.owner === player.id),
        visible: seen(map, trap.x, trap.y),
      });
    }
  }

  function buildChests(map, scene) {
    var chests = map.chests || [];
    for (var i = 0; i < chests.length; i++) {
      var chest = chests[i];
      if (!opened(map, chest.x, chest.y)) continue;
      scene.chests.push({
        x: chest.x,
        y: chest.y,
        state: chest.state,
        asset: chest.asset,
        storage: !!chest.storage,
        visible: seen(map, chest.x, chest.y),
      });
    }
  }

  function buildNpcs(map, scene, game) {
    var npcs = game.npcs || [];
    for (var i = 0; i < npcs.length; i++) {
      var npc = npcs[i];
      if (!npc || !opened(map, npc.x, npc.y)) continue;
      scene.npcs.push({
        x: npc.x,
        y: npc.y,
        kind: npc.kind,
        visual: RK.Npc.visual(npc.kind),
        visible: seen(map, npc.x, npc.y),
      });
    }
  }

  function buildItems(map, scene, game) {
    var items = game.items || [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!seen(map, item.x, item.y)) continue;
      scene.items.push({
        x: item.x,
        y: item.y,
        kind: item.kind,
        type: item.type,
        rarity: item.rarity || 'common',
        asset: item.asset || item.type,
        fallback: item.type,
        visible: true,
      });
    }
  }

  function buildEnemies(map, scene, game) {
    var enemies = game.enemies || [];
    for (var i = 0; i < enemies.length; i++) {
      var enemy = enemies[i];
      if (!enemy.alive || !seen(map, enemy.x, enemy.y)) continue;
      var sprites = enemySprites(enemy);
      scene.enemies.push({
        x: enemy.x,
        y: enemy.y,
        type: enemy.type,
        asset: sprites.asset,
        fallback: sprites.fallback,
        enhanced: !!enemy.enhanced,
        sizeScale: enemy.sizeScale || 1.25,
        boss: enemy.behavior === 'boss',
        champion: !!enemy.isChampion,
        visible: true,
      });
    }
  }

  function buildParty(map, scene, game) {
    var party = game.players || (game.player ? [game.player] : []);
    var focusedId = game.player && game.player.id;
    for (var i = 0; i < party.length; i++) {
      var member = party[i];
      if (!member || member.id === focusedId || member.hp <= 0) continue;
      if (!seen(map, member.x, member.y)) continue;
      scene.party.push({
        x: member.x,
        y: member.y,
        pos: drawPos(member),
        asset: member.asset || 'player',
        fallback: 'player',
        name: member.name || 'Игрок',
        facingX: member.facingX || 0,
        facingY: member.facingY || 0,
        visible: true,
      });
    }
  }

  // Герой рисуется поверх всего: в изометрии его иначе закрывает стена.
  function buildHero(map, scene, game) {
    var hero = game.player;
    if (!hero) return null;
    return {
      x: hero.x,
      y: hero.y,
      pos: drawPos(hero),
      asset: hero.asset || 'player',
      fallback: 'player',
      facingX: hero.facingX || 0,
      facingY: hero.facingY || 0,
      visible: true,
    };
  }

  /**
   * Собирает сцену: что видно на карте и чем это нарисовано.
   * Правила видимости и выбора спрайтов живут здесь, вид получает готовые факты.
   */
  function build(map, game) {
    game = game || {};
    var scene = {
      map: map,
      decor: [],
      lakes: [],
      streams: [],
      zones: [],
      blood: [],
      torches: [],
      pois: [],
      exits: [],
      doors: [],
      traps: [],
      chests: [],
      npcs: [],
      stair: null,
      items: [],
      enemies: [],
      party: [],
      hero: null,
    };
    if (!map) return scene;

    var player = game.player || null;

    buildDecor(map, scene);
    markLakeNeighbours(scene);
    buildZones(map, scene);

    var blood = map.blood || [];
    for (var b = 0; b < blood.length; b++) {
      var spot = blood[b];
      if (!opened(map, spot.x, spot.y)) continue;
      scene.blood.push({
        x: spot.x,
        y: spot.y,
        ox: spot.ox || 0,
        oy: spot.oy || 0,
        r: spot.r == null ? 0.3 : spot.r,
        a: spot.a == null ? 1 : spot.a,
        kind: spot.kind || 0,
        visible: seen(map, spot.x, spot.y),
      });
    }

    buildTorches(map, scene);

    var pois = map.pois || [];
    for (var p = 0; p < pois.length; p++) {
      var poi = pois[p];
      if (!opened(map, poi.x, poi.y)) continue;
      scene.pois.push({ x: poi.x, y: poi.y, type: poi.type, visible: seen(map, poi.x, poi.y) });
    }

    var exits = map.exits || [];
    for (var e = 0; e < exits.length; e++) {
      var exit = exits[e];
      if (!opened(map, exit.x, exit.y)) continue;
      scene.exits.push({ x: exit.x, y: exit.y, asset: exit.asset, visible: seen(map, exit.x, exit.y) });
    }

    buildDoors(map, scene);
    buildTraps(map, scene, player);
    buildChests(map, scene);
    buildNpcs(map, scene, game);

    if (map.stair) {
      scene.stair = {
        x: map.stair.x,
        y: map.stair.y,
        asset: map.stair.asset,
        visible: seen(map, map.stair.x, map.stair.y),
      };
    }

    buildItems(map, scene, game);
    buildEnemies(map, scene, game);
    buildParty(map, scene, game);
    scene.hero = buildHero(map, scene, game);

    return scene;
  }

  // Стиль клетки: по региону, а при битом регионе — по стилю карты.
  function styleIdAt(map, x, y) {
    var styles = C.MAP_STYLES;
    var row = map.regions && map.regions[y];
    var id = map.regionStyles && row ? map.regionStyles[row[x]] : null;
    if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(styles, id)) return id;
    return typeof map.style === 'string' && Object.prototype.hasOwnProperty.call(styles, map.style)
      ? map.style : null;
  }

  // Оттенок клетки: тот же индекс, которым генератор красил пол и стены.
  function shadeAt(map, x, y, tile, styleId) {
    var types = tile === 1 ? map.floorTypes : map.wallTypes;
    var row = types && types[y];
    var index = row ? row[x] : null;
    var style = styleId ? C.MAP_STYLES[styleId] : null;
    var colors = style && (tile === 1 ? style.colors : style.wallColors);
    return Number.isInteger(index) && Array.isArray(colors) && index >= 0 && index < colors.length ? index : 0;
  }

  RK.Scene = {
    build: build,
    seen: seen,
    opened: opened,
    styleIdAt: styleIdAt,
    shadeAt: shadeAt,
  };
})();
