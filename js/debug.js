// Комната отладки: все объекты игры на одном экране. Фикстура, а не игровая
// логика, поэтому живёт отдельно от combat.js и описывается данными, а не ветвлениями.
(function () {
  var C = RK.CONFIG;

  // Все обычные враги игры: список живёт в конфиге, чтобы комната не отставала
  // от спавна при добавлении новых типов.
  var ENEMY_TYPES = C.BASE_ENEMY_TYPES;
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
        g.wallTypes[y][x] = RK.MapBase.randomShade();
      }
    }
    for (var cy = 0; cy < sectionH; cy++) {
      for (var cx = sectionW; cx < g.w; cx++) {
        g.floorTypes[cy][cx] = 1;
        g.wallTypes[cy][cx] = RK.MapBase.randomShade();
      }
    }
    for (var by = sectionH; by < g.h; by++) {
      for (var bx = 0; bx < sectionW; bx++) {
        g.floorTypes[by][bx] = 2;
        g.wallTypes[by][bx] = RK.MapBase.randomShade();
      }
    }
    for (var my = sectionH; my < g.h; my++) {
      for (var mx = sectionW; mx < g.w; mx++) {
        g.floorTypes[my][mx] = RK.MapBase.randomShade();
        g.wallTypes[my][mx] = RK.MapBase.randomShade();
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

  function addEnemies(M, types, enhanced) {
    for (var i = 0; i < types.length; i++) {
      var enemy = RK.Entities.makeEnemy(types[i], 0, 0, 1, enhanced);
      enemy.alerted = false; // Враги здесь не ходят и не атакуют.
      M.enemies.push(enemy);
    }
  }

  function addDebugItems(M) {
    M.items = [];
    var place = function (item) {
      item.x = 0;
      item.y = 0;
      M.items.push(item);
    };

    place(RK.Items.makeGold(100, 0, 0));
    place(RK.Items.spawnPotion(0, 0));
    place(RK.Items.spawnKey(0, 0, 'iron'));

    for (var s = 0; s < C.SLOTS.length; s++) {
      for (var r = 0; r < C.RARITIES.length; r++) {
        var rarity = C.RARITIES[r];
        var loot = RK.Items.generateLootItem(1, 0, 0, false, false);
        loot.rarity = rarity;
        loot.color = C.RARITY_COLORS[rarity];
        loot.slot = C.SLOTS[s];
        loot.asset = C.SLOT_ASSETS[C.SLOTS[s]];
        place(loot);
      }
    }
  }

  function addSecretBoss(M) {
    var temple = RK.WorldData.LOCATIONS.legendary_sun_temple;
    var definition = temple && temple.boss;
    if (!definition) throw new Error('В WorldData не задан босс Храма Солнца.');
    var boss = RK.Entities.makeBoss(0, 0, 1, definition.type);
    boss.name = definition.name;
    boss.legendaryBoss = true;
    boss.legendaryRewardId = definition.rewardId;
    boss.alerted = false;
    M.enemies.push(boss);
  }

  function reserveTiles(occupied, objects, width, height) {
    for (var i = 0; i < objects.length; i++) {
      var object = objects[i];
      if (!object || !Number.isInteger(object.x) || !Number.isInteger(object.y)) continue;
      if (object.x < 0 || object.y < 0 || object.x >= width || object.y >= height) continue;
      occupied[object.x + ',' + object.y] = true;
    }
  }

  function spreadEntities(M, g) {
    var occupied = {};
    reserveTiles(occupied, [g.spawn, g.stair], g.w, g.h);
    reserveTiles(occupied, g.doors || [], g.w, g.h);
    reserveTiles(occupied, g.chests || [], g.w, g.h);
    reserveTiles(occupied, g.traps || [], g.w, g.h);
    reserveTiles(occupied, g.torches || [], g.w, g.h);
    reserveTiles(occupied, (g.decorations || []).filter(function (item) {
      return item.furniture;
    }), g.w, g.h);

    var candidates = [];
    for (var y = 3; y < g.h - 3; y += 3) {
      for (var x = 3; x < g.w - 3; x += 3) {
        if (!occupied[x + ',' + y]) candidates.push({ x: x, y: y });
      }
    }
    var groups = [M.enemies, M.items, M.npcs];
    var used = {};
    for (var groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      var group = groups[groupIndex];
      for (var entityIndex = 0; entityIndex < group.length; entityIndex++) {
        var target = Math.floor((entityIndex + 0.5) * candidates.length / group.length);
        var slotIndex = -1;
        for (var distance = 0; distance < candidates.length; distance++) {
          var after = target + distance;
          var before = target - distance;
          if (after < candidates.length && !used[after]) { slotIndex = after; break; }
          if (before >= 0 && !used[before]) { slotIndex = before; break; }
        }
        if (slotIndex < 0) throw new Error('Для комнаты отладки не хватает свободных клеток для объектов.');
        used[slotIndex] = true;
        var slot = candidates[slotIndex];
        group[entityIndex].x = slot.x;
        group[entityIndex].y = slot.y;
      }
    }
  }

  function createPlayer(ctx, x, y) {
    var player = RK.Entities.createPlayer(x, y);
    var classId = (RK.Meta && RK.Meta.data && RK.Meta.data.selectedClass) || 'paladin';
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
    g.tavern = { x: Math.floor(g.w / 2) - 4, y: 2, w: 8, h: 6 };

    var player = createPlayer(ctx, g.spawn.x, g.spawn.y);
    M.player = player;
    M.players = [player];

    M.enemies = [];
    addEnemies(M, ENEMY_TYPES, false);
    addEnemies(M, ENEMY_TYPES, true);
    addEnemies(M, RK.Entities.BOSS_TYPES || [], false);
    addSecretBoss(M);
    addDebugItems(M);

    M.npcs = [
      RK.Npc.make('merchant', 0, 0, 1),
      RK.Npc.make('blacksmith', 0, 0, 1),
      RK.Npc.make('guard', 0, 0, 1),
      RK.Npc.make('priest', 0, 0, 1),
      RK.Npc.make('scholar', 0, 0, 1),
      RK.Npc.make('ancient_guard', 0, 0, 1),
      RK.Npc.make('innkeeper', 0, 0, 1),
    ].filter(Boolean);

    spreadEntities(M, g);
    revealAll(g);
    g.locationType = 'city'; // Комната отладки без тумана войны: видно всю карту.
    M.sceneKind = 'debug';

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