// Конфигурация игры — единственный источник правды для клиента и сервера.
//
// Файл подключается и как браузерный <script> (вешает RK.CONFIG на window),
// и как CommonJS-модуль из server/room-manager.js, который берёт отсюда
// пределы карты и слоты экипировки для валидации сетевых сообщений.
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

  // Пределы карты выводятся из размеров, чтобы серверная валидация
  // координат не расходилась с тем, что рисует клиент.
  var MAP_LIMITS = Object.keys(MAP_SIZES).reduce(function (limits, key) {
    var size = MAP_SIZES[key];
    limits.maxWidth = Math.max(limits.maxWidth, size.width);
    limits.maxHeight = Math.max(limits.maxHeight, size.height);
    return limits;
  }, { maxWidth: 0, maxHeight: 0 });

  return {
    TILE: 32,
    COLS: 32,
    ROWS: 23,

    MAP_SIZES: MAP_SIZES,
    MAP_LIMITS: MAP_LIMITS,
    MAP_STYLES: {
      stone: {
        label: 'Каменные залы',
        colors: ['rgba(190, 145, 105, 0.34)', 'rgba(122, 91, 111, 0.38)', 'rgba(221, 183, 132, 0.28)'],
        wallColors: ['rgba(184, 130, 89, 0.32)', 'rgba(127, 99, 117, 0.36)', 'rgba(218, 174, 126, 0.28)'],
      },
      cave: {
        label: 'Влажные пещеры',
        colors: ['rgba(37, 190, 142, 0.38)', 'rgba(30, 126, 132, 0.42)', 'rgba(111, 220, 172, 0.32)'],
        wallColors: ['rgba(54, 157, 104, 0.36)', 'rgba(36, 121, 137, 0.4)', 'rgba(107, 192, 142, 0.32)'],
      },
      crypt: {
        label: 'Склепы',
        colors: ['rgba(67, 139, 231, 0.36)', 'rgba(71, 84, 184, 0.4)', 'rgba(151, 190, 250, 0.3)'],
        wallColors: ['rgba(76, 119, 191, 0.34)', 'rgba(81, 84, 163, 0.38)', 'rgba(131, 161, 216, 0.3)'],
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
    MAX_FLOOR: 10,

    EFFECT: {
      LIFE: 260,
      MAX_R: 10,
      DAMAGE_LIFE: 720,
    },

    WALK_MS: 95,

    // Боевые константы классов.
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
    DOOR_HP: 6,

    BASE_ENEMIES: 5,
    ENEMIES_PER_FLOOR: 1.8,

    PLAYER: {
      hp: 100,
      atk: 10,
      def: 2,
    },

    XP_BASE: 10,
    XP_GROWTH: 8,
    LEVEL_HP: 5,
    LEVEL_HEAL: 25,
    LEVEL_ATK: 1,

    START_POTIONS: 1,
    POTION_HEAL: 30,

    // Коэффициент, на который удача из мет-прогресса увеличивает найденное золото.
    META_LUCK_GOLD_RATE: 0.15,

    // Слоты экипировки — единственный источник правды для клиента и сервера.
    SLOTS: Object.freeze(['weapon', 'head', 'armor', 'ring', 'amulet', 'boots']),
    SLOT_LABELS: Object.freeze({
      weapon: 'Оружие',
      head: 'Шлем',
      armor: 'Броня',
      ring: 'Кольцо',
      amulet: 'Амулет',
      boots: 'Сапоги',
    }),
    SLOT_BODY_PARTS: Object.freeze({
      weapon: 'в руку',
      head: 'на голову',
      armor: 'на туловище',
      ring: 'на палец',
      amulet: 'на шею',
      boots: 'на ноги',
    }),
    SLOT_ASSETS: Object.freeze({
      weapon: 'sword',
      head: 'head',
      armor: 'armor',
      ring: 'ring',
      amulet: 'amulet',
      boots: 'boots',
    }),
    // Тип спрайта, который показывается в мире. Для оружия зависит от класса
    // игрока, поэтому для слота weapon задано значение по умолчанию.
    SLOT_VISUAL_TYPES: Object.freeze({
      weapon: 'sword',
      head: 'gold',
      armor: 'shield',
      ring: 'gold',
      amulet: 'gold',
      boots: 'boots',
    }),

    RARITIES: Object.freeze(['common', 'rare', 'epic', 'legendary']),
    RARITY_COLORS: Object.freeze({
      common: '#c8c4d8',
      rare: '#65aaff',
      epic: '#d29cff',
      legendary: '#ffd166',
    }),
    RARITY_ORDER: Object.freeze({ common: 0, rare: 1, epic: 2, legendary: 3 }),
    RARITY_MULT: Object.freeze({ common: 1, rare: 1.45, epic: 1.9, legendary: 2.5 }),
    // Мужской род — для названия предмета, женский — для описания редкости.
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

    ZONES: Object.freeze({
      regen: { name: 'зону регенерации', harmful: false, atkBonus: 0, defBonus: 0 },
      attack: { name: 'зону усиления атаки', harmful: false, atkBonus: 3, defBonus: 0 },
      weakAttack: { name: 'зону ослабления атаки', harmful: true, atkBonus: -2, defBonus: 0 },
      weakDefense: { name: 'зону ослабления защиты', harmful: true, atkBonus: 0, defBonus: -2 },
    }),

    // Идентификаторы классов — общий список для клиента и сервера. Сервер
    // сверяет classId по нему же, поэтому новый класс обязан появиться здесь.
    PLAYER_CLASSES: Object.freeze(['tank', 'berserker', 'archer']),

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
    },
  };
}));