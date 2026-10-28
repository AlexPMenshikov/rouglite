// Генератор PNG-ассетов: тайлсет 16×16, изометрия 64×64, герои и боссы 256×256.
// Использование: node scripts/generate-tileset.js
// Результат: assets/tiny-dungeon.png, assets/tiny-dungeon-iso.png, assets/sprites/*.png

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// Стили локаций берутся из общего конфига: тайлы пола и стен должны совпасть
// с ключами floor_<style>_<v> / wall_<style>_<v> в KENNEY_MAP (js/assets.js).
const CONFIG = require('../js/config');
const STYLE_IDS = Object.keys(CONFIG.MAP_STYLES);
const STYLE_SHADES = 3;
// В изо-атласе пять оттенков: у города пять материалов зданий.
const ISO_SHADES = 5;
// 71 — шаман; стили локаций начинаются с 72 (см. KENNEY_MAP).
const STYLE_START = 72;

const SPR = 16;
// Два дополнительных кадра пламени после тайлов стилей.
const FLAME_FRAME_COUNT = 2;
const COUNT = STYLE_START + STYLE_IDS.length * STYLE_SHADES * 2 + FLAME_FRAME_COUNT;
const WIDTH = SPR * COUNT;
const HEIGHT = SPR;

// --- Пиксельный холст ---
const data = new Uint8Array(WIDTH * HEIGHT * 4);

function set(x, y, r, g, b, a) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const i = (y * WIDTH + x) * 4;
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = a;
}

function rect(x, y, w, h, r, g, b, a) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      set(x + dx, y + dy, r, g, b, a);
}

function tileRect(tx, x, y, w, h, r, g, b, a) {
  rect(tx * SPR + x, y, w, h, r, g, b, a);
}

function tileSet(tx, x, y, r, g, b, a) {
  set(tx * SPR + x, y, r, g, b, a);
}

// Полупрозрачная заливка из rgba() поверх уже нарисованных пикселей тайла.
function overlayColor(tx, css) {
  const m = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/.exec(String(css));
  if (!m) return;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  const a = Math.min(1, Number(m[4]));
  for (let y = 0; y < SPR; y++)
    for (let x = 0; x < SPR; x++) {
      const i = (y * WIDTH + tx * SPR + x) * 4;
      if (data[i + 3] === 0) continue;
      data[i] = Math.round(data[i] * (1 - a) + r * a);
      data[i + 1] = Math.round(data[i + 1] * (1 - a) + g * a);
      data[i + 2] = Math.round(data[i + 2] * (1 - a) + b * a);
    }
}

// --- Палитры ---
const C = {
  transparent: [0, 0, 0, 0],
  floorA: [90, 78, 102, 255],
  floorB: [74, 64, 88, 255],
  floorDim: [42, 38, 54, 255],
  wallA: [126, 110, 136, 255],
  wallB: [82, 72, 92, 255],
  wallDim: [54, 48, 62, 255],
  stair: [60, 54, 70, 255],
  stairHi: [140, 130, 150, 255],
  skin: [230, 180, 130, 255],
  skinDark: [180, 130, 90, 255],
  hair: [80, 50, 30, 255],
  eye: [30, 20, 20, 255],
  cloth: [80, 100, 160, 255],
  clothDark: [50, 65, 110, 255],
  pants: [60, 50, 70, 255],
  boots: [70, 45, 25, 255],
  leather: [140, 100, 60, 255],
  leatherDark: [100, 70, 40, 255],
  metal: [180, 185, 195, 255],
  metalDark: [120, 125, 140, 255],
  gold: [255, 215, 80, 255],
  goldDark: [200, 160, 40, 255],
  wood: [120, 80, 45, 255],
  woodDark: [85, 55, 28, 255],
  slime: [80, 200, 120, 255],
  slimeDark: [50, 150, 85, 255],
  slimeHi: [140, 240, 180, 255],
  rat: [140, 130, 125, 255],
  ratDark: [100, 90, 88, 255],
  ratPink: [220, 140, 130, 255],
  bone: [225, 220, 205, 255],
  boneDark: [170, 165, 150, 255],
  batWing: [130, 100, 160, 255],
  batBody: [90, 70, 120, 255],
  batEar: [160, 130, 190, 255],
  demon: [200, 60, 50, 255],
  demonDark: [150, 35, 30, 255],
  demonHi: [255, 120, 80, 255],
  potion: [200, 30, 40, 255],
  potionGlass: [200, 220, 255, 200],
  potionLight: [255, 100, 100, 255],
  fog: [100, 100, 130, 80],
  flame: [255, 160, 30, 255],
  flameIn: [255, 230, 80, 255],
  flameOut: [255, 80, 20, 255],
  torchWood: [90, 60, 30, 255],
  shield: [60, 80, 160, 255],
  shieldRim: [180, 185, 195, 255],
  shieldEm: [220, 180, 60, 255],
  ring: [255, 215, 80, 255],
  ringGem: [80, 160, 255, 255],
  amulet: [255, 215, 80, 255],
  amuletGem: [200, 40, 60, 255],
  helm: [150, 155, 170, 255],
  helmDark: [100, 105, 120, 255],
  armor: [140, 145, 160, 255],
  armorDark: [90, 95, 115, 255],
  bossPurple: [140, 60, 180, 255],
  bossPurpleDk: [100, 40, 130, 255],
  witchHat: [60, 40, 90, 255],
  witchSkin: [180, 220, 160, 255],
  blacksmith: [160, 100, 60, 255],
  anvil: [80, 80, 95, 255],
  anvilTop: [120, 120, 140, 255],
  chest: [140, 95, 50, 255],
  chestBand: [200, 170, 60, 255],
  door: [130, 85, 40, 255],
  doorFrame: [90, 58, 25, 255],
  doorKnob: [255, 215, 80, 255],
  merchant: [200, 160, 100, 255],
  merchantHat: [180, 60, 50, 255],
  key: [255, 215, 80, 255],
  keyDark: [200, 160, 40, 255],
  swordBlade: [210, 215, 225, 255],
  swordEdge: [255, 255, 255, 255],
  swordGuard: [200, 170, 60, 255],
  swordGrip: [90, 60, 30, 255],
  bow: [130, 85, 40, 255],
  bowString: [220, 210, 180, 255],
  arrow: [180, 140, 80, 255],
  arrowHead: [200, 205, 215, 255],
  arrowTip: [255, 255, 255, 255],
  boneSword: [225, 220, 205, 255],
  lichRobes: [60, 50, 80, 255],
  lichSkull: [225, 220, 205, 255],
  lichEye: [80, 200, 255, 255],
  knightArmor: [70, 75, 90, 255],
  knightPlume: [180, 40, 40, 255],
  brute: [160, 100, 60, 255],
  bruteSkin: [180, 140, 100, 255],
  crown: [255, 215, 80, 255],
  crownDark: [200, 160, 40, 255],
  shamanRobe: [90, 58, 120, 255],
  shamanRobeDk: [74, 48, 96, 255],
  shamanMask: [232, 224, 204, 255],
  shamanMaskDk: [42, 26, 56, 255],
  shamanFeather: [176, 96, 224, 255],
};

// --- Рисование тайлов ---

function drawFloor(tx, dim) {
  const a = dim ? [35, 32, 46, 255] : C.floorA;
  const b = dim ? [28, 25, 38, 255] : C.floorB;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const checker = ((x >> 2) + (y >> 2)) % 2 === 0;
      tileSet(tx, x, y, ...(checker ? a : b));
    }
  // Текстура
  tileSet(tx, 3, 3, 255, 255, 255, 25);
  tileSet(tx, 11, 10, 255, 255, 255, 20);
  tileSet(tx, 7, 7, 0, 0, 0, 20);
}

function drawWall(tx, dim) {
  const a = dim ? [45, 40, 55, 255] : C.wallA;
  const b = dim ? [32, 28, 42, 255] : C.wallB;
  const mortar = dim ? [25, 22, 35, 255] : [55, 48, 62, 255];
  // Кирпичная кладка
  for (let y = 0; y < 16; y++) {
    const row = y >> 2;
    const offset = row % 2 === 0 ? 0 : 4;
    for (let x = 0; x < 16; x++) {
      const bx = (x + offset) >> 2;
      const isMortar = y % 4 === 3 || (x + offset) % 4 === 3;
      tileSet(tx, x, y, ...(isMortar ? mortar : ((bx % 2 === 0) ? a : b)));
    }
  }
  // Блики
  tileSet(tx, 2, 2, 255, 255, 255, 30);
  tileSet(tx, 13, 6, 255, 255, 255, 20);
  // Трещина
  tileSet(tx, 10, 12, 0, 0, 0, 40);
  tileSet(tx, 11, 13, 0, 0, 0, 30);
}

function drawStairs(tx) {
  // Фон
  rect(tx * SPR, 0, SPR, SPR, ...[40, 36, 52, 255]);
  // Ступени, уходящие вниз-вправо
  for (let i = 0; i < 4; i++) {
    const x = 2 + i * 3;
    const y = 2 + i * 3;
    const h = 16 - y;
    tileRect(tx, x, y, 3, h, ...[120, 110, 130, 255]);
    tileRect(tx, x, y, 3, 1, ...[170, 160, 185, 255]); // верхняя грань
    tileRect(tx, x + 2, y, 1, h, ...[68, 60, 84, 255]); // правая тень
  }
  // Тёмный проём над лестницей
  tileRect(tx, 0, 0, 2, 11, ...[26, 23, 36, 255]);
}

function drawHumanoid(tx, opts) {
  const { skin = C.skin, cloth = C.cloth, clothDk = C.clothDark, pants = C.pants, boots = C.boots, hair = C.hair, hat = null, helmet = null, weapon = null, shield = null } = opts || {};
  // Ноги
  tileRect(tx, 5, 12, 2, 3, ...pants);
  tileRect(tx, 9, 12, 2, 3, ...pants);
  // Ботинки
  tileRect(tx, 4, 14, 3, 2, ...boots);
  tileRect(tx, 9, 14, 3, 2, ...boots);
  // Тело
  tileRect(tx, 4, 7, 8, 5, ...cloth);
  tileRect(tx, 4, 11, 8, 1, ...clothDk);
  // Руки
  tileRect(tx, 2, 7, 2, 4, ...cloth);
  tileRect(tx, 12, 7, 2, 4, ...cloth);
  tileRect(tx, 2, 10, 2, 1, ...skin);
  tileRect(tx, 12, 10, 2, 1, ...skin);
  // Голова
  tileRect(tx, 4, 1, 8, 6, ...skin);
  tileRect(tx, 4, 6, 8, 1, ...C.skinDark);
  // Глаза
  tileRect(tx, 5, 4, 1, 1, ...C.eye);
  tileRect(tx, 10, 4, 1, 1, ...C.eye);
  // Рот
  tileRect(tx, 7, 5, 2, 1, ...C.skinDark);
  // Волосы/шлем/шляпа
  if (helmet) {
    tileRect(tx, 3, 0, 10, 3, ...helmet);
    tileRect(tx, 3, 3, 1, 3, ...helmet);
    tileRect(tx, 12, 3, 1, 3, ...helmet);
    tileRect(tx, 6, 0, 4, 1, ...C.metalDark);
  } else if (hat) {
    tileRect(tx, 3, 0, 10, 2, ...hat);
    tileRect(tx, 4, 2, 8, 1, ...hat);
    tileRect(tx, 5, 3, 6, 1, ...C.leatherDark);
  } else if (hair) {
    tileRect(tx, 3, 0, 10, 2, ...hair);
    tileRect(tx, 3, 2, 2, 2, ...hair);
    tileRect(tx, 11, 2, 2, 2, ...hair);
  }
  // Оружие в правой руке
  if (weapon === 'sword') {
    tileRect(tx, 13, 2, 1, 8, ...C.swordBlade);
    tileRect(tx, 14, 2, 1, 8, ...C.swordEdge);
    tileRect(tx, 13, 8, 3, 1, ...C.swordGuard);
    tileRect(tx, 14, 9, 1, 2, ...C.swordGrip);
  } else if (weapon === 'bow') {
    tileRect(tx, 13, 2, 1, 12, ...C.bow);
    tileRect(tx, 14, 3, 1, 1, ...C.bowString);
    tileRect(tx, 14, 12, 1, 1, ...C.bowString);
    tileRect(tx, 14, 4, 1, 8, ...C.bowString);
    tileRect(tx, 13, 7, 2, 1, ...C.arrow);
    tileRect(tx, 12, 6, 1, 3, ...C.arrowHead);
  }
  // Щит в левой руке
  if (shield) {
    tileRect(tx, 0, 6, 3, 7, ...shield);
    tileRect(tx, 0, 6, 3, 1, ...C.shieldRim);
    tileRect(tx, 0, 12, 3, 1, ...C.shieldRim);
    tileRect(tx, 1, 8, 1, 3, ...C.shieldEm);
  }
}

function drawSlime(tx, big) {
  const s = big ? C.bossPurple : C.slime;
  const sd = big ? C.bossPurpleDk : C.slimeDark;
  const sh = big ? [200, 120, 240, 255] : C.slimeHi;
  const bodyH = big ? 12 : 9;
  const bodyW = big ? 14 : 11;
  const x0 = Math.floor((16 - bodyW) / 2);
  const y0 = 15 - bodyH;
  // Тело
  for (let y = 0; y < bodyH; y++) {
    const w = Math.max(3, bodyW - Math.floor(y * 0.6));
    const x = Math.floor((16 - w) / 2);
    tileRect(tx, x, y0 + y, w, 1, ...(y < 2 ? sh : s));
  }
  // Низ
  tileRect(tx, x0, 15, bodyW, 1, ...sd);
  // Глаза
  const ey = y0 + 2;
  tileRect(tx, x0 + 2, ey, 2, 2, ...[255, 255, 255, 255]);
  tileRect(tx, x0 + bodyW - 4, ey, 2, 2, ...[255, 255, 255, 255]);
  tileRect(tx, x0 + 3, ey + 1, 1, 1, ...[30, 20, 20, 255]);
  tileRect(tx, x0 + bodyW - 3, ey + 1, 1, 1, ...[30, 20, 20, 255]);
  // Рот
  tileRect(tx, x0 + Math.floor(bodyW / 2) - 1, ey + 3, 2, 1, ...sd);
  // Корона для босса
  if (big) {
    tileRect(tx, 3, 0, 2, 2, ...C.crown);
    tileRect(tx, 7, 0, 2, 2, ...C.crown);
    tileRect(tx, 11, 0, 2, 2, ...C.crown);
    tileRect(tx, 4, 1, 8, 1, ...C.crownDark);
  }
}

function drawRat(tx, big) {
  const body = big ? [160, 150, 140, 255] : C.rat;
  const dark = big ? [110, 100, 95, 255] : C.ratDark;
  // Тело
  tileRect(tx, 3, 8, 10, 5, ...body);
  tileRect(tx, 2, 9, 12, 3, ...body);
  // Голова
  tileRect(tx, 11, 6, 4, 5, ...body);
  tileRect(tx, 13, 5, 2, 2, ...dark);
  // Уши
  tileRect(tx, 11, 4, 2, 2, ...C.ratPink);
  tileRect(tx, 13, 4, 2, 2, ...C.ratPink);
  // Глаз
  tileRect(tx, 13, 7, 1, 1, ...[30, 20, 20, 255]);
  // Нос
  tileRect(tx, 15, 8, 1, 1, ...[255, 100, 100, 255]);
  // Хвост
  tileRect(tx, 1, 9, 2, 1, ...C.ratPink);
  tileRect(tx, 0, 8, 1, 1, ...C.ratPink);
  // Лапки
  tileRect(tx, 4, 13, 2, 1, ...dark);
  tileRect(tx, 10, 13, 2, 1, ...dark);
  // Корона для босса
  if (big) {
    tileRect(tx, 11, 3, 4, 1, ...C.crown);
    tileRect(tx, 12, 2, 2, 1, ...C.crown);
  }
}

function drawSkeleton(tx, big) {
  const bone = big ? [200, 195, 180, 255] : C.bone;
  const dark = big ? [150, 145, 130, 255] : C.boneDark;
  // Череп
  tileRect(tx, 4, 1, 8, 6, ...bone);
  tileRect(tx, 5, 0, 6, 1, ...bone);
  // Глазницы
  tileRect(tx, 5, 3, 2, 2, ...[20, 15, 20, 255]);
  tileRect(tx, 9, 3, 2, 2, ...[20, 15, 20, 255]);
  // Нос
  tileRect(tx, 7, 5, 2, 1, ...dark);
  // Зубы
  tileRect(tx, 5, 7, 6, 1, ...dark);
  tileRect(tx, 5, 7, 1, 1, ...bone);
  tileRect(tx, 7, 7, 1, 1, ...bone);
  tileRect(tx, 9, 7, 1, 1, ...bone);
  // Позвоночник
  tileRect(tx, 7, 8, 2, 5, ...bone);
  // Рёбра
  tileRect(tx, 5, 9, 6, 1, ...bone);
  tileRect(tx, 5, 11, 6, 1, ...bone);
  tileRect(tx, 6, 10, 4, 1, ...dark);
  // Руки
  tileRect(tx, 3, 9, 2, 1, ...bone);
  tileRect(tx, 11, 9, 2, 1, ...bone);
  tileRect(tx, 2, 9, 1, 4, ...bone);
  tileRect(tx, 13, 9, 1, 4, ...bone);
  // Ноги
  tileRect(tx, 5, 13, 2, 3, ...bone);
  tileRect(tx, 9, 13, 2, 3, ...bone);
  // Корона для босса
  if (big) {
    tileRect(tx, 4, 0, 8, 1, ...C.crown);
    tileRect(tx, 5, 0, 2, 1, ...C.crownDark);
    tileRect(tx, 9, 0, 2, 1, ...C.crownDark);
  }
}

function drawArcher(tx, big) {
  // Тело
  tileRect(tx, 4, 7, 8, 5, ...[80, 120, 70, 255]);
  tileRect(tx, 4, 11, 8, 1, ...[50, 80, 45, 255]);
  // Ноги
  tileRect(tx, 5, 12, 2, 3, ...[60, 50, 40, 255]);
  tileRect(tx, 9, 12, 2, 3, ...[60, 50, 40, 255]);
  tileRect(tx, 4, 14, 3, 2, ...C.boots);
  tileRect(tx, 9, 14, 3, 2, ...C.boots);
  // Голова
  tileRect(tx, 4, 1, 8, 6, ...C.skin);
  // Капюшон
  tileRect(tx, 3, 0, 10, 3, ...[60, 100, 55, 255]);
  tileRect(tx, 3, 3, 2, 3, ...[60, 100, 55, 255]);
  tileRect(tx, 11, 3, 2, 3, ...[60, 100, 55, 255]);
  // Глаза
  tileRect(tx, 5, 4, 1, 1, ...C.eye);
  tileRect(tx, 10, 4, 1, 1, ...C.eye);
  // Лук
  tileRect(tx, 13, 2, 1, 12, ...C.bow);
  tileRect(tx, 14, 3, 1, 1, ...C.bowString);
  tileRect(tx, 14, 12, 1, 1, ...C.bowString);
  tileRect(tx, 14, 4, 1, 8, ...C.bowString);
  tileRect(tx, 13, 7, 2, 1, ...C.arrow);
  tileRect(tx, 12, 6, 1, 3, ...C.arrowHead);
  // Корона для босса
  if (big) {
    tileRect(tx, 4, 0, 8, 1, ...C.crown);
  }
}

function drawBat(tx, big) {
  const wing = big ? [100, 70, 140, 255] : C.batWing;
  const body = big ? [70, 50, 100, 255] : C.batBody;
  const ear = big ? [130, 100, 170, 255] : C.batEar;
  // Крылья
  tileRect(tx, 0, 5, 4, 2, ...wing);
  tileRect(tx, 1, 4, 3, 1, ...wing);
  tileRect(tx, 2, 3, 2, 1, ...wing);
  tileRect(tx, 12, 5, 4, 2, ...wing);
  tileRect(tx, 12, 4, 3, 1, ...wing);
  tileRect(tx, 12, 3, 2, 1, ...wing);
  // Тело
  tileRect(tx, 5, 4, 6, 8, ...body);
  tileRect(tx, 4, 6, 8, 4, ...body);
  // Уши
  tileRect(tx, 5, 2, 2, 2, ...ear);
  tileRect(tx, 9, 2, 2, 2, ...ear);
  // Глаза
  tileRect(tx, 6, 6, 1, 1, ...[255, 50, 50, 255]);
  tileRect(tx, 9, 6, 1, 1, ...[255, 50, 50, 255]);
  // Клыки
  tileRect(tx, 6, 8, 1, 1, ...[255, 255, 255, 255]);
  tileRect(tx, 9, 8, 1, 1, ...[255, 255, 255, 255]);
  // Корона для босса
  if (big) {
    tileRect(tx, 5, 1, 6, 1, ...C.crown);
  }
}

function drawDemon(tx, big) {
  const body = big ? [160, 30, 30, 255] : C.demon;
  const dark = big ? [110, 20, 20, 255] : C.demonDark;
  const hi = big ? [220, 80, 60, 255] : C.demonHi;
  // Тело
  tileRect(tx, 4, 6, 8, 7, ...body);
  tileRect(tx, 5, 5, 6, 1, ...body);
  // Голова
  tileRect(tx, 4, 1, 8, 5, ...body);
  // Рога
  tileRect(tx, 2, 0, 2, 3, ...dark);
  tileRect(tx, 12, 0, 2, 3, ...dark);
  tileRect(tx, 1, 1, 1, 2, ...dark);
  tileRect(tx, 14, 1, 1, 2, ...dark);
  // Глаза
  tileRect(tx, 5, 3, 2, 1, ...[255, 200, 50, 255]);
  tileRect(tx, 9, 3, 2, 1, ...[255, 200, 50, 255]);
  // Рот
  tileRect(tx, 6, 5, 4, 1, ...dark);
  tileRect(tx, 7, 5, 1, 1, ...[255, 255, 255, 255]);
  tileRect(tx, 9, 5, 1, 1, ...[255, 255, 255, 255]);
  // Руки
  tileRect(tx, 2, 7, 2, 3, ...body);
  tileRect(tx, 12, 7, 2, 3, ...body);
  // Ноги
  tileRect(tx, 5, 13, 2, 2, ...dark);
  tileRect(tx, 9, 13, 2, 2, ...dark);
  // Корона для босса
  if (big) {
    tileRect(tx, 3, 0, 10, 1, ...C.crown);
  }
}

