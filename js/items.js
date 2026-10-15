(function () {
  var C = RK.CONFIG;

  // Таблицы редкости, ловушек и слотов живут в CONFIG — здесь только алиасы
  // для обратной совместимости с кодом и тестами, обращающимися к RK.Items.
  var RARITY_COLORS = C.RARITY_COLORS;
  var RARITY_ORDER = C.RARITY_ORDER;
  var RARITY_NAMES = C.RARITY_NAMES;
  var TRAP_NAMES = C.TRAP_NAMES;

  // Дальний бой: тип оружия задаёт и спрайт, и названия.
  var WEAPON_TYPES = {
    bow: { type: 'bow', asset: 'bow' },
    crossbow: { type: 'crossbow', asset: 'crossbow' },
  };

  // Ближний бой делится на мечи, секиры и копья; у каждого вида свой спрайт.
  var MELEE_KINDS = {
    sword: ['Двуручный меч', 'Меч', 'Кинжал'],
    axe: ['Топор', 'Секира'],
    spear: ['Пика', 'Копьё'],
  };

  var WEAPON_PREFIXES = {
    bow: ['Лук', 'Длинный лук', 'Короткий лук', 'Охотничий лук'],
    crossbow: ['Арбалет', 'Тяжёлый арбалет', 'Лёгкий арбалет', 'Скорострельный арбалет'],
  };

  var WEAPON_DAMAGE_BONUS = {
    melee: 0,
    bow: 1,
    crossbow: 3,
  };

  function lootRarity(floor, fromBoss, fromEnhanced) {
    var r = RK.RNG.rand();
    if (fromBoss) {
      if (r < 0.45) return 'common';
      if (r < 0.70) return 'rare';
      if (r < 0.92) return 'epic';
      return 'legendary';
    }
    if (fromEnhanced) {
      if (r < 0.45) return 'common';
      if (r < 0.75) return 'rare';
      if (r < 0.95) return 'epic';
      return 'legendary';
    }
    if (r < 0.58) return 'common';
    if (r < 0.82) return 'rare';
    if (r < 0.97) return 'epic';
    return 'legendary';
  }

  function weaponSlotForLoot() {
    var roll = RK.RNG.rand();
    if (roll < 0.20) return 'weapon';
    if (roll < 0.40) return 'head';
    if (roll < 0.62) return 'armor';
    if (roll < 0.78) return 'ring';
    if (roll < 0.86) return 'amulet';
    return 'boots';
  }

  // Спавн оружия по умолчанию: 50/50 ближний и дальний бой.
  function weaponTypeForClass() {
    if (RK.RNG.chance(0.5)) return 'melee';
    return RK.RNG.chance(0.5) ? 'bow' : 'crossbow';
  }

  // Вид ближнего оружия: меч, секира или копьё.
  function meleeKindForLoot() {
    var kinds = Object.keys(MELEE_KINDS);
    return kinds[RK.RNG.int(0, kinds.length - 1)];
  }

  // Спрайт оружия; у ближнего боя совпадает с видом (меч, секира, копьё).
  function weaponLook(weaponType, weaponKind) {
    if (weaponType === 'melee') return { type: weaponKind, asset: weaponKind };
    var def = WEAPON_TYPES[weaponType] || WEAPON_TYPES.bow;
    return { type: def.type, asset: def.asset };
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

  var RARITY_LABELS = {
    common: ['Обычный', 'Простой', 'Рядовой', 'Звериный'],
    rare: ['Редкий', 'Необычный','Странный'],
    epic: ['Эпический', 'Могучий', 'Уникальный'],
    legendary: ['Легендарный', 'Божественный', 'Небесный'],
  };

  var SLOT_PREFIXES = {
    head: ['Шлем', 'Диадема', 'Капюшон', 'Маска'],
    armor: ['Панцирь', 'Кираса', 'Латы', 'Доспех'],
    ring: ['Кольцо', 'Печатка', 'Браслет'],
    amulet: ['Амулет', 'Кулон', 'Талисман', 'Руна'],
    boots: ['Сапоги', 'Ботинки', 'Сандали'],
  };

  var SLOT_SUFFIXES = {
    weapon: ['Грозы', 'Пламени', 'Крови', 'Тени', 'Неистовства', 'Смерти'],
    head: ['Стойкости', 'Мудрости', 'Твердости'],
    armor: ['Стойкости', 'Твердости', 'Защиты'],
    ring: ['Судьбы', 'Власти', 'Света',  'Защиты'],
    amulet: ['Радости', 'Знания', 'Власти', 'Света', 'Судьбы'],
    boots: ['Скорости', 'Ветра', 'Быстроты'],
  };

  function generateLootItem(floor, x, y, fromBoss, fromEnhanced, classId) {
    var slot = weaponSlotForLoot();
    var weaponType = slot === 'weapon' ? weaponTypeForClass(classId) : null;
    var weaponKind = weaponType === 'melee' ? meleeKindForLoot() : null;
    var rarity = lootRarity(floor, fromBoss, fromEnhanced);
    var unique = RK.RNG.chance(fromBoss
      ? 0.45 + Math.min(0.25, floor * 0.025)
      : (fromEnhanced
        ? 0.2 + Math.min(0.2, floor * 0.015)
        : 0.12 + Math.min(0.14, floor * 0.01)));
    if (unique) rarity = 'legendary';
    var mult = C.RARITY_MULT[rarity] || 1;
    var stats = { atk: 0, def: 0, hp: 0, heal: 0, luck: 0 };
    if (slot === 'weapon') {
      stats.atk = Math.round(((RK.RNG.int(2, 6) + floor * 0.8) + WEAPON_DAMAGE_BONUS[weaponType]) * mult);
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

    var labels = RARITY_LABELS[rarity];
    var prefixes = slot === 'weapon'
      ? (weaponType === 'melee' ? MELEE_KINDS[weaponKind] : WEAPON_PREFIXES[weaponType])
      : SLOT_PREFIXES[slot];
    var suffixes = SLOT_SUFFIXES[slot];

    var label = labels[RK.RNG.int(0, labels.length - 1)];
    var prefix = prefixes[RK.RNG.int(0, prefixes.length - 1)];
    var suffix = suffixes[RK.RNG.int(0, suffixes.length - 1)];
    var name = (unique ? 'Уникальный ' : label + ' ') + prefix + ' ' + suffix;

    if (unique) {
      if (slot === 'weapon') stats.atk += Math.round(floor * 1.8 + 5);
      if (slot === 'head') { stats.def += Math.round(floor * 1.3 + 3); stats.hp += Math.round(floor * 2 + 6); }
      if (slot === 'armor') { stats.def += Math.round(floor * 1.5 + 4); stats.hp += Math.round(floor * 2 + 8); }
      if (slot === 'ring') { stats.luck += 4; stats.hp += Math.round(floor * 1.4 + 4); }
      if (slot === 'amulet') { stats.hp += Math.round(floor * 2.4 + 10); stats.heal += Math.round(floor * 0.8 + 3); }
      if (slot === 'boots') { stats.def += Math.round(floor * 1.2 + 3); stats.luck += 4; }
    }

    var look = slot === 'weapon' ? weaponLook(weaponType, weaponKind) : null;
    var visual = slot === 'weapon' ? look.type : C.SLOT_VISUAL_TYPES[slot];
    var asset = slot === 'weapon' ? look.asset : (C.SLOT_ASSETS[slot] || visual);
    var baseStats = { atk: stats.atk, def: stats.def, hp: stats.hp, heal: stats.heal, luck: stats.luck };
    return {
      type: visual,
      asset: asset,
      kind: 'loot',
      x: x,
      y: y,
      name: name,
      color: RARITY_COLORS[rarity],
      slot: slot,
      weaponType: weaponType,
      rarity: rarity,
      unique: unique,
      stats: stats,
      baseStats: baseStats,
      upgradeLevel: 0,
      summary: summarizeStats(stats),
      value: Math.round((stats.atk + stats.def + stats.hp + stats.heal + stats.luck) * 3),
      durability: null,
      source: 'floor',
    };
  }

  function spawnPotion(x, y) {
    return {
      type: 'potion',
      asset: 'potion',
      kind: 'potion',
      x: x,
      y: y,
      name: 'Зелье лечения',
      heal: RK.CONFIG.POTION_HEAL,
      rarity: 'common',
      color: RARITY_COLORS.common,
      summary: '+30 HP',
      value: 15,
      count: 1,
    };
  }

  function spawnKey(x, y, keyId) {
    return {
      type: 'key',
      asset: 'key',
      kind: 'key',
      keyId: keyId || 'iron',
      x: x,
      y: y,
      name: 'Железный ключ',
      rarity: 'common',
      color: '#e3c56e',
      summary: 'Открывает железные замки',
      count: 1,
    };
  }

  function spawnTrapItem(trap, x, y) {
    var type = (trap && trap.type) || 'spike';
    var damage = Math.max(1, (trap && trap.damage) || 5);
    return {
      type: 'trap',
      asset: 'trap',
      kind: 'trap',
      trapType: type,
      trapDamage: damage,
      x: x,
      y: y,
      name: TRAP_NAMES[type] || 'Ловушка',
      rarity: 'rare',
      color: RARITY_COLORS.rare,
      summary: 'Урон ' + damage + ' HP — установить перед собой',
      value: damage * 6,
      count: 1,
    };
  }

  function trapItemName(item) {
    if (!item) return 'Ловушка';
    return item.name || TRAP_NAMES[item.trapType] || 'Ловушка';
  }

  function trapItemDamage(item) {
    return Math.max(1, (item && item.trapDamage) || 5);
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
        item = { type: 'gold', asset: 'gold', kind: 'gold', x: t.x, y: t.y, amt: RK.RNG.int(5, 12) * Math.max(1, Math.floor(floor * 0.7)), name: 'Золото', summary: 'Монеты', rarity: 'common', color: RARITY_COLORS.common };
      } else if (roll < 0.6) {
        item = spawnPotion(t.x, t.y);
      } else {
        item = generateLootItem(floor, t.x, t.y);
      }
      items.push(item);
    }
    return items;
  }

  function getUpgradeCost(item) {
    if (!item || !item.baseStats || item.upgradeLevel >= C.UPGRADE_MAX) return null;
    var baseCost = item.value || 0;
    var levelCost = (item.upgradeLevel || 0) * C.UPGRADE_COST_PER_LEVEL;
    return baseCost + levelCost;
  }

  function upgradeItem(item) {
    if (!item || !item.baseStats) return false;
    var level = item.upgradeLevel || 0;
    if (level >= C.UPGRADE_MAX) return false;
    var mult = C.UPGRADE_STAT_MULT || 0.15;
    var stats = item.stats;
    var base = item.baseStats;
    var changed = false;
    for (var stat in base) {
      if (!Object.prototype.hasOwnProperty.call(base, stat)) continue;
      var baseVal = base[stat];
      if (baseVal > 0) {
        var add = Math.max(1, Math.round(baseVal * mult));
        stats[stat] = (stats[stat] || 0) + add;
        changed = true;
      }
    }
    if (!changed) return false;
    item.upgradeLevel = level + 1;
    item.summary = summarizeStats(stats);
    item.value = Math.round((stats.atk + stats.def + stats.hp + stats.heal + stats.luck) * 3);
    return true;
  }

  RK.Items = {
    RARITY_COLORS: RARITY_COLORS,
    RARITY_ORDER: RARITY_ORDER,
    RARITY_NAMES: RARITY_NAMES,
    TRAP_NAMES: TRAP_NAMES,
    SLOTS: C.SLOTS,
    SLOT_LABELS: C.SLOT_LABELS,
    generateLootItem: generateLootItem,
    weaponTypeForClass: weaponTypeForClass,
    spawnPotion: spawnPotion,
    spawnKey: spawnKey,
    spawnTrapItem: spawnTrapItem,
    trapItemName: trapItemName,
    trapItemDamage: trapItemDamage,
    spawnItems: spawnItems,
    getUpgradeCost: getUpgradeCost,
    upgradeItem: upgradeItem,
  };
})();
