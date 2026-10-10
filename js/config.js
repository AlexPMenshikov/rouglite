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
      colors: ['rgba(170, 150, 210, 0.12)', 'rgba(110, 90, 150, 0.17)', 'rgba(210, 190, 230, 0.08)'],
      wallColors: ['rgba(166, 135, 110, 0.15)', 'rgba(112, 95, 118, 0.19)', 'rgba(204, 174, 137, 0.12)'],
    },
    cave: {
      label: 'Влажные пещеры',
      colors: ['rgba(60, 190, 155, 0.14)', 'rgba(35, 130, 115, 0.18)', 'rgba(120, 220, 180, 0.09)'],
      wallColors: ['rgba(63, 135, 108, 0.17)', 'rgba(49, 112, 119, 0.21)', 'rgba(100, 169, 136, 0.12)'],
    },
    crypt: {
      label: 'Склепы',
      colors: ['rgba(90, 145, 220, 0.14)', 'rgba(55, 95, 175, 0.18)', 'rgba(150, 190, 245, 0.09)'],
      wallColors: ['rgba(85, 117, 166, 0.17)', 'rgba(84, 91, 143, 0.21)', 'rgba(126, 151, 187, 0.12)'],
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