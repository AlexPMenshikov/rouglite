// Генератор PNG-тайлсета 16×16, тайлы в одну строку, с альфа-каналом.
// Использование: node scripts/generate-tileset.js
// Результат: assets/tiny-dungeon.png (WIDTH×16)

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
// 71 — первый индекс после базового набора спрайтов (см. KENNEY_MAP).
// 72 — первый индекс после базового набора (см. KENNEY_MAP); 71 — шаман.
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

// --- Hi-res спрайты (32×32, два кадра шага для героя и боссов) ---
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

// Палитра (совпадает с встроенными спрайтами в js/assets.js).
const skin = [232, 192, 144, 255];
const skinD = [180, 140, 100, 255];
const hair = [96, 60, 30, 255];
const eye = [26, 26, 40, 255];
const white = [232, 232, 240, 255];
const black = [26, 26, 40, 255];

function drawHero(c, P, pose) {
  // П: тело, трим, плащ, акцент. pose — нога вперед (0=стойка, 1/2=шаг).
  // Голова.
  hrect(c, 6, 0, 4, 2, skin);
  hrect(c, 7, 2, 1, 1, eye);
  hrect(c, 8, 2, 1, 1, eye);
  hpx(c, 6, 1, hair); hpx(c, 9, 1, hair);
  // Туловище.
  hrect(c, 4, 4, 8, 6, P.body);
  hrect(c, 5, 4, 6, 2, P.trim);
  // Плащ.
  hrect(c, 2, 6, 2, 6, P.cape);
  hrect(c, 12, 6, 2, 6, P.cape);
  // Руки.
  hrect(c, 3, 6, 1, 4, P.body);
  hrect(c, 12, 6, 1, 4, P.body);
  // Ноги: pose меняет положение ног (шаг).
  const lx = pose === 1 ? 4 : 5;   // левая нога
  const rx = pose === 2 ? 9 : 10;  // правая нога
  hrect(c, lx, 10, 2, 6, P.body);
  hrect(c, rx, 10, 2, 6, P.body);
  // Акцент (ремень/эмблема).
  hrect(c, 7, 10, 2, 1, P.accent);
  // Оружие класса: справа, не зависит от фазы шага.
  if (P.weapon === 'sword') {
    hrect(c, 13, 4, 1, 6, [210, 215, 225, 255]);
    hrect(c, 12, 9, 3, 1, [200, 170, 60, 255]);
  } else if (P.weapon === 'axe') {
    hrect(c, 13, 4, 1, 6, [120, 80, 45, 255]);
    hrect(c, 12, 3, 3, 2, [180, 185, 195, 255]);
    hrect(c, 3, 4, 1, 6, [120, 80, 45, 255]);
    hrect(c, 2, 3, 2, 2, [180, 185, 195, 255]);
  } else if (P.weapon === 'bow') {
    hrect(c, 13, 3, 1, 8, [130, 85, 40, 255]);
    hrect(c, 14, 4, 1, 6, [220, 210, 180, 255]);
  } else if (P.weapon === 'staff') {
    hrect(c, 13, 3, 1, 9, [120, 80, 45, 255]);
    hrect(c, 12, 2, 3, 2, [160, 120, 220, 255]);
  }
}

// --- Герой и классы (два кадра шага) ---
function spritePlayer() {
  const c = hmake();
  const P = { body: [48, 128, 232, 255], trim: [80, 160, 240, 255], cape: [32, 64, 160, 255], accent: [224, 64, 64, 255] };
  drawHero(c, P, 0);
  writeSprite('player', c);
}
function spritePlayerWalks(classId, P) {
  const c1 = hmake(); drawHero(c1, P, 1); writeSprite(classId + '_walk1', c1);
  const c2 = hmake(); drawHero(c2, P, 2); writeSprite(classId + '_walk2', c2);
}
function spriteClasses() {
  spritePlayerWalks('playerPaladin', { body: [192, 200, 216, 255], trim: [208, 192, 128, 255], cape: [64, 80, 128, 255], accent: [224, 64, 64, 255] });
  spritePlayerWalks('playerBerserker', { body: [132, 104, 96, 255], trim: [128, 96, 64, 255], cape: [80, 40, 32, 255], accent: [224, 64, 64, 255] });
  spritePlayerWalks('playerArcher', { body: [107, 128, 64, 255], trim: [140, 160, 96, 255], cape: [56, 80, 48, 255], accent: [200, 180, 100, 255] });
  spritePlayerWalks('playerMage', { body: [96, 104, 136, 255], trim: [140, 120, 200, 255], cape: [48, 56, 176, 255], accent: [200, 160, 240, 255] });
}

// --- Боссы (два кадра шага) ---
function spriteBossWalks(name, draw) {
  const c1 = hmake(); draw(c1, 1); writeSprite(name + '_walk1', c1);
  const c2 = hmake(); draw(c2, 2); writeSprite(name + '_walk2', c2);
}

// Слизень.
function bossSlime(c, pose) {
  hrect(c, 3, 8, 10, 5, [56, 184, 88, 255]);
  hrect(c, 5, 4, 6, 3, [120, 240, 144, 255]);
  hpx(c, 4, 11, [16, 48, 24, 255]); hpx(c, 11, 11, [16, 48, 24, 255]);
  hpx(c, 5, 10, [232, 255, 232, 255]); hpx(c, 10, 10, [232, 255, 232, 255]);
  hrect(c, 7, 13, 2, 2, [32, 96, 48, 255]);
}

