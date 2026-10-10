(function () {
  var C = RK.CONFIG;

  var DEFS = {
    potion: { name: 'Зелье лечения', symbol: '!', color: '#ff6b81' },
    gold: { name: 'Золото', symbol: '$', color: '#ffd166' },
    sword: { name: 'Меч (+4 к атаке)', symbol: 't', color: '#c3c8e8' },
    shield: { name: 'Щит (+3 к защите)', symbol: ']', color: '#7eb8ff' },
    boots: { name: 'Сапоги (замедление врагов)', symbol: 'b', color: '#c9a86a' },
    weapon: { name: 'Оружие', symbol: 't', color: '#c3c8e8' },
    armor: { name: 'Броня', symbol: ']', color: '#7eb8ff' },
    trinket: { name: 'Аксессуар', symbol: '*', color: '#d29cff' },
  };

  function lootRarity(floor) {
    var r = RK.RNG.rand();
    if (r < 0.58) return 'common';
    if (r < 0.82) return 'rare';
    if (r < 0.96) return 'epic';
    return 'legendary';
  }

  function weaponSlotForLoot() {
    var roll = RK.RNG.rand();
    if (roll < 0.28) return 'weapon';
    if (roll < 0.46) return 'head';
    if (roll < 0.72) return 'armor';
    if (roll < 0.88) return 'ring';
    if (roll < 0.96) return 'amulet';
    return 'boots';
  }

  function summarizeStats(stats) {
    var parts = [];
    if (stats.atk) parts.push('+' + stats.atk + ' ATK');
    if (stats.def) parts.push('+' + stats.def + ' DEF');
    if (stats.hp) parts.push('+' + stats.hp + ' HP');
    if (stats.heal) parts.push('+' + stats.heal + ' ЛЕЧ');
    if (stats.luck) parts.push('+' + stats.luck + '% УДАЧ');
    return parts.join(', ');
  }

  function generateLootItem(floor, x, y) {
    var slot = weaponSlotForLoot();
    var rarity = lootRarity(floor);
    var mult = { common: 1, rare: 1.45, epic: 1.9, legendary: 2.5 }[rarity] || 1;
    var stats = { atk: 0, def: 0, hp: 0, heal: 0, luck: 0 };
    if (slot === 'weapon') {
      stats.atk = Math.round((RK.RNG.int(2, 6) + floor * 0.8) * mult);
    } else if (slot === 'head') {
      stats.hp = Math.round((RK.RNG.int(6, 12) + floor * 1.2) * mult);
      stats.def = Math.round((RK.RNG.int(1, 3) + floor * 0.45) * mult);
    } else if (slot === 'armor') {
      stats.def = Math.round((RK.RNG.int(2, 5) + floor * 0.7) * mult);
      stats.hp = Math.round((RK.RNG.int(4, 10) + floor * 1.2) * mult);
    } else if (slot === 'ring') {
      stats.luck = Math.max(1, Math.round((floor * 0.12 + 1) * mult));
      stats.hp = Math.round((RK.RNG.int(3, 8) + floor * 0.7) * mult);
    } else if (slot === 'amulet') {
      stats.hp = Math.round((RK.RNG.int(6, 15) + floor * 1.5) * mult);
      stats.heal = Math.round((RK.RNG.int(3, 8) + floor * 0.5) * mult);
      stats.luck = Math.max(1, Math.round((floor * 0.12) * mult));
    } else if (slot === 'boots') {
      stats.def = Math.round((RK.RNG.int(1, 3) + floor * 0.5) * mult);
      stats.luck = Math.max(1, Math.round((floor * 0.1) * mult));
    } else {
      stats.hp = Math.round((RK.RNG.int(6, 15) + floor * 1.5) * mult);
      stats.heal = Math.round((RK.RNG.int(3, 8) + floor * 0.5) * mult);
      stats.luck = Math.max(1, Math.round((floor * 0.12) * mult));
    }

    var rareNames = {
      common: ['Обычный', 'Земной', 'Простой', 'Приземлённый'],
      rare: ['Редкий', 'Резкий', 'Лютый', 'Необычный'],
      epic: ['Эпический', 'Сияющий', 'Могучий', 'Легендарный'],
      legendary: ['Уникальный', 'Божественный', 'Небесный', 'Сверхъестественный'],
    };
    var prefixes = {
      weapon: ['Меч', 'Клинок', 'Топор', 'Секира', 'Пика'],
      head: ['Шлем', 'Диадема', 'Капюшон', 'Корона', 'Маска'],
      armor: ['Панцирь', 'Кираса', 'Латы', 'Защита', 'Пластина'],
      ring: ['Кольцо', 'Обруч', 'Печатка', 'Браслет', 'Кольчатый'],
      amulet: ['Амулет', 'Кулон', 'Талисман', 'Кристалл', 'Руна'],
      boots: ['Сапоги', 'Каблуки', 'Пояс', 'Доспех', 'Тренер'],
    };
    var suffixes = {
      weapon: ['Грозы', 'Пламени', 'Крови', 'Тени', 'Удара'],
      head: ['Стойкости', 'Мудрости', 'Печати', 'Пламени', 'Твердости'],
      armor: ['Стойкости', 'Горда', 'Твердости', 'Печати', 'Щита'],
      ring: ['Судьбы', 'Власти', 'Света', 'Неистовства', 'Защиты'],
      amulet: ['Радости', 'Знания', 'Власти', 'Света', 'Судьбы'],
      boots: ['Скорости', 'Шага', 'Ветра', 'Тени', 'Силы'],
    };

    var unique = RK.RNG.chance(0.12 + Math.min(0.14, floor * 0.01));
    var label = rareNames[rarity][RK.RNG.int(0, rareNames[rarity].length - 1)];
    var prefix = prefixes[slot][RK.RNG.int(0, prefixes[slot].length - 1)];
    var suffix = suffixes[slot][RK.RNG.int(0, suffixes[slot].length - 1)];
    var name = (unique ? 'Уникальный ' : label + ' ') + prefix + ' ' + suffix;

    if (unique) {
      if (slot === 'weapon') stats.atk += Math.round(floor * 1.8 + 5);
      if (slot === 'head') { stats.def += Math.round(floor * 1.3 + 3); stats.hp += Math.round(floor * 2 + 6); }
      if (slot === 'armor') { stats.def += Math.round(floor * 1.5 + 4); stats.hp += Math.round(floor * 2 + 8); }
      if (slot === 'ring') { stats.luck += 4; stats.hp += Math.round(floor * 1.4 + 4); }
      if (slot === 'amulet') { stats.hp += Math.round(floor * 2.4 + 10); stats.heal += Math.round(floor * 0.8 + 3); }
      if (slot === 'boots') { stats.def += Math.round(floor * 1.2 + 3); stats.luck += 4; }
    }

    var visual = slot === 'weapon' ? 'sword' : slot === 'armor' ? 'shield' : slot === 'boots' ? 'boots' : 'gold';
    return {
      type: visual,
      kind: 'loot',
      x: x,
      y: y,
      name: name,
      slot: slot,
      rarity: rarity,
      unique: unique,
      stats: stats,
      summary: summarizeStats(stats),
      value: Math.round((stats.atk + stats.def + stats.hp + stats.heal + stats.luck) * 3),
      durability: null,
      source: 'floor',
    };
  }

  function spawnPotion(x, y) {
    return {
      type: 'potion',
      kind: 'potion',
      x: x,
      y: y,
      name: 'Зелье лечения',
      heal: RK.CONFIG.POTION_HEAL,
      rarity: 'common',
      summary: '+30 HP',
      value: 15,
    };
  }

  function spawnItems(floor, spawn) {
    var items = [];
    var map = RK.Map;
    var areaScale = map ? Math.sqrt((map.w * map.h) / (C.COLS * C.ROWS)) : 1;
    var n = Math.min(20, Math.round(RK.RNG.int(3, 5) * areaScale));
    var guard = 0;
    while (items.length < n && guard < 120) {
      guard++;
      var t = RK.MapGen.randomFloorNear(spawn.x, spawn.y, map ? Math.max(map.w, map.h) : C.COLS, 2);
      if (!t) continue;
      var occupied = false;
      for (var existing = 0; existing < items.length; existing++) {
        if (items[existing].x === t.x && items[existing].y === t.y) {
          occupied = true;
          break;
        }
      }
      if (occupied) continue;
      var roll = RK.RNG.rand();
      var item;
      if (roll < 0.45) {
        item = { type: 'gold', kind: 'gold', x: t.x, y: t.y, amt: RK.RNG.int(5, 12) * Math.max(1, Math.floor(floor * 0.7)), name: 'Золото', summary: 'Монеты' };
      } else if (roll < 0.6) {
        item = spawnPotion(t.x, t.y);
      } else if (roll < 0.7) {
        item = generateLootItem(floor, t.x, t.y);
      } else if (roll < 0.85) {
        item = generateLootItem(floor, t.x, t.y);
      } else {
        item = { type: 'boots', kind: 'boots', x: t.x, y: t.y, name: 'Сапоги', rarity: 'common', summary: 'Замедление врагов', durability: RK.CONFIG.EQUIPMENT.boots.durability };
      }
      items.push(item);
    }
    return items;
  }

  RK.Items = {
    DEFS: DEFS,
    generateLootItem: generateLootItem,
    spawnPotion: spawnPotion,
    spawnItems: spawnItems,
  };
})();