function drawBoss(tx) {
  // Большой монстр
  tileRect(tx, 2, 2, 12, 12, ...[100, 60, 140, 255]);
  tileRect(tx, 3, 1, 10, 1, ...[100, 60, 140, 255]);
  tileRect(tx, 4, 0, 8, 1, ...[100, 60, 140, 255]);
  // Глаза
  tileRect(tx, 4, 5, 3, 3, ...[255, 200, 50, 255]);
  tileRect(tx, 9, 5, 3, 3, ...[255, 200, 50, 255]);
  tileRect(tx, 5, 6, 1, 1, ...[30, 20, 20, 255]);
  tileRect(tx, 10, 6, 1, 1, ...[30, 20, 20, 255]);
  // Рот
  tileRect(tx, 5, 9, 6, 2, ...[60, 30, 80, 255]);
  tileRect(tx, 6, 9, 1, 1, ...[255, 255, 255, 255]);
  tileRect(tx, 9, 9, 1, 1, ...[255, 255, 255, 255]);
  // Руки
  tileRect(tx, 0, 5, 2, 4, ...[100, 60, 140, 255]);
  tileRect(tx, 14, 5, 2, 4, ...[100, 60, 140, 255]);
  // Ноги
  tileRect(tx, 4, 14, 3, 2, ...[70, 40, 100, 255]);
  tileRect(tx, 9, 14, 3, 2, ...[70, 40, 100, 255]);
}

function drawGold(tx) {
  // Куча золота
  tileRect(tx, 3, 10, 10, 4, ...C.goldDark);
  tileRect(tx, 4, 8, 8, 2, ...C.gold);
  tileRect(tx, 5, 6, 6, 2, ...C.gold);
  tileRect(tx, 6, 4, 4, 2, ...C.gold);
  // Блики
  tileSet(tx, 5, 5, ...[255, 240, 150, 255]);
  tileSet(tx, 8, 7, ...[255, 240, 150, 255]);
  tileSet(tx, 6, 9, ...[255, 240, 150, 255]);
  // Монеты разбросаны
  tileRect(tx, 1, 12, 3, 2, ...C.gold);
  tileRect(tx, 12, 11, 3, 2, ...C.gold);
  tileRect(tx, 2, 13, 1, 1, ...C.goldDark);
}

function drawPotion(tx) {
  // Колба
  tileRect(tx, 6, 1, 4, 2, ...C.potionGlass);
  tileRect(tx, 5, 3, 6, 2, ...C.potionGlass);
  tileRect(tx, 4, 5, 8, 8, ...C.potionGlass);
  tileRect(tx, 5, 13, 6, 1, ...C.potionGlass);
  // Жидкость
  tileRect(tx, 5, 7, 6, 6, ...C.potion);
  tileRect(tx, 6, 6, 4, 1, ...C.potion);
  // Блик
  tileRect(tx, 6, 8, 1, 4, ...C.potionLight);
  // Пробка
  tileRect(tx, 6, 0, 4, 1, ...[140, 100, 60, 255]);
}

function drawSword(tx) {
  // Клинок
  tileRect(tx, 7, 0, 2, 10, ...C.swordBlade);
  tileRect(tx, 8, 0, 1, 10, ...C.swordEdge);
  tileRect(tx, 7, 0, 1, 1, ...C.swordEdge);
  // Гарда
  tileRect(tx, 5, 10, 6, 1, ...C.swordGuard);
  tileRect(tx, 6, 11, 4, 1, ...C.swordGuard);
  // Рукоять
  tileRect(tx, 7, 12, 2, 3, ...C.swordGrip);
  tileRect(tx, 6, 14, 4, 1, ...[60, 40, 20, 255]);
  // Блик
  tileSet(tx, 7, 2, ...[255, 255, 255, 180]);
  tileSet(tx, 7, 4, ...[255, 255, 255, 120]);
}

function drawAxe(tx) {
  // Древко
  tileRect(tx, 7, 2, 2, 13, ...C.wood);
  tileRect(tx, 7, 2, 1, 13, ...C.woodDark);
  // Лезвие
  tileRect(tx, 3, 2, 5, 5, ...C.metal);
  tileRect(tx, 2, 3, 1, 3, ...C.metalDark);
  tileRect(tx, 4, 1, 3, 1, ...C.metalDark);
  tileRect(tx, 4, 7, 3, 1, ...C.metalDark);
  // Блик
  tileSet(tx, 4, 3, ...[255, 255, 255, 180]);
}

function drawSpear(tx) {
  // Древко
  tileRect(tx, 7, 4, 2, 11, ...C.wood);
  tileRect(tx, 7, 4, 1, 11, ...C.woodDark);
  // Наконечник
  tileRect(tx, 6, 0, 4, 2, ...C.metal);
  tileRect(tx, 7, 2, 2, 3, ...C.metal);
  tileRect(tx, 7, 0, 1, 2, ...C.swordEdge);
  // Обмотка
  tileRect(tx, 6, 13, 4, 1, ...C.leatherDark);
}

function drawFog(tx) {
  // Полупрозрачный туман
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const wave = Math.sin((x + y * 2) * 0.5) * 20 + Math.sin((x * 2 - y) * 0.3) * 15;
      const a = 50 + wave;
      tileSet(tx, x, y, 120, 120, 150, Math.max(20, Math.min(120, a)));
    }
}

function drawKey(tx) {
  // Кольцо
  tileRect(tx, 2, 3, 5, 5, ...C.key);
  tileRect(tx, 3, 4, 3, 3, ...[0, 0, 0, 0]);
  // Стержень
  tileRect(tx, 7, 5, 7, 2, ...C.key);
  // Зубья
  tileRect(tx, 11, 7, 2, 2, ...C.key);
  tileRect(tx, 13, 7, 1, 3, ...C.key);
  // Блик
  tileSet(tx, 3, 4, ...[255, 240, 150, 255]);
}

function drawMerchant(tx) {
  // Тело
  tileRect(tx, 4, 7, 8, 5, ...C.merchant);
  tileRect(tx, 4, 11, 8, 1, ...[160, 120, 70, 255]);
  // Ноги
  tileRect(tx, 5, 12, 2, 3, ...[80, 60, 40, 255]);
  tileRect(tx, 9, 12, 2, 3, ...[80, 60, 40, 255]);
  tileRect(tx, 4, 14, 3, 2, ...C.boots);
  tileRect(tx, 9, 14, 3, 2, ...C.boots);
  // Голова
  tileRect(tx, 4, 1, 8, 6, ...C.skin);
  // Шляпа
  tileRect(tx, 3, 0, 10, 2, ...C.merchantHat);
  tileRect(tx, 4, 2, 8, 1, ...[140, 45, 35, 255]);
  // Глаза
  tileRect(tx, 5, 4, 1, 1, ...C.eye);
  tileRect(tx, 10, 4, 1, 1, ...C.eye);
  // Борода
  tileRect(tx, 6, 5, 4, 2, ...[200, 200, 200, 255]);
  tileRect(tx, 7, 7, 2, 1, ...[200, 200, 200, 255]);
  // Товар
  tileRect(tx, 13, 10, 2, 2, ...C.gold);
}

function drawDoor(tx) {
  // Рама
  tileRect(tx, 3, 0, 10, 16, ...C.doorFrame);
  // Полотно
  tileRect(tx, 4, 1, 8, 15, ...C.door);
  // Доски
  tileRect(tx, 6, 2, 1, 13, ...C.woodDark);
  tileRect(tx, 9, 2, 1, 13, ...C.woodDark);
  // Кольца
  tileRect(tx, 4, 4, 8, 1, ...C.woodDark);
  tileRect(tx, 4, 10, 8, 1, ...C.woodDark);
  // Ручка
  tileRect(tx, 11, 7, 2, 2, ...C.doorKnob);
}

function drawChest(tx) {
  // Тело
  tileRect(tx, 3, 6, 10, 8, ...C.chest);
  // Крышка
  tileRect(tx, 2, 3, 12, 3, ...C.chest);
  tileRect(tx, 3, 2, 10, 1, ...C.chest);
  // Полосы
  tileRect(tx, 3, 6, 10, 1, ...C.chestBand);
  tileRect(tx, 3, 12, 10, 1, ...C.chestBand);
  // Замок
  tileRect(tx, 7, 5, 2, 3, ...C.gold);
  tileSet(tx, 7, 6, ...[200, 160, 40, 255]);
  // Блик
  tileSet(tx, 4, 3, ...[200, 160, 100, 255]);
}

function drawTorch(tx) {
  // Держатель
  tileRect(tx, 7, 6, 2, 9, ...C.torchWood);
  tileRect(tx, 6, 14, 4, 2, ...C.woodDark);
  // Обмотка
  tileRect(tx, 6, 5, 4, 2, ...C.leatherDark);
  // Чаша
  tileRect(tx, 6, 3, 4, 2, ...C.metalDark);
  tileRect(tx, 5, 4, 6, 1, ...C.metalDark);
}

function drawFlame(tx, frame) {
  // Кадры отличаются сдвигом вершины и языков: огонь колышется.
  const sx = frame === 1 ? -1 : (frame === 2 ? 1 : 0);
  const lift = frame === 1 ? 1 : 0;
  // Внешнее пламя
  tileRect(tx, 5 + sx, 2 - lift, 6, 2, ...C.flameOut);
  tileRect(tx, 4 + sx, 4 - lift, 8, 4, ...C.flameOut);
  tileRect(tx, 3, 6, 10, 4, ...C.flameOut);
  tileRect(tx, 4, 10, 8, 3, ...C.flameOut);
  tileRect(tx, 5, 13, 6, 2, ...C.flameOut);
  // Среднее пламя
  tileRect(tx, 6 + sx, 4 - lift, 4, 2, ...C.flame);
  tileRect(tx, 5, 6, 6, 4, ...C.flame);
  tileRect(tx, 6, 10, 4, 3, ...C.flame);
  tileRect(tx, 7, 13, 2, 1, ...C.flame);
  // Внутреннее пламя
  tileRect(tx, 7 + sx, 6 - lift, 2, 2, ...C.flameIn);
  tileRect(tx, 7, 9, 2, 3, ...C.flameIn);
  tileRect(tx, 8, 12, 1, 1, ...C.flameIn);
}

function drawShield(tx) {
  // Щит
  tileRect(tx, 3, 2, 10, 8, ...C.shield);
  tileRect(tx, 4, 1, 8, 1, ...C.shield);
  tileRect(tx, 5, 0, 6, 1, ...C.shield);
  tileRect(tx, 3, 10, 10, 1, ...C.shieldRim);
  tileRect(tx, 4, 11, 8, 1, ...C.shieldRim);
  tileRect(tx, 5, 12, 6, 1, ...C.shieldRim);
  tileRect(tx, 6, 13, 4, 1, ...C.shieldRim);
  tileRect(tx, 7, 14, 2, 1, ...C.shieldRim);
  // Окаймление
  tileRect(tx, 3, 2, 1, 8, ...C.shieldRim);
  tileRect(tx, 12, 2, 1, 8, ...C.shieldRim);
  // Эмблема
  tileRect(tx, 6, 5, 4, 4, ...C.shieldEm);
  tileRect(tx, 7, 4, 2, 6, ...C.shieldEm);
}

function drawBoots(tx) {
  // Левый ботинок
  tileRect(tx, 2, 8, 5, 4, ...C.leather);
  tileRect(tx, 2, 12, 5, 3, ...C.leatherDark);
  tileRect(tx, 1, 14, 6, 2, ...C.leatherDark);
  // Правый ботинок
  tileRect(tx, 9, 6, 5, 4, ...C.leather);
  tileRect(tx, 9, 10, 5, 3, ...C.leatherDark);
  tileRect(tx, 8, 12, 6, 2, ...C.leatherDark);
  // Отвороты
  tileRect(tx, 2, 8, 5, 1, ...[180, 140, 90, 255]);
  tileRect(tx, 9, 6, 5, 1, ...[180, 140, 90, 255]);
}

function drawRing(tx) {
  // Кольцо
  tileRect(tx, 4, 6, 8, 6, ...C.ring);
  tileRect(tx, 5, 5, 6, 1, ...C.ring);
  tileRect(tx, 5, 12, 6, 1, ...C.ring);
  tileRect(tx, 4, 7, 1, 4, ...C.ring);
  tileRect(tx, 11, 7, 1, 4, ...C.ring);
  // Камень
  tileRect(tx, 6, 3, 4, 3, ...C.ringGem);
  tileRect(tx, 7, 2, 2, 1, ...C.ringGem);
  tileSet(tx, 7, 3, ...[150, 200, 255, 255]);
}

function drawAmulet(tx) {
  // Цепочка
  tileRect(tx, 7, 0, 2, 2, ...C.amulet);
  tileRect(tx, 6, 2, 4, 2, ...C.amulet);
  tileRect(tx, 5, 4, 6, 2, ...C.amulet);
  // Кулон
  tileRect(tx, 4, 6, 8, 6, ...C.amulet);
  tileRect(tx, 5, 12, 6, 1, ...C.amulet);
  // Камень
  tileRect(tx, 6, 7, 4, 4, ...C.amuletGem);
  tileSet(tx, 7, 8, ...[255, 100, 120, 255]);
}

function drawHead(tx) {
  // Шлем
  tileRect(tx, 3, 2, 10, 3, ...C.helm);
  tileRect(tx, 4, 1, 8, 1, ...C.helm);
  tileRect(tx, 5, 0, 6, 1, ...C.helm);
  // Защита
  tileRect(tx, 3, 5, 2, 6, ...C.helm);
  tileRect(tx, 11, 5, 2, 6, ...C.helm);
  tileRect(tx, 3, 11, 10, 2, ...C.helmDark);
  // Щель
  tileRect(tx, 6, 5, 4, 1, ...[30, 25, 35, 255]);
  // Ноздри
  tileRect(tx, 7, 8, 2, 1, ...C.helmDark);
  // Блик
  tileSet(tx, 5, 2, ...[200, 205, 220, 255]);
}

function drawArmor(tx) {
  // Нагрудник
  tileRect(tx, 3, 3, 10, 8, ...C.armor);
  tileRect(tx, 4, 2, 8, 1, ...C.armor);
  tileRect(tx, 5, 1, 6, 1, ...C.armor);
  // Плечи
  tileRect(tx, 1, 4, 2, 4, ...C.armor);
  tileRect(tx, 13, 4, 2, 4, ...C.armor);
  // Детали
  tileRect(tx, 5, 5, 6, 1, ...C.armorDark);
  tileRect(tx, 5, 7, 6, 1, ...C.armorDark);
  tileRect(tx, 7, 3, 2, 6, ...C.armorDark);
  // Пояс
  tileRect(tx, 3, 11, 10, 2, ...C.leatherDark);
  tileRect(tx, 7, 11, 2, 2, ...C.gold);
}

function drawWitch(tx) {
  // Тело (платье)
  tileRect(tx, 4, 7, 8, 7, ...[80, 50, 100, 255]);
  tileRect(tx, 5, 12, 6, 2, ...[80, 50, 100, 255]);
  // Голова
  tileRect(tx, 4, 2, 8, 5, ...C.witchSkin);
  // Шляпа
  tileRect(tx, 5, 0, 6, 2, ...C.witchHat);
  tileRect(tx, 6, 2, 4, 1, ...C.witchHat);
  tileRect(tx, 7, 3, 2, 1, ...C.witchHat);
  tileRect(tx, 4, 1, 8, 1, ...C.witchHat);
  // Глаза
  tileRect(tx, 5, 4, 1, 1, ...[255, 200, 50, 255]);
  tileRect(tx, 10, 4, 1, 1, ...[255, 200, 50, 255]);
  // Нос
  tileRect(tx, 7, 5, 2, 1, ...[140, 180, 120, 255]);
  // Бородавка
  tileSet(tx, 9, 5, ...[100, 140, 80, 255]);
}

function drawKnight(tx) {
  // Тело
  tileRect(tx, 4, 7, 8, 5, ...C.knightArmor);
  tileRect(tx, 4, 11, 8, 1, ...[50, 55, 70, 255]);
  // Ноги
  tileRect(tx, 5, 12, 2, 3, ...C.knightArmor);
  tileRect(tx, 9, 12, 2, 3, ...C.knightArmor);
  tileRect(tx, 4, 14, 3, 2, ...[40, 45, 60, 255]);
  tileRect(tx, 9, 14, 3, 2, ...[40, 45, 60, 255]);
  // Голова
  tileRect(tx, 4, 1, 8, 6, ...C.knightArmor);
  // Шлем
  tileRect(tx, 3, 0, 10, 3, ...C.knightArmor);
  tileRect(tx, 3, 3, 1, 3, ...C.knightArmor);
  tileRect(tx, 12, 3, 1, 3, ...C.knightArmor);
  // Плюмаж
  tileRect(tx, 6, 0, 4, 1, ...C.knightPlume);
  tileRect(tx, 7, 0, 2, 1, ...C.knightPlume);
  // Глаза
  tileRect(tx, 5, 4, 1, 1, ...[200, 50, 50, 255]);
  tileRect(tx, 10, 4, 1, 1, ...[200, 50, 50, 255]);
  // Щель
  tileRect(tx, 6, 6, 4, 1, ...[20, 20, 30, 255]);
}

function drawBrute(tx) {
  // Тело
  tileRect(tx, 3, 6, 10, 7, ...C.brute);
  tileRect(tx, 4, 5, 8, 1, ...C.brute);
  // Голова
  tileRect(tx, 4, 1, 8, 5, ...C.bruteSkin);
  // Глаза
  tileRect(tx, 5, 3, 2, 1, ...[255, 100, 50, 255]);
  tileRect(tx, 9, 3, 2, 1, ...[255, 100, 50, 255]);
  // Рот
  tileRect(tx, 6, 5, 4, 1, ...[100, 60, 40, 255]);
  // Руки
  tileRect(tx, 1, 7, 2, 4, ...C.brute);
  tileRect(tx, 13, 7, 2, 4, ...C.brute);
  tileRect(tx, 0, 10, 3, 2, ...C.bruteSkin);
  tileRect(tx, 13, 10, 3, 2, ...C.bruteSkin);
  // Ноги
  tileRect(tx, 5, 13, 2, 2, ...[100, 70, 45, 255]);
  tileRect(tx, 9, 13, 2, 2, ...[100, 70, 45, 255]);
}

function drawLich(tx) {
  // Мантия
  tileRect(tx, 4, 7, 8, 7, ...C.lichRobes);
  tileRect(tx, 5, 12, 6, 2, ...C.lichRobes);
  tileRect(tx, 4, 14, 8, 1, ...[40, 35, 55, 255]);
  // Голова (череп)
  tileRect(tx, 4, 1, 8, 6, ...C.lichSkull);
  // Глаза
  tileRect(tx, 5, 3, 2, 2, ...C.lichEye);
  tileRect(tx, 9, 3, 2, 2, ...C.lichEye);
  // Нос
  tileRect(tx, 7, 5, 2, 1, ...C.boneDark);
  // Корона
  tileRect(tx, 4, 0, 8, 1, ...C.crown);
  tileRect(tx, 5, 0, 2, 1, ...C.crownDark);
  tileRect(tx, 9, 0, 2, 1, ...C.crownDark);
  // Руки
  tileRect(tx, 2, 8, 2, 3, ...C.lichRobes);
  tileRect(tx, 12, 8, 2, 3, ...C.lichRobes);
  tileRect(tx, 1, 10, 3, 1, ...C.lichSkull);
  tileRect(tx, 12, 10, 3, 1, ...C.lichSkull);
}

function drawBlacksmith(tx) {
  // Тело
  tileRect(tx, 4, 7, 8, 5, ...C.blacksmith);
  tileRect(tx, 4, 11, 8, 1, ...[120, 75, 40, 255]);
  // Ноги
  tileRect(tx, 5, 12, 2, 3, ...[60, 45, 30, 255]);
  tileRect(tx, 9, 12, 2, 3, ...[60, 45, 30, 255]);
  tileRect(tx, 4, 14, 3, 2, ...C.boots);
  tileRect(tx, 9, 14, 3, 2, ...C.boots);
  // Голова
  tileRect(tx, 4, 1, 8, 6, ...C.skin);
  // Повязка
  tileRect(tx, 3, 0, 10, 2, ...[80, 50, 30, 255]);
  // Глаза
  tileRect(tx, 5, 4, 1, 1, ...C.eye);
  tileRect(tx, 10, 4, 1, 1, ...C.eye);
  // Борода
  tileRect(tx, 6, 5, 4, 2, ...[60, 40, 25, 255]);
  // Молот
  tileRect(tx, 13, 3, 2, 8, ...C.woodDark);
  tileRect(tx, 12, 2, 4, 2, ...C.anvilTop);
  // Напальник
  tileRect(tx, 0, 10, 3, 4, ...C.anvil);
  tileRect(tx, 1, 9, 2, 1, ...C.anvilTop);
}

// --- Главная функция ---
// --- Городские референсы ---
function drawFountain(tx) {
  // Чаша фонтана.
  tileRect(tx, 2, 2, 12, 12, 48, 132, 180, 255);
  tileRect(tx, 3, 3, 10, 10, 70, 165, 210, 255);
  tileRect(tx, 5, 5, 6, 6, 30, 100, 150, 255);
  // Бортик.
  tileRect(tx, 1, 1, 14, 1, 180, 210, 235, 255);
  tileRect(tx, 1, 14, 14, 1, 180, 210, 235, 255);
  tileRect(tx, 1, 1, 1, 14, 180, 210, 235, 255);
  tileRect(tx, 14, 1, 1, 14, 180, 210, 235, 255);
  // Струя.
  tileRect(tx, 7, 0, 2, 6, 220, 240, 255, 255);
  tileSet(tx, 7, 1, 255, 255, 255, 220);
  tileSet(tx, 8, 3, 255, 255, 255, 180);
}

