// Единственный источник правды для клиента и сервера. Подключается и как
// браузерный <script> (RK.CONFIG на window), и как CommonJS-модуль из
// server/room-manager.js, который берёт отсюда пределы карты и слоты экипировки.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RK = root.RK || {};
    root.RK.CONFIG = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  var MAP_SIZES = {
    compact: { label: 'Компактная — 32 × 23', width: 32, height: 23 },
    medium: { label: 'Большая — 48 × 34', width: 48, height: 34 },
    large: { label: 'Очень большая — 64 × 46', width: 64, height: 46 },
    huge: { label: 'Огромная — 96 × 68', width: 96, height: 68 },
  };

  // Пределы выводятся из размеров, чтобы серверная валидация координат не расходилась с клиентом.
  var MAP_LIMITS = Object.keys(MAP_SIZES).reduce(function (limits, key) {
    var size = MAP_SIZES[key];
    limits.maxWidth = Math.max(limits.maxWidth, size.width);
    limits.maxHeight = Math.max(limits.maxHeight, size.height);
    return limits;
  }, { maxWidth: 0, maxHeight: 0 });

  // Переходы между локациями — основной флоу; этажи сохраняются как legacy-режим.
  var ENABLE_WORLD = true;

  // Типы локаций — общий справочник для генератора и графа мира.
  var LOCATION_TYPES = Object.freeze({
    city: Object.freeze({ name: 'Город', spawnRate: 0 }),
    wilderness: Object.freeze({ name: 'Дикая природа', spawnRate: 0.6 }),
    mountains: Object.freeze({ name: 'Горы', spawnRate: 0.5 }),
    desert: Object.freeze({ name: 'Пустыня', spawnRate: 0.4 }),
    dungeon: Object.freeze({ name: 'Подземелье', spawnRate: 0.8 }),
    crypt: Object.freeze({ name: 'Склеп', spawnRate: 0.9 }),
    ruins: Object.freeze({ name: 'Руины', spawnRate: 0.7 }),
    sewers: Object.freeze({ name: 'Канализация', spawnRate: 0.6 }),
  });

  // Начальная локация мира.
  var WORLD_START_LOCATION = 'city_start';

  // В каждой не-городской локации есть вход в данж: до DUNGEON_MAX_DEPTH ярусов
  // вглубь, на каждом — враги, предметы и босс своей локации.
  var DUNGEON_MAX_DEPTH = 4;

  // Порядок локаций для разводки боссов по ярусам: ярус N берёт босс из круга
  // BOSS_TYPES со сдвигом на позицию локации. Первые три локации покрывают весь
  // список боссов, поэтому все типы достижимы за один забег.
  var DUNGEON_BOSS_ORDER = Object.freeze([
    'wilderness_forest',
    'dungeon_crypt',
    'dungeon_crypt_deep',
    'wilderness_swamp',
    'dungeon_ruins',
    'dungeon_ruins_deep',
    'wilderness_mountains',
    'dungeon_mountain_cave',
    'dungeon_mountain_deep',
    'wilderness_desert',
    'wilderness_oasis',
    'dungeon_desert_ruins',
    'dungeon_desert_deep',
    'dungeon_sewers',
  ]);

  // Профиль генерации по типу локации: сколько места занимает комната, сколько
  // комнат и связей, какие декорации и вода уместны. Планировку считает и клиент,
  // и сервер из одного кода, поэтому профиль живёт здесь, а не в генераторе.
  // roomScale/roomCountScale/extraLinks — множители базовых значений генератора.
  var DEFAULT_LOCATION_GEN = Object.freeze({
    roomScale: 1,
    roomCountScale: 1,
    extraLinks: 2,
    water: true,
    decorDensity: 0.04,
    decor: Object.freeze(['decorStone', 'decorGrass', 'decorMoss', 'decorMushroom', 'decorPuddle']),
    regionStyles: Object.freeze(['stone', 'cave']),
  });

  var LOCATION_GEN = Object.freeze({
    // Город строится сеткой улиц: профиль комнат ему не нужен, важны только декорации.
    // К своим украшениям город подмешивает декор из других локаций — деревья, кактусы, кости.
    city: Object.freeze({ roomScale: 1, roomCountScale: 1, extraLinks: 0, water: false, decorDensity: 0.03, decor: Object.freeze(['decorStone', 'decorGrass', 'decorMoss', 'decorPuddle', 'decorTree', 'decorPine', 'decorBush', 'decorCactus', 'decorSand', 'decorMushroom', 'decorBones', 'decorFountain', 'fireplace', 'churchCross', 'bench', 'forgeFurnace', 'anvil', 'counterGoods', 'tavernTable', 'tavernChair', 'beerBarrel', 'wineBottle']), regionStyles: Object.freeze(['stone', 'ruins']) }),
    // Дикая местность: только природный декор, деревья и кусты сдвоены.
    wilderness: Object.freeze({ roomScale: 1.7, roomCountScale: 0.7, extraLinks: 1, water: true, decorDensity: 0.12, decor: Object.freeze(['decorTree', 'decorTree', 'decorTree', 'decorBush', 'decorBush', 'decorGrass', 'decorMushroom', 'decorPuddle', 'decorMoss', 'decorFountain']), regionStyles: Object.freeze(['forest', 'cave']) }),
    // Лес, болото и оазис: просторные комнаты, много зелени, вода на месте.
    mountains: Object.freeze({ roomScale: 1.2, roomCountScale: 0.85, extraLinks: 2, water: true, decorDensity: 0.045, decor: Object.freeze(['decorPine', 'decorStone', 'decorMoss', 'decorGrass']), regionStyles: Object.freeze(['mountain', 'ruins']) }),
    // Пустыня: редкие просторные комнаты, кактусы, кости и песок, воды нет.
    desert: Object.freeze({ roomScale: 2, roomCountScale: 0.55, extraLinks: 1, water: false, decorDensity: 0.1, decor: Object.freeze(['decorCactus', 'decorCactus', 'decorSand', 'decorStone', 'decorBones']), regionStyles: Object.freeze(['desert', 'ruins']) }),
    dungeon: Object.freeze({ roomScale: 0.9, roomCountScale: 1.15, extraLinks: 2, water: true, decorDensity: 0.045, decor: Object.freeze(['decorMoss', 'decorMushroom', 'decorPuddle', 'decorStone']), regionStyles: Object.freeze(['cave', 'crypt', 'stone']) }),
    // Склеп: тесные комнаты, частые связи, гробы и кости вместо воды.
    crypt: Object.freeze({ roomScale: 0.7, roomCountScale: 1.3, extraLinks: 3, water: false, decorDensity: 0.05, decor: Object.freeze(['decorCoffin', 'decorCross', 'decorBones', 'decorMushroom']), regionStyles: Object.freeze(['crypt', 'cave']) }),
    ruins: Object.freeze({ roomScale: 1, roomCountScale: 1, extraLinks: 2, water: false, decorDensity: 0.045, decor: Object.freeze(['decorStone', 'decorMoss', 'decorGrass', 'decorBones']), regionStyles: Object.freeze(['ruins', 'stone']) }),
    sewers: Object.freeze({ roomScale: 0.95, roomCountScale: 1.1, extraLinks: 3, water: true, decorDensity: 0.05, decor: Object.freeze(['decorPuddle', 'decorMoss', 'decorMushroom', 'decorStone']), regionStyles: Object.freeze(['sewer', 'cave']) }),
  });

  // NPC города. Внешность и реплики лежат в js/npc.js, а сам список — здесь:
  // сервер проверяет по нему действие «принять задание», поэтому он должен быть
  // одинаковым на клиенте и на сервере.
  var NPC_KINDS = Object.freeze(['merchant', 'blacksmith', 'guard', 'priest', 'scholar', 'ancient_guard', 'innkeeper']);

  // Враги локаций: на каждый тип — свои обитатели. Базовый пул этажа
  // подмешивается с весом 1, локационный — с весом 2, поэтому локация
  // узнаваема, но не однообразна. В городе врагов нет (spawnRate: 0).
  var LOCATION_ENEMIES = Object.freeze({
    city: Object.freeze([]),
    wilderness: Object.freeze(['wolf', 'spider']),
    mountains: Object.freeze(['eagle', 'goat']),
    desert: Object.freeze(['scorpion', 'mummy']),
    dungeon: Object.freeze(['cultist', 'zombie']),
    crypt: Object.freeze(['ghost', 'ghoul']),
    ruins: Object.freeze(['golem']),
    sewers: Object.freeze(['croc']),
  });

  // Базовые мобы (без боссов) — пул для случайных kill-квестов NPC. Клиент и
  // сервер берут из одного места, поэтому список не расходится.
  var BASE_ENEMY_TYPES = Object.freeze(['slime', 'rat', 'skeleton', 'archer', 'bat', 'demon', 'wolf', 'spider', 'eagle', 'goat', 'scorpion', 'mummy', 'cultist', 'zombie', 'ghost', 'ghoul', 'golem', 'croc']);

  // Город строится сеткой улиц: между ними остаются кварталы под здания.
  var CITY_STREETS_PER_AXIS = 4;
  var CITY_STREET_WIDTH = 2;
  // Отступ здания от улиц: стена дома и клетка перед дверью.
  var CITY_BUILDING_INSET = 1;

  return {
    // Тайлы крупнее: 48×48 вместо 32×32.
    TILE: 48,
    // Базовый отсчёт — 1920×1080; поле должно занимать максимум свободного места.
    COLS: 40,
    ROWS: 22,

    MAP_SIZES: MAP_SIZES,
    MAP_LIMITS: MAP_LIMITS,
    ENABLE_WORLD: ENABLE_WORLD,
    LOCATION_TYPES: LOCATION_TYPES,
    WORLD_START_LOCATION: WORLD_START_LOCATION,
    DUNGEON_MAX_DEPTH: DUNGEON_MAX_DEPTH,
    DUNGEON_BOSS_ORDER: DUNGEON_BOSS_ORDER,
    LOCATION_GEN: LOCATION_GEN,
    LOCATION_ENEMIES: LOCATION_ENEMIES,
    BASE_ENEMY_TYPES: BASE_ENEMY_TYPES,
    DEFAULT_LOCATION_GEN: DEFAULT_LOCATION_GEN,
    NPC_KINDS: NPC_KINDS,
    CITY_STREETS_PER_AXIS: CITY_STREETS_PER_AXIS,
    CITY_STREET_WIDTH: CITY_STREET_WIDTH,
    CITY_BUILDING_INSET: CITY_BUILDING_INSET,
    MAP_STYLES: {
      stone: {
        label: 'Каменные залы',
        tint: '116,72,62',
        light: 0.42,
        colors: ['rgba(190, 145, 105, 0.34)', 'rgba(122, 91, 111, 0.38)', 'rgba(221, 183, 132, 0.28)', 'rgba(150, 115, 85, 0.36)', 'rgba(175, 135, 185, 0.34)'],
        wallColors: ['rgba(184, 130, 89, 0.32)', 'rgba(127, 99, 117, 0.36)', 'rgba(218, 174, 126, 0.28)', 'rgba(135, 100, 80, 0.34)', 'rgba(155, 125, 175, 0.34)'],
      },
      cave: {
        label: 'Влажные пещеры',
        tint: '34,96,100',
        light: 0.34,
        colors: ['rgba(37, 190, 142, 0.38)', 'rgba(30, 126, 132, 0.42)', 'rgba(111, 220, 172, 0.32)'],
        wallColors: ['rgba(54, 157, 104, 0.36)', 'rgba(36, 121, 137, 0.4)', 'rgba(107, 192, 142, 0.32)'],
      },
      crypt: {
        label: 'Склепы',
        tint: '72,80,140',
        light: 0.32,
        colors: ['rgba(67, 139, 231, 0.36)', 'rgba(71, 84, 184, 0.4)', 'rgba(151, 190, 250, 0.3)'],
        wallColors: ['rgba(76, 119, 191, 0.34)', 'rgba(81, 84, 163, 0.38)', 'rgba(131, 161, 216, 0.3)'],
      },
      forest: {
        label: 'Лесные чащи',
        tint: '64,102,58',
        light: 0.46,
        colors: ['rgba(74, 122, 66, 0.36)', 'rgba(96, 138, 72, 0.4)', 'rgba(126, 166, 96, 0.3)'],
        wallColors: ['rgba(52, 92, 54, 0.38)', 'rgba(38, 74, 46, 0.4)', 'rgba(74, 112, 62, 0.32)'],
      },
      mountain: {
        label: 'Скалистые горы',
        tint: '104,98,92',
        light: 0.5,
        colors: ['rgba(140, 130, 120, 0.38)', 'rgba(110, 100, 95, 0.42)', 'rgba(170, 160, 150, 0.3)'],
        wallColors: ['rgba(90, 85, 80, 0.36)', 'rgba(70, 65, 60, 0.4)', 'rgba(120, 115, 110, 0.32)'],
      },
      desert: {
        label: 'Песчаная пустыня',
        tint: '150,124,84',
        light: 0.58,
        colors: ['rgba(230, 200, 140, 0.38)', 'rgba(210, 180, 120, 0.42)', 'rgba(240, 220, 170, 0.3)'],
        wallColors: ['rgba(180, 150, 100, 0.36)', 'rgba(160, 130, 90, 0.4)', 'rgba(200, 170, 120, 0.32)'],
      },
      ruins: {
        label: 'Древние руины',
        tint: '110,94,76',
        light: 0.44,
        colors: ['rgba(160, 140, 110, 0.36)', 'rgba(130, 110, 90, 0.4)', 'rgba(180, 160, 130, 0.3)'],
        wallColors: ['rgba(100, 85, 70, 0.34)', 'rgba(85, 70, 55, 0.38)', 'rgba(120, 105, 90, 0.3)'],
      },
      sewer: {
        label: 'Канализация',
        tint: '46,66,52',
        light: 0.36,
        colors: ['rgba(60, 90, 70, 0.38)', 'rgba(45, 70, 55, 0.42)', 'rgba(80, 110, 90, 0.32)'],
        wallColors: ['rgba(35, 55, 45, 0.36)', 'rgba(25, 40, 35, 0.4)', 'rgba(55, 80, 65, 0.32)'],
      },
    },

    LOCKPICK_BASE_CHANCE: 0.55,
    TRAP_DISARM_BASE_CHANCE: 0.54,
    LOCKPICK_MIN_CHANCE: 0.2,
    LOCKPICK_MAX_CHANCE: 0.85,
    TRAP_DISARM_MIN_CHANCE: 0.28,
    TRAP_DISARM_MAX_CHANCE: 0.95,
    LUCK_PER_LOCKPICK_TILE: 100,
    LUCK_PER_DISARM_TILE: 150,
    FLOOR_LOCKPICK_PENALTY: 0.01,

    ROOM_MIN_W: 4,
    ROOM_MAX_W: 8,
    ROOM_MIN_H: 3,
    ROOM_MAX_H: 6,

    VIEW_RADIUS: 7,
    ENEMY_VISION_RADIUS: 6,

    EFFECT: {
      LIFE: 260,
      MAX_R: 10,
      DAMAGE_LIFE: 720,
    },

    WALK_MS: 95,

    RAGE_ATTACK_BONUS: 4,
    BERSERKER_LIFESTEAL: 0.7,
    REFLECT_RATIO: 0.5,
    PRECISE_SHOT_MULTIPLIER: 2,
    FORCE_BREAK_ATK_DIVISOR: 5,

    TORCH: {
      SPACING: 5,
      LIGHT_R: 3.2,
      AMBIENT: 0.58,
    },

    BLOOD_MAX: 180,

    TAVERN_MIN_ROOM_AREA: 30,
    TAVERN_REST_COST: 10,
    TAVERN_RUMORS_COST: 5,
    // Цена блюда у трактирщика = FOODS[i].value × наценка.
    TAVERN_FOOD_MARKUP: 2,

    // Кемпинг: лечение за ход у костра и радиус, в котором враги мешают привалу.
    CAMP_HEAL_PER_TICK: 4,
    CAMP_SAFE_RADIUS: 3,
    UPGRADE_MAX: 5,
    UPGRADE_COST_PER_LEVEL: 50,
    UPGRADE_STAT_MULT: 0.15,

    // Минимальная дистанция от спавна и лестницы для расставляемых объектов.
    SPAWN_CLEARANCE: 4,
    STAIR_CLEARANCE: 3,
    ENEMY_SPAWN_GUARD: 400,
    ENEMY_MAX_COUNT: 100,
    ENEMY_STAIR_CLEARANCE: 3,

    CHEST_ATTEMPTS_PER_CHEST: 80,
    CHEST_KEY_ATTEMPTS: 40,
    WAKE_NOISE_RADIUS: 8,
    CHEST_HP: 3,
    CHEST_CAPACITY: 20,
    DOOR_HP: 6,
    FOOD_MAX_HUNGER: 100,
    FOOD_HUNGER_RESTORE: 28,
    FOOD_HEAL: 5,
    FOOD_DECAY_PER_TURN: 0.2,
    FOODS: Object.freeze([
      Object.freeze({ id: 'bread', name: 'Хлеб', asset: 'bread', hungerRestore: 20, heal: 2, value: 6 }),
      Object.freeze({ id: 'meat', name: 'Мясо', asset: 'meat', hungerRestore: 35, heal: 5, value: 12 }),
      Object.freeze({ id: 'cheese', name: 'Сыр', asset: 'cheese', hungerRestore: 25, heal: 3, value: 8 }),
      Object.freeze({ id: 'apple', name: 'Яблоко', asset: 'apple', hungerRestore: 15, heal: 2, value: 5 }),
      Object.freeze({ id: 'stew', name: 'Тушёное', asset: 'stew', hungerRestore: 45, heal: 8, value: 15 }),
    ]),
    HUNGER_OK_THRESHOLD: 60,
    HUNGER_HUNGRY_THRESHOLD: 30,
    HUNGER_HUNGRY_ATK_PENALTY: 1,
    HUNGER_STARVING_ATK_PENALTY: 2,
    HUNGER_STARVING_DEF_PENALTY: 1,
    HUNGER_STARVING_HP_LOSS: 2,

    BASE_ENEMIES: 5,
    ENEMIES_PER_FLOOR: 1.8,

    PLAYER: {
      hp: 100,
      atk: 10,
      def: 2,
    },

    XP_BASE: 10,
    XP_GROWTH: 8,
    // Потолок уровня: на нём опыт не копится, игра продолжается без прокачки.
    MAX_LEVEL: 10,
    LEVEL_HP: 5,
    LEVEL_HEAL: 25,
    LEVEL_ATK: 1,

    START_POTIONS: 1,
    POTION_HEAL: 30,

    // Множитель золота от удачи мет-прогресса.
    META_LUCK_GOLD_RATE: 0.15,

    // Слоты экипировки — общий источник правды для клиента и сервера.
    // offhand — вторая рука: щит, второе оружие берсерка, отражение двуручного лука.
    SLOTS: Object.freeze(['weapon', 'offhand', 'head', 'armor', 'ring', 'amulet', 'boots']),
    SLOT_LABELS: Object.freeze({
      weapon: 'Оружие',
      offhand: 'Вторая рука',
      head: 'Шлем',
      armor: 'Броня',
      ring: 'Кольцо',
      amulet: 'Амулет',
      boots: 'Сапоги',
    }),
    SLOT_BODY_PARTS: Object.freeze({
      weapon: 'в руку',
      offhand: 'во вторую руку',
      head: 'на голову',
      armor: 'на тело',
      ring: 'на палец',
      amulet: 'на шею',
      boots: 'на ноги',
    }),
    SLOT_ASSETS: Object.freeze({
      weapon: 'sword',
      offhand: 'shield',
      head: 'head',
      armor: 'armor',
      ring: 'ring',
      amulet: 'amulet',
      boots: 'boots',
    }),
    // Тип спрайта в мире; для оружия зависит от класса, поэтому у weapon это лишь запасное значение.
    SLOT_VISUAL_TYPES: Object.freeze({
      weapon: 'sword',
      offhand: 'shield',
      head: 'gold',
      armor: 'shield',
      ring: 'gold',
      amulet: 'gold',
      boots: 'boots',
    }),

    RARITIES: Object.freeze(['common', 'rare', 'epic', 'legendary']),
    // Единый манифест wire-имён действий: клиент и сервер строят по нему
    // псевдонимы, поэтому список существует в одном месте (config.js).
    ACTION_ALIASES: Object.freeze({
      storeInWarehouse: Object.freeze(['storeItem', 'guildStore']),
      useFood: Object.freeze(['eatFood', 'eat', 'consumeFood']),
      templeBlessing: Object.freeze(['applyBlessing', 'blessing', 'applyTempleBlessing']),
      templeHeal: Object.freeze(['heal', 'applyTempleHeal']),
    }),
    // Верхняя граница числа аргументов действия — общая для сервера (ACTION_RULES)
    // и клиента (performAction). Отдельные локальные 5 легко было забыть.
    MAX_ACTION_ARGS: 5,
    // Удача — счётчик улучшения из мет-прогресса хоста. Границы общие для
    // сервера (room-manager, run-store) и клиента, который шлёт своё значение.
    MAX_LUCK: 1000,
    RARITY_COLORS: Object.freeze({
      common: '#c8c4d8',
      rare: '#65aaff',
      epic: '#d29cff',
      legendary: '#ffd166',
    }),
    RARITY_ORDER: Object.freeze({ common: 0, rare: 1, epic: 2, legendary: 3 }),
    RARITY_MULT: Object.freeze({ common: 1, rare: 1.45, epic: 1.9, legendary: 2.5 }),
    RARITY_NAMES: Object.freeze({
      common: 'Обычный',
      rare: 'Редкий',
      epic: 'Эпический',
      legendary: 'Легендарный',
    }),
    RARITY_NAMES_FEMININE: Object.freeze({
      common: 'Обычная',
      rare: 'Редкая',
      epic: 'Эпическая',
      legendary: 'Легендарная',
    }),

    TRAP_TYPES: Object.freeze(['spike', 'needle', 'flame']),
    TRAP_NAMES: Object.freeze({
      spike: 'Шипованная ловушка',
      needle: 'Ловушка с иглами',
      flame: 'Огненная ловушка',
    }),
    TRAP_SPRITES: Object.freeze({
      spike: 'trapSpike',
      needle: 'trapNeedle',
      flame: 'trapFlame',
      armed: 'trapSpike',
      triggered: 'trapTriggered',
      disarmed: 'trapDisarmed',
    }),

    // Одежда мага вместо брони: Плащ, Мантия, Бурка.
    MAGE_ARMOR_KINDS: Object.freeze({
      cloak: 'Плащ',
      mantle: 'Мантия',
      burka: 'Бурка',
    }),

    ZONES: Object.freeze({
      regen: { name: 'зону регенерации', harmful: false, atkBonus: 0, defBonus: 0 },
      attack: { name: 'зону усиления атаки', harmful: false, atkBonus: 3, defBonus: 0 },
      weakAttack: { name: 'зону ослабления атаки', harmful: true, atkBonus: -2, defBonus: 0 },
      weakDefense: { name: 'зону ослабления защиты', harmful: true, atkBonus: 0, defBonus: -2 },
    }),

    // Идентификаторы классов — общий список для клиента и сервера: новый класс обязан появиться здесь.
    // Танк переименован в паладина, поэтому старое имя 'tank' не в списке и падает
    // в 'paladin' общим правилом неизвестного classId.
    PLAYER_CLASSES: Object.freeze(['paladin', 'berserker', 'archer', 'mage']),

    // Палитра затемнения по этажам: один на этаж, дальше по кругу.
    FLOOR_PALETTES: Object.freeze([
      '116,72,62', '74,112,70', '56,105,118', '77,76,143', '130,70,118',
      '146,91,48', '62,113,109', '118,65,52', '86,91,133', '126,112,62',
    ]),

    HOVER_PATH_COLOR: 'rgba(255,224,120,0.45)',
    HOVER_PATH_MAX_STEPS: 5,
    VISIBLE_ALPHA: 1,
    EXPLORED_ALPHA: 0.42,
    HOVER_PATH_DOT: 4,

    META_KEY: 'rogalite_meta_v1',

// Сохранённый забег одиночной игры. Версия растёт при смене формата снимка:
    // старый файл должен молча уйти, а не сломать загрузку.
    SAVE_KEY: 'rogalite_save_v1',
    // Версия 2: NPC локации лежат списком npcs вместо пары merchant/blacksmith.
    // Версия 3: в графе появились узлы данжей и вход в данж в каждой локации.
    SAVE_VERSION: 3,
    // Снимок пишется не на каждом ходу: localStorage синхронный.
    SAVE_EVERY_TURNS: 20,

    COLORS: {
      bg: '#100818',
      floor: '#4e4a68',
      floorDim: '#2a2838',
      wall: '#6b5344',
      wallDim: '#3d3228',
      floorChar: '#3a3550',
      wallChar: '#4a3828',
      stairs: '#8ee3ef',
      player: '#3080e8',
      hover: 'rgba(255,224,120,0.22)',
      // Бордовый конус взгляда героя: куда он смотрит и, значит, чем ударит.
      gaze: '#8b1d2b',
    },
  };
}));