// Крыса.
function bossRat(c, pose) {
  hrect(c, 5, 8, 10, 5, [160, 112, 64, 255]);
  hrect(c, 1, 9, 3, 3, [128, 88, 40, 255]);
  hrect(c, 12, 7, 3, 2, [128, 88, 40, 255]);
  hpx(c, 1, 9, [192, 144, 80, 255]);
  hpx(c, 5, 9, [26, 16, 16, 255]); hpx(c, 9, 9, [26, 16, 16, 255]);
  hpx(c, 7, 11, [255, 128, 128, 255]);
}

// Костяной страж.
function bossBone(c, pose) {
  hrect(c, 6, 1, 8, 5, [240, 240, 240, 255]);
  hpx(c, 7, 2, eye); hpx(c, 10, 2, eye);
  hrect(c, 7, 7, 4, 5, [216, 216, 216, 255]);
  hrect(c, 3, 9, 10, 2, [224, 224, 224, 255]);
  hrect(c, 4, 11, 3, 4, [200, 200, 200, 255]);
  hrect(c, 9, 11, 3, 4, [200, 200, 200, 255]);
  hpx(c, 5, 2, [255, 80, 80, 255]); hpx(c, 11, 2, [255, 80, 80, 255]);
}

// Лучник босса.
function bossArcher(c, pose) {
  hrect(c, 7, 2, 6, 3, [255, 224, 128, 255]);
  hpx(c, 8, 3, eye); hpx(c, 10, 3, eye);
  hrect(c, 6, 5, 8, 6, [72, 96, 40, 255]);
  hrect(c, 14, 3, 2, 10, [139, 96, 64, 255]);
  hpx(c, 14, 2, [96, 64, 32, 255]);
  hrect(c, 2, 8, 2, 2, [192, 160, 96, 255]);
  hpx(c, 8, 8, [255, 209, 102, 255]);
}

// Летучая мышь.
function bossBat(c, pose) {
  hrect(c, 8, 6, 4, 4, [112, 64, 192, 255]);
  hrect(c, 1, 5, 5, 3, [176, 128, 255, 255]);
  hrect(c, 13, 5, 5, 3, [176, 128, 255, 255]);
  hpx(c, 0, 6, [80, 32, 144, 255]); hpx(c, 20, 6, [80, 32, 144, 255]);
  hpx(c, 9, 7, [255, 224, 96, 255]); hpx(c, 11, 7, [255, 224, 96, 255]);
  hrect(c, 9, 12, 2, 2, [64, 24, 112, 255]);
}

// Грубиян.
function bossBrute(c, pose) {
  hrect(c, 5, 2, 10, 4, [144, 128, 112, 255]);
  hrect(c, 4, 6, 12, 6, [112, 96, 80, 255]);
  hpx(c, 6, 3, [255, 64, 64, 255]); hpx(c, 11, 3, [255, 64, 64, 255]);
  hrect(c, 1, 8, 3, 5, [96, 80, 64, 255]);
  hrect(c, 12, 8, 3, 5, [96, 80, 64, 255]);
  hpx(c, 9, 10, [192, 176, 160, 255]);
}

// Ведьма.
function bossWitch(c, pose) {
  hrect(c, 8, 1, 6, 2, [48, 24, 72, 255]);
  hrect(c, 6, 3, 8, 3, [192, 96, 224, 255]);
  hpx(c, 7, 4, [26, 16, 40, 255]); hpx(c, 10, 4, [26, 16, 40, 255]);
  hrect(c, 4, 6, 10, 7, [80, 32, 112, 255]);
  hpx(c, 8, 10, [255, 128, 255, 255]);
  hrect(c, 14, 6, 2, 6, [160, 64, 208, 255]);
}

// Рыцарь.
function bossKnight(c, pose) {
  hrect(c, 7, 1, 6, 4, [128, 136, 152, 255]);
  hpx(c, 8, 2, eye); hpx(c, 10, 2, eye);
  hrect(c, 5, 5, 10, 6, [96, 104, 120, 255]);
  hrect(c, 3, 6, 2, 5, [80, 88, 96, 255]);
  hrect(c, 15, 4, 2, 8, [192, 200, 216, 255]);
  hpx(c, 16, 3, [232, 240, 255, 255]);
  hrect(c, 7, 12, 2, 3, [64, 72, 80, 255]);
  hrect(c, 11, 12, 2, 3, [64, 72, 80, 255]);
}

// Демон.
function bossDemon(c, pose) {
  hpx(c, 6, 1, [255, 96, 32, 255]); hpx(c, 13, 1, [255, 96, 32, 255]);
  hrect(c, 6, 2, 8, 5, [208, 48, 16, 255]);
  hpx(c, 8, 4, [255, 224, 64, 255]); hpx(c, 11, 4, [255, 224, 64, 255]);
  hrect(c, 4, 7, 10, 6, [128, 24, 16, 255]);
  hrect(c, 1, 8, 3, 5, [96, 16, 16, 255]);
  hrect(c, 12, 8, 3, 5, [96, 16, 16, 255]);
  hpx(c, 9, 10, [255, 128, 64, 255]);
}

// Лич.
function bossLich(c, pose) {
  hrect(c, 7, 1, 6, 4, [208, 240, 255, 255]);
  hpx(c, 8, 2, [32, 64, 96, 255]); hpx(c, 10, 2, [32, 64, 96, 255]);
  hrect(c, 6, 5, 8, 7, [64, 104, 136, 255]);
  hrect(c, 4, 6, 2, 6, [144, 224, 255, 255]);
  hrect(c, 14, 6, 2, 6, [144, 224, 255, 255]);
  hpx(c, 8, 8, [96, 255, 255, 255]);
  hrect(c, 8, 13, 4, 2, [32, 48, 64, 255]);
}

spriteClasses();
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