function drawTree(tx) {
  // Крона.
  tileRect(tx, 3, 0, 10, 8, 45, 110, 55, 255);
  tileRect(tx, 1, 3, 14, 6, 55, 125, 65, 255);
  tileRect(tx, 5, 0, 6, 3, 70, 150, 80, 255);
  // Ствол.
  tileRect(tx, 7, 8, 2, 8, 95, 62, 35, 255);
  tileRect(tx, 6, 12, 4, 4, 70, 45, 24, 255);
}

function drawFlowerBed(tx) {
  // Земля/клумба.
  tileRect(tx, 1, 10, 14, 5, 70, 48, 30, 255);
  tileRect(tx, 2, 8, 12, 4, 95, 70, 42, 255);
  // Цветы.
  tileSet(tx, 4, 6, 240, 80, 120, 255);
  tileSet(tx, 6, 5, 255, 210, 60, 255);
  tileSet(tx, 9, 6, 120, 80, 220, 255);
  tileSet(tx, 11, 5, 80, 180, 120, 255);
  tileSet(tx, 5, 8, 255, 120, 60, 255);
  tileSet(tx, 8, 8, 200, 80, 100, 255);
  tileSet(tx, 10, 9, 220, 200, 60, 255);
}

function drawWallWindow(tx) {
  // Базовая кирпичная стена.
  drawWall(tx, false);
  // Проём окна.
  tileRect(tx, 4, 3, 8, 8, 120, 190, 230, 255);
  tileRect(tx, 5, 4, 6, 6, 90, 160, 210, 255);
  // Рама.
  tileRect(tx, 3, 3, 1, 8, 90, 58, 25, 255);
  tileRect(tx, 12, 3, 1, 8, 90, 58, 25, 255);
  tileRect(tx, 3, 3, 10, 1, 90, 58, 25, 255);
  tileRect(tx, 3, 10, 10, 1, 90, 58, 25, 255);
  tileRect(tx, 7, 3, 1, 8, 90, 58, 25, 255);
  tileRect(tx, 3, 6, 10, 1, 90, 58, 25, 255);
  // Блик.
  tileSet(tx, 5, 4, 230, 245, 255, 220);
}

function drawBuildingFloorStone(tx) {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const checker = ((x >> 2) + (y >> 2)) % 2 === 0;
      tileSet(tx, x, y, ...(checker ? [135, 100, 80, 255] : [110, 82, 65, 255]));
    }
}

function drawBuildingFloorPlaster(tx) {
  tileRect(tx, 0, 0, 16, 16, 185, 175, 150, 255);
  for (let y = 0; y < 16; y += 4)
    for (let x = (y / 4) % 2 ? 2 : 0; x < 16; x += 4)
      tileRect(tx, x, y, 3, 3, 210, 200, 175, 255);
}

function drawBuildingFloorWood(tx) {
  for (let y = 0; y < 16; y++) {
    const shade = y % 4 === 3 ? 70 : 120;
    for (let x = 0; x < 16; x++) tileSet(tx, x, y, 100, 65, shade, 255);
  }
  for (let x = 2; x < 16; x += 5) tileRect(tx, x, 0, 1, 16, 70, 45, 24, 255);
}

function drawBuildingWallBrick(tx) {
  drawWall(tx, false);
  for (let i = 0; i < 4; i++) tileSet(tx, 1 + i * 4, 1 + i, 90, 58, 25, 255);
}

function drawBuildingWallPlaster(tx) {
  tileRect(tx, 0, 0, 16, 16, 190, 180, 155, 255);
  tileRect(tx, 0, 14, 16, 2, 140, 125, 105, 255);
  tileRect(tx, 0, 0, 2, 16, 140, 125, 105, 255);
  tileRect(tx, 14, 0, 2, 16, 140, 125, 105, 255);
  tileSet(tx, 6, 6, 120, 110, 95, 120);
}

function drawBuildingWallTimber(tx) {
  tileRect(tx, 0, 0, 16, 16, 175, 145, 95, 255);
  for (let y = 0; y < 16; y += 4) tileRect(tx, 0, y, 16, 1, 95, 62, 35, 255);
  for (let x = 0; x < 16; x += 4) tileRect(tx, x, 0, 1, 16, 95, 62, 35, 255);
  tileRect(tx, 1, 1, 3, 3, 120, 90, 55, 255);
  tileRect(tx, 12, 1, 3, 3, 120, 90, 55, 255);
}

// --- Мебель города и таверны ---
function drawFireplace(tx) {
  tileRect(tx, 1, 8, 14, 8, 70, 48, 34, 255);
  tileRect(tx, 2, 2, 12, 8, 100, 72, 48, 255);
  tileRect(tx, 3, 9, 10, 5, 25, 20, 16, 255);
  tileRect(tx, 4, 10, 8, 3, 220, 80, 30, 255);
  tileRect(tx, 5, 9, 6, 1, 255, 190, 60, 255);
  tileSet(tx, 7, 7, 255, 240, 120, 220);
}

function drawChurchCross(tx) {
  tileRect(tx, 7, 1, 2, 14, 160, 145, 110, 255);
  tileRect(tx, 2, 5, 12, 2, 160, 145, 110, 255);
  tileSet(tx, 7, 0, 230, 220, 190, 255);
  tileSet(tx, 8, 0, 230, 220, 190, 255);
}

function drawBench(tx) {
  tileRect(tx, 1, 9, 14, 3, 105, 72, 40, 255);
  tileRect(tx, 2, 8, 12, 1, 140, 100, 60, 255);
  tileRect(tx, 2, 12, 2, 3, 75, 52, 28, 255);
  tileRect(tx, 12, 12, 2, 3, 75, 52, 28, 255);
}

function drawForgeFurnace(tx) {
  tileRect(tx, 2, 4, 12, 12, 75, 60, 48, 255);
  tileRect(tx, 3, 5, 10, 5, 25, 20, 16, 255);
  tileRect(tx, 4, 6, 8, 3, 230, 90, 30, 255);
  tileRect(tx, 5, 5, 6, 1, 255, 200, 70, 255);
  tileRect(tx, 2, 1, 12, 3, 110, 85, 60, 255);
  tileSet(tx, 1, 2, 160, 130, 100, 255);
}

function drawAnvil(tx) {
  tileRect(tx, 3, 8, 10, 4, 95, 95, 110, 255);
  tileRect(tx, 5, 6, 6, 2, 125, 125, 145, 255);
  tileRect(tx, 4, 12, 8, 3, 60, 60, 75, 255);
  tileSet(tx, 4, 6, 160, 165, 185, 255);
}

function drawCounterGoods(tx) {
  tileRect(tx, 1, 9, 14, 5, 110, 75, 45, 255);
  tileRect(tx, 2, 8, 12, 1, 150, 110, 65, 255);
  tileRect(tx, 3, 6, 3, 3, 200, 50, 50, 255);
  tileRect(tx, 7, 5, 3, 4, 60, 120, 60, 255);
  tileRect(tx, 11, 6, 3, 3, 230, 180, 50, 255);
}

function drawTavernTable(tx) {
  tileRect(tx, 2, 7, 12, 3, 110, 75, 45, 255);
  tileRect(tx, 3, 6, 10, 1, 150, 110, 65, 255);
  tileRect(tx, 3, 10, 2, 5, 75, 52, 28, 255);
  tileRect(tx, 11, 10, 2, 5, 75, 52, 28, 255);
}

function drawTavernChair(tx) {
  tileRect(tx, 4, 8, 8, 3, 105, 72, 40, 255);
  tileRect(tx, 5, 4, 6, 4, 110, 78, 45, 255);
  tileRect(tx, 4, 11, 2, 4, 75, 52, 28, 255);
  tileRect(tx, 10, 11, 2, 4, 75, 52, 28, 255);
}

function drawBeerBarrel(tx) {
  tileRect(tx, 3, 4, 10, 9, 95, 62, 32, 255);
  tileRect(tx, 2, 6, 12, 5, 110, 75, 42, 255);
  tileRect(tx, 3, 3, 10, 1, 60, 40, 20, 255);
  tileRect(tx, 3, 12, 10, 1, 60, 40, 20, 255);
  tileRect(tx, 6, 7, 4, 2, 160, 120, 60, 255);
}

function drawWineBottle(tx) {
  tileRect(tx, 6, 1, 4, 3, 60, 85, 50, 255);
  tileRect(tx, 5, 4, 6, 9, 90, 30, 40, 255);
  tileRect(tx, 5, 7, 6, 4, 150, 30, 50, 255);
  tileSet(tx, 6, 4, 220, 190, 220, 160);
}

function drawBread(tx) {
  tileRect(tx, 3, 7, 10, 6, 200, 144, 80, 255);
  tileRect(tx, 4, 6, 8, 2, 224, 168, 96, 255);
}

function drawMeat(tx) {
  tileRect(tx, 2, 6, 12, 6, 184, 64, 56, 255);
  tileRect(tx, 3, 5, 10, 2, 216, 112, 96, 255);
  tileRect(tx, 5, 7, 3, 2, 138, 40, 32, 255);
}

function drawCheese(tx) {
  tileRect(tx, 3, 5, 10, 7, 232, 200, 64, 255);
  tileRect(tx, 4, 4, 8, 2, 240, 216, 96, 255);
}

function drawApple(tx) {
  tileRect(tx, 5, 5, 6, 7, 216, 48, 48, 255);
  tileRect(tx, 4, 6, 2, 4, 232, 80, 80, 255);
  tileRect(tx, 7, 3, 1, 2, 106, 138, 48, 255);
}

function drawStew(tx) {
  tileRect(tx, 3, 7, 10, 6, 106, 80, 56, 255);
  tileRect(tx, 4, 4, 8, 4, 160, 120, 80, 255);
  tileRect(tx, 5, 5, 6, 2, 208, 80, 32, 255);
}

function drawMagicOrb(tx) {
  // Магический Шар — offhand для мага.
  tileRect(tx, 5, 3, 6, 10, 58, 42, 90, 255);
  tileRect(tx, 4, 5, 8, 6, 90, 74, 138, 255);
  tileRect(tx, 6, 2, 4, 3, 122, 106, 170, 255);
  tileSet(tx, 7, 4, 176, 160, 224, 255);
  tileSet(tx, 8, 5, 144, 128, 192, 255);
  tileSet(tx, 7, 8, 106, 90, 154, 255);
}

function drawCloak(tx) {
  // Плащ — одежда мага.
  tileRect(tx, 4, 2, 8, 12, 74, 58, 106, 255);
  tileRect(tx, 3, 3, 10, 8, 90, 74, 122, 255);
  tileRect(tx, 5, 1, 6, 3, 106, 90, 138, 255);
  tileSet(tx, 7, 2, 138, 122, 170, 255);
  tileSet(tx, 6, 4, 58, 42, 90, 255);
}

function drawMantle(tx) {
  // Мантия — одежда мага.
  tileRect(tx, 4, 2, 8, 12, 90, 42, 58, 255);
  tileRect(tx, 3, 3, 10, 8, 122, 58, 74, 255);
  tileRect(tx, 5, 1, 6, 3, 138, 74, 90, 255);
  tileSet(tx, 7, 2, 176, 106, 122, 255);
  tileSet(tx, 6, 4, 74, 26, 42, 255);
}

function drawBurka(tx) {
  // Бурка — одежда мага.
  tileRect(tx, 4, 2, 8, 12, 58, 58, 42, 255);
  tileRect(tx, 3, 3, 10, 8, 90, 90, 58, 255);
  tileRect(tx, 5, 1, 6, 3, 106, 106, 74, 255);
  tileSet(tx, 7, 2, 138, 138, 90, 255);
  tileSet(tx, 6, 4, 42, 42, 26, 255);
}

// Шаман: маска из черепа, перья, посох с черепом.
function drawShaman(tx) {
  // Убор с перьями.
  tileRect(tx, 4, 2, 8, 2, ...C.shamanRobeDk);
  tileRect(tx, 3, 1, 2, 3, ...C.shamanFeather);
  tileRect(tx, 11, 1, 2, 3, ...C.shamanFeather);
  // Голова-маска из черепа.
  tileRect(tx, 5, 3, 6, 3, ...C.shamanMask);
  tileRect(tx, 6, 4, 1, 1, ...C.shamanMaskDk);
  tileRect(tx, 9, 4, 1, 1, ...C.shamanMaskDk);
  // Роба.
  tileRect(tx, 5, 7, 6, 7, ...C.shamanRobe);
  tileRect(tx, 4, 8, 1, 5, ...C.shamanRobeDk);
  tileRect(tx, 11, 8, 1, 5, ...C.shamanRobeDk);
  // Посох с черепом.
  tileRect(tx, 13, 3, 1, 10, ...C.wood);
  tileRect(tx, 12, 1, 3, 2, ...C.shamanMask);
  tileRect(tx, 13, 2, 1, 1, ...C.shamanMaskDk);
}

function generate() {
  // 0: floor
  drawFloor(0, false);
  // 1: wall
  drawWall(1, false);
  // 2: floorDim
  drawFloor(2, true);
  // 3: wallDim
  drawWall(3, true);
  // 4: stairs
  drawStairs(4);
  // 5: player
  drawHumanoid(5, { weapon: 'sword' });
  // 6: slime
  drawSlime(6, false);
  // 7: rat
  drawRat(7, false);
  // 8: skeleton
  drawSkeleton(8, false);
  // 9: archer
  drawArcher(9, false);
  // 10: bat
  drawBat(10, false);
  // 11: demon
  drawDemon(11, false);
  // 12: boss
  drawBoss(12);
  // 13: gold
  drawGold(13);
  // 14: potion
  drawPotion(14);
  // 15: sword
  drawSword(15);
  // 16: fog
  drawFog(16);
  // 17: key
  drawKey(17);
  // 18: merchant
  drawMerchant(18);
  // 19: door
  drawDoor(19);
  // 20: chest
  drawChest(20);
  // 21: torch
  drawTorch(21);
  // 22: torchFlame
  drawFlame(22);
  // 23: shield
  drawShield(23);
  // 24: boots
  drawBoots(24);
  // 25: ring
  drawRing(25);
  // 26: amulet
  drawAmulet(26);
  // 27: head
  drawHead(27);
  // 28: armor
  drawArmor(28);
  // 29: boss_slime
  drawSlime(29, true);
  // 30: boss_rat
  drawRat(30, true);
  // 31: boss_bone
  drawSkeleton(31, true);
  // 32: boss_archer
  drawArcher(32, true);
  // 33: boss_bat
  drawBat(33, true);
  // 34: boss_brute
  drawBrute(34);
  // 35: boss_witch
  drawWitch(35);
  // 36: boss_knight
  drawKnight(36);
  // 37: boss_demon
  drawDemon(37, true);
  // 38: boss_lich
  drawLich(38);
  // 39: blacksmith
  drawBlacksmith(39);
  // 40: axe
  drawAxe(40);
  // 41: spear
  drawSpear(41);
  // 42: fountain
  drawFountain(42);
  // 43: tree
  drawTree(43);
  // 44: flowerBed
  drawFlowerBed(44);
  // 45: wallWindow
  drawWallWindow(45);
  // 46: buildingFloorStone
  drawBuildingFloorStone(46);
  // 47: buildingFloorPlaster
  drawBuildingFloorPlaster(47);
  // 48: buildingFloorWood
  drawBuildingFloorWood(48);
  // 49: buildingWallBrick
  drawBuildingWallBrick(49);
  // 50: buildingWallPlaster
  drawBuildingWallPlaster(50);
  // 51: buildingWallTimber
  drawBuildingWallTimber(51);
  // 52: fireplace
  drawFireplace(52);
  // 53: churchCross
  drawChurchCross(53);
  // 54: bench
  drawBench(54);
  // 55: forgeFurnace
  drawForgeFurnace(55);
  // 56: anvil
  drawAnvil(56);
  // 57: counterGoods
  drawCounterGoods(57);
  // 58: tavernTable
  drawTavernTable(58);
  // 59: tavernChair
  drawTavernChair(59);
  // 60: beerBarrel
  drawBeerBarrel(60);
  // 61: wineBottle
  drawWineBottle(61);
  // 62: bread
  drawBread(62);
  // 63: meat
  drawMeat(63);
  // 64: cheese
  drawCheese(64);
  // 65: apple
  drawApple(65);
  // 66: stew
  drawStew(66);
  // 67: magicOrb
  drawMagicOrb(67);
  // 68: cloak
  drawCloak(68);
  // 69: mantle
  drawMantle(69);
  // 70: burka
  drawBurka(70);
  // 71: shaman
  drawShaman(71);
  // 72+: тайлы стилей локаций: floor_<style>_<v> и wall_<style>_<v> парами.
  let styleIndex = STYLE_START;
  for (const styleId of STYLE_IDS) {
    const style = CONFIG.MAP_STYLES[styleId];
    for (let v = 0; v < STYLE_SHADES; v++) {
      drawFloor(styleIndex, false);
      overlayColor(styleIndex, style.colors[v] || style.colors[0]);
      styleIndex++;
      drawWall(styleIndex, false);
      overlayColor(styleIndex, style.wallColors[v] || style.wallColors[0]);
      styleIndex++;
    }
  }
  // Кадры пламени: индексы после тайлов стилей, как в KENNEY_MAP.
  drawFlame(styleIndex, 1);
  drawFlame(styleIndex + 1, 2);
}

// --- PNG энкодер ---
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c >>>= 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(pixels, width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw data с фильтром None для каждой строки
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter None
    Buffer.from(pixels.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Атлас изометрии ---
//
// Клетка 64×64: пол лежит ромбом в нижней половине, стена поднимается блоком.
// Якорь обоих один — центр ромба клетки (32, 48): пол и стена встают на клетку
// одинаково, поэтому стена всегда прикрывает того, кто за ней.

const ISO_SPR = 64;
const ISO_BASE = 5; // floor, wall, floorDim, wallDim, fog
const ISO_COUNT = ISO_BASE + STYLE_IDS.length * ISO_SHADES * 2;
const ISO_WIDTH = ISO_SPR * ISO_COUNT;
const ISO_HEIGHT = ISO_SPR;
const ISO_WALL_H = 32;

const isoData = new Uint8Array(ISO_WIDTH * ISO_HEIGHT * 4);

function isoSet(x, y, c) {
  if (x < 0 || x >= ISO_WIDTH || y < 0 || y >= ISO_HEIGHT) return;
  const i = (y * ISO_WIDTH + x) * 4;
  isoData[i] = c[0];
  isoData[i + 1] = c[1];
  isoData[i + 2] = c[2];
  isoData[i + 3] = c[3] == null ? 255 : c[3];
}

function mixColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    Math.round(a[3] + (b[3] - a[3]) * t),
  ];
}

function darken(c, factor) {
  return [Math.round(c[0] * factor), Math.round(c[1] * factor), Math.round(c[2] * factor), c[3] == null ? 255 : c[3]];
}

// Ромб клетки: центр (32, cy), полуширина 32, полувысота 16.
function isoDiamond(tx, cy, halfW, halfH, color) {
  const ox = tx * ISO_SPR;
  for (let y = cy - halfH; y <= cy + halfH; y++) {
    for (let x = 0; x < ISO_SPR; x++) {
      if (Math.abs(x - 32) / halfW + Math.abs(y - cy) / halfH > 1) continue;
      isoSet(ox + x, y, color);
    }
  }
}

// Ромб с переливом сверху вниз: задний край светлее, передний темнее.
function isoDiamondGradient(tx, cy, halfW, halfH, top, bottom) {
  const ox = tx * ISO_SPR;
  for (let y = cy - halfH; y <= cy + halfH; y++) {
    const t = (y - (cy - halfH)) / (2 * halfH);
    const color = mixColor(top, bottom, t);
    for (let x = 0; x < ISO_SPR; x++) {
      if (Math.abs(x - 32) / halfW + Math.abs(y - cy) / halfH > 1) continue;
      isoSet(ox + x, y, color);
    }
  }
}

// Многоугольник по строкам: так рисуются боковые грани стены.
function isoPoly(tx, points, color) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minY = Math.min(minY, point[1]);
    maxY = Math.max(maxY, point[1]);
  }
  const ox = tx * ISO_SPR;
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) isoSet(ox + x, y, color);
    }
  }
}

// Полупрозрачная заливка поверх уже нарисованных пикселей изо-атласа.
function isoOverlayColor(tx, css) {
  const m = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/.exec(String(css));
  if (!m) return;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  const a = Math.min(1, Number(m[4]));
  for (let y = 0; y < ISO_SPR; y++) {
    for (let x = 0; x < ISO_SPR; x++) {
      const i = (y * ISO_WIDTH + tx * ISO_SPR + x) * 4;
      if (isoData[i + 3] === 0) continue;
      isoData[i] = Math.round(isoData[i] * (1 - a) + r * a);
      isoData[i + 1] = Math.round(isoData[i + 1] * (1 - a) + g * a);
      isoData[i + 2] = Math.round(isoData[i + 2] * (1 - a) + b * a);
    }
  }
}

// Смешать цвет с уже нарисованным пикселем: рисунок не должен дырявить тайл.
function isoBlend(tx, x, y, c) {
  if (x < 0 || x >= ISO_SPR || y < 0 || y >= ISO_SPR) return;
  const i = (y * ISO_WIDTH + tx * ISO_SPR + x) * 4;
  if (isoData[i + 3] === 0) return;
  const a = (c[3] == null ? 255 : c[3]) / 255;
  isoData[i] = Math.round(isoData[i] * (1 - a) + c[0] * a);
  isoData[i + 1] = Math.round(isoData[i + 1] * (1 - a) + c[1] * a);
  isoData[i + 2] = Math.round(isoData[i + 2] * (1 - a) + c[2] * a);
}

function isoLine(tx, x0, y0, x1, y1, c) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    isoBlend(tx, Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), c);
  }
}

