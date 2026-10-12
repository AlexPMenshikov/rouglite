// Комната отладки: все объекты игры на одном экране. Фикстура, а не игровая
// логика, поэтому живёт отдельно от combat.js и описывается данными, а не ветвлениями.
(function () {
  var C = RK.CONFIG;

  var ENEMY_TYPES = ['slime', 'rat', 'skeleton', 'archer', 'bat', 'demon'];
  var CHEST_FIXTURES = [
    { x: 5, y: 5, state: 'closed' },
    { x: 8, y: 5, state: 'locked' },
    { x: 11, y: 5, state: 'open' },
    { x: 14, y: 5, state: 'broken' },
  ];
  var TRAP_FIXTURES = [
    { x: 5, y: 8, type: 'spike', state: 'armed' },
    { x: 8, y: 8, type: 'needle', state: 'armed' },
    { x: 11, y: 8, type: 'flame', state: 'armed' },
    { x: 14, y: 8, type: 'spike', state: 'disarmed' },
    { x: 17, y: 8, type: 'needle', state: 'triggered' },
  ];

  function buildFloorTypes(g, sectionW, sectionH) {
    // Четыре секции — чтобы были видны все стили местности.
    for (var y = 0; y < sectionH; y++) {
      for (var x = 0; x < sectionW; x++) {
        g.floorTypes[y][x] = 0;
        g.wallTypes[y][x] = RK.RNG.int(0, 2);
      }
    }
    for (var cy = 0; cy < sectionH; cy++) {
      for (var cx = sectionW; cx < g.w; cx++) {
        g.floorTypes[cy][cx] = 1;
        g.wallTypes[cy][cx] = RK.RNG.int(0, 2);
      }
    }
    for (var by = sectionH; by < g.h; by++) {
      for (var bx = 0; bx < sectionW; bx++) {
        g.floorTypes[by][bx] = 2;
        g.wallTypes[by][bx] = RK.RNG.int(0, 2);
      }
    }
    for (var my = sectionH; my < g.h; my++) {
      for (var mx = sectionW; mx < g.w; mx++) {
        g.floorTypes[my][mx] = RK.RNG.int(0, 2);
        g.wallTypes[my][mx] = RK.RNG.int(0, 2);
      }
    }
  }

  function buildRooms(g, sectionW, sectionH) {
    var room = function (x, y, w, h) {
      return { x: x, y: y, w: w, h: h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) };
    };
    g.rooms = [
      room(0, 0, sectionW, sectionH),
      room(sectionW, 0, g.w - sectionW, sectionH),
      room(0, sectionH, sectionW, g.h - sectionH),
      room(sectionW, sectionH, g.w - sectionW, g.h - sectionH),
    ];
  }

  function buildZones(g) {
    g.zones = [];
    var corner = function (x, y, type) {
      g.zones.push({ type: type, x: x, y: y, radius: 3, name: C.ZONES[type].name });
    };
    corner(5, 5, 'regen');
    corner(g.w - 6, 5, 'attack');
    corner(5, g.h - 6, 'weakAttack');
    corner(g.w - 6, g.h - 6, 'weakDefense');
  }

  function buildTorches(g) {
    g.torches = [];
    var spacing = (C.TORCH && C.TORCH.SPACING) || 5;
    var addTorch = function (x, y, dx, dy, phase) {
      if (g.tiles[y][x] !== 1) return;
      g.torches.push({
        x: x, y: y, asset: 'torch', flameAsset: 'torchFlame',
        dx: dx, dy: dy, phase: phase,
      });
    };
    for (var tx = 2; tx < g.w - 2; tx += spacing) {
      addTorch(tx, 2, 0, 1, tx * 17);
      addTorch(tx, g.h - 3, 0, -1, tx * 17);
    }
    for (var ty = 2; ty < g.h - 2; ty += spacing) {
      addTorch(2, ty, 1, 0, ty * 31);
      addTorch(g.w - 3, ty, -1, 0, ty * 31);
    }
  }

  // Пять дверей: все состояния в обеих ориентациях.
  function buildDoors(g, sectionW, sectionH) {
    var layouts = [
      { x: Math.floor(sectionW / 2), y: 1, orientation: 'horizontal', state: 'closed' },
      { x: Math.floor(sectionW / 2), y: sectionH - 1, orientation: 'horizontal', state: 'locked' },
      { x: sectionW + Math.floor((g.w - sectionW) / 2), y: 1, orientation: 'horizontal', state: 'open' },
      { x: 1, y: Math.floor(sectionH / 2), orientation: 'vertical', state: 'closed' },
      { x: g.w - 2, y: Math.floor(sectionH / 2), orientation: 'vertical', state: 'broken' },
    ];
    return layouts.map(function (layout) {
      return {
        x: layout.x, y: layout.y, asset: 'door',
        orientation: layout.orientation, state: layout.state, keyId: 'iron',
        hp: C.DOOR_HP, maxHp: C.DOOR_HP,
      };
    });
  }

  function buildFixtures(g, sectionW, sectionH) {
    g.doors = buildDoors(g, sectionW, sectionH);
    g.chests = CHEST_FIXTURES.map(function (fixture) {
      return {
        x: fixture.x, y: fixture.y, asset: 'chest', state: fixture.state, keyId: 'iron',
        hp: C.CHEST_HP, maxHp: C.CHEST_HP,
        looted: fixture.state === 'open' || fixture.state === 'broken',
      };
    });
    g.traps = TRAP_FIXTURES.map(function (fixture) {
      return { x: fixture.x, y: fixture.y, asset: 'trap', type: fixture.type, state: fixture.state, damage: 5 };
    });
  }

  function revealAll(g) {
    g.blood = [];
    g.explored = [];
    g.vis = [];
    for (var y = 0; y < g.h; y++) {
      g.explored[y] = [];
      g.vis[y] = [];
      for (var x = 0; x < g.w; x++) {
        g.explored[y][x] = true;
        g.vis[y][x] = true;
      }
    }
  }

  // Сетка врагов: сначала обычные, потом усиленные, потом боссы.
  function addEnemies(M, types, enhanced, startY, stepX, stepY, w) {
    var x = 3;
    var y = startY;
    for (var i = 0; i < types.length; i++) {
      var enemy = RK.Entities.makeEnemy(types[i], x, y, 1, enhanced);
      enemy.alerted = false; // Враги здесь не ходят и не атакуют.
      M.enemies.push(enemy);
      x += stepX;
      if (x > w - 5) {
        x = 3;
        y += stepY;
      }
    }
  }

  // Предмет каждого слота в каждой редкости: лут берётся штатным генератором,
  // подменяются только цвет и слот.
  function addDebugItems(M, w) {
    M.items = [];
    var x = 3;
    var y = 28;
    M.items.push({
      type: 'gold', asset: 'gold', kind: 'gold', x: x, y: y, amt: 100,
      name: 'Золото', summary: 'Монеты', rarity: 'common', color: C.RARITY_COLORS.common,
    });
    x += 3;
    M.items.push(RK.Items.spawnPotion(x, y));
    x += 3;
    M.items.push(RK.Items.spawnKey(x, y, 'iron'));
    x += 3;

    for (var s = 0; s < C.SLOTS.length; s++) {
      for (var r = 0; r < C.RARITIES.length; r++) {
        if (x > w - 5) {
          x = 3;
          y += 3;
        }
        var rarity = C.RARITIES[r];
        var loot = RK.Items.generateLootItem(1, x, y, false, false);
        loot.rarity = rarity;
        loot.color = C.RARITY_COLORS[rarity];
        loot.slot = C.SLOTS[s];
        loot.asset = C.SLOT_ASSETS[C.SLOTS[s]];
        M.items.push(loot);
        x += 3;
      }
    }
  }

  function createPlayer(ctx, x, y) {
    var player = RK.Entities.createPlayer(x, y);
    var classId = (RK.Meta && RK.Meta.data && RK.Meta.data.selectedClass) || 'tank';
    RK.Classes.applyToPlayer(player, classId);
    for (var i = 0; i < C.START_POTIONS; i++) {
      var potion = RK.Items.spawnPotion(player.x, player.y);
      potion.heal = player.potionHeal;
      potion.summary = '+' + potion.heal + ' HP';
      ctx.addPotionToBackpack(player.backpack, potion);
    }
    player.id = (RK.Network && RK.Network.playerId && RK.Network.playerId()) || 'local';
    player.name = (RK.Meta && RK.Meta.data && RK.Meta.data.playerName) || 'Игрок';
    return player;
  }

  function open() {
    var ctx = RK.Combat.createDebugContext();
    var M = ctx.game;

    RK.MapGen.generate(1, M.runSeed, M.mapWidth, M.mapHeight, 'stone');
    var g = RK.Map;
    var sectionW = Math.floor(g.w / 3);
    var sectionH = Math.floor(g.h / 3);

    // Карта полностью проходима: важна видимость объектов, а не стены.
    for (var y = 0; y < g.h; y++) {
      for (var x = 0; x < g.w; x++) {
        g.tiles[y][x] = 1;
        g.floorTypes[y][x] = 0;
        g.wallTypes[y][x] = 0;
      }
    }

    buildFloorTypes(g, sectionW, sectionH);
    g.spawn = { x: 2, y: 2 };
    g.stair = { x: g.w - 3, y: g.h - 3, asset: 'stairs' };
    buildRooms(g, sectionW, sectionH);
    g.decorations = RK.MapGen.placeDecorations(g, []);
    buildZones(g);
    buildTorches(g);
    buildFixtures(g, sectionW, sectionH);
    g.tavern = { x: Math.floor(g.w / 2) - 4, y: Math.floor(g.h / 2) - 3, w: 8, h: 6 };

    var player = createPlayer(ctx, g.spawn.x, g.spawn.y);
    M.player = player;
    M.players = [player];

    M.enemies = [];
    addEnemies(M, ENEMY_TYPES, false, 12, 3, 3, g.w);
    addEnemies(M, ENEMY_TYPES, true, 16, 3, 3, g.w);
    addEnemies(M, RK.Entities.BOSS_TYPES || [], false, 20, 4, 3, g.w);

    addDebugItems(M, g.w);

    M.merchant = { x: g.w - 5, y: 3, name: 'Странствующий торговец', asset: 'merchant' };
    M.blacksmith = { x: g.w - 5, y: 5, name: 'Кузнец', asset: 'blacksmith' };
    M.merchantOffer = {
      type: 'demon',
      kind: 'kill',
      enemyTypes: ['demon', 'boss_demon'],
      target: 5,
      progress: 0,
      reward: 100,
      description: 'Убить 5 демонов',
    };

    revealAll(g);
    M.debugRoom = true;

    RK.Fov.compute(player.x, player.y);
    ctx.recomputePlayerStats();
    ctx.updatePlayerZone();
    ctx.resizeCanvas();

    if (RK.Audio && !RK.Audio.start()) RK.UI.msg('Web Audio не поддерживается браузером: звуки недоступны.');
    RK.UI.show('game');
    RK.UI.msg('КОМНАТА ОТЛАДКИ: здесь представлены все объекты игры. Враги не ходят и не атакуют. WASD/стрелки — ходьба, E — взаимодействие, L — взлом, F — сила, Q — навык, R — зелье.');
    RK.UI.refresh();
  }

  RK.Debug = { open: open };
})();