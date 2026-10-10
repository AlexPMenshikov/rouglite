window.RK = window.RK || {};

RK.CONFIG = {
  TILE: 32,
  COLS: 32,
  ROWS: 23,
  MAP_SIZES: {
    compact: { label: 'Компактная — 32 × 23', width: 32, height: 23 },
    medium: { label: 'Большая — 48 × 34', width: 48, height: 34 },
    large: { label: 'Очень большая — 64 × 46', width: 64, height: 46 },
    huge: { label: 'Огромная — 96 × 68', width: 96, height: 68 },
  },
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

  TORCH: {
    SPACING: 5,
    LIGHT_R: 3.2,
    AMBIENT: 0.58,
  },

  BLOOD_MAX: 180,

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