// Свой рисунок пола: трещины, трава, песок, плиты. Тинт стиля ложится сверху.
function isoStylePattern(tx, styleId, shade) {
  const dark = [0, 0, 0, 42];
  const light = [255, 245, 220, 34];
  const shift = shade * 2;
  if (styleId === 'stone' || styleId === 'ruins') {
    isoLine(tx, 16 + shift, 44, 27 + shift, 51, dark);
    isoLine(tx, 40 - shift, 52, 49 - shift, 45, dark);
    isoLine(tx, 23, 57, 30, 60, light);
  } else if (styleId === 'cave') {
    for (let i = 0; i < 4; i++) {
      const x = 14 + i * 10 + shift;
      isoBlend(tx, x, 48 + (i % 2) * 5, [70, 130, 90, 70]);
    }
    isoLine(tx, 30, 42, 38, 48, dark);
  } else if (styleId === 'crypt') {
    isoLine(tx, 32, 36, 32, 60, dark);
    isoLine(tx, 18, 48, 46, 48, dark);
    isoBlend(tx, 24, 55, light);
    isoBlend(tx, 41, 43, light);
  } else if (styleId === 'forest') {
    for (let i = 0; i < 5; i++) {
      const x = 15 + i * 8 + shift;
      isoLine(tx, x, 52, x + 1, 47, [80, 170, 80, 80]);
    }
    isoBlend(tx, 36, 39, dark);
  } else if (styleId === 'mountain') {
    for (let i = 0; i < 6; i++) {
      const x = 13 + i * 7 + shift;
      isoBlend(tx, x, 45 + (i % 3) * 4, i % 2 ? light : dark);
    }
  } else if (styleId === 'desert') {
    for (let i = 0; i < 3; i++) {
      isoLine(tx, 12, 48 + i * 5, 51, 44 + i * 5, [255, 235, 180, 26]);
    }
  } else if (styleId === 'sewer') {
    for (let i = 0; i < 4; i++) {
      isoLine(tx, 18 + i * 7, 42, 18 + i * 7, 58, dark);
    }
    isoLine(tx, 10, 52, 54, 52, [70, 120, 90, 50]);
  }
}

function drawIsoFloor(tx, dim) {
  const top = dim ? C.floorDim : C.floorA;
  const bottom = dim ? darken(C.floorDim, 0.8) : C.floorB;
  isoDiamondGradient(tx, 48, 32, 16, top, bottom);
  // Задние рёбра в тени: они отделяют клетку от клетки за ней.
  const edge = darken(bottom, 0.88);
  for (let x = 0; x < ISO_SPR; x++) {
    const t = Math.abs(x - 32) / 32;
    const y = 32 + 16 * (1 - t);
    isoSet(tx * ISO_SPR + x, Math.round(y), edge);
    isoSet(tx * ISO_SPR + x, Math.round(y) - 1, edge);
  }
  // Пара бликов: пол не однотонный.
  isoSet(tx * ISO_SPR + 26, 42, [255, 255, 255, 40]);
  isoSet(tx * ISO_SPR + 38, 50, [255, 255, 255, 30]);
  isoSet(tx * ISO_SPR + 30, 55, [0, 0, 0, 30]);
}

function drawIsoWall(tx, dim) {
  const top = dim ? C.wallDim : C.wallA;
  const side = dim ? C.wallDim : C.wallB;
  // Основание блока: тёмная полоса под нижними гранями.
  isoDiamond(tx, 48, 32, 16, darken(side, 0.55));
  // Левая грань — светлее правой: свет падает сверху слева.
  isoPoly(tx, [[0, 48], [32, 64], [32, 32], [0, 16]], darken(side, 0.86));
  isoPoly(tx, [[32, 64], [64, 48], [64, 16], [32, 32]], darken(side, 0.62));
  // Верхняя грань — ромб на высоте стены.
  isoDiamondGradient(tx, 16, 32, 16, top, mixColor(top, side, 0.5));
  // Пара трещин: верх не выглядит однотонной заливкой.
  const crack = darken(top, 0.82);
  for (let x = 18; x <= 26; x++) isoSet(tx * ISO_SPR + x, 12 + Math.round((x - 18) * 0.25), crack);
  for (let x = 38; x <= 44; x++) isoSet(tx * ISO_SPR + x, 19 - Math.round((x - 38) * 0.2), crack);
  isoSet(tx * ISO_SPR + 20, 11, [255, 245, 220, 90]);
  isoSet(tx * ISO_SPR + 40, 18, [255, 245, 220, 70]);
}

function drawIsoFog(tx) {
  isoDiamond(tx, 48, 32, 16, [21, 18, 31, 255]);
}

function generateIso() {
  // 0: floor, 1: wall, 2: floorDim, 3: wallDim, 4: fog
  drawIsoFloor(0, false);
  drawIsoWall(1, false);
  drawIsoFloor(2, true);
  drawIsoWall(3, true);
  drawIsoFog(4);
  // 5+: тайлы стилей локаций: пол и стена парами, по пять оттенков.
  let index = ISO_BASE;
  for (const styleId of STYLE_IDS) {
    const style = CONFIG.MAP_STYLES[styleId];
    for (let v = 0; v < ISO_SHADES; v++) {
      drawIsoFloor(index, false);
      isoStylePattern(index, styleId, v);
      isoOverlayColor(index, style.colors[v] || style.colors[0]);
      index++;
      drawIsoWall(index, false);
      isoOverlayColor(index, style.wallColors[v] || style.wallColors[0]);
      index++;
    }
  }
}

// --- Hi-res спрайты: 32×32 для мелочи, 256×256 для героев и боссов ---
// Логические координаты 16×16: каждый пиксель рисуется блоком 2×2 на 32×32.
// Старый атлас остаётся запасным: hi-res файл просто перекрывает встроенный спрайт.
const HIRES = 32;

function hmake() { return new Uint8Array(HIRES * HIRES * 4); }
function hset(c, x, y, col) {
  if (x < 0 || x >= HIRES || y < 0 || y >= HIRES) return;
  const i = (y * HIRES + x) * 4;
  c[i] = col[0]; c[i + 1] = col[1]; c[i + 2] = col[2]; c[i + 3] = col[3] == null ? 255 : col[3];
}
function hrect(c, x, y, w, h, col) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      for (let sx = 0; sx < 2; sx++)
        for (let sy = 0; sy < 2; sy++)
          hset(c, x * 2 + dx + sx, y * 2 + dy + sy, col);
}
function hpx(c, x, y, col) { hrect(c, x, y, 1, 1, col); }
function writeSprite(name, c) {
  const png = encodePNG(c, HIRES, HIRES);
  fs.writeFileSync(path.join(__dirname, '..', 'assets', 'sprites', name + '.png'), png);
}

// --- Герои 256×256: четыре разных силуэта, стойка и два кадра шага ---
// Логическая сетка 128×128, каждый пиксель — блок 2×2. Класс читается по
// снаряжению: щит паладина, два топора берсерка, лук с колчаном, шляпа и посох.
const HERO_SIZE = 256;
const HERO_GRID = 128;
const HERO_SCALE = HERO_SIZE / HERO_GRID;

const HERO = {
  outline: [24, 20, 32, 255],
  skinDark: [158, 100, 66, 255],
  steel: [178, 190, 210, 255],
  steelHi: [228, 236, 248, 255],
  steelDark: [102, 114, 138, 255],
  gold: [240, 194, 76, 255],
  goldDark: [166, 120, 34, 255],
  leather: [126, 84, 48, 255],
  leatherDark: [82, 52, 30, 255],
  wood: [112, 74, 42, 255],
  woodDark: [76, 48, 28, 255],
  eye: [24, 26, 42, 255],
  white: [236, 240, 248, 255]
};

const PALADIN = {
  cape: [52, 78, 146, 255],
  capeDark: [32, 48, 96, 255],
  armor: HERO.steel,
  armorDark: HERO.steelDark,
  armorHi: HERO.steelHi,
  gold: HERO.gold,
  goldDark: HERO.goldDark,
  tabard: [238, 240, 248, 255],
  accent: [196, 44, 52, 255],
  accentDark: [132, 26, 34, 255],
  shield: [44, 76, 158, 255],
  boot: [92, 102, 124, 255],
  bootDark: [58, 64, 82, 255]
};

const BERSERKER = {
  skin: [208, 142, 96, 255],
  skinHi: [236, 174, 120, 255],
  skinDark: [148, 90, 58, 255],
  hair: [190, 66, 34, 255],
  hairDark: [124, 40, 22, 255],
  leather: [118, 74, 42, 255],
  leatherDark: [76, 44, 26, 255],
  leatherHi: [166, 118, 72, 255],
  fur: [138, 110, 80, 255],
  furHi: [190, 160, 122, 255],
  paint: [184, 38, 34, 255],
  steelDark: HERO.steelDark
};

const ARCHER = {
  cloak: [64, 96, 54, 255],
  cloakDark: [40, 64, 38, 255],
  cloakHi: [92, 128, 74, 255],
  leather: [128, 88, 50, 255],
  leatherDark: [84, 56, 32, 255],
  leatherHi: [172, 126, 78, 255],
  skin: [216, 160, 114, 255],
  skinDark: [156, 104, 66, 255],
  wood: [116, 74, 40, 255],
  woodDark: [78, 50, 28, 255],
  string: [224, 216, 186, 255],
  fletch: [218, 194, 98, 255],
  fletchDark: [154, 128, 56, 255],
  boot: [88, 58, 34, 255],
  bootDark: [58, 38, 24, 255]
};

const MAGE = {
  robe: [86, 76, 158, 255],
  robeDark: [54, 46, 112, 255],
  robeHi: [120, 108, 196, 255],
  trim: [236, 196, 92, 255],
  trimDark: [164, 124, 38, 255],
  hat: [74, 60, 140, 255],
  hatDark: [44, 34, 92, 255],
  hatHi: [104, 90, 180, 255],
  beard: [228, 228, 238, 255],
  beardDark: [174, 176, 194, 255],
  skin: [224, 172, 126, 255],
  skinDark: [170, 120, 84, 255],
  orb: [158, 238, 255, 255],
  orbDark: [86, 158, 232, 255],
  orbGlow: [116, 200, 255, 80],
  boot: [66, 54, 96, 255],
  wood: HERO.wood,
  woodDark: HERO.woodDark
};

function heroMake() { return new Uint8Array(HERO_SIZE * HERO_SIZE * 4); }

function heroSet(c, x, y, col) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= HERO_GRID || y < 0 || y >= HERO_GRID) return;
  for (let dy = 0; dy < HERO_SCALE; dy++) {
    for (let dx = 0; dx < HERO_SCALE; dx++) {
      const i = ((y * HERO_SCALE + dy) * HERO_SIZE + x * HERO_SCALE + dx) * 4;
      c[i] = col[0];
      c[i + 1] = col[1];
      c[i + 2] = col[2];
      c[i + 3] = col[3] == null ? 255 : col[3];
    }
  }
}

function heroRect(c, x, y, w, h, col) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      heroSet(c, x + dx, y + dy, col);
}

function heroEllipse(c, cx, cy, rx, ry, col) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) heroSet(c, x, y, col);
    }
}

// Заливка многоугольника: пересечения считаются по центрам пикселей.
function heroPoly(c, pts, col) {
  if (!pts.length) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[j];
      const b = pts[i];
      if ((a[1] <= y + 0.5 && b[1] > y + 0.5) || (b[1] <= y + 0.5 && a[1] > y + 0.5)) {
        xs.push(a[0] + (y + 0.5 - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.floor(xs[k]); x <= Math.ceil(xs[k + 1]) - 1; x++) {
        if (x + 0.5 >= xs[k] && x + 0.5 <= xs[k + 1]) heroSet(c, x, y, col);
      }
    }
  }
}

function heroLine(c, x0, y0, x1, y1, col) {
  x0 = Math.round(x0); y0 = Math.round(y0);
  x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    heroSet(c, x0, y0, col);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function heroThickLine(c, x0, y0, x1, y1, half, col) {
  for (let ox = -half; ox <= half; ox++)
    for (let oy = -half; oy <= half; oy++)
      heroLine(c, x0 + ox, y0 + oy, x1 + ox, y1 + oy, col);
}

function heroDiamond(c, cx, cy, r, col) {
  heroPoly(c, [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]], col);
}

function writeHeroSprite(name, c) {
  const png = encodePNG(c, HERO_SIZE, HERO_SIZE);
  fs.writeFileSync(path.join(__dirname, '..', 'assets', 'sprites', name + '.png'), png);
}

function heroArmoredLeg(c, x, y, lift, P) {
  const bottom = 126 - lift;
  heroRect(c, x - 1, y - 1, 15, bottom - y + 2, HERO.outline);
  heroRect(c, x, y, 13, bottom - y, P.armorDark);
  heroRect(c, x + 1, y, 11, bottom - y - 2, P.armor);
  heroRect(c, x + 1, y, 4, bottom - y - 3, P.armorHi);
  // Наколенник.
  heroRect(c, x - 1, y + 9, 15, 8, HERO.outline);
  heroRect(c, x, y + 10, 13, 6, P.armorDark);
  heroRect(c, x + 1, y + 10, 11, 4, P.armor);
  // Сапог.
  heroRect(c, x - 1, bottom - 8, 16, 9, HERO.outline);
  heroRect(c, x, bottom - 7, 14, 7, P.bootDark);
  heroRect(c, x, bottom - 7, 14, 3, P.boot);
}

function heroPauldron(c, cx, P) {
  heroEllipse(c, cx, 56, 17, 13, HERO.outline);
  heroEllipse(c, cx, 56, 15, 11, P.goldDark);
  heroEllipse(c, cx, 55, 13, 9, P.armorDark);
  heroEllipse(c, cx, 54, 11, 7, P.armor);
  heroEllipse(c, cx - 4, 51, 5, 3, P.armorHi);
}

function drawPaladin(c, pose, P) {
  P = P || PALADIN;
  const step = pose === 1 ? 1 : pose === 2 ? -1 : 0;
  const liftL = pose === 1 ? 3 : 0;
  const liftR = pose === 2 ? 3 : 0;
  const sway = -step * 4;
  const armY = step * 2;

  // Плащ.
  heroPoly(c, [[38, 46], [90, 46], [104, 110 + sway], [96, 120], [88, 111], [80, 122],
    [72, 112], [64, 122], [56, 112], [48, 122], [40, 111], [32, 120], [24, 110 - sway]], HERO.outline);
  heroPoly(c, [[41, 48], [87, 48], [100, 108 + sway], [92, 116], [84, 107], [76, 118],
    [68, 108], [64, 116], [60, 108], [52, 118], [44, 107], [36, 116], [28, 108 - sway]], P.capeDark);
  heroPoly(c, [[46, 50], [82, 50], [94, 106 + sway], [88, 111], [81, 103], [74, 112],
    [68, 104], [64, 110], [60, 104], [54, 112], [47, 103], [40, 111], [34, 106 - sway]], P.cape);

  heroArmoredLeg(c, 49 - step * 2, 94, liftL, P);
  heroArmoredLeg(c, 67 + step * 2, 94, liftR, P);

  // Доспех и сюрко.
  heroRect(c, 43, 47, 42, 47, HERO.outline);
  heroRect(c, 44, 48, 40, 45, P.armorDark);
  heroRect(c, 46, 48, 36, 42, P.armor);
  heroRect(c, 46, 48, 7, 38, P.armorHi);
  heroPoly(c, [[55, 52], [73, 52], [78, 92], [50, 92]], HERO.outline);
  heroPoly(c, [[56, 54], [72, 54], [76, 90], [52, 90]], P.tabard);
  heroRect(c, 61, 58, 6, 32, P.accentDark);
  heroRect(c, 62, 58, 4, 32, P.accent);
  heroRect(c, 54, 68, 20, 6, P.accentDark);
  heroRect(c, 54, 69, 20, 4, P.accent);
  heroRect(c, 42, 88, 44, 9, HERO.outline);
  heroRect(c, 43, 89, 42, 7, P.goldDark);
  heroRect(c, 44, 90, 40, 4, P.gold);
  heroRect(c, 61, 89, 7, 7, HERO.outline);
  heroRect(c, 62, 90, 5, 5, P.gold);

  heroPauldron(c, 64 - 20, P);
  heroPauldron(c, 64 + 20, P);

  // Руки.
  heroRect(c, 30, 64, 12, 28, HERO.outline);
  heroRect(c, 31, 65, 10, 26, P.armorDark);
  heroRect(c, 32, 65, 7, 24, P.armor);
  heroRect(c, 32, 65, 2, 22, P.armorHi);
  heroRect(c, 84, 64 + armY, 13, 29, HERO.outline);
  heroRect(c, 85, 65 + armY, 11, 27, P.armorDark);
  heroRect(c, 86, 65 + armY, 8, 25, P.armor);
  heroRect(c, 86, 65 + armY, 2, 23, P.armorHi);
  heroRect(c, 86, 86 + armY, 10, 8, P.armorDark);
  heroRect(c, 87, 87 + armY, 8, 5, P.armor);

  // Голова: закрытый шлем с плюмажем.
  heroRect(c, 58, 43, 12, 8, HERO.outline);
  heroRect(c, 59, 44, 10, 6, HERO.skinDark);
  heroPoly(c, [[56, 8], [66, 6], [72, 16], [78, 30], [72, 36], [64, 27], [56, 21]], HERO.outline);
  heroPoly(c, [[58, 10], [64, 9], [68, 16], [73, 29], [69, 32], [64, 25], [59, 19]], P.accent);
  heroEllipse(c, 64, 31, 17, 16, HERO.outline);
  heroEllipse(c, 64, 31, 15, 14, P.armorDark);
  heroEllipse(c, 64, 30, 13, 12, P.armor);
  heroEllipse(c, 64, 26, 8, 6, P.armorHi);
  heroRect(c, 53, 34, 22, 9, HERO.outline);
  heroRect(c, 54, 35, 20, 7, [24, 26, 42, 255]);
  heroRect(c, 55, 36, 6, 3, [104, 184, 226, 255]);
  heroRect(c, 67, 36, 6, 3, [104, 184, 226, 255]);
  heroRect(c, 62, 34, 4, 16, P.goldDark);
  heroRect(c, 63, 34, 2, 16, P.gold);
  heroRect(c, 54, 43, 20, 3, P.goldDark);
  heroRect(c, 55, 44, 18, 1, P.gold);

  // Крестовый щит.
  heroPoly(c, [[14, 64], [46, 56], [50, 92], [38, 120], [16, 104]], HERO.outline);
  heroPoly(c, [[16, 66], [44, 59], [48, 91], [38, 116], [18, 102]], P.goldDark);
  heroPoly(c, [[19, 68], [42, 62], [45, 90], [37, 112], [20, 100]], P.gold);
  heroPoly(c, [[23, 70], [39, 66], [42, 89], [37, 107], [23, 97]], P.shield);
  heroRect(c, 31, 70, 7, 32, P.tabard);
  heroRect(c, 26, 79, 17, 7, P.tabard);
  heroEllipse(c, 34, 82, 6, 6, P.goldDark);
  heroEllipse(c, 34, 82, 4, 4, P.gold);

  // Меч.
  heroPoly(c, [[95, 12 + armY], [100, 6 + armY], [105, 12 + armY], [105, 80 + armY],
    [100, 90 + armY], [95, 80 + armY]], HERO.outline);
  heroPoly(c, [[97, 14 + armY], [100, 9 + armY], [103, 14 + armY], [103, 78 + armY],
    [100, 85 + armY], [97, 78 + armY]], P.armor);
  heroLine(c, 98, 18 + armY, 98, 74 + armY, P.armorHi);
  heroRect(c, 88, 82 + armY, 24, 7, HERO.outline);
  heroRect(c, 89, 83 + armY, 22, 5, P.goldDark);
  heroRect(c, 90, 84 + armY, 20, 3, P.gold);
  heroRect(c, 96, 89 + armY, 8, 14, HERO.outline);
  heroRect(c, 97, 90 + armY, 6, 12, HERO.leatherDark);
  heroEllipse(c, 100, 104 + armY, 5, 4, P.goldDark);
  heroEllipse(c, 100, 103 + armY, 3, 3, P.gold);
}

function berserkerAxe(c, side, dy) {
  const handX = side < 0 ? 30 : 98;
  const topX = side < 0 ? 22 : 106;
  heroThickLine(c, handX, 98 + dy, topX, 46 + dy, 2, HERO.outline);
  heroThickLine(c, handX, 96 + dy, topX, 44 + dy, 1, HERO.woodDark);
  heroLine(c, handX, 94 + dy, topX, 42 + dy, HERO.leather);
  // Клин с рогами, бородой и выпуклой режущей кромкой.
  const head = side < 0
    ? [[29, 32], [18, 25], [7, 27], [2, 36], [1, 50], [3, 64], [9, 72], [16, 68],
      [23, 58], [29, 50], [30, 40]]
    : [[99, 32], [110, 25], [121, 27], [126, 36], [127, 50], [125, 64], [119, 72],
      [112, 68], [105, 58], [99, 50], [98, 40]];
  const blade = side < 0
    ? [[26, 36], [18, 30], [10, 32], [5, 39], [4, 50], [6, 61], [10, 67], [16, 63],
      [21, 55], [26, 47], [27, 41]]
    : [[102, 36], [110, 30], [118, 32], [123, 39], [124, 50], [122, 61], [118, 67],
      [112, 63], [107, 55], [102, 47], [101, 41]];
  const bevel = side < 0
    ? [[24, 40], [19, 35], [13, 37], [9, 43], [9, 51], [12, 58], [16, 61], [21, 54],
      [24, 48]]
    : [[104, 40], [109, 35], [115, 37], [119, 43], [119, 51], [116, 58], [112, 61],
      [107, 54], [104, 48]];
  heroPoly(c, head, HERO.outline);
  heroPoly(c, blade, HERO.steel);
  heroPoly(c, bevel, HERO.steelDark);
  if (side < 0) {
    heroLine(c, 4, 42, 4, 58, HERO.steelHi);
    heroLine(c, 7, 37, 6, 63, HERO.steelHi);
  } else {
    heroLine(c, 124, 42, 124, 58, HERO.steelHi);
    heroLine(c, 121, 37, 122, 63, HERO.steelHi);
  }
  // Обойма крепит клин к древку.
  const socketX = side < 0 ? 21 : 99;
  heroRect(c, socketX, 36, 8, 20, HERO.outline);
  heroRect(c, socketX + 1, 37, 6, 18, HERO.steelDark);
  heroRect(c, socketX + 2, 38, 2, 16, HERO.steel);
}

