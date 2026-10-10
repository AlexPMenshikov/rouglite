window.RK = window.RK || {};

RK.CONFIG = {
  TILE: 32,
  COLS: 32,
  ROWS: 23,

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

  EQUIPMENT: {
    sword: { atk: 4, durability: 10 },
    shield: { def: 3, durability: 10 },
    boots: { durability: 10 },
  },

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