function drawBerserker(c, pose) {
  const step = pose === 1 ? 1 : pose === 2 ? -1 : 0;
  const liftL = pose === 1 ? 3 : 0;
  const liftR = pose === 2 ? 3 : 0;
  const armY = step * 4;

  // Медвежья шкура на плечах.
  heroPoly(c, [[34, 48], [94, 48], [100, 64], [90, 60], [84, 72], [74, 62], [64, 74],
    [54, 62], [44, 72], [38, 60], [28, 64]], HERO.outline);
  heroPoly(c, [[38, 50], [90, 50], [95, 62], [87, 58], [81, 68], [72, 59], [64, 69],
    [56, 59], [47, 68], [41, 58], [33, 62]], BERSERKER.fur);
  heroPoly(c, [[44, 51], [84, 51], [88, 58], [80, 56], [74, 62], [64, 58], [54, 62],
    [48, 56], [40, 58]], BERSERKER.furHi);

  berserkerAxe(c, -1, armY);
  berserkerAxe(c, 1, -armY);

  // Ноги.
  heroRect(c, 48 - step * 2, 92, 14, 34 - liftL, HERO.outline);
  heroRect(c, 49 - step * 2, 93, 12, 32 - liftL, BERSERKER.leatherDark);
  heroRect(c, 51 - step * 2, 93, 8, 30 - liftL, BERSERKER.leather);
  heroRect(c, 66 + step * 2, 92, 14, 34 - liftR, HERO.outline);
  heroRect(c, 67 + step * 2, 93, 12, 32 - liftR, BERSERKER.leatherDark);
  heroRect(c, 69 + step * 2, 93, 8, 30 - liftR, BERSERKER.leather);
  // Меховые сапоги.
  heroRect(c, 46 - step * 2, 114 - liftL, 17, 12, HERO.outline);
  heroRect(c, 47 - step * 2, 115 - liftL, 15, 10, BERSERKER.fur);
  heroRect(c, 47 - step * 2, 115 - liftL, 15, 3, BERSERKER.furHi);
  heroRect(c, 65 + step * 2, 114 - liftR, 17, 12, HERO.outline);
  heroRect(c, 66 + step * 2, 115 - liftR, 15, 10, BERSERKER.fur);
  heroRect(c, 66 + step * 2, 115 - liftR, 15, 3, BERSERKER.furHi);

  // Голое мускулистое тело.
  heroRect(c, 42, 49, 44, 47, HERO.outline);
  heroRect(c, 43, 50, 42, 45, BERSERKER.skinDark);
  heroRect(c, 45, 50, 38, 43, BERSERKER.skin);
  heroRect(c, 45, 50, 8, 40, BERSERKER.skinHi);
  heroEllipse(c, 54, 61, 10, 7, BERSERKER.skinHi);
  heroEllipse(c, 74, 61, 10, 7, BERSERKER.skinHi);
  heroLine(c, 64, 53, 64, 86, BERSERKER.skinDark);
  heroLine(c, 51, 70, 77, 70, BERSERKER.skinDark);
  heroLine(c, 56, 78, 72, 78, BERSERKER.skinDark);
  heroLine(c, 58, 85, 70, 85, BERSERKER.skinDark);
  // Боевая раскраска.
  heroPoly(c, [[44, 74], [84, 60], [85, 67], [45, 81]], BERSERKER.paint);
  heroEllipse(c, 43, 55, 10, 9, BERSERKER.skinDark);
  heroEllipse(c, 85, 55, 10, 9, BERSERKER.skinDark);
  heroEllipse(c, 43, 54, 8, 7, BERSERKER.skin);
  heroEllipse(c, 85, 54, 8, 7, BERSERKER.skin);

  // Руки с браслетами.
  heroPoly(c, [[34, 56], [45, 58], [44, 82], [36, 94], [27, 91], [31, 76], [30, 60]], HERO.outline);
  heroPoly(c, [[35, 57], [43, 59], [42, 81], [35, 90], [30, 88], [33, 75], [32, 60]], BERSERKER.skin);
  heroRect(c, 30, 80, 12, 8, HERO.outline);
  heroRect(c, 31, 81, 10, 6, BERSERKER.leatherDark);
  heroRect(c, 32, 82, 3, 4, BERSERKER.leatherHi);
  heroPoly(c, [[83, 56], [94, 58], [93, 82], [85, 94], [76, 91], [80, 76], [79, 60]], HERO.outline);
  heroPoly(c, [[84, 57], [92, 59], [91, 81], [84, 90], [79, 88], [82, 75], [81, 60]], BERSERKER.skin);
  heroRect(c, 82, 80, 12, 8, HERO.outline);
  heroRect(c, 83, 81, 10, 6, BERSERKER.leatherDark);
  heroRect(c, 84, 82, 3, 4, BERSERKER.leatherHi);

  // Кожаный килт и пояс.
  heroRect(c, 41, 84, 46, 8, HERO.outline);
  heroRect(c, 42, 85, 44, 6, BERSERKER.leatherDark);
  heroRect(c, 43, 86, 42, 3, BERSERKER.leatherHi);
  heroPoly(c, [[42, 90], [86, 90], [94, 110], [86, 106], [78, 114], [70, 107], [64, 116],
    [58, 107], [50, 114], [42, 106], [34, 110]], HERO.outline);
  heroPoly(c, [[45, 92], [83, 92], [89, 108], [83, 104], [76, 111], [69, 105], [64, 112],
    [59, 105], [52, 111], [45, 104], [39, 108]], BERSERKER.leather);
  heroLine(c, 64, 93, 64, 109, BERSERKER.leatherDark);
  heroRect(c, 55, 101, 5, 5, BERSERKER.steelDark);
  heroRect(c, 69, 101, 5, 5, BERSERKER.steelDark);

  // Голова: дикие волосы, борода и боевая раскраска.
  heroEllipse(c, 64, 33, 14, 15, HERO.outline);
  heroEllipse(c, 64, 33, 12, 13, BERSERKER.skin);
  heroEllipse(c, 51, 34, 4, 5, BERSERKER.skinDark);
  heroEllipse(c, 77, 34, 4, 5, BERSERKER.skinDark);
  heroEllipse(c, 51, 34, 3, 4, BERSERKER.skin);
  heroEllipse(c, 77, 34, 3, 4, BERSERKER.skin);
  heroPoly(c, [[48, 27], [44, 10], [53, 19], [56, 4], [62, 16], [68, 2], [72, 17],
    [80, 8], [81, 22], [88, 28], [80, 30], [64, 25], [50, 31]], BERSERKER.hairDark);
  heroPoly(c, [[50, 27], [48, 14], [55, 21], [58, 8], [63, 18], [68, 6], [71, 19],
    [78, 12], [79, 24], [84, 28], [77, 28], [64, 23], [52, 29]], BERSERKER.hair);
  heroPoly(c, [[52, 43], [76, 43], [78, 55], [72, 70], [64, 76], [56, 70], [50, 55]], HERO.outline);
  heroPoly(c, [[54, 44], [74, 44], [76, 55], [70, 67], [64, 72], [58, 67], [52, 55]], BERSERKER.hairDark);
  heroRect(c, 57, 34, 5, 3, HERO.white);
  heroRect(c, 67, 34, 5, 3, HERO.white);
  heroRect(c, 58, 35, 3, 2, BERSERKER.paint);
  heroRect(c, 68, 35, 3, 2, BERSERKER.paint);
  heroRect(c, 61, 42, 7, 3, BERSERKER.skinDark);
  heroPoly(c, [[55, 40], [73, 40], [74, 45], [64, 48], [54, 45]], BERSERKER.paint);
}

function drawArcher(c, pose) {
  const step = pose === 1 ? 1 : pose === 2 ? -1 : 0;
  const liftL = pose === 1 ? 3 : 0;
  const liftR = pose === 2 ? 3 : 0;
  const sway = -step * 3;
  const armY = step * 2;

  // Плащ.
  heroPoly(c, [[42, 50], [86, 50], [100, 108 + sway], [91, 116], [84, 107], [76, 118],
    [68, 108], [64, 116], [60, 108], [52, 118], [44, 107], [37, 116], [28, 108 - sway]], HERO.outline);
  heroPoly(c, [[45, 52], [83, 52], [96, 106 + sway], [88, 112], [81, 104], [74, 114],
    [67, 105], [64, 112], [61, 105], [54, 114], [47, 104], [40, 112], [32, 106 - sway]], ARCHER.cloakDark);
  heroPoly(c, [[49, 54], [79, 54], [91, 104 + sway], [85, 108], [78, 101], [71, 110],
    [65, 102], [64, 108], [63, 102], [57, 110], [50, 101], [43, 108], [37, 104 - sway]], ARCHER.cloak);

  // Колчан за правым плечом.
  heroRect(c, 82, 36, 18, 50, HERO.outline);
  heroRect(c, 84, 38, 14, 46, ARCHER.leatherDark);
  heroRect(c, 85, 38, 12, 44, ARCHER.leather);
  heroRect(c, 85, 38, 3, 44, ARCHER.leatherHi);
  for (let i = 0; i < 3; i++) {
    const ax = 86 + i * 4;
    heroRect(c, ax, 18 + i * 2, 2, 24, HERO.woodDark);
    heroRect(c, ax, 18 + i * 2, 2, 8, ARCHER.fletch);
    heroRect(c, ax, 18 + i * 2, 2, 3, ARCHER.fletchDark);
    heroRect(c, ax - 1, 25 + i * 2, 4, 3, ARCHER.fletch);
    heroRect(c, ax - 1, 25 + i * 2, 4, 1, ARCHER.fletchDark);
  }

  // Ноги.
  heroRect(c, 48 - step * 2, 92, 14, 34 - liftL, HERO.outline);
  heroRect(c, 49 - step * 2, 93, 12, 32 - liftL, ARCHER.leatherDark);
  heroRect(c, 51 - step * 2, 93, 8, 30 - liftL, ARCHER.leather);
  heroRect(c, 66 + step * 2, 92, 14, 34 - liftR, HERO.outline);
  heroRect(c, 67 + step * 2, 93, 12, 32 - liftR, ARCHER.leatherDark);
  heroRect(c, 69 + step * 2, 93, 8, 30 - liftR, ARCHER.leather);
  heroRect(c, 46 - step * 2, 116 - liftL, 17, 10, HERO.outline);
  heroRect(c, 47 - step * 2, 117 - liftL, 15, 8, ARCHER.bootDark);
  heroRect(c, 47 - step * 2, 117 - liftL, 15, 2, ARCHER.boot);
  heroRect(c, 65 + step * 2, 116 - liftR, 17, 10, HERO.outline);
  heroRect(c, 66 + step * 2, 117 - liftR, 15, 8, ARCHER.bootDark);
  heroRect(c, 66 + step * 2, 117 - liftR, 15, 2, ARCHER.boot);

  // Куртка и ремень колчана.
  heroRect(c, 44, 52, 40, 42, HERO.outline);
  heroRect(c, 45, 53, 38, 40, ARCHER.leatherDark);
  heroRect(c, 47, 53, 34, 38, ARCHER.leather);
  heroRect(c, 47, 53, 7, 35, ARCHER.leatherHi);
  heroPoly(c, [[47, 56], [55, 55], [82, 86], [76, 92]], HERO.outline);
  heroPoly(c, [[48, 57], [54, 56], [80, 86], [76, 90]], ARCHER.leatherHi);
  heroRect(c, 72, 80, 8, 6, HERO.outline);
  heroRect(c, 73, 81, 6, 4, ARCHER.fletch);
  heroRect(c, 44, 88, 40, 6, HERO.outline);
  heroRect(c, 45, 89, 38, 4, ARCHER.leatherDark);

  // Капюшон.
  heroPoly(c, [[42, 58], [46, 40], [58, 24], [64, 20], [70, 24], [82, 40], [86, 58],
    [78, 64], [70, 58], [64, 66], [58, 58], [50, 64]], HERO.outline);
  heroPoly(c, [[45, 56], [49, 41], [59, 27], [64, 24], [69, 27], [79, 41], [83, 56],
    [77, 60], [70, 54], [64, 62], [58, 54], [51, 60]], ARCHER.cloak);
  heroEllipse(c, 64, 42, 13, 13, [30, 30, 32, 255]);
  heroRect(c, 56, 40, 6, 4, ARCHER.cloakHi);
  heroRect(c, 67, 40, 6, 4, ARCHER.cloakHi);
  heroRect(c, 58, 41, 3, 2, [190, 230, 130, 255]);
  heroRect(c, 68, 41, 3, 2, [190, 230, 130, 255]);
  heroRect(c, 55, 48, 18, 10, ARCHER.skinDark);
  heroRect(c, 56, 49, 16, 8, ARCHER.skin);
  heroRect(c, 58, 52, 12, 2, ARCHER.skinDark);

  // Руки.
  heroRect(c, 34, 66 + armY, 11, 26, HERO.outline);
  heroRect(c, 35, 67 + armY, 9, 24, ARCHER.leatherDark);
  heroRect(c, 36, 67 + armY, 6, 22, ARCHER.leather);
  heroRect(c, 35, 80 + armY, 10, 7, ARCHER.leatherHi);
  heroRect(c, 82, 68 - armY, 12, 26, HERO.outline);
  heroRect(c, 83, 69 - armY, 10, 24, ARCHER.leatherDark);
  heroRect(c, 84, 69 - armY, 7, 22, ARCHER.leather);
  heroRect(c, 83, 82 - armY, 11, 7, ARCHER.leatherHi);

  // Лук: тонкая изогнутая дуга и прямая тетива.
  const bowOuter = [[32, 21], [23, 33], [18, 50], [17, 66], [18, 83], [23, 100],
    [32, 115], [31, 99], [29, 84], [28, 68], [29, 51], [31, 36]];
  const bow = [[31, 23], [24, 34], [20, 50], [19, 66], [20, 82], [24, 98],
    [31, 113], [30, 98], [28, 84], [27, 68], [28, 52], [30, 38]];
  heroPoly(c, bowOuter, HERO.outline);
  heroPoly(c, bow, ARCHER.wood);
  heroLine(c, 21, 54, 20, 78, ARCHER.woodDark);
  heroLine(c, 33, 26, 33, 110, ARCHER.string);
  heroRect(c, 31, 64, 9, 11, HERO.outline);
  heroRect(c, 32, 65, 7, 9, ARCHER.leatherDark);
  heroRect(c, 33, 66, 5, 3, ARCHER.fletch);
}

function drawMage(c, pose) {
  const step = pose === 1 ? 1 : pose === 2 ? -1 : 0;
  const liftL = pose === 1 ? 3 : 0;
  const liftR = pose === 2 ? 3 : 0;
  const sway = -step * 3;
  const beardSway = step * 1;

  // Сапоги под подолом.
  heroRect(c, 46 - step * 2, 116 - liftL, 16, 10, HERO.outline);
  heroRect(c, 47 - step * 2, 117 - liftL, 14, 8, MAGE.boot);
  heroRect(c, 68 + step * 2, 116 - liftR, 16, 10, HERO.outline);
  heroRect(c, 69 + step * 2, 117 - liftR, 14, 8, MAGE.boot);

  // Мантия.
  heroPoly(c, [[38, 50], [90, 50], [104, 110 + sway], [98, 118], [90, 111], [82, 121],
    [74, 112], [66, 120], [58, 112], [50, 121], [42, 111], [34, 118], [28, 110 - sway]], HERO.outline);
  heroPoly(c, [[41, 52], [87, 52], [100, 108 + sway], [94, 114], [87, 107], [80, 117],
    [73, 108], [66, 116], [59, 108], [52, 117], [45, 107], [38, 114], [32, 108 - sway]], MAGE.robeDark);
  heroPoly(c, [[46, 54], [82, 54], [94, 104 + sway], [89, 109], [82, 102], [76, 112],
    [70, 103], [64, 111], [58, 103], [52, 112], [46, 102], [41, 109], [36, 104 - sway]], MAGE.robe);
  heroRect(c, 49, 52, 30, 5, HERO.outline);
  heroRect(c, 50, 53, 28, 3, MAGE.trimDark);
  heroRect(c, 51, 53, 26, 1, MAGE.trim);
  heroLine(c, 55, 60, 55, 104, MAGE.robeHi);
  heroLine(c, 73, 60, 73, 104, MAGE.robeDark);
  heroLine(c, 64, 62, 64, 108, MAGE.trimDark);
  heroLine(c, 65, 62, 65, 108, MAGE.trim);
  // Звёзды на мантии.
  heroDiamond(c, 52, 78, 3, MAGE.trim);
  heroDiamond(c, 58, 90, 2, MAGE.robeHi);
  heroDiamond(c, 76, 82, 3, MAGE.trim);
  heroDiamond(c, 70, 96, 2, MAGE.robeHi);

  // Широкие рукава.
  heroPoly(c, [[40, 54], [49, 57], [46, 78], [38, 94], [28, 92], [34, 76], [34, 62]], HERO.outline);
  heroPoly(c, [[42, 56], [48, 58], [45, 77], [38, 90], [31, 88], [36, 75], [36, 63]], MAGE.robe);
  heroPoly(c, [[79, 54], [88, 54], [94, 70], [100, 86], [92, 92], [85, 78], [80, 62]], HERO.outline);
  heroPoly(c, [[81, 56], [87, 56], [92, 70], [97, 85], [91, 89], [85, 77], [81, 62]], MAGE.robe);
  heroRect(c, 36, 88, 12, 7, HERO.outline);
  heroRect(c, 37, 89, 10, 5, MAGE.skinDark);
  heroRect(c, 38, 89, 8, 3, MAGE.skin);
  heroRect(c, 86, 86, 12, 8, HERO.outline);
  heroRect(c, 87, 87, 10, 6, MAGE.skinDark);
  heroRect(c, 88, 87, 8, 4, MAGE.skin);

  // Голова и длинная борода.
  heroEllipse(c, 64, 39, 12, 13, HERO.outline);
  heroEllipse(c, 64, 39, 10, 11, MAGE.skin);
  heroRect(c, 52, 36, 4, 5, MAGE.skinDark);
  heroRect(c, 72, 36, 4, 5, MAGE.skinDark);
  heroRect(c, 56, 37, 5, 2, HERO.white);
  heroRect(c, 68, 37, 5, 2, HERO.white);
  heroRect(c, 57, 38, 3, 2, HERO.eye);
  heroRect(c, 69, 38, 3, 2, HERO.eye);
  heroRect(c, 63, 42, 3, 3, MAGE.skinDark);
  heroPoly(c, [[52, 45 + beardSway], [76, 45 + beardSway], [80, 56], [74, 70],
    [70, 88], [64, 96], [58, 88], [54, 70], [48, 56]], HERO.outline);
  heroPoly(c, [[54, 47 + beardSway], [74, 47 + beardSway], [77, 57], [71, 69],
    [68, 85], [64, 91], [60, 85], [57, 69], [51, 57]], MAGE.beard);
  heroLine(c, 58, 54, 62, 84, MAGE.beardDark);
  heroLine(c, 70, 54, 66, 84, MAGE.beardDark);
  heroRect(c, 57, 47, 15, 3, MAGE.beard);
  heroRect(c, 58, 47, 13, 1, [255, 255, 255, 255]);

  // Остроконечная шляпа с золотой лентой.
  heroPoly(c, [[42, 34], [86, 34], [79, 12], [75, 2], [68, 9], [58, 22], [48, 32]], HERO.outline);
  heroPoly(c, [[46, 32], [82, 32], [76, 13], [73, 6], [68, 12], [59, 23], [51, 31]], MAGE.hat);
  heroPoly(c, [[60, 22], [68, 12], [73, 6], [76, 13], [72, 20], [64, 26]], MAGE.hatHi);
  heroEllipse(c, 64, 33, 30, 7, HERO.outline);
  heroEllipse(c, 64, 33, 27, 5, MAGE.hatDark);
  heroEllipse(c, 64, 33, 24, 3, MAGE.hat);
  heroRect(c, 50, 28, 28, 5, MAGE.trimDark);
  heroRect(c, 51, 29, 26, 3, MAGE.trim);
  heroDiamond(c, 73, 20, 3, MAGE.trim);
  heroDiamond(c, 65, 26, 2, MAGE.orb);

  // Посох с сияющим шаром.
  heroEllipse(c, 101, 28, 15, 15, MAGE.orbGlow);
  heroThickLine(c, 100, 40, 100, 122, 2, HERO.outline);
  heroThickLine(c, 100, 40, 100, 122, 1, MAGE.woodDark);
  heroLine(c, 99, 42, 99, 120, MAGE.wood);
  heroEllipse(c, 100, 29, 12, 12, HERO.outline);
  heroEllipse(c, 100, 29, 10, 10, MAGE.orbDark);
  heroEllipse(c, 100, 28, 8, 8, MAGE.orb);
  heroEllipse(c, 97, 25, 3, 3, [255, 255, 255, 255]);
  heroLine(c, 93, 29, 89, 29, MAGE.orb);
  heroLine(c, 111, 29, 115, 29, MAGE.orb);
  heroLine(c, 100, 18, 100, 14, MAGE.orb);
  // Рука на посохе.
  heroRect(c, 93, 82, 14, 9, HERO.outline);
  heroRect(c, 94, 83, 12, 7, MAGE.skinDark);
  heroRect(c, 95, 83, 10, 5, MAGE.skin);
}

function spriteHero(name, draw) {
  const idle = heroMake();
  draw(idle, 0);
  writeHeroSprite(name, idle);
  const walk1 = heroMake();
  draw(walk1, 1);
  writeHeroSprite(name + '_walk1', walk1);
  const walk2 = heroMake();
  draw(walk2, 2);
  writeHeroSprite(name + '_walk2', walk2);
}

function spriteHeroes() {
  spriteHero('playerPaladin', drawPaladin);
  spriteHero('playerBerserker', drawBerserker);
  spriteHero('playerArcher', drawArcher);
  spriteHero('playerMage', drawMage);
}

// Шаман 32×32: тот же силуэт, что и тайл 71, вдвое крупнее.
function spriteShaman() {
  const c = hmake();
  const robe = [90, 58, 120, 255];
  const robeDk = [74, 48, 96, 255];
  const mask = [232, 224, 204, 255];
  const maskDk = [42, 26, 56, 255];
  const feather = [176, 96, 224, 255];
  const staff = [120, 80, 45, 255];
  hrect(c, 8, 4, 16, 4, robeDk);
  hrect(c, 6, 2, 4, 6, feather);
  hrect(c, 22, 2, 4, 6, feather);
  hrect(c, 10, 6, 12, 6, mask);
  hpx(c, 12, 8, maskDk); hpx(c, 13, 8, maskDk);
  hpx(c, 18, 8, maskDk); hpx(c, 19, 8, maskDk);
  hrect(c, 10, 14, 12, 14, robe);
  hrect(c, 8, 16, 2, 10, robeDk);
  hrect(c, 22, 16, 2, 10, robeDk);
  hrect(c, 26, 6, 2, 20, staff);
  hrect(c, 24, 2, 6, 4, mask);
  hpx(c, 26, 4, maskDk); hpx(c, 27, 4, maskDk);
  writeSprite('shaman', c);
}

// --- Боссы 256×256: та же сетка 128×128 и хелперы, что у героев ---
const BOSS = {
  bone: [232, 226, 206, 255],
  boneDark: [172, 164, 142, 255],
  boneHi: [255, 252, 238, 255],
  steel: [112, 120, 142, 255],
  steelDark: [62, 68, 88, 255],
  steelHi: [174, 186, 208, 255],
  gold: HERO.gold,
  goldDark: HERO.goldDark,
  eyeRed: [255, 78, 62, 255],
  eyeYellow: [255, 216, 96, 255],
  eyeCyan: [124, 242, 255, 255],
  eyeAmber: [255, 156, 54, 255]
};

// Глаз с тёмной обводкой и бликом: свечение не режет лицо дыркой.
function bossEye(c, cx, cy, rx, ry, color) {
  heroEllipse(c, cx, cy, rx + 1, ry + 1, HERO.outline);
  heroEllipse(c, cx, cy, rx, ry, color);
  heroEllipse(c, cx - 1, cy - 1, Math.max(1, rx - 2), Math.max(1, ry - 2), [255, 255, 255, 235]);
}

// Корона: три зубца, обод и самоцветы.
function bossCrown(c, cx, y, w) {
  const half = Math.round(w / 2);
  const h = Math.round(w * 0.35);
  for (let i = -1; i <= 1; i++) {
    const x = cx + i * Math.round(w / 3);
    heroPoly(c, [[x - 6, y - 5], [x, y - 5 - h], [x + 6, y - 5]], HERO.outline);
    heroPoly(c, [[x - 4, y - 6], [x, y - 3 - h], [x + 4, y - 6]], BOSS.gold);
  }
  heroRect(c, cx - half - 2, y - 7, w + 4, 11, HERO.outline);
  heroRect(c, cx - half, y - 6, w, 9, BOSS.goldDark);
  heroRect(c, cx - half, y - 6, w, 3, BOSS.gold);
  heroDiamond(c, cx, y - 2, 3, [214, 46, 58, 255]);
  heroDiamond(c, cx - Math.round(w / 4), y - 2, 2, [90, 210, 240, 255]);
  heroDiamond(c, cx + Math.round(w / 4), y - 2, 2, [90, 210, 240, 255]);
}

// Пламя: внешний контур, тело и яркое ядро.
function bossFlame(c, x, y, size, pose, colors) {
  const sway = pose === 1 ? 3 : pose === 2 ? -3 : 0;
  const h = size;
  const outer = [[x - size * 0.5, y], [x - size * 0.34, y - h * 0.42],
    [x - size * 0.58 + sway, y - h * 0.72], [x + sway, y - h],
    [x + size * 0.44 + sway, y - h * 0.62], [x + size * 0.32, y - h * 0.34],
    [x + size * 0.5, y]];
  const inner = [[x - size * 0.3, y], [x - size * 0.16, y - h * 0.4],
    [x - size * 0.24 + sway, y - h * 0.62], [x + sway * 0.5, y - h * 0.78],
    [x + size * 0.26 + sway, y - h * 0.48], [x + size * 0.3, y]];
  const core = [[x - size * 0.12, y], [x - size * 0.04, y - h * 0.42],
    [x + sway * 0.3, y - h * 0.55], [x + size * 0.14, y - h * 0.32],
    [x + size * 0.16, y]];
  heroPoly(c, outer, HERO.outline);
  heroPoly(c, inner, colors.main);
  heroPoly(c, core, colors.core);
}

// Крыло: взмах задаёт подъём кончика, перепонка и кости идут за силуэтом.
function bossWing(c, side, pose, colors) {
  const lift = pose === 1 ? -16 : pose === 2 ? 14 : 0;
  const dir = side;
  const rootX = 64 + dir * 14;
  const rootY = 68;
  const elbowX = 64 + dir * 32;
  const elbowY = 60 + Math.round(lift * 0.45);
  const tipX = 64 + dir * 62;
  const tipY = 46 + lift;
  const outer = [
    [rootX, rootY],
    [elbowX, elbowY - 6],
    [tipX, tipY],
    [64 + dir * 52, 88 + Math.round(lift * 0.4)],
    [64 + dir * 40, 82 + Math.round(lift * 0.3)],
    [64 + dir * 30, 98 + Math.round(lift * 0.2)],
    [rootX, 94]
  ];
  const inner = [
    [rootX, rootY + 2],
    [elbowX, elbowY - 2],
    [tipX - dir * 5, tipY + 7],
    [64 + dir * 48, 86 + Math.round(lift * 0.35)],
    [64 + dir * 36, 82 + Math.round(lift * 0.25)],
    [64 + dir * 28, 94 + Math.round(lift * 0.2)],
    [rootX, 90]
  ];
  heroPoly(c, outer, HERO.outline);
  heroPoly(c, inner, colors.membraneDark);
  heroThickLine(c, rootX, rootY, elbowX, elbowY - 6, 1, HERO.outline);
  heroThickLine(c, elbowX, elbowY - 6, tipX, tipY, 1, HERO.outline);
  heroLine(c, rootX, rootY + 1, elbowX, elbowY - 4, colors.bone);
  heroLine(c, elbowX, elbowY - 4, tipX, tipY + 1, colors.bone);
}

// Нога в штанах и сапогах: подъём стопы даёт кадр шага.
function bossLeg(c, x, top, lift, cloth, clothDark, boot, bootDark) {
  const bottom = 126 - lift;
  heroRect(c, x - 1, top - 1, 16, bottom - top + 2, HERO.outline);
  heroRect(c, x, top, 14, bottom - top, clothDark);
  heroRect(c, x + 1, top, 10, Math.max(0, bottom - top - 2), cloth);
  heroRect(c, x, bottom - 9, 16, 10, HERO.outline);
  heroRect(c, x + 1, bottom - 8, 14, 8, bootDark);
  heroRect(c, x + 1, bottom - 8, 14, 3, boot);
}

// Костяная нога с наколенником и тяжёлым сапогом.
function bossBoneLeg(c, x, top, lift) {
  const bottom = 126 - lift;
  heroRect(c, x - 1, top - 1, 12, bottom - top + 2, HERO.outline);
  heroRect(c, x, top, 10, bottom - top, BOSS.boneDark);
  heroRect(c, x + 1, top, 6, Math.max(0, bottom - top - 4), BOSS.bone);
  heroEllipse(c, x + 5, top + 12, 6, 5, HERO.outline);
  heroEllipse(c, x + 5, top + 12, 4, 3, BOSS.bone);
  heroRect(c, x - 2, bottom - 8, 16, 9, HERO.outline);
  heroRect(c, x - 1, bottom - 7, 14, 7, BOSS.steelDark);
  heroRect(c, x - 1, bottom - 7, 14, 3, BOSS.steel);
}

// Толстая каменная нога крушителя.
function bossThickLeg(c, x, top, lift, stone, stoneDark) {
  const bottom = 126 - lift;
  heroRect(c, x - 2, top - 2, 24, bottom - top + 3, HERO.outline);
  heroRect(c, x - 1, top - 1, 22, bottom - top + 1, stoneDark);
  heroRect(c, x + 1, top, 18, Math.max(0, bottom - top - 3), stone);
  heroRect(c, x - 3, bottom - 8, 28, 10, HERO.outline);
  heroRect(c, x - 2, bottom - 7, 26, 8, stoneDark);
  heroRect(c, x - 2, bottom - 7, 26, 3, stone);
}

// Король слизи: большая туша, корона и злая ухмылка.
function bossSlime(c, pose) {
  const step = pose === 1 ? 1 : pose === 2 ? -1 : 0;
  const squash = pose === 1 ? 3 : pose === 2 ? -3 : 0;
  const rx = 48 + squash;
  const ry = 40 - squash;
  const cy = 124 - ry;
  const body = [74, 198, 104, 255];
  const bodyDark = [38, 132, 68, 255];
  const bodyHi = [150, 240, 164, 255];
  const goo = [34, 96, 52, 255];

  // Псевдоподии и капли по бокам.
  heroEllipse(c, 20 - step * 2, 108, 12, 9, HERO.outline);
  heroEllipse(c, 20 - step * 2, 108, 10, 7, bodyDark);
  heroEllipse(c, 108 + step * 2, 106, 11, 8, HERO.outline);
  heroEllipse(c, 108 + step * 2, 106, 9, 6, bodyDark);
  heroEllipse(c, 30 - step, 122, 6, 5, HERO.outline);
  heroEllipse(c, 30 - step, 122, 4, 3, body);
  heroEllipse(c, 98 + step, 122, 5, 4, HERO.outline);
  heroEllipse(c, 98 + step, 122, 3, 2, body);

  // Тело.
  heroEllipse(c, 64, cy, rx + 2, ry + 2, HERO.outline);
  heroEllipse(c, 64, cy, rx, ry, bodyDark);
  heroEllipse(c, 62, cy - 3, rx - 6, ry - 6, body);
  heroEllipse(c, 46, cy - ry * 0.42, 16, 11, bodyHi);
  heroEllipse(c, 78, cy - ry * 0.55, 7, 5, [190, 255, 200, 255]);
  heroEllipse(c, 88, 92, 6, 6, [120, 226, 140, 255]);
  heroEllipse(c, 88, 92, 4, 4, [170, 250, 186, 255]);
  heroEllipse(c, 34, 100, 4, 4, [120, 226, 140, 255]);

  // Глаза, щёлки зрачков и злые брови.
  bossEye(c, 48 + step, 78, 10, 11, BOSS.eyeYellow);
  bossEye(c, 80 + step, 78, 10, 11, BOSS.eyeYellow);
  heroRect(c, 47 + step, 72, 3, 12, HERO.outline);
  heroRect(c, 79 + step, 72, 3, 12, HERO.outline);
  heroPoly(c, [[34 + step, 64], [56 + step, 70], [54 + step, 76], [32 + step, 70]], HERO.outline);
  heroPoly(c, [[94 + step, 64], [72 + step, 70], [74 + step, 76], [96 + step, 70]], HERO.outline);

  // Ухмылка с зубами.
  heroPoly(c, [[46 + step, 96], [82 + step, 96], [76 + step, 108], [52 + step, 108]], HERO.outline);
  heroPoly(c, [[49 + step, 98], [79 + step, 98], [74 + step, 105], [54 + step, 105]], goo);
  for (let i = 0; i < 4; i++) heroRect(c, 54 + step + i * 6, 98, 4, 5, BOSS.boneHi);

  bossCrown(c, 64 + step, cy - ry + 2, 44);
}

// Крысиный вожак: горб, кинжал, шрам и тяжёлый хвост.
function bossRat(c, pose) {
  const step = pose === 1 ? 1 : pose === 2 ? -1 : 0;
  const sway = pose === 1 ? -6 : pose === 2 ? 6 : 0;
  const armY = step * 3;
  const fur = [154, 112, 70, 255];
  const furDark = [104, 72, 42, 255];
  const furHi = [196, 154, 104, 255];
  const skin = [214, 158, 150, 255];
  const leather = [84, 58, 38, 255];
  const leatherDark = [52, 34, 22, 255];

  // Хвост.
  heroThickLine(c, 90, 104, 112, 92 + sway, 3, HERO.outline);
  heroThickLine(c, 112, 92 + sway, 120, 66 + sway, 3, HERO.outline);
  heroThickLine(c, 90, 104, 112, 92 + sway, 1, skin);
  heroThickLine(c, 112, 92 + sway, 120, 66 + sway, 1, skin);

  // Ноги.
  bossLeg(c, 42 - step * 2, 92, pose === 1 ? 4 : 0, fur, furDark, furDark, fur);
  bossLeg(c, 70 + step * 2, 92, pose === 2 ? 4 : 0, fur, furDark, furDark, fur);

  // Торс и кожаная упряжь.
  heroPoly(c, [[38, 66], [90, 66], [86, 102], [42, 102]], HERO.outline);
  heroPoly(c, [[40, 68], [88, 68], [84, 100], [44, 100]], furDark);
  heroPoly(c, [[44, 70], [84, 70], [80, 96], [48, 96]], fur);
  heroEllipse(c, 64, 78, 16, 10, furHi);
  heroPoly(c, [[45, 68], [56, 67], [82, 94], [74, 100]], HERO.outline);
  heroPoly(c, [[46, 70], [54, 69], [79, 93], [74, 97]], leather);
  heroRect(c, 40, 96, 48, 9, HERO.outline);
  heroRect(c, 41, 97, 46, 7, leatherDark);
  heroRect(c, 52, 96, 24, 9, leather);
  heroRect(c, 60, 97, 8, 7, BOSS.steelDark);
  heroDiamond(c, 64, 100, 3, BOSS.bone);

  // Плечи.
  heroEllipse(c, 38, 68, 14, 11, HERO.outline);
  heroEllipse(c, 38, 67, 12, 9, furDark);
  heroEllipse(c, 90, 68, 14, 11, HERO.outline);
  heroEllipse(c, 90, 67, 12, 9, furDark);

  // Левая рука с кинжалом.
  heroPoly(c, [[36, 72 + armY], [46, 74 + armY], [44, 94 + armY],
    [32, 98 + armY], [26, 90 + armY], [32, 80 + armY]], HERO.outline);
  heroPoly(c, [[38, 74 + armY], [44, 75 + armY], [42, 92 + armY],
    [33, 95 + armY], [29, 89 + armY], [34, 81 + armY]], fur);
  heroEllipse(c, 30, 94 + armY, 7, 7, HERO.outline);
  heroEllipse(c, 30, 94 + armY, 5, 5, fur);
  heroPoly(c, [[24, 92 + armY], [18, 60 + armY], [22, 44 + armY],
    [30, 58 + armY], [32, 90 + armY]], HERO.outline);
  heroPoly(c, [[25, 90 + armY], [21, 62 + armY], [23, 50 + armY],
    [28, 60 + armY], [29, 88 + armY]], BOSS.steel);
  heroLine(c, 25, 88 + armY, 23, 60 + armY, BOSS.steelHi);
  heroRect(c, 18, 88 + armY, 16, 5, HERO.outline);
  heroRect(c, 19, 89 + armY, 14, 3, BOSS.goldDark);

  // Правая лапа с когтями.
  heroPoly(c, [[84, 72 - armY], [94, 72 - armY], [100, 92 - armY],
    [88, 100 - armY], [80, 92 - armY]], HERO.outline);
  heroPoly(c, [[86, 74 - armY], [92, 74 - armY], [97, 91 - armY],
    [88, 97 - armY], [83, 91 - armY]], fur);
  heroEllipse(c, 94, 96 - armY, 8, 7, HERO.outline);
  heroEllipse(c, 94, 96 - armY, 6, 5, fur);
  for (let i = 0; i < 3; i++) {
    heroPoly(c, [[90 + i * 5, 100 - armY], [92 + i * 5, 92 - armY],
      [94 + i * 5, 100 - armY]], BOSS.boneHi);
  }

  // Уши.
  heroEllipse(c, 38, 28, 17, 17, HERO.outline);
  heroEllipse(c, 38, 28, 14, 14, furDark);
  heroEllipse(c, 38, 28, 9, 10, skin);
  heroEllipse(c, 90, 28, 17, 17, HERO.outline);
  heroEllipse(c, 90, 28, 14, 14, furDark);
  heroEllipse(c, 90, 28, 9, 10, skin);

  // Голова и морда.
  heroEllipse(c, 64, 46, 28, 24, HERO.outline);
  heroEllipse(c, 64, 46, 26, 22, furDark);
  heroEllipse(c, 63, 44, 24, 20, fur);
  heroEllipse(c, 64, 61, 17, 11, HERO.outline);
  heroEllipse(c, 64, 60, 15, 9, furHi);
  heroEllipse(c, 64, 58, 5, 4, HERO.outline);
  heroRect(c, 62, 56, 4, 3, [36, 26, 26, 255]);
  heroLine(c, 64, 62, 64, 68, HERO.outline);
  heroPoly(c, [[56, 64], [60, 64], [58, 72]], BOSS.boneHi);
  heroPoly(c, [[68, 64], [72, 64], [70, 72]], BOSS.boneHi);
  heroLine(c, 50, 60, 28, 54, [220, 204, 178, 255]);
  heroLine(c, 50, 64, 26, 66, [220, 204, 178, 255]);
  heroLine(c, 78, 60, 100, 54, [220, 204, 178, 255]);
  heroLine(c, 78, 64, 102, 66, [220, 204, 178, 255]);
  bossEye(c, 51, 42, 5, 5, BOSS.eyeRed);
  bossEye(c, 77, 42, 5, 5, BOSS.eyeRed);
  heroRect(c, 46, 37, 9, 2, HERO.outline);
  heroRect(c, 73, 37, 9, 2, HERO.outline);
  heroLine(c, 72, 33, 84, 52, [214, 170, 150, 255]);
}

// Костяной страж: ржавый шлем, щит с черепом и двуручный меч.
function bossBone(c, pose) {
  const step = pose === 1 ? 1 : pose === 2 ? -1 : 0;
  const armY = step * 3;

  bossBoneLeg(c, 48 - step * 2, 96, pose === 1 ? 3 : 0);
  bossBoneLeg(c, 68 + step * 2, 96, pose === 2 ? 3 : 0);

  // Таз и рёбра.
  heroPoly(c, [[48, 92], [80, 92], [84, 102], [74, 108], [54, 108], [44, 102]], HERO.outline);
  heroPoly(c, [[50, 94], [78, 94], [81, 101], [72, 105], [56, 105], [47, 101]], BOSS.boneDark);
  heroRect(c, 59, 58, 10, 42, HERO.outline);
  heroRect(c, 61, 60, 6, 38, BOSS.boneDark);
  for (let i = 0; i < 5; i++) {
    const y = 64 + i * 7;
    heroRect(c, 42, y, 44, 6, HERO.outline);
    heroRect(c, 43, y + 1, 42, 4, BOSS.boneDark);
    heroRect(c, 45, y + 1, 38, 2, BOSS.bone);
  }
  heroRect(c, 60, 58, 8, 46, HERO.outline);
  heroRect(c, 62, 60, 4, 42, BOSS.boneDark);
  heroRect(c, 63, 60, 2, 42, BOSS.bone);

  // Костяные наплечники.
  heroPoly(c, [[26, 58], [44, 48], [54, 62], [42, 72], [30, 68]], HERO.outline);
  heroPoly(c, [[29, 59], [43, 51], [50, 62], [41, 69], [32, 66]], BOSS.boneDark);
  heroPoly(c, [[32, 59], [43, 54], [47, 61], [40, 65], [34, 63]], BOSS.bone);
  heroPoly(c, [[74, 58], [92, 48], [102, 62], [90, 72], [78, 68]], HERO.outline);
  heroPoly(c, [[77, 59], [91, 51], [98, 62], [89, 69], [80, 66]], BOSS.boneDark);
  heroPoly(c, [[80, 59], [91, 54], [95, 61], [88, 65], [82, 63]], BOSS.bone);

  // Левая рука за щитом.
  heroRect(c, 34, 70, 10, 24, HERO.outline);
  heroRect(c, 35, 71, 8, 22, BOSS.boneDark);
  heroRect(c, 36, 71, 5, 20, BOSS.bone);

  // Правая рука с мечом.
  heroRect(c, 88, 70 + armY, 10, 26, HERO.outline);
  heroRect(c, 89, 71 + armY, 8, 24, BOSS.boneDark);
  heroRect(c, 90, 71 + armY, 5, 22, BOSS.bone);
  heroEllipse(c, 94, 96 + armY, 6, 6, HERO.outline);
  heroEllipse(c, 94, 96 + armY, 4, 4, BOSS.bone);
  heroPoly(c, [[94, 84 + armY], [100, 80 + armY], [104, 18 + armY],
    [110, 10 + armY], [116, 18 + armY], [112, 80 + armY], [100, 92 + armY]], HERO.outline);
  heroPoly(c, [[97, 82 + armY], [102, 78 + armY], [106, 21 + armY],
    [110, 15 + armY], [113, 21 + armY], [109, 78 + armY], [100, 88 + armY]], BOSS.steel);
  heroLine(c, 107, 24 + armY, 109, 76 + armY, BOSS.steelHi);
  heroRect(c, 90, 82 + armY, 28, 7, HERO.outline);
  heroRect(c, 91, 83 + armY, 26, 5, BOSS.goldDark);
  heroRect(c, 92, 84 + armY, 24, 3, BOSS.gold);
  heroRect(c, 100, 88 + armY, 8, 12, HERO.outline);
  heroRect(c, 101, 89 + armY, 6, 10, HERO.leatherDark);

  // Щит с черепом.
  heroPoly(c, [[6, 62], [40, 54], [48, 88], [34, 120], [8, 104]], HERO.outline);
  heroPoly(c, [[9, 65], [38, 58], [45, 88], [33, 116], [11, 102]], BOSS.steelDark);
  heroPoly(c, [[12, 68], [35, 62], [42, 88], [32, 111], [14, 100]], BOSS.steel);
  heroLine(c, 16, 72, 30, 104, BOSS.steelHi);
  heroEllipse(c, 27, 84, 10, 11, HERO.outline);
  heroEllipse(c, 27, 83, 8, 9, BOSS.bone);
  heroRect(c, 22, 80, 3, 4, HERO.outline);
  heroRect(c, 29, 80, 3, 4, HERO.outline);
  heroRect(c, 25, 88, 4, 3, HERO.outline);
  heroRect(c, 26, 89, 2, 1, BOSS.boneDark);

  // Череп под ржавым шлемом.
  heroEllipse(c, 64, 32, 19, 20, HERO.outline);
  heroEllipse(c, 64, 32, 17, 18, BOSS.bone);
  heroRect(c, 54, 44, 20, 12, HERO.outline);
  heroRect(c, 55, 45, 18, 10, BOSS.boneDark);
  for (let i = 0; i < 4; i++) heroRect(c, 57 + i * 4, 46, 3, 8, BOSS.boneHi);
  heroEllipse(c, 56, 30, 6, 6, [26, 20, 20, 255]);
  heroEllipse(c, 72, 30, 6, 6, [26, 20, 20, 255]);
  bossEye(c, 56, 30, 3, 3, BOSS.eyeRed);
  bossEye(c, 72, 30, 3, 3, BOSS.eyeRed);
  heroEllipse(c, 64, 26, 22, 15, HERO.outline);
  heroEllipse(c, 64, 26, 20, 13, BOSS.steelDark);
  heroEllipse(c, 64, 25, 17, 10, BOSS.steel);
  heroRect(c, 50, 30, 28, 6, HERO.outline);
  heroRect(c, 51, 31, 26, 4, BOSS.steelDark);
  heroRect(c, 61, 28, 6, 18, BOSS.steelDark);
  heroRect(c, 63, 28, 2, 18, BOSS.steelHi);
  heroPoly(c, [[46, 22], [34, 8], [30, 14], [42, 30]], HERO.outline);
  heroPoly(c, [[46, 22], [37, 11], [34, 15], [43, 27]], BOSS.bone);
  heroPoly(c, [[82, 22], [94, 8], [98, 14], [86, 30]], HERO.outline);
  heroPoly(c, [[82, 22], [91, 11], [94, 15], [85, 27]], BOSS.bone);
}

// Стрелок бездны: капюшон, светящиеся глаза, большой лук и колчан.
function bossArcher(c, pose) {
  const step = pose === 1 ? 1 : pose === 2 ? -1 : 0;
  const sway = -step * 4;
  const armY = step * 3;
  const cloak = [50, 82, 54, 255];
  const cloakDark = [30, 52, 36, 255];
  const cloakHi = [76, 112, 72, 255];
  const leather = [104, 70, 42, 255];
  const leatherDark = [64, 42, 26, 255];

  // Плащ.
  heroPoly(c, [[38, 54], [90, 54], [102, 108 + sway], [94, 118], [86, 108],
    [78, 120], [70, 110], [64, 118], [58, 110], [50, 120], [42, 108],
    [34, 118], [26, 108 - sway]], HERO.outline);
  heroPoly(c, [[41, 56], [87, 56], [98, 106 + sway], [90, 113], [83, 104],
    [76, 115], [69, 106], [64, 113], [59, 106], [52, 115], [45, 104],
    [38, 113], [30, 106 - sway]], cloakDark);
  heroPoly(c, [[45, 58], [83, 58], [94, 104 + sway], [87, 108], [80, 100],
    [73, 110], [67, 101], [64, 108], [61, 101], [55, 110], [48, 100],
    [41, 108], [34, 104 - sway]], cloak);

  // Колчан.
  heroRect(c, 82, 34, 18, 48, HERO.outline);
  heroRect(c, 84, 36, 14, 44, leatherDark);
  heroRect(c, 85, 36, 12, 42, leather);
  for (let i = 0; i < 3; i++) {
    const ax = 86 + i * 4;
    heroRect(c, ax, 16 + i * 2, 2, 24, HERO.woodDark);
    heroRect(c, ax, 16 + i * 2, 2, 8, [218, 194, 98, 255]);
    heroRect(c, ax - 1, 23 + i * 2, 4, 3, [218, 194, 98, 255]);
  }

  // Ноги.
  bossLeg(c, 46 - step * 2, 94, pose === 1 ? 4 : 0, leather, leatherDark, leatherDark, leather);
  bossLeg(c, 66 + step * 2, 94, pose === 2 ? 4 : 0, leather, leatherDark, leatherDark, leather);

  // Торс.
  heroRect(c, 44, 58, 40, 42, HERO.outline);
  heroRect(c, 45, 59, 38, 40, leatherDark);
  heroRect(c, 47, 59, 34, 38, leather);
  heroRect(c, 47, 59, 7, 35, [140, 98, 60, 255]);
  heroPoly(c, [[47, 62], [55, 61], [82, 92], [76, 98]], HERO.outline);
  heroPoly(c, [[48, 63], [54, 62], [80, 92], [76, 96]], [140, 98, 60, 255]);
  heroRect(c, 44, 94, 40, 7, HERO.outline);
  heroRect(c, 45, 95, 38, 5, leatherDark);

  // Лук.
  heroPoly(c, [[32, 26], [22, 38], [16, 56], [14, 72], [16, 90], [22, 108],
    [32, 116], [30, 100], [26, 84], [24, 70], [26, 52], [30, 38]], HERO.outline);
  heroPoly(c, [[30, 30], [24, 40], [19, 57], [17, 72], [19, 89], [24, 106],
    [30, 112], [28, 99], [24, 84], [22, 70], [24, 53], [28, 39]], ARCHER.wood);
  heroLine(c, 31, 30, 31, 112, ARCHER.string);
  heroRect(c, 26, 64, 12, 10, HERO.outline);
  heroRect(c, 27, 65, 10, 8, leatherDark);
  heroRect(c, 28, 66, 8, 4, [218, 194, 98, 255]);

  // Стрела с наконечником бездны.
  heroRect(c, 6, 68, 34, 3, HERO.outline);
  heroRect(c, 7, 69, 32, 1, [220, 200, 140, 255]);
  heroPoly(c, [[4, 69], [10, 64], [10, 74]], BOSS.steelHi);
  heroPoly(c, [[36, 69], [42, 64], [42, 74]], [180, 40, 40, 255]);

  // Руки.
  heroRect(c, 34, 64 + armY, 12, 26, HERO.outline);
  heroRect(c, 35, 65 + armY, 10, 24, leatherDark);
  heroRect(c, 36, 65 + armY, 7, 22, leather);
  heroEllipse(c, 30, 70 + armY, 6, 6, HERO.outline);
  heroEllipse(c, 30, 70 + armY, 4, 4, leather);
  heroPoly(c, [[76, 64 - armY], [86, 66 - armY], [80, 86 - armY], [70, 82 - armY]], HERO.outline);
  heroPoly(c, [[78, 66 - armY], [84, 67 - armY], [79, 83 - armY], [72, 80 - armY]], leather);
  heroRect(c, 54, 66 - armY, 28, 8, HERO.outline);
  heroRect(c, 55, 67 - armY, 26, 6, leatherDark);
  heroEllipse(c, 52, 70 - armY, 6, 6, HERO.outline);
  heroEllipse(c, 52, 70 - armY, 4, 4, leather);

  // Капюшон и тень лица.
  heroPoly(c, [[42, 58], [46, 36], [56, 20], [64, 16], [72, 20], [82, 36],
    [86, 58], [78, 64], [70, 56], [64, 66], [58, 56], [50, 64]], HERO.outline);
  heroPoly(c, [[45, 56], [49, 38], [58, 24], [64, 21], [70, 24], [79, 38],
    [83, 56], [77, 60], [70, 53], [64, 62], [58, 53], [51, 60]], cloakDark);
  heroPoly(c, [[48, 52], [52, 38], [59, 27], [64, 24], [69, 27], [76, 38],
    [80, 52], [74, 56], [68, 50], [64, 57], [60, 50], [54, 56]], cloak);
  heroEllipse(c, 64, 43, 15, 14, [22, 24, 26, 255]);
  bossEye(c, 57, 43, 4, 3, BOSS.eyeYellow);
  bossEye(c, 71, 43, 4, 3, BOSS.eyeYellow);
  heroRect(c, 52, 57, 24, 4, cloakHi);
}

// Владыка стаи: широкие крылья, корона и клыки.
function bossBat(c, pose) {
  const bob = pose === 1 ? -4 : pose === 2 ? 1 : 0;
  const wingColors = {
    membraneDark: [96, 56, 168, 255],
    bone: [198, 174, 240, 255]
  };
  bossWing(c, -1, pose, wingColors);
  bossWing(c, 1, pose, wingColors);

  // Тело.
  heroEllipse(c, 64, 82 + bob, 20, 26, HERO.outline);
  heroEllipse(c, 64, 82 + bob, 18, 24, [92, 52, 160, 255]);
  heroEllipse(c, 60, 76 + bob, 10, 12, [126, 82, 200, 255]);

  // Лапы с когтями.
  heroRect(c, 52, 102 + bob, 8, 16, HERO.outline);
  heroRect(c, 53, 103 + bob, 6, 14, [92, 52, 160, 255]);
  heroRect(c, 68, 102 + bob, 8, 16, HERO.outline);
  heroRect(c, 69, 103 + bob, 6, 14, [92, 52, 160, 255]);
  for (let i = 0; i < 3; i++) {
    heroPoly(c, [[51 + i * 4, 120 + bob], [53 + i * 4, 114 + bob],
      [55 + i * 4, 120 + bob]], BOSS.boneHi);
    heroPoly(c, [[67 + i * 4, 120 + bob], [69 + i * 4, 114 + bob],
      [71 + i * 4, 120 + bob]], BOSS.boneHi);
  }

  // Уши.
  heroPoly(c, [[48, 40 + bob], [42, 12 + bob], [58, 30 + bob]], HERO.outline);
  heroPoly(c, [[49, 38 + bob], [44, 17 + bob], [56, 31 + bob]], [150, 104, 224, 255]);
  heroPoly(c, [[80, 40 + bob], [86, 12 + bob], [70, 30 + bob]], HERO.outline);
  heroPoly(c, [[79, 38 + bob], [84, 17 + bob], [72, 31 + bob]], [150, 104, 224, 255]);

  // Голова.
  heroEllipse(c, 64, 48 + bob, 19, 17, HERO.outline);
  heroEllipse(c, 64, 48 + bob, 17, 15, [112, 66, 184, 255]);
  heroEllipse(c, 60, 45 + bob, 9, 7, [146, 96, 216, 255]);
  bossEye(c, 56, 46 + bob, 5, 5, BOSS.eyeRed);
  bossEye(c, 72, 46 + bob, 5, 5, BOSS.eyeRed);
  heroPoly(c, [[56, 54 + bob], [72, 54 + bob], [64, 64 + bob]], HERO.outline);
  heroPoly(c, [[58, 55 + bob], [70, 55 + bob], [64, 61 + bob]], [58, 20, 44, 255]);
  heroPoly(c, [[57, 55 + bob], [61, 55 + bob], [59, 63 + bob]], BOSS.boneHi);
  heroPoly(c, [[67, 55 + bob], [71, 55 + bob], [69, 63 + bob]], BOSS.boneHi);

  bossCrown(c, 64, 33 + bob, 26);
}

// Каменный крушитель: глыба, кулаки и трещины.
function bossBrute(c, pose) {
  const step = pose === 1 ? 1 : pose === 2 ? -1 : 0;
  const fistL = pose === 1 ? 5 : 0;
  const fistR = pose === 2 ? 5 : 0;
  const stone = [128, 120, 110, 255];
  const stoneDark = [86, 80, 74, 255];
  const stoneHi = [166, 158, 146, 255];
  const moss = [84, 118, 62, 255];

  bossThickLeg(c, 36 - step * 2, 92, pose === 1 ? 4 : 0, stone, stoneDark);
  bossThickLeg(c, 68 + step * 2, 92, pose === 2 ? 4 : 0, stone, stoneDark);

  // Торс.
  heroPoly(c, [[26, 56], [102, 56], [108, 94], [94, 106], [34, 106], [20, 94]], HERO.outline);
  heroPoly(c, [[28, 58], [100, 58], [105, 93], [92, 103], [36, 103], [23, 93]], stoneDark);
  heroPoly(c, [[31, 60], [97, 60], [101, 91], [89, 100], [39, 100], [27, 91]], stone);
  heroRect(c, 31, 60, 66, 8, stoneHi);
  heroLine(c, 46, 64, 54, 80, stoneDark);
  heroLine(c, 54, 80, 48, 92, stoneDark);
  heroLine(c, 78, 62, 72, 78, stoneDark);
  heroLine(c, 72, 78, 82, 94, stoneDark);
  heroLine(c, 58, 80, 62, 88, [255, 140, 50, 255]);
  heroEllipse(c, 40, 96, 12, 5, moss);
  heroEllipse(c, 86, 66, 9, 5, moss);

  // Плечи.
  heroEllipse(c, 24, 60, 18, 16, HERO.outline);
  heroEllipse(c, 24, 59, 16, 14, stoneDark);
  heroEllipse(c, 24, 58, 13, 11, stone);
  heroEllipse(c, 104, 60, 18, 16, HERO.outline);
  heroEllipse(c, 104, 59, 16, 14, stoneDark);
  heroEllipse(c, 104, 58, 13, 11, stone);
  heroEllipse(c, 19, 55, 6, 4, moss);
  heroEllipse(c, 109, 55, 6, 4, moss);

  // Голова.
  heroEllipse(c, 64, 44, 16, 15, HERO.outline);
  heroEllipse(c, 64, 44, 14, 13, stoneDark);
  heroEllipse(c, 64, 43, 11, 10, stone);
  bossEye(c, 58, 42, 3, 3, BOSS.eyeAmber);
  bossEye(c, 70, 42, 3, 3, BOSS.eyeAmber);
  heroLine(c, 56, 50, 72, 50, HERO.outline);
  heroLine(c, 58, 52, 70, 52, stoneDark);

  // Руки и кулаки.
  heroRect(c, 12, 64 + fistL, 20, 34, HERO.outline);
  heroRect(c, 14, 65 + fistL, 16, 30, stoneDark);
  heroRect(c, 16, 65 + fistL, 10, 26, stone);
  heroEllipse(c, 20, 102 + fistL, 16, 14, HERO.outline);
  heroEllipse(c, 20, 101 + fistL, 14, 12, stoneDark);
  heroEllipse(c, 20, 100 + fistL, 11, 9, stone);
  for (let i = 0; i < 3; i++) heroRect(c, 12 + i * 5, 96 + fistL, 3, 6, stoneHi);
  heroRect(c, 96, 64 + fistR, 20, 34, HERO.outline);
  heroRect(c, 98, 65 + fistR, 16, 30, stoneDark);
  heroRect(c, 102, 65 + fistR, 10, 26, stone);
  heroEllipse(c, 108, 102 + fistR, 16, 14, HERO.outline);
  heroEllipse(c, 108, 101 + fistR, 14, 12, stoneDark);
  heroEllipse(c, 108, 100 + fistR, 11, 9, stone);
  for (let i = 0; i < 3; i++) heroRect(c, 100 + i * 5, 96 + fistR, 3, 6, stoneHi);
}

// Ведьма катакомб: горб, кривая шляпа и зелёное пламя посоха.
function bossWitch(c, pose) {
  const step = pose === 1 ? 1 : pose === 2 ? -1 : 0;
  const sway = -step * 3;
  const hatSway = step * 4;
  const robe = [112, 58, 148, 255];
  const robeDark = [72, 34, 104, 255];
  const robeHi = [148, 88, 180, 255];
  const skin = [118, 160, 96, 255];
  const skinDark = [82, 118, 66, 255];

  // Посох и пламя.
  heroThickLine(c, 104, 34, 100, 124, 3, HERO.outline);
  heroThickLine(c, 104, 34, 100, 124, 1, [92, 62, 38, 255]);
  bossFlame(c, 104, 32, 24, pose, { main: [92, 226, 128, 255], core: [220, 255, 200, 255] });

  // Сапоги под подолом.
  bossLeg(c, 44 - step * 2, 104, pose === 1 ? 3 : 0, robe, robeDark,
    [58, 40, 30, 255], [40, 28, 20, 255]);
  bossLeg(c, 68 + step * 2, 104, pose === 2 ? 3 : 0, robe, robeDark,
    [58, 40, 30, 255], [40, 28, 20, 255]);

  // Мантия с рваным подолом.
  heroPoly(c, [[42, 66], [86, 66], [100, 108 + sway], [94, 120], [86, 112],
    [78, 124], [70, 114], [62, 124], [54, 114], [46, 124], [38, 112],
    [30, 120], [24, 108 - sway]], HERO.outline);
  heroPoly(c, [[45, 68], [83, 68], [96, 106 + sway], [90, 114], [83, 106],
    [76, 117], [69, 108], [64, 116], [59, 108], [52, 117], [45, 106],
    [38, 114], [32, 106 - sway]], robeDark);
  heroPoly(c, [[49, 70], [79, 70], [92, 104 + sway], [86, 108], [79, 101],
    [72, 112], [66, 103], [64, 110], [62, 103], [56, 112], [49, 101],
    [42, 108], [36, 104 - sway]], robe);
  heroLine(c, 64, 72, 64, 110, robeDark);
  heroDiamond(c, 56, 86, 3, robeHi);
  heroDiamond(c, 72, 94, 2, robeHi);

  // Шаль на плечах.
  heroPoly(c, [[40, 64], [88, 64], [84, 76], [74, 70], [64, 78], [54, 70], [44, 76]], HERO.outline);
  heroPoly(c, [[43, 66], [85, 66], [81, 74], [73, 69], [64, 75], [55, 69], [47, 74]], robeDark);

  // Руки: левая с когтями, правая на посохе.
  heroPoly(c, [[40, 72], [50, 74], [46, 92], [36, 98], [30, 90], [36, 80]], HERO.outline);
  heroPoly(c, [[42, 74], [48, 75], [45, 90], [37, 95], [33, 89], [38, 81]], robe);
  heroEllipse(c, 36, 94, 7, 6, HERO.outline);
  heroEllipse(c, 36, 94, 5, 4, skin);
  for (let i = 0; i < 3; i++) {
    heroPoly(c, [[31 + i * 4, 98], [33 + i * 4, 91], [35 + i * 4, 98]], skinDark);
  }
  heroEllipse(c, 100, 88 + step * 2, 7, 7, HERO.outline);
  heroEllipse(c, 100, 88 + step * 2, 5, 5, skin);

  // Пояс с зельями.
  heroRect(c, 46, 96, 38, 7, HERO.outline);
  heroRect(c, 47, 97, 36, 5, [60, 38, 30, 255]);
  heroRect(c, 70, 98, 5, 10, HERO.outline);
  heroRect(c, 71, 99, 3, 7, [92, 210, 128, 255]);
  heroRect(c, 78, 99, 5, 9, HERO.outline);
  heroRect(c, 79, 100, 3, 6, [210, 92, 180, 255]);

  // Голова, крючковатый нос и бородавки.
  heroEllipse(c, 64, 50, 15, 16, HERO.outline);
  heroEllipse(c, 64, 50, 13, 14, skin);
  heroRect(c, 55, 47, 4, 4, skinDark);
  heroRect(c, 69, 47, 4, 4, skinDark);
  heroPoly(c, [[52, 50], [40, 56], [44, 60], [54, 57]], HERO.outline);
  heroPoly(c, [[52, 51], [43, 56], [46, 58], [54, 56]], skin);
  heroRect(c, 58, 47, 4, 3, [255, 244, 180, 255]);
  heroRect(c, 67, 47, 4, 3, [255, 244, 180, 255]);
  heroRect(c, 59, 48, 2, 1, HERO.eye);
  heroRect(c, 68, 48, 2, 1, HERO.eye);
  heroEllipse(c, 64, 62, 9, 5, skinDark);
  heroRect(c, 58, 59, 12, 2, HERO.outline);
  heroRect(c, 66, 60, 2, 3, [255, 244, 180, 255]);
  heroRect(c, 49, 43, 2, 2, skinDark);
  heroRect(c, 78, 52, 2, 2, skinDark);

  // Седые пряди.
  heroPoly(c, [[46, 38], [38, 52], [42, 62], [50, 48]], [210, 208, 198, 255]);
  heroPoly(c, [[82, 38], [90, 54], [86, 62], [78, 48]], [210, 208, 198, 255]);

  // Шляпа.
  heroPoly(c, [[40, 34], [88, 34], [78 + hatSway, 18], [72 + hatSway, 4],
    [62, 12], [52, 24]], HERO.outline);
  heroPoly(c, [[44, 32], [84, 32], [76 + hatSway, 19], [71 + hatSway, 8],
    [63, 15], [55, 25]], robeDark);
  heroPoly(c, [[56, 24], [63, 15], [71 + hatSway, 8], [76 + hatSway, 19],
    [68, 24]], robeHi);
  heroEllipse(c, 64, 34, 40, 8, HERO.outline);
  heroEllipse(c, 64, 34, 37, 6, robeDark);
  heroEllipse(c, 64, 34, 34, 4, robe);
  heroRect(c, 48, 30, 32, 5, HERO.outline);
  heroRect(c, 49, 31, 30, 3, BOSS.goldDark);
  heroRect(c, 50, 31, 28, 1, BOSS.gold);
  heroDiamond(c, 72, 31, 3, [214, 46, 58, 255]);
}

// Проклятый рыцарь: рогатый шлем, рваный плащ и рунный меч.
function bossKnight(c, pose) {
  const step = pose === 1 ? 1 : pose === 2 ? -1 : 0;
  const sway = -step * 4;
  const armY = step * 4;
  const steel = [96, 104, 126, 255];
  const steelDark = [52, 56, 74, 255];
  const steelHi = [156, 168, 190, 255];
  const cape = [44, 30, 58, 255];
  const capeDark = [28, 18, 38, 255];

  // Плащ.
  heroPoly(c, [[36, 50], [92, 50], [104, 108 + sway], [96, 120], [88, 110],
    [80, 122], [72, 112], [64, 120], [56, 112], [48, 122], [40, 110],
    [32, 120], [24, 108 - sway]], HERO.outline);
  heroPoly(c, [[39, 52], [89, 52], [100, 106 + sway], [92, 114], [85, 106],
    [78, 117], [71, 108], [64, 115], [57, 108], [50, 117], [43, 106],
    [36, 114], [28, 106 - sway]], capeDark);
  heroPoly(c, [[43, 54], [85, 54], [96, 104 + sway], [89, 108], [82, 102],
    [75, 112], [69, 104], [64, 110], [59, 104], [53, 112], [46, 102],
    [39, 108], [32, 104 - sway]], cape);

  // Ноги.
  bossLeg(c, 46 - step * 2, 92, pose === 1 ? 4 : 0, steel, steelDark, steelDark, steel);
  bossLeg(c, 66 + step * 2, 92, pose === 2 ? 4 : 0, steel, steelDark, steelDark, steel);

  // Торс.
  heroRect(c, 40, 50, 48, 50, HERO.outline);
  heroRect(c, 41, 51, 46, 48, steelDark);
  heroRect(c, 43, 51, 42, 45, steel);
  heroRect(c, 43, 51, 8, 40, steelHi);
  heroLine(c, 64, 54, 64, 94, steelDark);
  for (let i = 0; i < 3; i++) heroLine(c, 46, 62 + i * 10, 82, 62 + i * 10, steelDark);
  heroRect(c, 40, 90, 48, 9, HERO.outline);
  heroRect(c, 41, 91, 46, 7, BOSS.goldDark);
  heroRect(c, 41, 91, 46, 3, BOSS.gold);
  heroRect(c, 60, 90, 8, 9, HERO.outline);
  heroRect(c, 62, 91, 4, 7, BOSS.gold);

  // Наплечники с шипами.
  heroPoly(c, [[26, 58], [42, 46], [54, 58], [46, 74], [30, 72]], HERO.outline);
  heroPoly(c, [[29, 58], [42, 49], [50, 58], [44, 70], [32, 68]], steelDark);
  heroPoly(c, [[32, 58], [42, 52], [47, 58], [42, 66], [34, 64]], steel);
  heroPoly(c, [[30, 54], [22, 40], [34, 48]], HERO.outline);
  heroPoly(c, [[74, 58], [90, 46], [102, 58], [98, 74], [82, 72]], HERO.outline);
  heroPoly(c, [[77, 58], [90, 49], [98, 58], [95, 70], [84, 68]], steelDark);
  heroPoly(c, [[80, 58], [90, 52], [95, 58], [92, 66], [84, 64]], steel);
  heroPoly(c, [[98, 54], [106, 40], [94, 48]], HERO.outline);

  // Левая рука.
  heroRect(c, 28, 68, 12, 28, HERO.outline);
  heroRect(c, 29, 69, 10, 26, steelDark);
  heroRect(c, 30, 69, 7, 24, steel);
  heroRect(c, 28, 88, 13, 10, HERO.outline);
  heroRect(c, 29, 89, 11, 8, steelDark);

  // Правая рука и рунный меч.
  heroRect(c, 84, 66 + armY, 13, 29, HERO.outline);
  heroRect(c, 85, 67 + armY, 11, 27, steelDark);
  heroRect(c, 86, 67 + armY, 8, 25, steel);
  heroPoly(c, [[92, 86 + armY], [100, 82 + armY], [106, 16 + armY],
    [112, 8 + armY], [118, 16 + armY], [114, 80 + armY], [102, 94 + armY]], HERO.outline);
  heroPoly(c, [[95, 84 + armY], [101, 80 + armY], [107, 19 + armY],
    [112, 13 + armY], [115, 19 + armY], [111, 78 + armY], [102, 90 + armY]], steel);
  heroLine(c, 108, 22 + armY, 110, 76 + armY, steelHi);
  heroLine(c, 99, 84 + armY, 112, 24 + armY, [198, 48, 56, 255]);
  heroRect(c, 88, 80 + armY, 30, 7, HERO.outline);
  heroRect(c, 89, 81 + armY, 28, 5, BOSS.goldDark);
  heroRect(c, 90, 82 + armY, 26, 3, BOSS.gold);
  heroRect(c, 100, 86 + armY, 8, 13, HERO.outline);
  heroRect(c, 101, 87 + armY, 6, 11, HERO.leatherDark);

  // Шлем с рогами.
  heroEllipse(c, 64, 34, 20, 19, HERO.outline);
  heroEllipse(c, 64, 34, 18, 17, steelDark);
  heroEllipse(c, 64, 33, 15, 14, steel);
  heroEllipse(c, 58, 28, 6, 5, steelHi);
  heroRect(c, 46, 38, 36, 10, HERO.outline);
  heroRect(c, 47, 39, 34, 8, [18, 16, 24, 255]);
  bossEye(c, 56, 43, 3, 2, BOSS.eyeRed);
  bossEye(c, 72, 43, 3, 2, BOSS.eyeRed);
  heroRect(c, 61, 38, 6, 14, steelDark);
  heroRect(c, 63, 38, 2, 14, steelHi);
  heroPoly(c, [[48, 26], [34, 12], [28, 18], [42, 34]], HERO.outline);
  heroPoly(c, [[48, 26], [37, 15], [33, 19], [44, 31]], [198, 190, 172, 255]);
  heroPoly(c, [[80, 26], [94, 12], [100, 18], [86, 34]], HERO.outline);
  heroPoly(c, [[80, 26], [91, 15], [95, 19], [84, 31]], [198, 190, 172, 255]);
}

// Инфернальный лорд: крылья, рога, пламенный трезубец и хвост.
function bossDemon(c, pose) {
  const step = pose === 1 ? 1 : pose === 2 ? -1 : 0;
  const bob = pose === 1 ? -3 : pose === 2 ? 1 : 0;
  const tailSway = step * 8;
  const red = [176, 42, 32, 255];
  const redDark = [112, 22, 22, 255];
  const redHi = [224, 78, 48, 255];
  const wingColors = {
    membraneDark: [92, 16, 22, 255],
    bone: [60, 10, 16, 255]
  };
  bossWing(c, -1, pose, wingColors);
  bossWing(c, 1, pose, wingColors);

  // Хвост.
  heroThickLine(c, 80, 108, 112, 118, 3, HERO.outline);
  heroThickLine(c, 112, 118, 120, 100 + tailSway, 3, HERO.outline);
  heroThickLine(c, 80, 108, 112, 118, 1, redDark);
  heroThickLine(c, 112, 118, 120, 100 + tailSway, 1, redDark);
  heroDiamond(c, 120, 96 + tailSway, 6, HERO.outline);
  heroDiamond(c, 120, 96 + tailSway, 4, red);

  // Ноги.
  bossLeg(c, 46 - step * 2, 94, pose === 1 ? 4 : 0, red, redDark,
    [36, 20, 24, 255], [24, 12, 16, 255]);
  bossLeg(c, 66 + step * 2, 94, pose === 2 ? 4 : 0, red, redDark,
    [36, 20, 24, 255], [24, 12, 16, 255]);

  // Торс с тлеющими трещинами.
  heroPoly(c, [[38, 58], [90, 58], [94, 92], [80, 104], [48, 104], [34, 92]], HERO.outline);
  heroPoly(c, [[40, 60], [88, 60], [91, 90], [78, 101], [50, 101], [37, 90]], redDark);
  heroPoly(c, [[44, 62], [84, 62], [87, 88], [76, 98], [52, 98], [41, 88]], red);
  heroEllipse(c, 52, 70, 12, 8, redHi);
  heroEllipse(c, 76, 70, 12, 8, redHi);
  heroLine(c, 64, 62, 64, 96, [255, 128, 40, 255]);
  heroLine(c, 56, 78, 48, 88, [255, 128, 40, 255]);
  heroLine(c, 72, 78, 80, 88, [255, 128, 40, 255]);

  // Руки.
  heroPoly(c, [[34, 62], [44, 64], [42, 88], [30, 98], [24, 88], [30, 74]], HERO.outline);
  heroPoly(c, [[36, 64], [42, 65], [40, 86], [31, 94], [27, 87], [32, 75]], red);
  heroPoly(c, [[84, 62], [94, 64], [98, 86], [90, 98], [82, 90], [84, 74]], HERO.outline);
  heroPoly(c, [[86, 64], [92, 65], [95, 84], [89, 94], [84, 88], [86, 75]], red);

  // Трезубец.
  heroThickLine(c, 104, 30, 100, 118, 3, HERO.outline);
  heroThickLine(c, 104, 30, 100, 118, 1, [86, 52, 32, 255]);
  heroRect(c, 94, 26, 24, 4, HERO.outline);
  heroRect(c, 95, 27, 22, 2, [86, 52, 32, 255]);
  heroRect(c, 95, 8, 3, 20, HERO.outline);
  heroRect(c, 96, 9, 1, 18, BOSS.steelHi);
  heroRect(c, 103, 4, 3, 24, HERO.outline);
  heroRect(c, 104, 5, 1, 22, BOSS.steelHi);
  heroRect(c, 111, 8, 3, 20, HERO.outline);
  heroRect(c, 112, 9, 1, 18, BOSS.steelHi);
  heroEllipse(c, 100, 88 + step * 2, 7, 7, HERO.outline);
  heroEllipse(c, 100, 88 + step * 2, 5, 5, red);

  // Голова и рога.
  heroEllipse(c, 64, 44 + bob, 18, 17, HERO.outline);
  heroEllipse(c, 64, 44 + bob, 16, 15, redDark);
  heroEllipse(c, 64, 43 + bob, 14, 13, red);
  heroEllipse(c, 58, 39 + bob, 7, 5, redHi);
  bossEye(c, 57, 42 + bob, 4, 4, BOSS.eyeYellow);
  bossEye(c, 71, 42 + bob, 4, 4, BOSS.eyeYellow);
  heroPoly(c, [[55, 53 + bob], [73, 53 + bob], [64, 62 + bob]], HERO.outline);
  heroPoly(c, [[57, 54 + bob], [71, 54 + bob], [64, 59 + bob]], [58, 16, 18, 255]);
  heroPoly(c, [[56, 54 + bob], [60, 54 + bob], [58, 62 + bob]], BOSS.boneHi);
  heroPoly(c, [[68, 54 + bob], [72, 54 + bob], [70, 62 + bob]], BOSS.boneHi);
  heroPoly(c, [[50, 32 + bob], [38, 14 + bob], [26, 8 + bob], [32, 20 + bob],
    [44, 40 + bob]], HERO.outline);
  heroPoly(c, [[49, 32 + bob], [39, 17 + bob], [31, 12 + bob], [36, 21 + bob],
    [45, 37 + bob]], [214, 196, 180, 255]);
  heroPoly(c, [[78, 32 + bob], [90, 14 + bob], [102, 8 + bob], [96, 20 + bob],
    [84, 40 + bob]], HERO.outline);
  heroPoly(c, [[79, 32 + bob], [89, 17 + bob], [97, 12 + bob], [92, 21 + bob],
    [83, 37 + bob]], [214, 196, 180, 255]);

  // Пламя в левой руке.
  bossFlame(c, 28, 94, 20, pose, { main: [255, 150, 48, 255], core: [255, 240, 160, 255] });
}

// Лич глубин: корона, посох с шаром и парящая мантия.
function bossLich(c, pose) {
  const step = pose === 1 ? 1 : pose === 2 ? -1 : 0;
  const float = pose === 1 ? -3 : pose === 2 ? 1 : 0;
  const sway = -step * 4;
  const robe = [52, 70, 118, 255];
  const robeDark = [32, 44, 82, 255];
  const robeHi = [84, 110, 166, 255];

  // Посох с шаром.
  heroThickLine(c, 104, 30 + float, 100, 124, 3, HERO.outline);
  heroThickLine(c, 104, 30 + float, 100, 124, 1, [64, 52, 74, 255]);
  heroEllipse(c, 104, 26 + float, 14, 14, [80, 210, 240, 90]);
  heroEllipse(c, 104, 26 + float, 12, 12, HERO.outline);
  heroEllipse(c, 104, 26 + float, 10, 10, [44, 120, 160, 255]);
  heroEllipse(c, 104, 26 + float, 7, 7, BOSS.eyeCyan);
  heroEllipse(c, 101, 23 + float, 3, 3, [255, 255, 255, 255]);
  heroDiamond(c, 88, 40 + float, 3, BOSS.eyeCyan);
  heroDiamond(c, 120, 44 + float, 2, BOSS.eyeCyan);

  // Костяные ступни под мантией.
  heroRect(c, 54, 116, 8, 10, HERO.outline);
  heroRect(c, 55, 117, 6, 8, BOSS.boneDark);
  heroRect(c, 68, 116, 8, 10, HERO.outline);
  heroRect(c, 69, 117, 6, 8, BOSS.boneDark);

  // Мантия.
  heroPoly(c, [[38, 58], [90, 58], [100, 104 + sway], [92, 118], [84, 110],
    [76, 124], [68, 114], [60, 124], [52, 114], [44, 124], [36, 110],
    [28, 118], [20, 104 - sway]], HERO.outline);
  heroPoly(c, [[41, 60], [87, 60], [96, 102 + sway], [89, 112], [82, 105],
    [74, 118], [67, 109], [64, 116], [61, 109], [54, 118], [46, 105],
    [39, 112], [32, 102 - sway]], robeDark);
  heroPoly(c, [[45, 62], [83, 62], [92, 100 + sway], [86, 105], [79, 99],
    [72, 111], [66, 102], [64, 108], [62, 102], [56, 111], [49, 99],
    [42, 105], [36, 100 - sway]], robe);
  heroLine(c, 64, 66, 64, 108, robeDark);
  heroLine(c, 64, 66, 64, 108, robeHi);

  // Рёбра в прорези мантии.
  heroRect(c, 56, 64, 16, 32, HERO.outline);
  heroRect(c, 57, 65, 14, 30, [18, 24, 40, 255]);
  for (let i = 0; i < 4; i++) {
    heroRect(c, 58, 68 + i * 7, 12, 3, BOSS.boneDark);
    heroRect(c, 58, 68 + i * 7, 10, 1, BOSS.bone);
  }

  // Наплечники мантии.
  heroPoly(c, [[34, 60], [48, 52], [58, 62], [46, 72], [36, 70]], HERO.outline);
  heroPoly(c, [[37, 61], [48, 55], [55, 62], [45, 69], [38, 67]], robeDark);
  heroPoly(c, [[70, 62], [80, 52], [94, 60], [92, 70], [82, 72]], HERO.outline);
  heroPoly(c, [[73, 62], [80, 55], [91, 61], [89, 67], [82, 69]], robeDark);

  // Руки: пламя слева, хват посоха справа.
  heroRect(c, 32, 68, 9, 24, HERO.outline);
  heroRect(c, 33, 69, 7, 22, BOSS.boneDark);
  heroRect(c, 34, 69, 4, 20, BOSS.bone);
  heroEllipse(c, 34, 92, 7, 6, HERO.outline);
  heroEllipse(c, 34, 92, 5, 4, BOSS.bone);
  heroEllipse(c, 100, 88 + step * 2, 7, 7, HERO.outline);
  heroEllipse(c, 100, 88 + step * 2, 5, 5, BOSS.bone);
  bossFlame(c, 32, 88, 18, pose, { main: [96, 220, 240, 255], core: [220, 255, 255, 255] });

  // Череп.
  heroEllipse(c, 64, 42 + float, 17, 18, HERO.outline);
  heroEllipse(c, 64, 42 + float, 15, 16, BOSS.bone);
  heroRect(c, 54, 54 + float, 20, 11, HERO.outline);
  heroRect(c, 55, 55 + float, 18, 9, BOSS.boneDark);
  for (let i = 0; i < 4; i++) heroRect(c, 57 + i * 4, 56 + float, 3, 7, BOSS.boneHi);
  heroEllipse(c, 57, 41 + float, 5, 5, [20, 30, 40, 255]);
  heroEllipse(c, 71, 41 + float, 5, 5, [20, 30, 40, 255]);
  bossEye(c, 57, 41 + float, 3, 3, BOSS.eyeCyan);
  bossEye(c, 71, 41 + float, 3, 3, BOSS.eyeCyan);
  heroRect(c, 63, 48 + float, 3, 3, [20, 30, 40, 255]);

  bossCrown(c, 64, 27 + float, 28);
}

function spriteBossWalks(name, draw) {
  const idle = heroMake(); draw(idle, 0); writeHeroSprite(name, idle);
  const c1 = heroMake(); draw(c1, 1); writeHeroSprite(name + '_walk1', c1);
  const c2 = heroMake(); draw(c2, 2); writeHeroSprite(name + '_walk2', c2);
}

spriteHeroes();
spriteShaman();
spriteBossWalks('boss_slime', bossSlime);
spriteBossWalks('boss_rat', bossRat);
spriteBossWalks('boss_bone', bossBone);
spriteBossWalks('boss_archer', bossArcher);
spriteBossWalks('boss_bat', bossBat);
spriteBossWalks('boss_brute', bossBrute);
spriteBossWalks('boss_witch', bossWitch);
spriteBossWalks('boss_knight', bossKnight);
spriteBossWalks('boss_demon', bossDemon);
spriteBossWalks('boss_lich', bossLich);

// --- Ключевые предметы ---
function spriteItem(name, draw) {
  const c = hmake(); draw(c); writeSprite(name, c);
}
function itemSword(c) { hrect(c, 13, 8, 1, 8, [200, 200, 210, 255]); hrect(c, 14, 4, 2, 2, [180, 180, 200, 255]); hrect(c, 13, 12, 3, 4, [120, 80, 40, 255]); }
function itemAxe(c) { hrect(c, 13, 8, 1, 8, [160, 140, 100, 255]); hrect(c, 14, 4, 4, 2, [180, 180, 190, 255]); hpx(c, 16, 4, [160, 160, 170, 255]); hrect(c, 13, 12, 3, 4, [120, 80, 40, 255]); }
function itemSpear(c) { hrect(c, 14, 6, 1, 8, [150, 140, 130, 255]); hrect(c, 14, 4, 2, 2, [190, 190, 200, 255]); hrect(c, 13, 12, 3, 4, [120, 80, 40, 255]); }
function itemBow(c) { hrect(c, 12, 10, 1, 6, [130, 100, 70, 255]); hrect(c, 13, 8, 6, 1, [160, 130, 90, 255]); hrect(c, 19, 8, 2, 2, [140, 110, 80, 255]); }
function itemCrossbow(c) { hrect(c, 12, 9, 2, 4, [130, 100, 70, 255]); hrect(c, 14, 8, 4, 2, [170, 170, 180, 255]); hrect(c, 18, 8, 2, 2, [150, 150, 160, 255]); hrect(c, 12, 12, 4, 4, [110, 80, 60, 255]); }
function itemShield(c) { hrect(c, 13, 7, 4, 8, [170, 180, 190, 255]); hrect(c, 14, 7, 2, 2, [230, 230, 240, 255]); hrect(c, 13, 15, 4, 2, [110, 80, 60, 255]); }
function itemPotion(c) { hrect(c, 13, 8, 4, 6, [255, 220, 120, 255]); hrect(c, 14, 8, 2, 2, [255, 100, 60, 255]); hrect(c, 13, 14, 4, 2, [130, 80, 40, 255]); }
function itemKey(c) { hrect(c, 13, 8, 2, 6, [220, 180, 60, 255]); hrect(c, 13, 14, 4, 2, [200, 160, 40, 255]); hpx(c, 15, 12, [160, 120, 30, 255]); }
function itemBread(c) { hrect(c, 13, 8, 4, 5, [220, 190, 140, 255]); hrect(c, 13, 8, 4, 1, [180, 140, 100, 255]); hpx(c, 14, 10, [160, 120, 80, 255]); hpx(c, 15, 10, [160, 120, 80, 255]); }
function itemMeat(c) { hrect(c, 13, 8, 4, 5, [140, 90, 90, 255]); hrect(c, 13, 8, 4, 1, [100, 60, 60, 255]); hpx(c, 14, 10, [110, 70, 70, 255]); hpx(c, 15, 10, [110, 70, 70, 255]); }
function itemApple(c) { hrect(c, 13, 8, 4, 5, [200, 50, 60, 255]); hrect(c, 14, 7, 2, 2, [100, 160, 60, 255]); }
function itemStew(c) { hrect(c, 13, 8, 4, 5, [100, 70, 40, 255]); hrect(c, 14, 9, 2, 2, [140, 100, 60, 255]); }

spriteItem('sword', itemSword);
spriteItem('axe', itemAxe);
spriteItem('spear', itemSpear);
spriteItem('bow', itemBow);
spriteItem('crossbow', itemCrossbow);
spriteItem('shield', itemShield);
spriteItem('potion', itemPotion);
spriteItem('key', itemKey);
spriteItem('bread', itemBread);
spriteItem('meat', itemMeat);
spriteItem('apple', itemApple);
spriteItem('stew', itemStew);

// --- Декорации (крупные): дерево, фонтан, прилавок ---
function spriteDecor(name, draw) { const c = hmake(); draw(c); writeSprite(name, c); }
function decorTree(c) {
  hrect(c, 13, 10, 2, 6, [110, 80, 40, 255]);  // ствол
  hrect(c, 9, 4, 10, 7, [60, 140, 60, 255]);   // крона
  hrect(c, 10, 3, 8, 2, [90, 170, 90, 255]);
}
function decorFountain(c) {
  hrect(c, 10, 8, 10, 6, [200, 200, 210, 255]);  // чаша
  hrect(c, 13, 6, 4, 3, [60, 120, 180, 255]);    // струя
  hrect(c, 14, 5, 2, 2, [220, 240, 255, 255]);
}
function counterGoods(c) {
  hrect(c, 10, 10, 10, 4, [160, 120, 80, 255]);  // прилавок
  hrect(c, 11, 7, 2, 4, [200, 160, 100, 255]);   // товар
  hrect(c, 15, 7, 2, 4, [220, 180, 120, 255]);
  hrect(c, 13, 7, 2, 3, [40, 60, 100, 255]);
}

spriteDecor('decorTree', decorTree);
spriteDecor('decorFountain', decorFountain);
spriteDecor('counterGoods', counterGoods);

// --- Запуск ---
generate();
const png = encodePNG(data, WIDTH, HEIGHT);
const outPath = path.join(__dirname, '..', 'assets', 'tiny-dungeon.png');
fs.writeFileSync(outPath, png);
console.log('Сгенерировано: ' + outPath + ' (' + WIDTH + 'x' + HEIGHT + ', ' + COUNT + ' тайлов)');

generateIso();
const isoPng = encodePNG(isoData, ISO_WIDTH, ISO_HEIGHT);
const isoPath = path.join(__dirname, '..', 'assets', 'tiny-dungeon-iso.png');
fs.writeFileSync(isoPath, isoPng);
console.log('Сгенерировано: ' + isoPath + ' (' + ISO_WIDTH + 'x' + ISO_HEIGHT + ', ' + ISO_COUNT + ' клеток)');
