// Генератор PNG-ассетов: изометрия 64×64 и спрайты 256×256.
// Использование: node scripts/generate-tileset.js
// Результат: assets/tiny-dungeon-iso.png, assets/sprites/*.png

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// Стили локаций берутся из общего конфига: клетки изо-атласа должны совпасть
// с ключами MAP_STYLES (js/config.js).
const CONFIG = require('../js/config');
const STYLE_IDS = Object.keys(CONFIG.MAP_STYLES);
// В изо-атласе пять оттенков: у города пять материалов зданий.
const ISO_SHADES = 5;

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

// Палитра изометрии: пол и стена, обычные и приглушённые.
const C = {
  floorA: [90, 78, 102, 255],
  floorB: [74, 64, 88, 255],
  floorDim: [42, 38, 54, 255],
  wallA: [126, 110, 136, 255],
  wallB: [82, 72, 92, 255],
  wallDim: [54, 48, 62, 255],
};

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

// --- Обычные и усиленные враги 256×256 ---
// Та же сетка 128×128 и хелперы, что у героев и боссов. Усиленный вариант
// (`<имя>_enhanced`) рисует тот же код с флагом elite: другая палитра и
// добавочные детали. Кадров шага у врагов нет — они стоят на клетке.

const ENEMY_BONE = [238, 232, 214, 255];
const ENEMY_BONE_DK = [178, 170, 148, 255];
const ENEMY_TOOTH = [255, 250, 236, 255];
const ENEMY_CLAW = [228, 220, 200, 255];

function enemyEyes(c, leftX, rightX, cy, r, iris) {
  bossEye(c, leftX, cy, r, r, iris);
  bossEye(c, rightX, cy, r, r, iris);
}

// Слизень: лужа, студенистая туша и злая ухмылка.
function enemySlime(c, elite) {
  const body = elite ? [132, 86, 206, 255] : [78, 202, 108, 255];
  const dark = elite ? [72, 40, 128, 255] : [38, 132, 68, 255];
  const hi = elite ? [204, 168, 255, 255] : [156, 246, 170, 255];
  const goo = elite ? [46, 26, 82, 255] : [32, 88, 50, 255];
  const eye = elite ? [255, 120, 232, 255] : [255, 216, 96, 255];

  heroEllipse(c, 24, 112, 14, 9, HERO.outline);
  heroEllipse(c, 24, 112, 12, 7, dark);
  heroEllipse(c, 104, 110, 12, 8, HERO.outline);
  heroEllipse(c, 104, 110, 10, 6, dark);
  heroEllipse(c, 64, 88, 48, 38, HERO.outline);
  heroEllipse(c, 64, 87, 45, 35, dark);
  heroEllipse(c, 63, 84, 41, 31, body);
  heroEllipse(c, 45, 70, 17, 11, hi);
  heroEllipse(c, 78, 65, 7, 5, [235, 255, 242, 255]);
  heroEllipse(c, 88, 82, 6, 5, hi);

  enemyEyes(c, 48, 80, 80, 9, eye);
  heroPoly(c, [[38, 67], [56, 72], [54, 79], [36, 74]], HERO.outline);
  heroPoly(c, [[90, 67], [72, 72], [74, 79], [92, 74]], HERO.outline);
  heroPoly(c, [[48, 104], [80, 104], [74, 116], [54, 116]], HERO.outline);
  heroPoly(c, [[51, 106], [77, 106], [72, 112], [56, 112]], goo);
  for (let i = 0; i < 4; i++) heroRect(c, 54 + i * 6, 106, 4, 5, ENEMY_TOOTH);

  if (elite) {
    // Кристаллы на спине: усиленный слизень светится.
    const crystal = [204, 166, 255, 255];
    heroPoly(c, [[48, 54], [58, 22], [68, 54]], HERO.outline);
    heroPoly(c, [[51, 51], [58, 29], [65, 51]], crystal);
    heroPoly(c, [[70, 56], [80, 30], [88, 58]], HERO.outline);
    heroPoly(c, [[73, 53], [80, 36], [85, 55]], crystal);
    heroRect(c, 56, 34, 2, 12, [255, 255, 255, 170]);
    heroRect(c, 79, 41, 2, 8, [255, 255, 255, 170]);
  }
}

// Крыса: хвост, уши и морда с резцами.
function enemyRat(c, elite) {
  const fur = elite ? [116, 108, 124, 255] : [158, 114, 70, 255];
  const dark = elite ? [70, 62, 82, 255] : [104, 72, 42, 255];
  const hi = elite ? [168, 160, 180, 255] : [200, 158, 108, 255];
  const skin = elite ? [198, 128, 160, 255] : [220, 164, 154, 255];
  const eye = elite ? [255, 78, 62, 255] : [30, 24, 28, 255];

  heroThickLine(c, 34, 102, 14, 92, 3, HERO.outline);
  heroThickLine(c, 14, 92, 6, 74, 3, HERO.outline);
  heroThickLine(c, 34, 102, 14, 92, 1, skin);
  heroThickLine(c, 14, 92, 6, 74, 1, skin);

  bossLeg(c, 38, 96, 0, fur, dark, dark, fur);
  bossLeg(c, 64, 96, 0, fur, dark, dark, fur);

  heroEllipse(c, 62, 90, 35, 24, HERO.outline);
  heroEllipse(c, 62, 89, 32, 21, dark);
  heroEllipse(c, 60, 86, 29, 18, fur);
  heroEllipse(c, 54, 78, 14, 8, hi);

  heroEllipse(c, 98, 74, 23, 20, HERO.outline);
  heroEllipse(c, 98, 73, 20, 17, dark);
  heroEllipse(c, 97, 71, 18, 15, fur);
  heroEllipse(c, 112, 82, 12, 9, HERO.outline);
  heroEllipse(c, 112, 82, 10, 7, hi);
  heroEllipse(c, 121, 82, 3, 3, HERO.outline);

  heroEllipse(c, 86, 48, 14, 13, HERO.outline);
  heroEllipse(c, 86, 48, 11, 10, dark);
  heroEllipse(c, 86, 49, 7, 6, skin);
  heroEllipse(c, 106, 42, 13, 13, HERO.outline);
  heroEllipse(c, 106, 42, 10, 10, dark);
  heroEllipse(c, 106, 43, 6, 6, skin);

  bossEye(c, 100, 68, 4, 4, eye);
  heroLine(c, 116, 86, 104, 90, [230, 220, 206, 255]);
  heroLine(c, 116, 88, 104, 94, [230, 220, 206, 255]);
  heroPoly(c, [[114, 88], [118, 88], [116, 96]], ENEMY_TOOTH);
  heroPoly(c, [[120, 86], [124, 86], [122, 94]], ENEMY_TOOTH);

  if (elite) {
    heroLine(c, 88, 58, 98, 76, [214, 96, 82, 255]);
    heroLine(c, 90, 58, 100, 76, [214, 96, 82, 255]);
    heroRect(c, 78, 86, 16, 7, HERO.outline);
    heroRect(c, 79, 87, 14, 5, BOSS.goldDark);
    for (let i = 0; i < 3; i++) {
      heroPoly(c, [[80 + i * 5, 86], [83 + i * 5, 76], [86 + i * 5, 86]], ENEMY_BONE);
    }
  }
}

// Скелет: рёбра, тяжёлый меч и пустые глазницы.
function enemySkeleton(c, elite) {
  const eye = elite ? [255, 78, 62, 255] : [34, 30, 40, 255];
  bossBoneLeg(c, 46, 96, 0);
  bossBoneLeg(c, 68, 96, 0);

  heroPoly(c, [[46, 94], [82, 94], [86, 104], [74, 110], [54, 110], [42, 104]], HERO.outline);
  heroPoly(c, [[49, 96], [79, 96], [82, 102], [72, 107], [56, 107], [46, 102]], BOSS.boneDark);
  heroRect(c, 60, 52, 8, 44, HERO.outline);
  heroRect(c, 62, 54, 4, 40, BOSS.boneDark);
  heroRect(c, 63, 54, 2, 40, BOSS.bone);

  for (let i = 0; i < 4; i++) {
    const y = 60 + i * 8;
    heroRect(c, 42, y, 44, 6, HERO.outline);
    heroRect(c, 43, y + 1, 42, 4, BOSS.boneDark);
    heroRect(c, 45, y + 1, 38, 2, BOSS.bone);
  }

  // Левая рука.
  heroRect(c, 34, 66, 10, 28, HERO.outline);
  heroRect(c, 35, 67, 8, 26, BOSS.boneDark);
  heroRect(c, 36, 67, 5, 24, BOSS.bone);
  heroEllipse(c, 39, 94, 6, 6, HERO.outline);
  heroEllipse(c, 39, 94, 4, 4, BOSS.bone);

  // Правая рука и меч.
  heroRect(c, 84, 66, 10, 26, HERO.outline);
  heroRect(c, 85, 67, 8, 24, BOSS.boneDark);
  heroRect(c, 86, 67, 5, 22, BOSS.bone);
  heroEllipse(c, 89, 92, 6, 6, HERO.outline);
  heroEllipse(c, 89, 92, 4, 4, BOSS.bone);
  heroPoly(c, [[90, 82], [96, 78], [102, 18], [108, 10], [114, 18], [108, 78], [98, 90]], HERO.outline);
  heroPoly(c, [[93, 80], [98, 76], [104, 21], [108, 15], [111, 21], [105, 76], [98, 86]], BOSS.steel);
  heroLine(c, 105, 24, 107, 74, BOSS.steelHi);
  heroRect(c, 86, 80, 28, 7, HERO.outline);
  heroRect(c, 87, 81, 26, 5, BOSS.goldDark);
  heroRect(c, 88, 82, 24, 3, BOSS.gold);
  heroRect(c, 98, 86, 8, 12, HERO.outline);
  heroRect(c, 99, 87, 6, 10, HERO.leatherDark);

  // Череп.
  heroEllipse(c, 64, 36, 18, 19, HERO.outline);
  heroEllipse(c, 64, 36, 16, 17, BOSS.bone);
  heroEllipse(c, 64, 31, 12, 8, BOSS.boneHi);
  heroRect(c, 53, 44, 22, 12, HERO.outline);
  heroRect(c, 54, 45, 20, 10, BOSS.boneDark);
  for (let i = 0; i < 4; i++) heroRect(c, 57 + i * 4, 46, 3, 8, BOSS.boneHi);
  heroEllipse(c, 56, 34, 6, 6, [22, 18, 24, 255]);
  heroEllipse(c, 72, 34, 6, 6, [22, 18, 24, 255]);
  bossEye(c, 56, 34, 3, 3, eye);
  bossEye(c, 72, 34, 3, 3, eye);

  if (elite) {
    // Ржавый шлем с рогами.
    heroEllipse(c, 64, 29, 21, 16, HERO.outline);
    heroEllipse(c, 64, 29, 19, 14, BOSS.steelDark);
    heroEllipse(c, 64, 28, 16, 11, BOSS.steel);
    heroRect(c, 50, 32, 28, 6, HERO.outline);
    heroRect(c, 51, 33, 26, 4, BOSS.steelDark);
    heroRect(c, 61, 30, 6, 16, BOSS.steelDark);
    heroPoly(c, [[46, 24], [34, 8], [30, 14], [42, 32]], HERO.outline);
    heroPoly(c, [[46, 24], [37, 11], [34, 15], [43, 29]], ENEMY_BONE);
    heroPoly(c, [[82, 24], [94, 8], [98, 14], [86, 32]], HERO.outline);
    heroPoly(c, [[82, 24], [91, 11], [94, 15], [85, 29]], ENEMY_BONE);
  }
}

// Лучник: капюшон, лук и стрела на тетиве.
function enemyArcher(c, elite) {
  const cloak = elite ? [52, 40, 66, 255] : [62, 104, 58, 255];
  const cloakDark = elite ? [30, 22, 40, 255] : [38, 66, 38, 255];
  const cloakHi = elite ? [86, 68, 108, 255] : [96, 138, 82, 255];
  const leather = elite ? [74, 54, 48, 255] : [124, 86, 50, 255];
  const leatherDark = elite ? [46, 32, 30, 255] : [82, 56, 32, 255];
  const eye = elite ? [255, 88, 72, 255] : [196, 240, 128, 255];
  const string = [228, 220, 190, 255];

  // Плащ.
  heroPoly(c, [[38, 56], [90, 56], [100, 108], [92, 116], [84, 106], [76, 116],
    [68, 106], [64, 114], [60, 106], [52, 116], [44, 106], [36, 114], [28, 108]], HERO.outline);
  heroPoly(c, [[41, 58], [87, 58], [96, 106], [89, 112], [82, 102], [75, 112],
    [68, 103], [64, 110], [60, 103], [53, 112], [46, 102], [39, 112], [31, 106]], cloakDark);
  heroPoly(c, [[46, 60], [82, 60], [91, 103], [85, 107], [78, 99], [72, 108],
    [66, 100], [64, 105], [62, 100], [56, 108], [50, 99], [43, 107], [37, 103]], cloak);

  // Ноги.
  bossLeg(c, 46, 94, 0, leather, leatherDark, leatherDark, leather);
  bossLeg(c, 66, 94, 0, leather, leatherDark, leatherDark, leather);

  // Торс и ремень.
  heroRect(c, 44, 58, 40, 42, HERO.outline);
  heroRect(c, 45, 59, 38, 40, leatherDark);
  heroRect(c, 47, 59, 34, 38, leather);
  heroRect(c, 47, 59, 7, 35, cloakHi);
  heroPoly(c, [[47, 62], [55, 61], [82, 92], [76, 98]], HERO.outline);
  heroPoly(c, [[48, 63], [54, 62], [80, 92], [76, 96]], cloakHi);
  heroRect(c, 44, 94, 40, 7, HERO.outline);
  heroRect(c, 45, 95, 38, 5, leatherDark);

  // Колчан.
  heroRect(c, 82, 36, 16, 44, HERO.outline);
  heroRect(c, 84, 38, 12, 40, leatherDark);
  for (let i = 0; i < 3; i++) {
    const ax = 85 + i * 4;
    heroRect(c, ax, 18 + i * 2, 2, 24, HERO.woodDark);
    heroRect(c, ax, 18 + i * 2, 2, 8, elite ? [220, 138, 104, 255] : [218, 194, 98, 255]);
  }

  // Капюшон и лицо в тени.
  heroPoly(c, [[42, 58], [46, 36], [56, 20], [64, 16], [72, 20], [82, 36],
    [86, 58], [78, 64], [70, 56], [64, 66], [58, 56], [50, 64]], HERO.outline);
  heroPoly(c, [[45, 56], [49, 38], [58, 24], [64, 21], [70, 24], [79, 38],
    [83, 56], [77, 60], [70, 53], [64, 62], [58, 53], [51, 60]], cloakDark);
  heroPoly(c, [[48, 52], [52, 38], [59, 27], [64, 24], [69, 27], [76, 38],
    [80, 52], [74, 56], [68, 50], [64, 57], [60, 50], [54, 56]], cloak);
  heroEllipse(c, 64, 43, 15, 14, [20, 22, 26, 255]);
  enemyEyes(c, 57, 71, 43, 4, eye);

  // Лук.
  heroPoly(c, [[32, 26], [22, 38], [16, 56], [14, 72], [16, 90], [22, 108],
    [32, 116], [30, 100], [26, 84], [24, 70], [26, 52], [30, 38]], HERO.outline);
  heroPoly(c, [[30, 30], [24, 40], [19, 57], [17, 72], [19, 89], [24, 106],
    [30, 112], [28, 99], [24, 84], [22, 70], [24, 53], [28, 39]], elite ? [82, 62, 54, 255] : HERO.wood);
  heroLine(c, 31, 30, 31, 112, string);
  heroRect(c, 26, 64, 12, 10, HERO.outline);
  heroRect(c, 27, 65, 10, 8, leatherDark);
  heroRect(c, 28, 66, 8, 4, elite ? [220, 138, 104, 255] : [218, 194, 98, 255]);

  // Стрела на тетиве.
  heroRect(c, 6, 68, 34, 3, HERO.outline);
  heroRect(c, 7, 69, 32, 1, [222, 204, 150, 255]);
  heroPoly(c, [[4, 69], [10, 64], [10, 74]], BOSS.steelHi);

  if (elite) {
    // Костяные шипы на плече.
    for (let i = 0; i < 3; i++) {
      heroPoly(c, [[40 + i * 5, 58], [43 + i * 5, 46], [46 + i * 5, 58]], ENEMY_BONE);
    }
    heroLine(c, 51, 82, 51, 92, [168, 40, 48, 255]);
  }
}

// Нетопырь: широкие крылья, уши и клыки.
function enemyBat(c, elite) {
  const wingColors = elite
    ? { membraneDark: [82, 34, 92, 255], bone: [232, 140, 132, 255] }
    : { membraneDark: [108, 74, 168, 255], bone: [206, 184, 244, 255] };
  bossWing(c, -1, 0, wingColors);
  bossWing(c, 1, 0, wingColors);

  const body = elite ? [74, 34, 84, 255] : [96, 64, 158, 255];
  const bodyHi = elite ? [126, 66, 132, 255] : [140, 100, 204, 255];
  const ear = elite ? [176, 92, 132, 255] : [162, 126, 212, 255];

  heroEllipse(c, 64, 84, 22, 28, HERO.outline);
  heroEllipse(c, 64, 84, 20, 26, body);
  heroEllipse(c, 60, 78, 11, 14, bodyHi);

  // Лапы.
  heroRect(c, 52, 104, 8, 14, HERO.outline);
  heroRect(c, 53, 105, 6, 12, body);
  heroRect(c, 68, 104, 8, 14, HERO.outline);
  heroRect(c, 69, 105, 6, 12, body);
  for (let i = 0; i < 3; i++) {
    heroPoly(c, [[51 + i * 4, 122], [53 + i * 4, 114], [55 + i * 4, 122]], ENEMY_CLAW);
    heroPoly(c, [[67 + i * 4, 122], [69 + i * 4, 114], [71 + i * 4, 122]], ENEMY_CLAW);
  }

  // Уши.
  heroPoly(c, [[48, 42], [42, 12], [58, 32]], HERO.outline);
  heroPoly(c, [[49, 40], [44, 17], [56, 33]], ear);
  heroPoly(c, [[80, 42], [86, 12], [70, 32]], HERO.outline);
  heroPoly(c, [[79, 40], [84, 17], [72, 33]], ear);

  // Голова.
  heroEllipse(c, 64, 50, 19, 17, HERO.outline);
  heroEllipse(c, 64, 50, 17, 15, body);
  heroEllipse(c, 60, 47, 9, 7, bodyHi);
  enemyEyes(c, 56, 72, 48, 5, elite ? [255, 96, 72, 255] : [255, 70, 70, 255]);
  heroPoly(c, [[56, 56], [72, 56], [64, 66]], HERO.outline);
  heroPoly(c, [[58, 57], [70, 57], [64, 63]], [58, 20, 44, 255]);
  heroPoly(c, [[57, 57], [61, 57], [59, 65]], ENEMY_TOOTH);
  heroPoly(c, [[67, 57], [71, 57], [69, 65]], ENEMY_TOOTH);

  if (elite) {
    // Багровый гребень.
    heroPoly(c, [[52, 38], [56, 18], [62, 34]], [198, 48, 62, 255]);
    heroPoly(c, [[60, 34], [68, 12], [74, 34]], [198, 48, 62, 255]);
    heroPoly(c, [[72, 38], [82, 22], [82, 42]], [198, 48, 62, 255]);
  }
}

// Демон: рога, хвост и когти.
function enemyDemon(c, elite) {
  const red = elite ? [124, 28, 36, 255] : [186, 52, 40, 255];
  const redDark = elite ? [74, 14, 22, 255] : [116, 26, 24, 255];
  const redHi = elite ? [188, 62, 54, 255] : [226, 86, 54, 255];
  const eye = elite ? [255, 148, 52, 255] : [255, 216, 96, 255];

  // Хвост.
  heroThickLine(c, 76, 104, 108, 114, 3, HERO.outline);
  heroThickLine(c, 108, 114, 118, 96, 3, HERO.outline);
  heroThickLine(c, 76, 104, 108, 114, 1, redDark);
  heroThickLine(c, 108, 114, 118, 96, 1, redDark);
  heroDiamond(c, 118, 92, 6, HERO.outline);
  heroDiamond(c, 118, 92, 4, red);

  bossLeg(c, 46, 96, 0, red, redDark, [38, 22, 26, 255], [26, 14, 18, 255]);
  bossLeg(c, 66, 96, 0, red, redDark, [38, 22, 26, 255], [26, 14, 18, 255]);

  heroPoly(c, [[38, 58], [90, 58], [94, 92], [80, 104], [48, 104], [34, 92]], HERO.outline);
  heroPoly(c, [[40, 60], [88, 60], [91, 90], [78, 101], [50, 101], [37, 90]], redDark);
  heroPoly(c, [[44, 62], [84, 62], [87, 88], [76, 98], [52, 98], [41, 88]], red);
  heroEllipse(c, 52, 70, 12, 8, redHi);
  heroEllipse(c, 76, 70, 12, 8, redHi);
  heroLine(c, 64, 62, 64, 96, redHi);
  heroLine(c, 56, 78, 48, 88, redHi);
  heroLine(c, 72, 78, 80, 88, redHi);

  // Руки.
  heroPoly(c, [[34, 62], [44, 64], [42, 88], [30, 98], [24, 88], [30, 74]], HERO.outline);
  heroPoly(c, [[36, 64], [42, 65], [40, 86], [31, 94], [27, 87], [32, 75]], red);
  heroPoly(c, [[84, 62], [94, 64], [98, 86], [90, 98], [82, 90], [84, 74]], HERO.outline);
  heroPoly(c, [[86, 64], [92, 65], [95, 84], [89, 94], [84, 88], [86, 75]], red);
  for (let i = 0; i < 3; i++) {
    heroPoly(c, [[26 + i * 4, 100], [28 + i * 4, 92], [30 + i * 4, 100]], ENEMY_CLAW);
    heroPoly(c, [[86 + i * 4, 100], [88 + i * 4, 92], [90 + i * 4, 100]], ENEMY_CLAW);
  }

  // Голова и рога.
  heroEllipse(c, 64, 44, 18, 17, HERO.outline);
  heroEllipse(c, 64, 44, 16, 15, redDark);
  heroEllipse(c, 64, 43, 14, 13, red);
  heroEllipse(c, 58, 39, 7, 5, redHi);
  enemyEyes(c, 57, 71, 42, 4, eye);
  heroPoly(c, [[55, 53], [73, 53], [64, 62]], HERO.outline);
  heroPoly(c, [[57, 54], [71, 54], [64, 59]], [58, 16, 18, 255]);
  heroPoly(c, [[56, 54], [60, 54], [58, 62]], ENEMY_TOOTH);
  heroPoly(c, [[68, 54], [72, 54], [70, 62]], ENEMY_TOOTH);
  heroPoly(c, [[50, 32], [38, 14], [26, 8], [32, 20], [44, 40]], HERO.outline);
  heroPoly(c, [[49, 32], [39, 17], [31, 12], [36, 21], [45, 37]], ENEMY_BONE);
  heroPoly(c, [[78, 32], [90, 14], [102, 8], [96, 20], [84, 40]], HERO.outline);
  heroPoly(c, [[79, 32], [89, 17], [97, 12], [92, 21], [83, 37]], ENEMY_BONE);

  if (elite) {
    // Тёмный нагрудник и тлеющие трещины.
    heroPoly(c, [[46, 66], [82, 66], [86, 88], [76, 96], [52, 96], [42, 88]], HERO.outline);
    heroPoly(c, [[48, 68], [80, 68], [83, 87], [74, 93], [54, 93], [45, 87]], BOSS.steelDark);
    heroLine(c, 64, 68, 64, 92, [255, 130, 40, 255]);
    heroLine(c, 54, 78, 48, 86, [255, 130, 40, 255]);
    heroLine(c, 74, 78, 80, 86, [255, 130, 40, 255]);
    heroDiamond(c, 64, 76, 4, [255, 168, 64, 255]);
  }
}

// Волк: низкая стойка, косматая грива и клыки.
function enemyWolf(c, elite) {
  const fur = elite ? [78, 82, 92, 255] : [154, 152, 136, 255];
  const furDark = elite ? [44, 46, 58, 255] : [104, 102, 88, 255];
  const furHi = elite ? [116, 122, 136, 255] : [196, 194, 176, 255];
  const eye = elite ? [255, 74, 62, 255] : [255, 210, 92, 255];

  // Хвост.
  heroPoly(c, [[30, 86], [14, 70], [4, 78], [12, 96], [30, 102]], HERO.outline);
  heroPoly(c, [[30, 88], [17, 75], [10, 80], [16, 94], [30, 98]], furDark);
  heroPoly(c, [[26, 88], [18, 79], [14, 83], [19, 92]], fur);

  bossLeg(c, 30, 98, 0, fur, furDark, furDark, fur);
  bossLeg(c, 56, 98, 0, fur, furDark, furDark, fur);

  // Корпус.
  heroEllipse(c, 56, 90, 32, 23, HERO.outline);
  heroEllipse(c, 56, 89, 29, 20, furDark);
  heroEllipse(c, 54, 86, 26, 17, fur);
  heroEllipse(c, 44, 80, 13, 8, furHi);

  // Голова.
  heroEllipse(c, 96, 72, 24, 21, HERO.outline);
  heroEllipse(c, 96, 71, 21, 18, furDark);
  heroEllipse(c, 95, 69, 19, 16, fur);
  heroEllipse(c, 110, 82, 14, 10, HERO.outline);
  heroEllipse(c, 110, 82, 12, 8, furHi);
  heroEllipse(c, 122, 83, 4, 4, HERO.outline);

  // Уши.
  heroPoly(c, [[82, 54], [78, 30], [94, 48]], HERO.outline);
  heroPoly(c, [[83, 52], [81, 35], [92, 48]], furDark);
  heroPoly(c, [[106, 54], [112, 28], [118, 50]], HERO.outline);
  heroPoly(c, [[107, 52], [112, 33], [116, 49]], furDark);

  // Грива.
  heroPoly(c, [[36, 62], [56, 54], [80, 62], [78, 82], [70, 78], [68, 94],
    [60, 86], [56, 100], [48, 88], [44, 100], [38, 84], [34, 74]], HERO.outline);
  heroPoly(c, [[40, 64], [56, 58], [76, 64], [74, 80], [68, 76], [66, 90],
    [59, 82], [55, 94], [49, 84], [45, 94], [40, 82], [37, 72]], furDark);
  heroPoly(c, [[46, 66], [56, 63], [66, 67], [62, 76], [54, 72], [48, 78]], furHi);

  enemyEyes(c, 96, 110, 69, 4, eye);
  heroLine(c, 118, 87, 104, 92, [230, 220, 206, 255]);
  heroPoly(c, [[113, 88], [117, 88], [115, 98]], ENEMY_TOOTH);
  heroPoly(c, [[120, 87], [124, 87], [122, 97]], ENEMY_TOOTH);

  if (elite) {
    // Костяной ошейник с шипами.
    heroRect(c, 70, 86, 18, 8, HERO.outline);
    heroRect(c, 71, 87, 16, 6, BOSS.goldDark);
    for (let i = 0; i < 3; i++) {
      heroPoly(c, [[72 + i * 5, 86], [75 + i * 5, 76], [78 + i * 5, 86]], ENEMY_BONE);
    }
    heroLine(c, 82, 58, 96, 68, [208, 92, 80, 255]);
  }
}

// Паук: восемь ног, брюшко и красные глаза.
function enemySpider(c, elite) {
  const body = elite ? [58, 42, 80, 255] : [134, 86, 158, 255];
  const bodyDark = elite ? [32, 22, 48, 255] : [92, 56, 112, 255];
  const bodyHi = elite ? [98, 74, 126, 255] : [176, 124, 198, 255];
  const leg = elite ? [46, 34, 62, 255] : [112, 74, 132, 255];
  const eye = elite ? [255, 66, 78, 255] : [255, 84, 84, 255];

  const legs = [
    [[56, 78], [30, 64], [10, 70]],
    [[54, 86], [26, 82], [8, 92]],
    [[56, 94], [30, 104], [12, 116]],
    [[60, 100], [42, 116], [30, 124]],
    [[76, 78], [102, 64], [120, 70]],
    [[78, 86], [108, 82], [124, 92]],
    [[76, 94], [102, 104], [118, 116]],
    [[72, 100], [90, 116], [100, 124]]
  ];
  for (const points of legs) {
    heroThickLine(c, points[0][0], points[0][1], points[1][0], points[1][1], 2, HERO.outline);
    heroThickLine(c, points[1][0], points[1][1], points[2][0], points[2][1], 2, HERO.outline);
    heroThickLine(c, points[0][0], points[0][1], points[1][0], points[1][1], 1, leg);
    heroThickLine(c, points[1][0], points[1][1], points[2][0], points[2][1], 1, leg);
    heroDiamond(c, points[1][0], points[1][1], 2, bodyDark);
  }

  // Брюшко.
  heroEllipse(c, 60, 96, 30, 24, HERO.outline);
  heroEllipse(c, 60, 95, 27, 21, bodyDark);
  heroEllipse(c, 58, 92, 23, 17, body);
  heroEllipse(c, 48, 84, 10, 6, bodyHi);

  // Головогрудь.
  heroEllipse(c, 68, 68, 20, 18, HERO.outline);
  heroEllipse(c, 68, 67, 17, 15, bodyDark);
  heroEllipse(c, 67, 66, 14, 12, body);

  // Глаза.
  enemyEyes(c, 60, 78, 62, 4, eye);
  heroEllipse(c, 55, 57, 2, 2, eye);
  heroEllipse(c, 63, 55, 2, 2, eye);
  heroEllipse(c, 73, 55, 2, 2, eye);
  heroEllipse(c, 81, 57, 2, 2, eye);

  // Хелицеры и клыки.
  heroPoly(c, [[58, 78], [64, 78], [61, 88]], HERO.outline);
  heroPoly(c, [[72, 78], [78, 78], [75, 88]], HERO.outline);
  heroPoly(c, [[60, 80], [63, 80], [62, 86]], ENEMY_CLAW);
  heroPoly(c, [[74, 80], [77, 80], [75, 86]], ENEMY_CLAW);

  if (elite) {
    // Багровый узор на брюшке.
    heroDiamond(c, 60, 96, 7, [190, 40, 58, 255]);
    heroDiamond(c, 60, 96, 4, [255, 104, 96, 255]);
    heroRect(c, 59, 82, 2, 6, [190, 40, 58, 255]);
    heroPoly(c, [[46, 70], [54, 56], [58, 72]], ENEMY_BONE);
    heroPoly(c, [[86, 70], [80, 54], [76, 72]], ENEMY_BONE);
  }
}

// Орёл: распахнутые крылья и крючковатый клюв.
function enemyEagle(c, elite) {
  const wing = elite ? [92, 70, 48, 255] : [154, 116, 70, 255];
  const wingDark = elite ? [52, 38, 28, 255] : [104, 72, 42, 255];
  const wingHi = elite ? [150, 126, 92, 255] : [206, 170, 118, 255];
  const head = elite ? [238, 230, 214, 255] : [176, 126, 76, 255];
  const headDark = elite ? [186, 174, 158, 255] : [126, 84, 46, 255];
  const beak = elite ? [248, 196, 64, 255] : [240, 176, 58, 255];
  const eye = elite ? [255, 210, 84, 255] : [255, 236, 156, 255];

  // Левое крыло.
  heroPoly(c, [[52, 56], [28, 34], [6, 26], [12, 46], [2, 54], [18, 66],
    [8, 82], [34, 78], [50, 92]], HERO.outline);
  heroPoly(c, [[51, 58], [30, 39], [12, 32], [17, 48], [9, 56], [22, 65],
    [14, 78], [36, 75], [50, 87]], wingDark);
  heroPoly(c, [[48, 60], [32, 44], [18, 39], [22, 50], [16, 57], [27, 64],
    [21, 74], [38, 72], [48, 82]], wing);
  heroLine(c, 42, 60, 24, 46, wingHi);
  heroLine(c, 36, 68, 19, 57, wingHi);
  heroLine(c, 32, 76, 18, 68, wingHi);

  // Правое крыло.
  heroPoly(c, [[76, 56], [100, 34], [122, 26], [116, 46], [126, 54], [110, 66],
    [120, 82], [94, 78], [78, 92]], HERO.outline);
  heroPoly(c, [[77, 58], [98, 39], [116, 32], [111, 48], [119, 56], [106, 65],
    [114, 78], [92, 75], [78, 87]], wingDark);
  heroPoly(c, [[80, 60], [96, 44], [110, 39], [106, 50], [112, 57], [101, 64],
    [107, 74], [90, 72], [80, 82]], wing);
  heroLine(c, 86, 60, 104, 46, wingHi);
  heroLine(c, 92, 68, 109, 57, wingHi);
  heroLine(c, 96, 76, 110, 68, wingHi);

  // Тело.
  heroEllipse(c, 64, 78, 20, 24, HERO.outline);
  heroEllipse(c, 64, 77, 17, 21, wingDark);
  heroEllipse(c, 64, 75, 14, 18, wing);

  // Голова.
  heroEllipse(c, 64, 44, 17, 16, HERO.outline);
  heroEllipse(c, 64, 44, 15, 14, headDark);
  heroEllipse(c, 64, 43, 13, 12, head);
  enemyEyes(c, 57, 71, 42, 4, eye);
  heroPoly(c, [[60, 48], [68, 48], [72, 58], [64, 62], [58, 55]], HERO.outline);
  heroPoly(c, [[61, 49], [67, 49], [70, 57], [64, 59], [60, 55]], beak);

  // Лапы.
  heroRect(c, 54, 98, 8, 14, HERO.outline);
  heroRect(c, 55, 99, 6, 12, headDark);
  heroRect(c, 67, 98, 8, 14, HERO.outline);
  heroRect(c, 68, 99, 6, 12, headDark);
  for (let i = 0; i < 3; i++) {
    heroPoly(c, [[52 + i * 4, 122], [54 + i * 4, 112], [56 + i * 4, 122]], beak);
    heroPoly(c, [[66 + i * 4, 122], [68 + i * 4, 112], [70 + i * 4, 122]], beak);
  }

  if (elite) {
    // Золотое оперение на груди.
    heroPoly(c, [[56, 66], [72, 66], [76, 82], [64, 92], [52, 82]], [214, 170, 62, 255]);
    heroLine(c, 60, 70, 60, 82, [255, 220, 120, 255]);
    heroLine(c, 68, 70, 68, 82, [255, 220, 120, 255]);
  }
}

// Козёл: рога, борода и упрямый лоб.
function enemyGoat(c, elite) {
  const fur = elite ? [74, 70, 76, 255] : [166, 150, 128, 255];
  const furDark = elite ? [42, 40, 48, 255] : [116, 102, 84, 255];
  const furHi = elite ? [114, 110, 118, 255] : [204, 190, 168, 255];
  const horn = elite ? [176, 188, 204, 255] : [214, 208, 190, 255];
  const hornDark = elite ? [112, 124, 144, 255] : [166, 158, 138, 255];
  const eye = elite ? [104, 226, 255, 255] : [255, 216, 96, 255];

  // Хвост.
  heroPoly(c, [[28, 84], [18, 76], [14, 88], [26, 94]], HERO.outline);
  heroPoly(c, [[26, 86], [20, 80], [18, 88], [26, 92]], furDark);

  bossLeg(c, 34, 98, 0, fur, furDark, furDark, fur);
  bossLeg(c, 60, 98, 0, fur, furDark, furDark, fur);

  // Корпус.
  heroEllipse(c, 58, 90, 32, 24, HERO.outline);
  heroEllipse(c, 58, 89, 29, 21, furDark);
  heroEllipse(c, 56, 86, 26, 18, fur);
  heroEllipse(c, 46, 80, 12, 7, furHi);

  // Шея и голова.
  heroPoly(c, [[78, 74], [96, 62], [104, 78], [86, 92]], HERO.outline);
  heroPoly(c, [[80, 76], [95, 65], [101, 78], [86, 89]], fur);
  heroEllipse(c, 102, 68, 20, 18, HERO.outline);
  heroEllipse(c, 102, 67, 17, 15, furDark);
  heroEllipse(c, 101, 65, 15, 13, fur);
  heroEllipse(c, 114, 78, 11, 8, HERO.outline);
  heroEllipse(c, 114, 78, 9, 6, furHi);
  heroEllipse(c, 123, 79, 3, 3, HERO.outline);

  // Рога.
  heroPoly(c, [[92, 54], [84, 30], [88, 20], [98, 34], [100, 52]], HERO.outline);
  heroPoly(c, [[94, 52], [87, 31], [90, 25], [96, 36], [98, 52]], horn);
  heroPoly(c, [[112, 54], [120, 30], [126, 22], [120, 42], [118, 56]], HERO.outline);
  heroPoly(c, [[113, 52], [119, 33], [123, 27], [118, 43], [116, 54]], horn);
  heroLine(c, 89, 33, 95, 30, hornDark);
  heroLine(c, 121, 34, 118, 40, hornDark);

  // Уши и борода.
  heroPoly(c, [[86, 64], [72, 62], [82, 74]], HERO.outline);
  heroPoly(c, [[87, 65], [76, 64], [83, 72]], furDark);
  heroPoly(c, [[104, 80], [110, 80], [110, 100], [104, 94]], HERO.outline);
  heroPoly(c, [[105, 81], [109, 81], [108, 96], [105, 92]], furHi);

  bossEye(c, 106, 64, 4, 4, eye);
  heroEllipse(c, 120, 82, 2, 2, [30, 24, 24, 255]);

  if (elite) {
    // Стальные накладки на рогах и шрам.
    heroLine(c, 90, 44, 97, 44, [206, 220, 236, 255]);
    heroLine(c, 118, 44, 123, 40, [206, 220, 236, 255]);
    heroLine(c, 94, 72, 106, 82, [208, 92, 80, 255]);
  }
}

// Скорпион: клешни, сегментированный хвост и жало.
function enemyScorpion(c, elite) {
  const shell = elite ? [92, 44, 46, 255] : [216, 176, 96, 255];
  const shellDark = elite ? [54, 24, 30, 255] : [138, 104, 48, 255];
  const shellHi = elite ? [142, 74, 72, 255] : [244, 214, 132, 255];
  const eye = elite ? [255, 96, 72, 255] : [255, 230, 140, 255];

  // Хвост дугой.
  const tail = [[50, 90], [34, 76], [26, 58], [30, 42], [42, 32]];
  for (let i = 0; i + 1 < tail.length; i++) {
    heroThickLine(c, tail[i][0], tail[i][1], tail[i + 1][0], tail[i + 1][1], 5, HERO.outline);
    heroThickLine(c, tail[i][0], tail[i][1], tail[i + 1][0], tail[i + 1][1], 3, shellDark);
  }
  for (let i = 1; i < tail.length; i++) heroDiamond(c, tail[i][0], tail[i][1], 5, shell);
  // Жало.
  heroPoly(c, [[42, 32], [54, 14], [62, 26], [50, 38]], HERO.outline);
  heroPoly(c, [[44, 33], [53, 18], [59, 27], [50, 36]], shell);
  heroPoly(c, [[52, 18], [58, 10], [60, 22]], [255, 236, 190, 255]);

  // Ноги.
  for (let i = 0; i < 3; i++) {
    const y = 82 + i * 8;
    heroThickLine(c, 50, y, 30, y + 6, 2, HERO.outline);
    heroThickLine(c, 30, y + 6, 18, y + 18, 2, HERO.outline);
    heroThickLine(c, 50, y, 30, y + 6, 1, shellDark);
    heroThickLine(c, 30, y + 6, 18, y + 18, 1, shellDark);
    heroThickLine(c, 78, y, 98, y + 6, 2, HERO.outline);
    heroThickLine(c, 98, y + 6, 110, y + 18, 2, HERO.outline);
    heroThickLine(c, 78, y, 98, y + 6, 1, shellDark);
    heroThickLine(c, 98, y + 6, 110, y + 18, 1, shellDark);
  }

  // Корпус.
  heroEllipse(c, 64, 92, 28, 17, HERO.outline);
  heroEllipse(c, 64, 91, 25, 14, shellDark);
  heroEllipse(c, 63, 89, 21, 11, shell);
  heroRect(c, 52, 84, 24, 4, shellHi);

  // Голова и клешни.
  heroEllipse(c, 88, 88, 16, 12, HERO.outline);
  heroEllipse(c, 88, 88, 13, 9, shell);
  heroPoly(c, [[100, 82], [114, 74], [124, 80], [116, 88], [124, 96],
    [110, 98], [100, 92]], HERO.outline);
  heroPoly(c, [[102, 84], [114, 77], [121, 81], [113, 87], [121, 93],
    [110, 95], [102, 91]], shell);
  heroPoly(c, [[100, 88], [86, 80], [78, 88], [86, 96]], HERO.outline);
  heroPoly(c, [[100, 88], [88, 82], [82, 88], [88, 94]], shellDark);

  bossEye(c, 84, 84, 3, 3, eye);
  bossEye(c, 92, 84, 3, 3, eye);

  if (elite) {
    // Костяные шипы на панцире.
    for (let i = 0; i < 3; i++) {
      heroPoly(c, [[50 + i * 10, 84], [54 + i * 10, 72], [58 + i * 10, 84]], ENEMY_BONE);
    }
  }
}

// Мумия: бинты, тяжёлые руки и пустой взгляд.
function enemyMummy(c, elite) {
  const wrap = elite ? [206, 190, 148, 255] : [222, 210, 174, 255];
  const wrapDark = elite ? [154, 136, 98, 255] : [176, 162, 126, 255];
  const wrapHi = elite ? [238, 226, 188, 255] : [242, 234, 206, 255];
  const eye = elite ? [116, 240, 255, 255] : [255, 210, 96, 255];
  const gold = [220, 178, 66, 255];
  const goldDark = [154, 118, 36, 255];

  // Ноги.
  heroRect(c, 48, 92, 14, 34, HERO.outline);
  heroRect(c, 49, 93, 12, 32, wrapDark);
  heroRect(c, 50, 93, 9, 30, wrap);
  heroRect(c, 68, 92, 14, 34, HERO.outline);
  heroRect(c, 69, 93, 12, 32, wrapDark);
  heroRect(c, 70, 93, 9, 30, wrap);
  heroRect(c, 45, 118, 19, 8, HERO.outline);
  heroRect(c, 46, 119, 17, 6, wrapDark);
  heroRect(c, 66, 118, 19, 8, HERO.outline);
  heroRect(c, 67, 119, 17, 6, wrapDark);
  for (let i = 0; i < 4; i++) {
    heroLine(c, 49, 98 + i * 7, 61, 96 + i * 7, wrapHi);
    heroLine(c, 69, 98 + i * 7, 81, 96 + i * 7, wrapHi);
  }

  // Торс.
  heroPoly(c, [[42, 56], [86, 56], [90, 96], [80, 104], [48, 104], [38, 96]], HERO.outline);
  heroPoly(c, [[44, 58], [84, 58], [87, 94], [78, 101], [50, 101], [41, 94]], wrapDark);
  heroPoly(c, [[47, 59], [81, 59], [84, 92], [76, 98], [52, 98], [44, 92]], wrap);
  for (let i = 0; i < 6; i++) {
    heroLine(c, 45, 64 + i * 6, 82, 62 + i * 6, wrapHi);
  }
  // Свисающий бинт.
  heroPoly(c, [[44, 94], [52, 96], [48, 114], [40, 108]], wrapDark);
  heroPoly(c, [[46, 96], [50, 97], [47, 110], [43, 106]], wrapHi);

  // Руки вперёд.
  heroRect(c, 30, 64, 40, 13, HERO.outline);
  heroRect(c, 31, 65, 38, 11, wrapDark);
  heroRect(c, 32, 66, 34, 8, wrap);
  heroRect(c, 58, 76, 34, 13, HERO.outline);
  heroRect(c, 59, 77, 32, 11, wrapDark);
  heroRect(c, 60, 78, 28, 8, wrap);
  for (let i = 0; i < 3; i++) {
    heroLine(c, 34 + i * 12, 68, 34 + i * 12, 74, wrapHi);
    heroLine(c, 62 + i * 10, 80, 62 + i * 10, 86, wrapHi);
  }
  // Кисти.
  heroEllipse(c, 34, 72, 9, 7, HERO.outline);
  heroEllipse(c, 34, 72, 7, 5, wrapDark);
  heroEllipse(c, 92, 82, 9, 7, HERO.outline);
  heroEllipse(c, 92, 82, 7, 5, wrapDark);

  // Голова.
  heroEllipse(c, 64, 36, 18, 19, HERO.outline);
  heroEllipse(c, 64, 36, 16, 17, wrap);
  heroEllipse(c, 64, 33, 12, 10, wrapHi);
  heroRect(c, 52, 26, 24, 4, wrapDark);
  heroRect(c, 56, 44, 16, 3, wrapDark);
  bossEye(c, 57, 36, 4, 4, eye);
  bossEye(c, 71, 36, 4, 4, eye);
  heroRect(c, 60, 47, 8, 2, [42, 32, 26, 255]);

  if (elite) {
    // Золотой нагрудник и самоцвет.
    heroPoly(c, [[50, 58], [78, 58], [82, 72], [64, 82], [46, 72]], HERO.outline);
    heroPoly(c, [[52, 60], [76, 60], [79, 71], [64, 79], [49, 71]], goldDark);
    heroPoly(c, [[55, 62], [73, 62], [75, 70], [64, 76], [53, 70]], gold);
    heroDiamond(c, 64, 69, 4, [80, 210, 240, 255]);
    heroRect(c, 54, 46, 20, 3, gold);
  }
}

// Культист: балахон, клинок и маска.
function enemyCultist(c, elite) {
  const robe = elite ? [52, 28, 44, 255] : [156, 52, 70, 255];
  const robeDark = elite ? [30, 16, 28, 255] : [104, 32, 50, 255];
  const robeHi = elite ? [92, 52, 74, 255] : [198, 84, 100, 255];
  const mask = elite ? [226, 190, 92, 255] : [232, 224, 204, 255];
  const eye = elite ? [255, 88, 72, 255] : [255, 120, 130, 255];

  // Балахон.
  heroPoly(c, [[40, 56], [88, 56], [102, 112], [94, 120], [86, 110], [78, 122],
    [70, 112], [64, 120], [58, 112], [50, 122], [42, 110], [34, 120], [26, 112]], HERO.outline);
  heroPoly(c, [[43, 58], [85, 58], [98, 110], [91, 116], [84, 106], [77, 118],
    [70, 108], [64, 116], [58, 108], [51, 118], [44, 106], [37, 116], [29, 110]], robeDark);
  heroPoly(c, [[47, 60], [81, 60], [93, 107], [87, 111], [80, 102], [74, 113],
    [68, 104], [64, 111], [60, 104], [54, 113], [48, 102], [42, 111], [35, 107]], robe);
  heroLine(c, 64, 62, 64, 116, robeDark);
  heroLine(c, 64, 64, 64, 114, robeHi);

  // Капюшон.
  heroPoly(c, [[38, 58], [42, 34], [54, 16], [64, 12], [74, 16], [86, 34],
    [90, 58], [80, 66], [70, 58], [64, 68], [58, 58], [48, 66]], HERO.outline);
  heroPoly(c, [[42, 56], [46, 36], [56, 20], [64, 17], [72, 20], [82, 36],
    [86, 56], [78, 62], [70, 54], [64, 64], [58, 54], [50, 62]], robeDark);
  heroPoly(c, [[46, 52], [50, 38], [58, 24], [64, 21], [70, 24], [78, 38],
    [82, 52], [76, 58], [69, 50], [64, 59], [59, 50], [52, 58]], robe);

  // Маска в тени капюшона.
  heroEllipse(c, 64, 42, 14, 13, [18, 14, 22, 255]);
  heroEllipse(c, 64, 43, 10, 9, mask);
  heroEllipse(c, 58, 42, 3, 2, [24, 18, 26, 255]);
  heroEllipse(c, 70, 42, 3, 2, [24, 18, 26, 255]);
  bossEye(c, 58, 42, 2, 2, eye);
  bossEye(c, 70, 42, 2, 2, eye);
  heroRect(c, 60, 48, 8, 2, [24, 18, 26, 255]);

  // Рука с клинком.
  heroPoly(c, [[86, 64], [96, 64], [100, 86], [92, 94], [84, 84], [86, 72]], HERO.outline);
  heroPoly(c, [[88, 66], [94, 66], [96, 84], [92, 89], [87, 83], [88, 72]], robe);
  heroEllipse(c, 96, 90, 6, 6, HERO.outline);
  heroEllipse(c, 96, 90, 4, 4, mask);
  heroPoly(c, [[94, 88], [102, 76], [108, 54], [112, 42], [116, 54], [108, 80], [100, 92]], HERO.outline);
  heroPoly(c, [[96, 87], [102, 77], [107, 56], [110, 48], [112, 56], [106, 79], [100, 89]], BOSS.steel);
  heroLine(c, 108, 52, 110, 74, BOSS.steelHi);
  heroRect(c, 88, 84, 14, 5, HERO.outline);
  heroRect(c, 89, 85, 12, 3, BOSS.goldDark);

  // Пояс и амулет.
  heroRect(c, 42, 92, 44, 7, HERO.outline);
  heroRect(c, 43, 93, 42, 5, robeDark);
  heroDiamond(c, 64, 94, 4, mask);
  heroDiamond(c, 64, 94, 2, eye);
  heroLine(c, 58, 60, 64, 68, BOSS.goldDark);
  heroLine(c, 70, 60, 64, 68, BOSS.goldDark);

  if (elite) {
    // Кровавый ореол за спиной.
    heroEllipse(c, 64, 48, 38, 34, [190, 40, 52, 44]);
    heroEllipse(c, 64, 48, 34, 30, [190, 40, 52, 30]);
  }
}

// Зомби: сгорбленная фигура, рваная одежда и раны.
function enemyZombie(c, elite) {
  const skin = elite ? [96, 116, 132, 255] : [122, 154, 106, 255];
  const skinDark = elite ? [58, 72, 90, 255] : [82, 112, 70, 255];
  const skinHi = elite ? [144, 166, 180, 255] : [164, 194, 144, 255];
  const cloth = elite ? [86, 74, 58, 255] : [90, 122, 74, 255];
  const clothDark = elite ? [52, 44, 34, 255] : [58, 84, 48, 255];
  const eye = elite ? [255, 78, 62, 255] : [226, 240, 150, 255];

  // Ноги.
  heroRect(c, 48, 94, 14, 32, HERO.outline);
  heroRect(c, 49, 95, 12, 30, clothDark);
  heroRect(c, 50, 95, 9, 28, cloth);
  heroRect(c, 68, 94, 14, 32, HERO.outline);
  heroRect(c, 69, 95, 12, 30, clothDark);
  heroRect(c, 70, 95, 9, 28, cloth);
  heroRect(c, 45, 120, 19, 7, HERO.outline);
  heroRect(c, 46, 121, 17, 5, skinDark);
  heroRect(c, 66, 120, 19, 7, HERO.outline);
  heroRect(c, 67, 121, 17, 5, skinDark);

  // Торс.
  heroPoly(c, [[40, 58], [88, 58], [90, 96], [80, 106], [48, 106], [38, 96]], HERO.outline);
  heroPoly(c, [[42, 60], [86, 60], [87, 94], [78, 103], [50, 103], [41, 94]], skinDark);
  heroPoly(c, [[45, 61], [83, 61], [84, 91], [76, 100], [52, 100], [44, 91]], skin);
  heroRect(c, 54, 62, 20, 26, clothDark);
  heroRect(c, 56, 64, 16, 22, cloth);
  // Прореха с рёбрами.
  heroPoly(c, [[48, 76], [58, 76], [56, 94], [46, 90]], [18, 16, 18, 255]);
  for (let i = 0; i < 3; i++) heroRect(c, 48, 79 + i * 5, 9, 2, ENEMY_BONE_DK);

  // Руки вперёд.
  heroRect(c, 24, 62, 38, 14, HERO.outline);
  heroRect(c, 25, 63, 36, 12, skinDark);
  heroRect(c, 26, 64, 32, 9, skin);
  heroRect(c, 58, 70, 38, 14, HERO.outline);
  heroRect(c, 59, 71, 36, 12, skinDark);
  heroRect(c, 60, 72, 32, 9, skin);
  heroEllipse(c, 26, 69, 9, 7, HERO.outline);
  heroEllipse(c, 26, 69, 7, 5, skinDark);
  heroEllipse(c, 94, 77, 9, 7, HERO.outline);
  heroEllipse(c, 94, 77, 7, 5, skinDark);
  for (let i = 0; i < 3; i++) {
    heroPoly(c, [[22 + i * 5, 76], [24 + i * 5, 68], [26 + i * 5, 76]], ENEMY_CLAW);
    heroPoly(c, [[90 + i * 5, 84], [92 + i * 5, 76], [94 + i * 5, 84]], ENEMY_CLAW);
  }

  // Голова.
  heroEllipse(c, 64, 38, 18, 18, HERO.outline);
  heroEllipse(c, 64, 38, 16, 16, skinDark);
  heroEllipse(c, 64, 36, 13, 13, skin);
  heroEllipse(c, 57, 32, 5, 4, skinHi);
  bossEye(c, 57, 36, 4, 4, eye);
  bossEye(c, 71, 36, 4, 4, eye);
  heroRect(c, 54, 46, 20, 7, HERO.outline);
  heroRect(c, 55, 47, 18, 5, [44, 24, 26, 255]);
  for (let i = 0; i < 4; i++) heroRect(c, 56 + i * 4, 47, 2, 4, [232, 220, 190, 255]);
  heroLine(c, 50, 28, 58, 34, [176, 60, 60, 255]);

  if (elite) {
    // Ржавые наплечники.
    heroEllipse(c, 40, 60, 15, 12, HERO.outline);
    heroEllipse(c, 40, 59, 13, 10, [98, 74, 52, 255]);
    heroEllipse(c, 40, 58, 9, 7, [142, 108, 70, 255]);
    heroEllipse(c, 88, 60, 15, 12, HERO.outline);
    heroEllipse(c, 88, 59, 13, 10, [98, 74, 52, 255]);
    heroEllipse(c, 88, 58, 9, 7, [142, 108, 70, 255]);
    heroRect(c, 54, 20, 20, 5, HERO.outline);
    heroRect(c, 55, 21, 18, 3, [142, 108, 70, 255]);
  }
}

// Призрак: рваная дымка, пустые глаза и свечение.
function enemyGhost(c, elite) {
  const body = elite ? [150, 240, 230, 220] : [178, 224, 255, 210];
  const bodyDark = elite ? [74, 168, 174, 200] : [112, 168, 216, 200];
  const glow = elite ? [102, 255, 238, 255] : [216, 246, 255, 255];
  const eye = elite ? [255, 92, 120, 255] : [30, 52, 78, 255];

  // Хвост-дымка.
  heroPoly(c, [[32, 84], [96, 84], [104, 110], [96, 106], [92, 120], [82, 110],
    [76, 124], [68, 111], [60, 124], [52, 110], [44, 122], [38, 108], [26, 116], [24, 102]],
    [18, 28, 44, 200]);
  heroPoly(c, [[36, 84], [92, 84], [98, 108], [92, 104], [87, 116], [78, 107],
    [72, 120], [64, 108], [56, 120], [48, 107], [41, 118], [35, 105], [27, 112], [28, 100]], bodyDark);
  heroPoly(c, [[42, 84], [86, 84], [90, 104], [85, 101], [80, 112], [72, 103],
    [64, 115], [56, 103], [49, 112], [43, 101], [37, 109], [34, 100]], body);

  // Тело и голова.
  heroEllipse(c, 64, 62, 28, 26, [18, 28, 44, 210]);
  heroEllipse(c, 64, 61, 25, 23, bodyDark);
  heroEllipse(c, 62, 58, 21, 19, body);
  heroEllipse(c, 64, 40, 20, 18, [18, 28, 44, 220]);
  heroEllipse(c, 64, 40, 17, 15, body);
  heroEllipse(c, 64, 35, 12, 8, glow);

  // Руки-дымка.
  heroPoly(c, [[38, 64], [18, 74], [14, 90], [24, 86], [30, 96], [38, 84], [44, 76]], [18, 28, 44, 200]);
  heroPoly(c, [[40, 66], [24, 76], [20, 88], [28, 84], [32, 92], [38, 82], [43, 76]], bodyDark);
  heroPoly(c, [[90, 64], [110, 74], [114, 90], [104, 86], [98, 96], [90, 84], [84, 76]], [18, 28, 44, 200]);
  heroPoly(c, [[88, 66], [104, 76], [108, 88], [100, 84], [96, 92], [90, 82], [85, 76]], bodyDark);

  // Лицо.
  heroEllipse(c, 57, 41, 5, 6, [14, 22, 34, 255]);
  heroEllipse(c, 71, 41, 5, 6, [14, 22, 34, 255]);
  bossEye(c, 57, 41, 3, 3, eye);
  bossEye(c, 71, 41, 3, 3, eye);
  heroEllipse(c, 64, 51, 6, 7, [14, 22, 34, 255]);
  heroEllipse(c, 64, 51, 4, 5, [14, 22, 34, 255]);

  if (elite) {
    // Древняя корона и лишние огоньки.
    heroPoly(c, [[42, 26], [50, 8], [57, 22], [64, 2], [71, 22], [78, 8], [86, 26]], HERO.outline);
    heroPoly(c, [[46, 24], [51, 13], [57, 24], [64, 8], [71, 24], [77, 13], [82, 24]], BOSS.gold);
    heroDiamond(c, 64, 18, 3, glow);
    heroDiamond(c, 22, 62, 3, glow);
    heroDiamond(c, 108, 58, 3, glow);
    heroDiamond(c, 98, 108, 2, glow);
  }
}

// Упырь: горб, длинные руки и ребра наружу.
function enemyGhoul(c, elite) {
  const skin = elite ? [178, 168, 156, 255] : [116, 148, 132, 255];
  const skinDark = elite ? [112, 102, 94, 255] : [72, 98, 86, 255];
  const skinHi = elite ? [212, 204, 192, 255] : [154, 186, 168, 255];
  const eye = elite ? [255, 70, 70, 255] : [228, 255, 224, 255];

  // Лапы.
  heroRect(c, 44, 98, 12, 28, HERO.outline);
  heroRect(c, 45, 99, 10, 26, skinDark);
  heroRect(c, 46, 99, 7, 24, skin);
  heroRect(c, 70, 98, 12, 28, HERO.outline);
  heroRect(c, 71, 99, 10, 26, skinDark);
  heroRect(c, 72, 99, 7, 24, skin);
  for (let i = 0; i < 3; i++) {
    heroPoly(c, [[42 + i * 4, 124], [44 + i * 4, 114], [46 + i * 4, 124]], ENEMY_CLAW);
    heroPoly(c, [[68 + i * 4, 124], [70 + i * 4, 114], [72 + i * 4, 124]], ENEMY_CLAW);
  }

  // Горбатый торс.
  heroPoly(c, [[44, 62], [58, 52], [78, 54], [88, 68], [84, 96], [74, 104],
    [52, 104], [42, 94]], HERO.outline);
  heroPoly(c, [[46, 64], [59, 55], [76, 57], [85, 69], [81, 94], [72, 101],
    [54, 101], [44, 93]], skinDark);
  heroPoly(c, [[49, 65], [60, 58], [74, 60], [81, 70], [78, 91], [70, 97],
    [56, 97], [47, 91]], skin);
  heroEllipse(c, 52, 72, 9, 8, skinHi);

  // Ребра.
  for (let i = 0; i < 3; i++) {
    heroLine(c, 56, 76 + i * 6, 76, 74 + i * 6, ENEMY_BONE_DK);
  }
  // Рана на животе.
  heroPoly(c, [[60, 86], [70, 86], [66, 98], [58, 94]], [100, 34, 40, 255]);

  // Длинные руки.
  heroPoly(c, [[42, 66], [30, 72], [22, 94], [30, 112], [18, 104], [16, 84], [28, 66]], HERO.outline);
  heroPoly(c, [[42, 68], [32, 74], [25, 94], [30, 105], [23, 100], [21, 84], [30, 68]], skin);
  heroPoly(c, [[86, 66], [98, 72], [104, 94], [96, 112], [108, 104], [110, 84], [98, 66]], HERO.outline);
  heroPoly(c, [[86, 68], [96, 74], [101, 94], [96, 105], [103, 100], [105, 84], [96, 68]], skin);
  for (let i = 0; i < 3; i++) {
    heroPoly(c, [[24 + i * 4, 116], [26 + i * 4, 105], [29 + i * 4, 116]], ENEMY_CLAW);
    heroPoly(c, [[95 + i * 4, 116], [97 + i * 4, 105], [100 + i * 4, 116]], ENEMY_CLAW);
  }

  // Голова.
  heroEllipse(c, 64, 40, 18, 18, HERO.outline);
  heroEllipse(c, 64, 40, 16, 16, skinDark);
  heroEllipse(c, 64, 39, 13, 13, skin);
  heroEllipse(c, 56, 34, 5, 4, skinHi);
  bossEye(c, 57, 39, 4, 4, eye);
  bossEye(c, 71, 39, 4, 4, eye);
  heroRect(c, 54, 48, 20, 8, HERO.outline);
  heroRect(c, 55, 49, 18, 6, [52, 22, 26, 255]);
  for (let i = 0; i < 5; i++) heroRect(c, 56 + i * 3, 49, 2, 5, ENEMY_TOOTH);

  if (elite) {
    // Костяные наросты на спине.
    for (let i = 0; i < 3; i++) {
      heroPoly(c, [[54 + i * 8, 58], [58 + i * 8, 40], [62 + i * 8, 58]], ENEMY_BONE);
    }
    heroLine(c, 76, 60, 82, 88, [190, 60, 56, 255]);
  }
}

// Голем: каменные блоки и светящееся ядро.
function enemyGolem(c, elite) {
  const stone = elite ? [86, 94, 104, 255] : [140, 136, 128, 255];
  const stoneDark = elite ? [48, 56, 68, 255] : [92, 88, 82, 255];
  const stoneHi = elite ? [130, 142, 154, 255] : [178, 174, 164, 255];
  const core = elite ? [98, 240, 255, 255] : [255, 196, 72, 255];

  bossThickLeg(c, 38, 94, 0, stone, stoneDark);
  bossThickLeg(c, 68, 94, 0, stone, stoneDark);

  // Торс.
  heroPoly(c, [[28, 54], [100, 54], [106, 92], [92, 106], [36, 106], [22, 92]], HERO.outline);
  heroPoly(c, [[30, 56], [98, 56], [103, 91], [90, 103], [38, 103], [25, 91]], stoneDark);
  heroPoly(c, [[33, 58], [95, 58], [99, 89], [87, 99], [41, 99], [29, 89]], stone);
  heroRect(c, 33, 58, 62, 8, stoneHi);
  // Трещины.
  heroLine(c, 42, 64, 50, 80, stoneDark);
  heroLine(c, 50, 80, 44, 92, stoneDark);
  heroLine(c, 78, 62, 72, 78, stoneDark);
  heroLine(c, 72, 78, 82, 94, stoneDark);
  // Ядро.
  heroEllipse(c, 64, 78, 12, 12, HERO.outline);
  heroEllipse(c, 64, 78, 9, 9, core);
  heroEllipse(c, 61, 75, 4, 4, [255, 255, 255, 220]);
  heroLine(c, 56, 78, 46, 72, core);
  heroLine(c, 72, 78, 82, 72, core);

  // Плечи и руки.
  heroEllipse(c, 28, 60, 16, 14, HERO.outline);
  heroEllipse(c, 28, 59, 14, 12, stoneDark);
  heroEllipse(c, 28, 58, 11, 9, stone);
  heroEllipse(c, 100, 60, 16, 14, HERO.outline);
  heroEllipse(c, 100, 59, 14, 12, stoneDark);
  heroEllipse(c, 100, 58, 11, 9, stone);
  heroRect(c, 14, 66, 18, 32, HERO.outline);
  heroRect(c, 16, 67, 14, 30, stoneDark);
  heroRect(c, 18, 67, 9, 27, stone);
  heroEllipse(c, 22, 100, 15, 13, HERO.outline);
  heroEllipse(c, 22, 99, 13, 11, stoneDark);
  heroEllipse(c, 22, 98, 10, 8, stone);
  heroRect(c, 96, 66, 18, 32, HERO.outline);
  heroRect(c, 98, 67, 14, 30, stoneDark);
  heroRect(c, 102, 67, 9, 27, stone);
  heroEllipse(c, 106, 100, 15, 13, HERO.outline);
  heroEllipse(c, 106, 99, 13, 11, stoneDark);
  heroEllipse(c, 106, 98, 10, 8, stone);

  // Голова.
  heroPoly(c, [[48, 48], [80, 48], [84, 32], [74, 22], [54, 22], [44, 32]], HERO.outline);
  heroPoly(c, [[50, 46], [78, 46], [81, 33], [72, 25], [56, 25], [47, 33]], stone);
  heroRect(c, 50, 28, 28, 4, stoneHi);
  bossEye(c, 58, 37, 3, 3, core);
  bossEye(c, 70, 37, 3, 3, core);
  heroLine(c, 56, 42, 72, 42, HERO.outline);

  if (elite) {
    // Рунические пластины.
    heroRect(c, 54, 64, 4, 20, core);
    heroRect(c, 72, 64, 4, 20, core);
    heroRect(c, 56, 90, 18, 3, core);
    heroLine(c, 30, 74, 22, 88, core);
    heroLine(c, 98, 74, 106, 88, core);
  }
}

// Крокодил: длинная морда, хвост и костяные шипы.
function enemyCroc(c, elite) {
  const scale = elite ? [58, 78, 58, 255] : [78, 136, 78, 255];
  const scaleDark = elite ? [30, 44, 34, 255] : [46, 92, 50, 255];
  const scaleHi = elite ? [100, 126, 96, 255] : [122, 180, 118, 255];
  const belly = elite ? [126, 124, 100, 255] : [164, 190, 140, 255];
  const eye = elite ? [255, 86, 62, 255] : [255, 220, 96, 255];

  // Хвост.
  heroPoly(c, [[42, 94], [14, 102], [2, 94], [12, 86], [34, 82]], HERO.outline);
  heroPoly(c, [[40, 94], [16, 100], [8, 94], [14, 89], [34, 84]], scaleDark);
  heroPoly(c, [[36, 93], [18, 97], [12, 93], [18, 90], [34, 87]], scale);

  bossLeg(c, 34, 98, 0, scale, scaleDark, scaleDark, scale);
  bossLeg(c, 62, 98, 0, scale, scaleDark, scaleDark, scale);

  // Корпус.
  heroEllipse(c, 58, 90, 34, 22, HERO.outline);
  heroEllipse(c, 58, 89, 31, 19, scaleDark);
  heroEllipse(c, 56, 86, 28, 16, scale);
  heroEllipse(c, 54, 98, 24, 6, belly);

  // Шея и морда.
  heroPoly(c, [[76, 78], [106, 70], [120, 76], [126, 84], [118, 92], [96, 94], [78, 92]], HERO.outline);
  heroPoly(c, [[78, 80], [104, 73], [117, 78], [121, 84], [115, 89], [96, 91], [79, 90]], scaleDark);
  heroPoly(c, [[80, 81], [103, 76], [115, 80], [118, 84], [113, 87], [96, 88], [80, 88]], scale);
  heroPoly(c, [[78, 90], [118, 88], [114, 98], [92, 100], [80, 96]], HERO.outline);
  heroPoly(c, [[81, 90], [115, 89], [111, 96], [93, 98], [82, 95]], belly);

  // Зубы.
  for (let i = 0; i < 6; i++) {
    heroPoly(c, [[84 + i * 6, 89], [87 + i * 6, 83], [90 + i * 6, 89]], ENEMY_TOOTH);
  }
  // Глаз и ноздря.
  bossEye(c, 104, 76, 4, 4, eye);
  heroEllipse(c, 121, 81, 2, 2, [24, 20, 22, 255]);

  // Шипы на спине.
  for (let i = 0; i < 4; i++) {
    heroPoly(c, [[36 + i * 12, 70], [41 + i * 12, 56], [46 + i * 12, 70]], HERO.outline);
    heroPoly(c, [[38 + i * 12, 69], [41 + i * 12, 60], [44 + i * 12, 69]], ENEMY_BONE_DK);
  }

  if (elite) {
    // Багровые полосы на боках и костяной гребень.
    for (let i = 0; i < 3; i++) heroLine(c, 42 + i * 12, 80, 52 + i * 12, 94, [168, 50, 46, 255]);
    for (let i = 0; i < 3; i++) {
      heroPoly(c, [[80 + i * 8, 74], [84 + i * 8, 60], [88 + i * 8, 74]], ENEMY_BONE);
    }
  }
}

// Шаман: маска-череп, перья и посох с черепом.
function enemyShaman(c, elite) {
  const robe = elite ? [62, 38, 76, 255] : [94, 62, 128, 255];
  const robeDark = elite ? [38, 22, 50, 255] : [72, 46, 100, 255];
  const robeHi = elite ? [104, 74, 124, 255] : [132, 98, 166, 255];
  const mask = elite ? [246, 210, 106, 255] : [236, 228, 208, 255];
  const maskDark = elite ? [112, 72, 32, 255] : [44, 28, 58, 255];
  const feather = elite ? [226, 72, 96, 255] : [176, 96, 224, 255];
  const eye = elite ? [255, 86, 62, 255] : [255, 216, 96, 255];

  // Посох с черепом.
  heroThickLine(c, 102, 40, 98, 124, 3, HERO.outline);
  heroThickLine(c, 102, 40, 98, 124, 1, HERO.woodDark);
  heroLine(c, 101, 42, 99, 122, HERO.wood);
  heroEllipse(c, 102, 32, 14, 14, HERO.outline);
  heroEllipse(c, 102, 32, 12, 12, mask);
  heroRect(c, 93, 30, 4, 5, maskDark);
  heroRect(c, 107, 30, 4, 5, maskDark);
  bossEye(c, 95, 31, 2, 2, eye);
  bossEye(c, 109, 31, 2, 2, eye);
  heroRect(c, 97, 40, 10, 2, maskDark);

  // Ноги.
  bossLeg(c, 46, 102, 0, robe, robeDark, HERO.leatherDark, HERO.leather);
  bossLeg(c, 66, 102, 0, robe, robeDark, HERO.leatherDark, HERO.leather);

  // Роба.
  heroPoly(c, [[42, 62], [86, 62], [100, 110], [92, 118], [84, 108], [76, 120],
    [68, 110], [60, 120], [52, 108], [44, 118], [36, 110], [28, 116], [24, 104]], HERO.outline);
  heroPoly(c, [[45, 64], [83, 64], [96, 108], [89, 114], [82, 104], [75, 116],
    [68, 106], [64, 114], [60, 106], [53, 116], [46, 104], [39, 114], [31, 108]], robeDark);
  heroPoly(c, [[49, 66], [79, 66], [92, 105], [86, 109], [79, 100], [73, 111],
    [67, 102], [64, 108], [61, 102], [55, 111], [49, 100], [42, 109], [35, 105]], robe);
  heroLine(c, 64, 68, 64, 110, robeDark);
  heroLine(c, 64, 70, 64, 108, robeHi);

  // Шаль и руки.
  heroPoly(c, [[38, 60], [90, 60], [86, 74], [76, 68], [64, 78], [52, 68], [42, 74]], HERO.outline);
  heroPoly(c, [[42, 62], [86, 62], [82, 71], [74, 66], [64, 74], [54, 66], [46, 71]], robeDark);
  heroPoly(c, [[38, 68], [48, 70], [46, 90], [36, 98], [28, 90], [34, 78]], HERO.outline);
  heroPoly(c, [[40, 70], [46, 71], [44, 88], [37, 94], [32, 89], [36, 78]], robe);
  heroEllipse(c, 36, 94, 7, 6, HERO.outline);
  heroEllipse(c, 36, 94, 5, 4, mask);
  heroEllipse(c, 98, 88, 7, 7, HERO.outline);
  heroEllipse(c, 98, 88, 5, 5, mask);

  // Маска-череп.
  heroEllipse(c, 64, 44, 17, 18, HERO.outline);
  heroEllipse(c, 64, 44, 15, 16, mask);
  heroEllipse(c, 64, 39, 11, 8, [255, 250, 230, 255]);
  heroRect(c, 54, 54, 20, 10, HERO.outline);
  heroRect(c, 55, 55, 18, 8, mask);
  for (let i = 0; i < 4; i++) heroRect(c, 57 + i * 4, 55, 2, 7, maskDark);
  heroEllipse(c, 57, 44, 5, 5, [28, 20, 34, 255]);
  heroEllipse(c, 71, 44, 5, 5, [28, 20, 34, 255]);
  bossEye(c, 57, 44, 3, 3, eye);
  bossEye(c, 71, 44, 3, 3, eye);
  heroRect(c, 63, 50, 2, 3, maskDark);

  // Перья на уборе.
  heroPoly(c, [[52, 30], [40, 4], [48, 16], [54, 6], [58, 28]], HERO.outline);
  heroPoly(c, [[54, 28], [43, 8], [49, 17], [54, 11], [56, 27]], feather);
  heroPoly(c, [[76, 30], [88, 4], [80, 16], [74, 6], [70, 28]], HERO.outline);
  heroPoly(c, [[74, 28], [85, 8], [79, 17], [74, 11], [72, 27]], feather);
  heroRect(c, 48, 28, 32, 5, HERO.outline);
  heroRect(c, 49, 29, 30, 3, robeDark);
  heroDiamond(c, 64, 31, 4, mask);
  heroDiamond(c, 64, 31, 2, eye);

  // Ожерелье из костей.
  for (let i = 0; i < 4; i++) {
    heroRect(c, 50 + i * 7, 66, 5, 6, HERO.outline);
    heroRect(c, 51 + i * 7, 67, 3, 4, ENEMY_BONE);
  }

  if (elite) {
    // Золотые подвески и кровавый отсвет.
    heroDiamond(c, 64, 72, 4, BOSS.gold);
    heroLine(c, 40, 84, 32, 96, [226, 72, 96, 255]);
    heroLine(c, 88, 86, 96, 98, [226, 72, 96, 255]);
  }
}

const ENEMY_SPRITES = [
  ['slime', enemySlime],
  ['rat', enemyRat],
  ['skeleton', enemySkeleton],
  ['archer', enemyArcher],
  ['bat', enemyBat],
  ['demon', enemyDemon],
  ['wolf', enemyWolf],
  ['spider', enemySpider],
  ['eagle', enemyEagle],
  ['goat', enemyGoat],
  ['scorpion', enemyScorpion],
  ['mummy', enemyMummy],
  ['cultist', enemyCultist],
  ['zombie', enemyZombie],
  ['ghost', enemyGhost],
  ['ghoul', enemyGhoul],
  ['golem', enemyGolem],
  ['croc', enemyCroc],
  ['shaman', enemyShaman],
];

// Враг и его усиленная версия: `<имя>.png` и `<имя>_enhanced.png`.
function spriteEnemies() {
  for (const [name, draw] of ENEMY_SPRITES) {
    const idle = heroMake();
    draw(idle, false);
    writeHeroSprite(name, idle);
    const elite = heroMake();
    draw(elite, true);
    writeHeroSprite(name + '_enhanced', elite);
  }
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
spriteEnemies();
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

// --- NPC 256×256: та же сетка 128×128, что у героев и боссов ---
// Городские жители стоят на месте, поэтому у них только стойка без кадров шага.
const NPC = {
  skin: [226, 176, 128, 255],
  skinHi: [246, 206, 162, 255],
  skinDark: [174, 122, 82, 255],
  hair: [92, 62, 38, 255],
  hairDark: [58, 38, 24, 255],
  leather: [116, 78, 44, 255],
  leatherDark: [74, 48, 28, 255]
};

// Обычный глаз: белок, зрачок и обводка.
function npcEye(c, cx, cy) {
  heroEllipse(c, cx, cy, 3, 3, HERO.outline);
  heroEllipse(c, cx, cy, 2, 2, [244, 244, 250, 255]);
  heroRect(c, cx - 1, cy - 1, 2, 2, HERO.eye);
}

// Левая рука в рукаве: плечо, предплечье и кисть.
function npcSleeveArm(c, x, y, sleeve, sleeveDark, skin) {
  heroRect(c, x - 1, y - 1, 14, 31, HERO.outline);
  heroRect(c, x, y, 12, 29, sleeveDark);
  heroRect(c, x + 1, y, 9, 27, sleeve);
  heroEllipse(c, x + 6, y + 31, 7, 6, HERO.outline);
  heroEllipse(c, x + 6, y + 31, 5, 4, skin);
}

// Торговец: широкополая шляпа, кафтан, кошель и монета.
function npcMerchant(c) {
  const coat = [224, 184, 117, 255];
  const coatDark = [168, 132, 78, 255];
  const coatHi = [246, 214, 156, 255];
  const vest = [106, 63, 141, 255];
  const vestDark = [74, 42, 102, 255];

  bossLeg(c, 46, 96, 0, vestDark, vestDark, NPC.leatherDark, NPC.leather);
  bossLeg(c, 68, 96, 0, vestDark, vestDark, NPC.leatherDark, NPC.leather);

  // Кафтан с подолом.
  heroPoly(c, [[38, 54], [90, 54], [100, 104], [92, 112], [84, 104], [76, 114],
    [64, 106], [52, 114], [44, 104], [36, 112], [28, 104]], HERO.outline);
  heroPoly(c, [[41, 56], [87, 56], [96, 102], [89, 108], [82, 100], [75, 110],
    [64, 102], [53, 110], [46, 100], [39, 108], [32, 102]], coatDark);
  heroPoly(c, [[45, 58], [83, 58], [92, 100], [86, 104], [80, 97], [74, 106],
    [64, 99], [54, 106], [48, 97], [42, 104], [36, 100]], coat);
  heroRect(c, 45, 58, 7, 42, coatHi);

  // Жилет и пуговицы.
  heroPoly(c, [[54, 54], [74, 54], [78, 92], [64, 98], [50, 92]], HERO.outline);
  heroPoly(c, [[55, 56], [73, 56], [76, 90], [64, 95], [52, 90]], vestDark);
  heroPoly(c, [[57, 58], [71, 58], [74, 88], [64, 92], [54, 88]], vest);
  heroDiamond(c, 64, 66, 2, BOSS.gold);
  heroDiamond(c, 64, 76, 2, BOSS.gold);

  // Пояс и кошель.
  heroRect(c, 40, 88, 48, 8, HERO.outline);
  heroRect(c, 41, 89, 46, 6, NPC.leatherDark);
  heroRect(c, 60, 88, 8, 8, HERO.outline);
  heroRect(c, 62, 90, 4, 6, BOSS.gold);
  heroEllipse(c, 32, 98, 9, 8, HERO.outline);
  heroEllipse(c, 32, 98, 7, 6, NPC.leather);
  heroEllipse(c, 32, 96, 5, 3, BOSS.gold);
  heroRect(c, 31, 99, 2, 3, BOSS.goldDark);

  // Руки.
  npcSleeveArm(c, 30, 62, coat, coatDark, NPC.skin);
  npcSleeveArm(c, 86, 62, coat, coatDark, NPC.skin);
  heroEllipse(c, 100, 96, 7, 6, HERO.outline);
  heroEllipse(c, 100, 96, 5, 4, NPC.skin);
  heroEllipse(c, 100, 94, 4, 3, BOSS.gold);
  heroDiamond(c, 100, 94, 2, BOSS.goldDark);

  // Голова, борода и глаза.
  heroEllipse(c, 64, 36, 15, 16, HERO.outline);
  heroEllipse(c, 64, 36, 13, 14, NPC.skin);
  heroEllipse(c, 60, 32, 6, 5, NPC.skinHi);
  heroPoly(c, [[52, 42], [76, 42], [74, 54], [64, 60], [54, 54]], NPC.hair);
  heroPoly(c, [[55, 44], [73, 44], [70, 52], [64, 56], [58, 52]], NPC.hairDark);
  npcEye(c, 58, 35);
  npcEye(c, 70, 35);
  heroRect(c, 62, 39, 3, 5, NPC.skinDark);

  // Шляпа с пером.
  heroPoly(c, [[44, 22], [50, 6], [58, 14], [64, 4], [70, 14], [78, 6], [84, 22]], HERO.outline);
  heroPoly(c, [[47, 21], [51, 9], [58, 16], [64, 8], [70, 16], [77, 9], [81, 21]], coatDark);
  heroPoly(c, [[51, 20], [53, 12], [58, 17], [64, 11], [70, 17], [75, 12], [77, 20]], coat);
  heroEllipse(c, 64, 23, 30, 7, HERO.outline);
  heroEllipse(c, 64, 23, 28, 5, coatDark);
  heroEllipse(c, 64, 23, 25, 3, coat);
  heroRect(c, 46, 18, 36, 5, HERO.outline);
  heroRect(c, 47, 19, 34, 3, BOSS.goldDark);
  heroRect(c, 48, 19, 32, 1, BOSS.gold);
  heroPoly(c, [[79, 16], [94, 2], [88, 14], [82, 16]], vest);
}

// Кузнец: фартук, голые руки, борода и молот.
function npcBlacksmith(c) {
  const shirt = [142, 126, 108, 255];
  const shirtDark = [96, 84, 70, 255];
  const apron = [78, 56, 36, 255];
  const apronDark = [50, 34, 22, 255];

  bossLeg(c, 46, 94, 0, [74, 62, 50, 255], [48, 40, 32, 255], NPC.leatherDark, NPC.leather);
  bossLeg(c, 68, 94, 0, [74, 62, 50, 255], [48, 40, 32, 255], NPC.leatherDark, NPC.leather);

  // Молот за спиной.
  heroRect(c, 96, 24, 26, 15, HERO.outline);
  heroRect(c, 98, 26, 22, 11, BOSS.steelDark);
  heroRect(c, 99, 27, 20, 4, BOSS.steel);
  heroRect(c, 104, 38, 8, 62, HERO.outline);
  heroRect(c, 106, 38, 4, 60, HERO.woodDark);
  heroRect(c, 107, 38, 2, 58, HERO.wood);

  // Широкий торс.
  heroPoly(c, [[38, 52], [90, 52], [96, 96], [86, 104], [64, 108], [42, 104], [32, 96]], HERO.outline);
  heroPoly(c, [[40, 54], [88, 54], [93, 95], [84, 101], [64, 104], [44, 101], [35, 95]], shirtDark);
  heroPoly(c, [[43, 56], [85, 56], [90, 94], [82, 99], [64, 102], [46, 99], [38, 94]], shirt);
  heroEllipse(c, 39, 61, 12, 10, shirt);
  heroEllipse(c, 89, 61, 12, 10, shirt);

  // Фартук.
  heroPoly(c, [[50, 58], [78, 58], [84, 102], [74, 110], [64, 104], [54, 110], [44, 102]], HERO.outline);
  heroPoly(c, [[52, 60], [76, 60], [81, 101], [73, 107], [64, 101], [55, 107], [47, 101]], apronDark);
  heroPoly(c, [[54, 62], [74, 62], [78, 99], [72, 104], [64, 99], [56, 104], [50, 99]], apron);
  heroRect(c, 56, 42, 4, 20, apronDark);
  heroRect(c, 68, 42, 4, 20, apronDark);
  heroRect(c, 56, 42, 4, 4, NPC.leather);
  heroRect(c, 68, 42, 4, 4, NPC.leather);

  // Руки.
  heroRect(c, 24, 62, 15, 32, HERO.outline);
  heroRect(c, 26, 63, 11, 30, NPC.skinDark);
  heroRect(c, 28, 63, 8, 28, NPC.skin);
  heroEllipse(c, 32, 96, 8, 7, HERO.outline);
  heroEllipse(c, 32, 96, 6, 5, NPC.skin);
  heroRect(c, 84, 62, 15, 32, HERO.outline);
  heroRect(c, 85, 63, 11, 30, NPC.skinDark);
  heroRect(c, 87, 63, 8, 28, NPC.skin);
  heroEllipse(c, 92, 96, 8, 7, HERO.outline);
  heroEllipse(c, 92, 96, 6, 5, NPC.skin);

  // Голова, лысина и борода.
  heroEllipse(c, 64, 38, 16, 17, HERO.outline);
  heroEllipse(c, 64, 38, 14, 15, NPC.skin);
  heroEllipse(c, 60, 32, 7, 5, NPC.skinHi);
  heroPoly(c, [[48, 40], [54, 28], [64, 24], [74, 28], [80, 40], [74, 36],
    [64, 34], [54, 36]], NPC.hairDark);
  heroPoly(c, [[52, 44], [76, 44], [78, 56], [64, 64], [50, 56]], NPC.hair);
  heroPoly(c, [[55, 47], [73, 47], [71, 54], [64, 59], [57, 54]], NPC.hairDark);
  npcEye(c, 58, 37);
  npcEye(c, 70, 37);
  heroRect(c, 62, 41, 4, 5, NPC.skinDark);
  npcMoustache(c);
}

// Усы кузнеца: два коротких мазка под носом.
function npcMoustache(c) {
  heroRect(c, 54, 51, 10, 4, NPC.hairDark);
  heroRect(c, 64, 51, 10, 4, NPC.hairDark);
  heroRect(c, 55, 51, 8, 2, NPC.hair);
  heroRect(c, 65, 51, 8, 2, NPC.hair);
}

// Стражник: шлем, копьё, каплевидный щит и синий сюрко.
function npcGuard(c) {
  const steel = [112, 120, 142, 255];
  const steelDark = [62, 68, 88, 255];
  const steelHi = [174, 186, 208, 255];
  const tabard = [63, 92, 154, 255];
  const tabardDark = [38, 56, 104, 255];

  // Копьё.
  heroThickLine(c, 106, 124, 100, 12, 2, HERO.outline);
  heroThickLine(c, 106, 124, 100, 12, 1, HERO.woodDark);
  heroLine(c, 105, 122, 100, 16, HERO.wood);
  heroPoly(c, [[100, 18], [94, 30], [100, 38], [106, 30]], HERO.outline);
  heroPoly(c, [[100, 21], [96, 30], [100, 35], [104, 30]], steelHi);
  heroRect(c, 98, 36, 5, 8, BOSS.goldDark);

  bossLeg(c, 46, 94, 0, steel, steelDark, steelDark, steel);
  bossLeg(c, 68, 94, 0, steel, steelDark, steelDark, steel);

  // Торс и сюрко.
  heroRect(c, 42, 54, 44, 44, HERO.outline);
  heroRect(c, 43, 55, 42, 42, steelDark);
  heroRect(c, 45, 55, 38, 39, steel);
  heroRect(c, 45, 55, 7, 36, steelHi);
  heroPoly(c, [[54, 55], [74, 55], [78, 94], [50, 94]], HERO.outline);
  heroPoly(c, [[55, 57], [73, 57], [76, 92], [52, 92]], tabardDark);
  heroPoly(c, [[57, 59], [71, 59], [74, 90], [54, 90]], tabard);
  heroRect(c, 61, 60, 6, 30, BOSS.gold);
  heroRect(c, 54, 70, 20, 6, BOSS.gold);
  heroRect(c, 40, 90, 48, 8, HERO.outline);
  heroRect(c, 41, 91, 46, 6, NPC.leatherDark);
  heroRect(c, 60, 90, 8, 8, HERO.outline);
  heroRect(c, 62, 92, 4, 6, BOSS.gold);

  // Щит.
  heroPoly(c, [[8, 62], [42, 54], [46, 92], [34, 118], [12, 102]], HERO.outline);
  heroPoly(c, [[11, 65], [39, 58], [43, 91], [33, 114], [15, 100]], steelDark);
  heroPoly(c, [[14, 68], [36, 62], [40, 90], [32, 109], [17, 98]], steel);
  heroLine(c, 18, 72, 30, 102, steelHi);
  heroDiamond(c, 28, 84, 8, tabard);
  heroDiamond(c, 28, 84, 4, BOSS.gold);

  // Руки.
  npcSleeveArm(c, 30, 64, steel, steelDark, NPC.skin);
  npcSleeveArm(c, 86, 64, steel, steelDark, NPC.skin);

  // Шлем с гребнем.
  heroPoly(c, [[52, 22], [64, 6], [76, 22], [70, 30], [58, 30]], HERO.outline);
  heroPoly(c, [[55, 21], [64, 10], [73, 21], [69, 27], [59, 27]], tabard);
  heroEllipse(c, 64, 36, 18, 17, HERO.outline);
  heroEllipse(c, 64, 36, 16, 15, steelDark);
  heroEllipse(c, 64, 35, 14, 13, steel);
  heroEllipse(c, 64, 30, 8, 5, steelHi);
  heroRect(c, 51, 37, 26, 8, HERO.outline);
  heroRect(c, 52, 38, 24, 6, [24, 26, 42, 255]);
  heroRect(c, 56, 38, 5, 3, [124, 170, 220, 255]);
  heroRect(c, 67, 38, 5, 3, [124, 170, 220, 255]);
  heroRect(c, 62, 30, 4, 20, steelDark);
  heroRect(c, 63, 30, 2, 18, steelHi);
  heroRect(c, 51, 48, 26, 4, BOSS.goldDark);
}

// Жрица: светлая мантия, капюшон и посох со святым светом.
function npcPriest(c) {
  const robe = [242, 233, 255, 255];
  const robeDark = [196, 178, 224, 255];
  const robeHi = [255, 250, 255, 255];
  const trim = [122, 79, 163, 255];
  const trimDark = [82, 50, 116, 255];

  // Посох.
  heroThickLine(c, 102, 122, 104, 20, 2, HERO.outline);
  heroThickLine(c, 102, 122, 104, 20, 1, HERO.woodDark);
  heroLine(c, 103, 120, 105, 22, HERO.wood);
  heroEllipse(c, 104, 16, 12, 12, HERO.outline);
  heroEllipse(c, 104, 16, 10, 10, [255, 220, 140, 160]);
  heroEllipse(c, 104, 16, 7, 7, [255, 240, 190, 255]);
  heroEllipse(c, 102, 14, 3, 3, [255, 255, 255, 255]);

  bossLeg(c, 48, 104, 0, robe, robeDark, [92, 66, 48, 255], [58, 40, 28, 255]);
  bossLeg(c, 66, 104, 0, robe, robeDark, [92, 66, 48, 255], [58, 40, 28, 255]);

  // Длинная мантия.
  heroPoly(c, [[42, 54], [86, 54], [98, 112], [90, 122], [82, 114], [74, 124],
    [64, 116], [54, 124], [46, 114], [38, 122], [30, 112]], HERO.outline);
  heroPoly(c, [[45, 56], [83, 56], [94, 110], [87, 117], [80, 109], [73, 119],
    [64, 111], [55, 119], [48, 109], [41, 117], [34, 110]], robeDark);
  heroPoly(c, [[49, 58], [79, 58], [90, 108], [84, 112], [77, 105], [71, 114],
    [64, 107], [57, 114], [51, 105], [44, 112], [38, 108]], robe);
  heroRect(c, 45, 58, 7, 48, robeHi);
  heroLine(c, 64, 58, 64, 108, robeDark);
  heroRect(c, 42, 98, 44, 5, trimDark);
  heroRect(c, 43, 99, 42, 3, trim);

  // Руки.
  npcSleeveArm(c, 32, 62, robe, robeDark, NPC.skin);
  npcSleeveArm(c, 84, 62, robe, robeDark, NPC.skin);

  // Святый символ.
  heroRect(c, 60, 66, 8, 4, HERO.outline);
  heroRect(c, 61, 67, 6, 2, BOSS.gold);
  heroRect(c, 62, 70, 4, 12, HERO.outline);
  heroRect(c, 63, 70, 2, 10, BOSS.gold);

  // Капюшон и лицо.
  heroPoly(c, [[42, 58], [46, 34], [56, 20], [64, 16], [72, 20], [82, 34],
    [86, 58], [76, 64], [70, 54], [64, 62], [58, 54], [52, 64]], HERO.outline);
  heroPoly(c, [[45, 56], [49, 36], [58, 24], [64, 21], [70, 24], [79, 36],
    [83, 56], [75, 60], [69, 51], [64, 58], [59, 51], [53, 60]], robeDark);
  heroPoly(c, [[48, 54], [52, 37], [59, 27], [64, 24], [69, 27], [76, 37],
    [80, 54], [73, 57], [68, 49], [64, 55], [60, 49], [55, 57]], robe);
  heroEllipse(c, 64, 44, 13, 12, NPC.skin);
  heroEllipse(c, 60, 40, 6, 4, NPC.skinHi);
  npcEye(c, 58, 43);
  npcEye(c, 70, 43);
  heroRect(c, 62, 47, 3, 4, NPC.skinDark);
  heroRect(c, 59, 53, 11, 2, [196, 126, 126, 255]);
  heroRect(c, 44, 58, 40, 4, trimDark);
  heroDiamond(c, 64, 62, 3, BOSS.gold);
}

// Учёный: шапочка, очки, книга и свиток.
function npcScholar(c) {
  const robe = [107, 122, 74, 255];
  const robeDark = [74, 86, 54, 255];
  const robeHi = [140, 154, 98, 255];
  const paper = [216, 207, 160, 255];
  const paperDark = [176, 162, 116, 255];

  bossLeg(c, 46, 96, 0, robeDark, robeDark, NPC.leatherDark, NPC.leather);
  bossLeg(c, 68, 96, 0, robeDark, robeDark, NPC.leatherDark, NPC.leather);

  // Мантия.
  heroPoly(c, [[40, 54], [88, 54], [98, 110], [88, 118], [80, 108], [72, 120],
    [64, 110], [56, 120], [48, 108], [40, 118], [30, 110]], HERO.outline);
  heroPoly(c, [[43, 56], [85, 56], [94, 108], [85, 113], [78, 104], [71, 115],
    [64, 106], [57, 115], [50, 104], [43, 113], [34, 108]], robeDark);
  heroPoly(c, [[47, 58], [81, 58], [90, 106], [82, 109], [75, 101], [69, 110],
    [64, 102], [59, 110], [53, 101], [46, 109], [38, 106]], robe);
  heroRect(c, 47, 58, 7, 44, robeHi);
  heroRect(c, 41, 90, 46, 7, HERO.outline);
  heroRect(c, 42, 91, 44, 5, NPC.leatherDark);
  heroRect(c, 60, 90, 8, 7, BOSS.goldDark);

  // Книга под левой рукой.
  heroRect(c, 22, 76, 20, 28, HERO.outline);
  heroRect(c, 24, 78, 16, 24, paperDark);
  heroRect(c, 25, 79, 6, 22, paper);
  heroRect(c, 32, 79, 7, 22, paper);
  heroLine(c, 32, 79, 32, 101, paperDark);
  heroRect(c, 22, 74, 20, 5, BOSS.goldDark);

  // Руки.
  npcSleeveArm(c, 86, 62, robe, robeDark, NPC.skin);
  heroEllipse(c, 32, 104, 7, 6, HERO.outline);
  heroEllipse(c, 32, 104, 5, 4, NPC.skin);

  // Свиток в правой руке.
  heroRect(c, 92, 88, 18, 8, HERO.outline);
  heroRect(c, 93, 89, 16, 6, paper);
  heroRect(c, 92, 86, 18, 4, paperDark);
  heroRect(c, 92, 96, 18, 4, paperDark);
  heroRect(c, 102, 94, 5, 2, [126, 90, 58, 255]);

  // Голова и очки.
  heroEllipse(c, 64, 38, 15, 16, HERO.outline);
  heroEllipse(c, 64, 38, 13, 14, NPC.skin);
  heroEllipse(c, 60, 34, 6, 5, NPC.skinHi);
  heroRect(c, 51, 27, 26, 7, NPC.hairDark);
  heroRect(c, 52, 28, 24, 4, NPC.hair);
  npcEye(c, 58, 40);
  npcEye(c, 70, 40);
  heroEllipse(c, 58, 40, 5, 4, [210, 196, 132, 100]);
  heroEllipse(c, 70, 40, 5, 4, [210, 196, 132, 100]);
  heroEllipse(c, 58, 40, 5, 4, HERO.outline);
  heroEllipse(c, 70, 40, 5, 4, HERO.outline);
  heroEllipse(c, 58, 40, 4, 3, [214, 224, 208, 120]);
  heroEllipse(c, 70, 40, 4, 3, [214, 224, 208, 120]);
  heroRect(c, 62, 40, 2, 1, HERO.outline);
  heroRect(c, 62, 46, 3, 4, NPC.skinDark);
  heroRect(c, 55, 52, 18, 2, [196, 126, 126, 255]);
  heroPoly(c, [[45, 30], [46, 16], [54, 10], [64, 8], [74, 10], [82, 16],
    [83, 30], [74, 24], [64, 28], [54, 24]], HERO.outline);
  heroPoly(c, [[48, 28], [49, 17], [56, 13], [64, 11], [72, 13], [79, 17],
    [80, 28], [72, 22], [64, 26], [56, 22]], robeDark);
  heroDiamond(c, 64, 12, 3, BOSS.gold);
}

// Трактирщик: фартук, кружка и полотенце на плече.
function npcInnkeeper(c) {
  const shirt = [138, 106, 74, 255];
  const shirtDark = [96, 72, 50, 255];
  const apron = [212, 192, 154, 255];
  const apronDark = [164, 144, 108, 255];

  bossLeg(c, 46, 96, 0, [90, 74, 58, 255], [60, 48, 38, 255], NPC.leatherDark, NPC.leather);
  bossLeg(c, 68, 96, 0, [90, 74, 58, 255], [60, 48, 38, 255], NPC.leatherDark, NPC.leather);

  // Плотный торс.
  heroPoly(c, [[36, 54], [92, 54], [98, 98], [86, 106], [64, 110], [42, 106], [30, 98]], HERO.outline);
  heroPoly(c, [[38, 56], [90, 56], [95, 97], [84, 103], [64, 106], [44, 103], [33, 97]], shirtDark);
  heroPoly(c, [[41, 58], [87, 58], [92, 96], [82, 101], [64, 104], [46, 101], [36, 96]], shirt);
  heroEllipse(c, 38, 64, 12, 10, shirt);
  heroEllipse(c, 90, 64, 12, 10, shirt);

  // Фартук.
  heroPoly(c, [[50, 60], [78, 60], [84, 100], [74, 108], [64, 102], [54, 108], [44, 100]], HERO.outline);
  heroPoly(c, [[52, 62], [76, 62], [81, 99], [73, 105], [64, 99], [55, 105], [47, 99]], apronDark);
  heroPoly(c, [[54, 64], [74, 64], [78, 97], [72, 102], [64, 97], [56, 102], [50, 97]], apron);
  heroRect(c, 60, 82, 8, 8, apronDark);
  heroRect(c, 61, 83, 6, 6, [190, 168, 128, 255]);

  // Полотенце на плече.
  heroPoly(c, [[38, 52], [58, 52], [56, 70], [46, 76], [40, 68]], HERO.outline);
  heroPoly(c, [[40, 54], [56, 54], [54, 68], [46, 73], [42, 67]], [230, 226, 210, 255]);
  heroRect(c, 44, 58, 8, 2, [188, 182, 166, 255]);

  // Руки.
  npcSleeveArm(c, 28, 64, shirt, shirtDark, NPC.skin);
  npcSleeveArm(c, 88, 64, shirt, shirtDark, NPC.skin);

  // Кружка.
  heroRect(c, 18, 84, 20, 22, HERO.outline);
  heroRect(c, 20, 86, 16, 18, HERO.woodDark);
  heroRect(c, 21, 87, 14, 4, [236, 216, 168, 255]);
  heroRect(c, 21, 92, 14, 10, HERO.wood);
  heroRect(c, 14, 90, 6, 10, HERO.outline);
  heroRect(c, 16, 92, 3, 6, HERO.woodDark);
  heroRect(c, 24, 88, 2, 14, [160, 126, 78, 255]);

  // Голова, усы и улыбка.
  heroEllipse(c, 64, 38, 16, 16, HERO.outline);
  heroEllipse(c, 64, 38, 14, 14, NPC.skin);
  heroEllipse(c, 60, 33, 7, 5, NPC.skinHi);
  heroRect(c, 50, 31, 6, 8, NPC.hairDark);
  heroRect(c, 72, 31, 6, 8, NPC.hairDark);
  npcEye(c, 58, 37);
  npcEye(c, 70, 37);
  heroRect(c, 62, 41, 4, 5, NPC.skinDark);
  heroRect(c, 54, 49, 10, 4, NPC.hairDark);
  heroRect(c, 64, 49, 10, 4, NPC.hairDark);
  heroRect(c, 55, 49, 8, 2, NPC.hair);
  heroRect(c, 65, 49, 8, 2, NPC.hair);
  heroRect(c, 58, 55, 12, 2, [176, 110, 100, 255]);
}

// Древний страж: выветренный доспех, башенный щит и янтарные глаза.
function npcAncientGuard(c) {
  const stone = [122, 112, 88, 255];
  const stoneDark = [78, 72, 54, 255];
  const stoneHi = [166, 154, 120, 255];
  const cloth = [94, 82, 54, 255];
  const clothDark = [62, 54, 36, 255];

  // Копьё.
  heroThickLine(c, 104, 124, 98, 10, 2, HERO.outline);
  heroThickLine(c, 104, 124, 98, 10, 1, stoneDark);
  heroLine(c, 103, 122, 98, 14, stone);
  heroPoly(c, [[98, 16], [92, 28], [98, 36], [104, 28]], HERO.outline);
  heroPoly(c, [[98, 19], [94, 28], [98, 33], [102, 28]], stoneHi);

  bossLeg(c, 46, 94, 0, stone, stoneDark, stoneDark, stone);
  bossLeg(c, 68, 94, 0, stone, stoneDark, stoneDark, stone);

  // Торс и рваная накидка.
  heroPoly(c, [[40, 54], [88, 54], [94, 96], [86, 104], [76, 96], [68, 106],
    [60, 96], [50, 106], [42, 96], [34, 104]], HERO.outline);
  heroPoly(c, [[42, 56], [86, 56], [91, 95], [84, 101], [75, 93], [68, 102],
    [61, 93], [51, 102], [43, 93], [36, 101]], stoneDark);
  heroPoly(c, [[46, 58], [82, 58], [86, 94], [80, 98], [72, 91], [66, 99],
    [60, 91], [52, 99], [46, 91], [40, 98]], stone);
  heroRect(c, 46, 58, 7, 36, stoneHi);
  heroLine(c, 58, 62, 54, 78, stoneDark);
  heroLine(c, 54, 78, 60, 90, stoneDark);
  heroLine(c, 76, 64, 72, 82, stoneDark);

  // Истлевшая ткань на поясе.
  heroPoly(c, [[42, 92], [86, 92], [82, 116], [74, 108], [66, 118], [58, 108], [50, 116], [44, 108]], HERO.outline);
  heroPoly(c, [[45, 94], [83, 94], [79, 112], [72, 105], [65, 114], [58, 105], [51, 112], [46, 105]], clothDark);
  heroPoly(c, [[49, 96], [79, 96], [76, 108], [70, 102], [64, 110], [58, 102], [52, 108], [49, 102]], cloth);
  heroRect(c, 40, 88, 48, 7, HERO.outline);
  heroRect(c, 41, 89, 46, 5, stoneHi);

  // Башенный щит.
  heroPoly(c, [[4, 58], [40, 50], [46, 94], [42, 120], [22, 126], [6, 100]], HERO.outline);
  heroPoly(c, [[7, 61], [37, 54], [43, 93], [39, 116], [22, 121], [9, 98]], stoneDark);
  heroPoly(c, [[11, 64], [34, 58], [40, 92], [36, 112], [22, 116], [12, 97]], stone);
  heroLine(c, 16, 68, 32, 104, stoneHi);
  heroPoly(c, [[22, 70], [27, 80], [22, 90], [17, 80]], stoneDark);
  heroPoly(c, [[22, 73], [25, 80], [22, 86], [19, 80]], [255, 176, 70, 255]);

  // Руки.
  npcSleeveArm(c, 28, 62, stone, stoneDark, stoneHi);
  npcSleeveArm(c, 86, 62, stone, stoneDark, stoneHi);

  // Шлем с трещиной и свечением.
  heroEllipse(c, 64, 36, 18, 18, HERO.outline);
  heroEllipse(c, 64, 36, 16, 16, stoneDark);
  heroEllipse(c, 64, 35, 14, 14, stone);
  heroRect(c, 51, 36, 26, 8, HERO.outline);
  heroRect(c, 52, 37, 24, 6, [24, 22, 20, 255]);
  bossEye(c, 58, 39, 3, 3, BOSS.eyeAmber);
  bossEye(c, 70, 39, 3, 3, BOSS.eyeAmber);
  heroRect(c, 62, 28, 4, 20, stoneDark);
  heroLine(c, 50, 30, 44, 22, stoneDark);
  heroLine(c, 48, 24, 42, 30, stoneDark);
  heroRect(c, 50, 48, 28, 4, stoneHi);
  heroPoly(c, [[56, 18], [64, 8], [72, 18], [68, 26], [60, 26]], HERO.outline);
  heroPoly(c, [[58, 18], [64, 11], [70, 18], [67, 24], [61, 24]], stoneDark);
}

function spriteNpcs() {
  const list = [
    ['merchant', npcMerchant],
    ['blacksmith', npcBlacksmith],
    ['guard', npcGuard],
    ['priest', npcPriest],
    ['scholar', npcScholar],
    ['innkeeper', npcInnkeeper],
    ['ancient_guard', npcAncientGuard]
  ];
  for (const [name, draw] of list) {
    const idle = heroMake();
    draw(idle);
    writeHeroSprite(name, idle);
  }
}

spriteNpcs();

// --- Мир, предметы и декор 256×256 ---
// Та же логическая сетка 128×128, что у героев: каждый пиксель — блок 2×2.
// Отдельные PNG заменяют встроенные спрайты.
const A = {
  outline: [24, 20, 32, 255],
  stone: [122, 110, 136, 255],
  stoneDark: [82, 72, 92, 255],
  stoneHi: [172, 160, 190, 255],
  mortar: [42, 34, 46, 255],
  floor: [76, 70, 100, 255],
  floorLight: [96, 88, 124, 255],
  floorDark: [54, 48, 76, 255],
  wood: [138, 92, 50, 255],
  woodDark: [86, 56, 30, 255],
  woodHi: [190, 140, 86, 255],
  steel: [178, 190, 210, 255],
  steelHi: [230, 238, 248, 255],
  steelDark: [96, 108, 134, 255],
  gold: [246, 200, 80, 255],
  goldDark: [170, 120, 34, 255],
  goldHi: [255, 234, 154, 255],
  leather: [126, 84, 48, 255],
  leatherDark: [82, 52, 30, 255],
  leatherHi: [174, 126, 78, 255],
  skin: [226, 174, 126, 255],
  skinDark: [164, 110, 72, 255],
  cloth: [86, 76, 158, 255],
  clothDark: [54, 46, 112, 255],
  clothHi: [124, 112, 196, 255],
  red: [198, 52, 52, 255],
  redDark: [132, 30, 34, 255],
  redHi: [242, 104, 94, 255],
  green: [86, 154, 68, 255],
  greenDark: [48, 98, 42, 255],
  greenHi: [132, 196, 102, 255],
  blue: [58, 116, 190, 255],
  blueDark: [30, 70, 128, 255],
  blueHi: [134, 196, 242, 255],
  water: [54, 126, 170, 255],
  waterDark: [32, 86, 124, 255],
  waterHi: [144, 212, 232, 255],
  bone: [232, 226, 206, 255],
  boneDark: [176, 168, 146, 255],
  flame: [255, 150, 36, 255],
  flameCore: [255, 236, 140, 255],
  purple: [120, 78, 168, 255],
  purpleDark: [76, 46, 112, 255],
  white: [240, 244, 250, 255],
  black: [16, 14, 22, 255]
};

function assetMake() { return heroMake(); }

function assetSprite(name, draw) {
  const c = assetMake();
  draw(c);
  writeHeroSprite(name, c);
}

function assetFloor(c, dim) {
  const base = dim ? [40, 36, 54, 255] : A.floor;
  const light = dim ? [50, 45, 64, 255] : A.floorLight;
  const dark = dim ? [28, 25, 38, 255] : A.floorDark;
  heroRect(c, 0, 0, 128, 128, base);
  for (let by = 0; by < 128; by += 32) {
    for (let bx = 0; bx < 128; bx += 32) {
      const lite = ((bx + by) / 32) % 2 === 0;
      heroRect(c, bx + 1, by + 1, 30, 30, lite ? light : dark);
      heroLine(c, bx + 3, by + 3, bx + 27, by + 3, lite ? [112, 104, 140, 255] : [66, 60, 90, 255]);
      heroLine(c, bx + 3, by + 27, bx + 27, by + 27, dim ? [22, 20, 30, 255] : [40, 36, 56, 255]);
    }
  }
  if (!dim) {
    heroLine(c, 38, 50, 52, 68, [58, 52, 80, 255]);
    heroLine(c, 52, 68, 48, 84, [58, 52, 80, 255]);
    heroLine(c, 92, 78, 104, 96, [58, 52, 80, 255]);
  }
}

function assetWall(c, dim) {
  const brick = dim ? [62, 54, 68, 255] : [104, 88, 104, 255];
  const brickHi = dim ? [80, 70, 86, 255] : [134, 114, 132, 255];
  const brickDark = dim ? [42, 36, 48, 255] : [68, 56, 70, 255];
  heroRect(c, 0, 0, 128, 128, A.mortar);
  for (let row = 0; row < 8; row++) {
    const y = row * 16;
    const offset = row % 2 ? -16 : 0;
    for (let x = offset; x < 128; x += 32) {
      const bx = Math.max(0, x);
      const right = Math.min(128, x + 32);
      if (right <= bx) continue;
      heroRect(c, bx + 1, y + 1, right - bx - 2, 14, brick);
      heroRect(c, bx + 2, y + 2, right - bx - 4, 3, brickHi);
      heroRect(c, bx + 2, y + 12, right - bx - 4, 2, brickDark);
    }
  }
  heroRect(c, 0, 0, 128, 4, dim ? [30, 26, 34, 255] : [48, 40, 50, 255]);
}

function assetWallWindow(c) {
  assetWall(c, false);
  heroRect(c, 28, 18, 72, 84, A.outline);
  heroRect(c, 32, 22, 64, 76, A.woodDark);
  heroRect(c, 37, 27, 54, 66, [30, 44, 62, 255]);
  heroRect(c, 40, 30, 20, 28, A.blueHi);
  heroRect(c, 62, 30, 26, 28, [92, 154, 204, 255]);
  heroRect(c, 40, 60, 20, 30, [86, 142, 192, 255]);
  heroRect(c, 62, 60, 26, 30, [54, 96, 150, 255]);
  heroRect(c, 62, 22, 4, 76, A.woodDark);
  heroRect(c, 32, 56, 64, 4, A.woodDark);
  heroRect(c, 32, 22, 64, 4, A.wood);
  heroRect(c, 28, 98, 72, 6, A.stoneDark);
}

function assetStairs(c) {
  assetFloor(c, false);
  heroRect(c, 18, 18, 92, 92, A.outline);
  heroRect(c, 22, 22, 84, 84, [22, 18, 30, 255]);
  for (let i = 0; i < 7; i++) {
    const inset = 26 + i * 4;
    const width = 76 - i * 8;
    const y = 26 + i * 9;
    heroRect(c, inset, y, width, 6, [48, 42, 62, 255]);
    heroRect(c, inset + 2, y, width - 4, 2, [92, 118, 146, 255]);
  }
  heroRect(c, 42, 96, 44, 5, A.gold);
  heroRect(c, 56, 90, 16, 4, A.goldHi);
}

function assetFog(c) {
  heroRect(c, 0, 0, 128, 128, [30, 28, 44, 96]);
  for (let i = 0; i < 12; i++) {
    const x = 8 + (i * 37) % 112;
    const y = 10 + (i * 53) % 108;
    heroEllipse(c, x, y, 10 + (i % 3) * 4, 5 + (i % 2) * 3, [54, 52, 74, 54]);
  }
}

function assetTorch(c) {
  heroRect(c, 60, 46, 10, 68, A.outline);
  heroRect(c, 62, 48, 6, 62, A.wood);
  heroRect(c, 63, 50, 2, 58, A.woodHi);
  heroRect(c, 54, 46, 22, 12, A.outline);
  heroRect(c, 56, 48, 18, 8, A.leatherDark);
  heroRect(c, 58, 49, 14, 3, A.leather);
  heroRect(c, 60, 36, 10, 12, A.outline);
  heroRect(c, 62, 38, 6, 9, [96, 58, 30, 255]);
  heroRect(c, 52, 108, 26, 8, A.outline);
  heroRect(c, 54, 110, 22, 4, A.steelDark);
}

function assetFlame(c, frame) {
  const sway = frame === 1 ? 5 : frame === 2 ? -5 : 0;
  bossFlame(c, 64, 112, 86, frame, { main: A.flame, core: A.flameCore });
  if (sway) heroEllipse(c, 64 + sway, 78, 5, 7, A.flameCore);
}

function assetTrapPlate(c, base) {
  heroRect(c, 12, 12, 104, 104, A.outline);
  heroRect(c, 16, 16, 96, 96, [36, 32, 44, 255]);
  heroRect(c, 22, 22, 84, 84, base);
  for (let i = 0; i < 4; i++) {
    heroRect(c, 22 + i * 21, 22, 2, 84, [54, 48, 62, 255]);
  }
  heroRect(c, 22, 22, 84, 3, [86, 78, 96, 255]);
}

function assetTrapSpike(c) {
  assetTrapPlate(c, [58, 54, 68, 255]);
  for (let gx = 0; gx < 3; gx++) {
    for (let gy = 0; gy < 3; gy++) {
      const x = 36 + gx * 26;
      const y = 36 + gy * 26;
      heroEllipse(c, x + 6, y + 8, 8, 4, [24, 20, 28, 255]);
      heroPoly(c, [[x - 2, y + 8], [x + 6, y - 8], [x + 14, y + 8]], A.outline);
      heroPoly(c, [[x + 1, y + 7], [x + 6, y - 5], [x + 11, y + 7]], A.steel);
      heroLine(c, x + 6, y - 5, x + 6, y + 7, A.steelHi);
    }
  }
}

function assetTrapNeedle(c) {
  assetTrapPlate(c, [62, 56, 70, 255]);
  for (let i = 0; i < 5; i++) {
    const x = 30 + i * 16;
    heroEllipse(c, x, 70, 4, 3, [22, 20, 26, 255]);
    heroRect(c, x - 1, 46, 2, 24, A.bone);
    heroLine(c, x, 46, x + (i % 2 ? 3 : -3), 30, [238, 230, 196, 255]);
  }
  heroRect(c, 24, 94, 80, 4, [120, 108, 96, 255]);
}

function assetTrapFlame(c) {
  assetTrapPlate(c, [52, 46, 54, 255]);
  heroRect(c, 34, 74, 60, 16, A.outline);
  heroRect(c, 38, 78, 52, 8, [48, 40, 42, 255]);
  for (let i = 0; i < 4; i++) heroRect(c, 40 + i * 13, 76, 4, 12, A.steelDark);
  bossFlame(c, 64, 92, 58, 0, { main: A.flame, core: A.flameCore });
}

function assetTrapDisarmed(c) {
  assetTrapPlate(c, [58, 62, 58, 255]);
  heroRect(c, 30, 34, 34, 28, A.outline);
  heroRect(c, 34, 38, 26, 20, [90, 112, 86, 255]);
  heroRect(c, 66, 66, 34, 28, A.outline);
  heroRect(c, 70, 70, 26, 20, [90, 112, 86, 255]);
  heroLine(c, 46, 48, 84, 48, [150, 186, 128, 255]);
  heroLine(c, 84, 48, 72, 62, [150, 186, 128, 255]);
  heroLine(c, 72, 62, 56, 62, [150, 186, 128, 255]);
  heroLine(c, 56, 62, 46, 48, [150, 186, 128, 255]);
}

function assetTrapTriggered(c) {
  assetTrapPlate(c, [78, 52, 54, 255]);
  heroEllipse(c, 64, 66, 42, 36, [116, 34, 38, 160]);
  for (let i = 0; i < 4; i++) {
    const x = 34 + i * 20;
    heroPoly(c, [[x, 82], [x + 8, 40 + (i % 2) * 8], [x + 16, 82]], A.outline);
    heroPoly(c, [[x + 3, 80], [x + 8, 47 + (i % 2) * 8], [x + 13, 80]], A.redHi);
  }
  heroRect(c, 26, 84, 76, 4, [154, 66, 60, 255]);
}

function assetPlayer(c) {
  bossLeg(c, 48, 92, 0, A.clothDark, A.clothDark, A.leatherDark, A.leather);
  bossLeg(c, 68, 92, 0, A.clothDark, A.clothDark, A.leatherDark, A.leather);
  heroPoly(c, [[42, 52], [86, 52], [92, 92], [82, 100], [64, 94], [46, 100], [36, 92]], A.outline);
  heroPoly(c, [[45, 54], [83, 54], [88, 90], [80, 96], [64, 90], [48, 96], [40, 90]], A.cloth);
  heroRect(c, 46, 54, 36, 7, A.leather);
  heroRect(c, 60, 54, 8, 34, A.clothHi);
  heroRect(c, 44, 86, 40, 7, A.leatherDark);
  heroDiamond(c, 64, 89, 4, A.gold);
  // Щит.
  heroPoly(c, [[12, 62], [40, 56], [44, 88], [40, 106], [26, 112], [14, 96]], A.outline);
  heroPoly(c, [[16, 65], [37, 60], [40, 88], [36, 102], [26, 107], [17, 94]], A.blueDark);
  heroPoly(c, [[20, 68], [34, 64], [37, 87], [33, 99], [26, 103], [20, 92]], A.blue);
  heroLine(c, 26, 74, 26, 96, A.blueHi);
  // Меч.
  heroThickLine(c, 92, 88, 112, 28, 3, A.outline);
  heroThickLine(c, 92, 88, 112, 28, 2, A.steel);
  heroLine(c, 94, 84, 112, 32, A.steelHi);
  heroRect(c, 82, 84, 24, 8, A.outline);
  heroRect(c, 84, 86, 20, 4, A.gold);
  // Голова.
  heroEllipse(c, 64, 34, 16, 16, A.outline);
  heroEllipse(c, 64, 34, 14, 14, A.skin);
  heroRect(c, 49, 22, 30, 10, A.leatherDark);
  heroRect(c, 52, 19, 24, 6, A.steel);
  heroRect(c, 58, 34, 4, 4, A.black);
  heroRect(c, 68, 34, 4, 4, A.black);
  heroRect(c, 58, 44, 14, 3, A.skinDark);
}

function assetBossStub(c) {
  heroEllipse(c, 64, 112, 54, 12, [20, 16, 26, 180]);
  bossLeg(c, 40, 82, 0, [70, 34, 38, 255], [46, 20, 24, 255], A.redDark, A.red);
  bossLeg(c, 72, 82, 0, [70, 34, 38, 255], [46, 20, 24, 255], A.redDark, A.red);
  heroEllipse(c, 64, 64, 42, 38, A.outline);
  heroEllipse(c, 64, 62, 38, 34, A.redDark);
  heroEllipse(c, 60, 58, 32, 28, A.red);
  heroPoly(c, [[28, 34], [16, 4], [40, 24], [52, 18]], A.outline);
  heroPoly(c, [[32, 32], [22, 10], [40, 26], [48, 22]], A.boneDark);
  heroPoly(c, [[100, 34], [112, 4], [88, 24], [76, 18]], A.outline);
  heroPoly(c, [[96, 32], [106, 10], [88, 26], [80, 22]], A.boneDark);
  bossEye(c, 48, 54, 8, 9, A.flameCore);
  bossEye(c, 80, 54, 8, 9, A.flameCore);
  heroRect(c, 44, 44, 10, 3, A.outline);
  heroRect(c, 74, 44, 10, 3, A.outline);
  heroPoly(c, [[40, 82], [88, 82], [80, 102], [48, 102]], A.outline);
  for (let i = 0; i < 5; i++) heroPoly(c, [[46 + i * 8, 82], [50 + i * 8, 96], [54 + i * 8, 82]], A.white);
  heroThickLine(c, 26, 66, 18, 100, 5, A.outline);
  heroThickLine(c, 102, 66, 110, 100, 5, A.outline);
  for (let i = 0; i < 3; i++) {
    heroPoly(c, [[12 + i * 5, 100], [16 + i * 5, 118], [20 + i * 5, 100]], A.bone);
    heroPoly(c, [[108 + i * 5, 100], [112 + i * 5, 118], [116 + i * 5, 100]], A.bone);
  }
}

// --- Декор локаций ---
function assetDecorStone(c) {
  heroEllipse(c, 62, 96, 42, 14, [20, 18, 26, 130]);
  heroPoly(c, [[22, 92], [30, 62], [48, 48], [80, 50], [100, 66], [108, 92], [92, 110], [38, 110]], A.outline);
  heroPoly(c, [[28, 90], [36, 66], [50, 54], [78, 56], [94, 70], [100, 90], [86, 104], [42, 104]], A.stoneDark);
  heroPoly(c, [[36, 86], [42, 68], [54, 58], [76, 60], [88, 72], [92, 86], [80, 96], [48, 96]], A.stone);
  heroPoly(c, [[44, 78], [50, 66], [62, 62], [66, 70], [54, 78]], A.stoneHi);
  heroLine(c, 68, 74, 78, 92, A.stoneDark);
}

function assetDecorGrass(c) {
  heroEllipse(c, 64, 100, 38, 10, [30, 58, 32, 100]);
  for (let i = 0; i < 9; i++) {
    const x = 26 + i * 10;
    const h = 22 + (i * 13) % 24;
    heroLine(c, x, 98, x - 4 + (i % 3) * 4, 98 - h, i % 2 ? A.green : A.greenHi);
    heroLine(c, x + 1, 98, x + 5 - (i % 3) * 3, 104 - h, A.greenDark);
  }
}

function assetDecorMoss(c) {
  heroEllipse(c, 64, 96, 42, 15, [34, 66, 44, 130]);
  for (let i = 0; i < 5; i++) {
    heroEllipse(c, 34 + i * 15, 88 + (i % 2) * 8, 13, 8, i % 2 ? A.greenDark : A.green);
    heroEllipse(c, 30 + i * 15, 84 + (i % 2) * 8, 7, 4, A.greenHi);
  }
  heroEllipse(c, 88, 100, 10, 5, [92, 140, 76, 150]);
}

function assetDecorMushroom(c) {
  heroEllipse(c, 64, 104, 38, 8, [20, 18, 26, 100]);
  heroRect(c, 52, 62, 10, 40, A.outline);
  heroRect(c, 54, 64, 6, 38, [228, 210, 176, 255]);
  heroEllipse(c, 57, 60, 24, 18, A.outline);
  heroEllipse(c, 57, 58, 21, 15, A.red);
  heroEllipse(c, 50, 52, 7, 4, A.redHi);
  heroEllipse(c, 66, 60, 4, 3, A.white);
  heroRect(c, 82, 86, 8, 22, A.outline);
  heroRect(c, 84, 88, 4, 20, [228, 210, 176, 255]);
  heroEllipse(c, 86, 84, 17, 12, A.outline);
  heroEllipse(c, 86, 82, 14, 10, A.gold);
  heroEllipse(c, 82, 78, 5, 3, A.goldHi);
}

function assetDecorPuddle(c) {
  heroEllipse(c, 64, 92, 46, 20, A.outline);
  heroEllipse(c, 64, 90, 43, 18, A.waterDark);
  heroEllipse(c, 60, 88, 36, 14, A.water);
  heroEllipse(c, 50, 84, 16, 6, A.waterHi);
  heroEllipse(c, 80, 96, 12, 4, [86, 174, 202, 255]);
}

function assetDecorLake(c) {
  heroRect(c, 0, 0, 128, 128, A.waterDark);
  for (let y = 8; y < 128; y += 24) {
    for (let x = (y / 8) % 2 ? 10 : 22; x < 128; x += 36) {
      heroEllipse(c, x, y, 14, 4, A.water);
      heroEllipse(c, x - 4, y - 2, 8, 2, [104, 184, 212, 255]);
    }
  }
}

function assetDecorStream(c) {
  heroRect(c, 0, 0, 128, 128, A.waterDark);
  for (let i = 0; i < 7; i++) {
    const x = 12 + i * 16;
    heroEllipse(c, x, 36 + (i % 3) * 26, 12, 5, A.water);
    heroEllipse(c, x + 4, 34 + (i % 3) * 26, 6, 2, A.waterHi);
  }
  for (let i = 0; i < 5; i++) {
    heroRect(c, 0, 14 + i * 26, 128, 3, [74, 154, 188, 120]);
  }
}

function assetDecorTree(c) {
  heroEllipse(c, 64, 114, 34, 8, [20, 18, 26, 120]);
  heroRect(c, 57, 70, 14, 46, A.outline);
  heroRect(c, 59, 72, 10, 44, A.woodDark);
  heroRect(c, 61, 74, 4, 40, A.wood);
  heroLine(c, 64, 74, 48, 54, A.woodDark);
  heroLine(c, 64, 78, 82, 58, A.woodDark);
  heroEllipse(c, 64, 50, 40, 32, A.outline);
  heroEllipse(c, 64, 48, 37, 29, A.greenDark);
  heroEllipse(c, 52, 38, 24, 20, A.green);
  heroEllipse(c, 76, 44, 20, 17, [100, 170, 72, 255]);
  heroEllipse(c, 68, 30, 14, 10, A.greenHi);
  heroEllipse(c, 44, 52, 6, 4, [150, 210, 112, 160]);
}

function assetDecorPine(c) {
  heroEllipse(c, 64, 116, 28, 7, [20, 18, 26, 120]);
  heroRect(c, 59, 88, 10, 28, A.outline);
  heroRect(c, 61, 90, 6, 26, A.woodDark);
  for (let i = 0; i < 4; i++) {
    const y = 18 + i * 22;
    const w = 20 + i * 12;
    heroPoly(c, [[64, y - 22], [64 - w, y + 18], [64 + w, y + 18]], A.outline);
    heroPoly(c, [[64, y - 16], [64 - w + 5, y + 14], [64 + w - 5, y + 14]], i % 2 ? [38, 96, 58, 255] : [44, 112, 66, 255]);
    heroLine(c, 64, y - 14, 64, y + 12, [72, 148, 88, 255]);
  }
}

function assetDecorBush(c) {
  heroEllipse(c, 64, 102, 34, 10, [24, 48, 28, 120]);
  heroEllipse(c, 64, 84, 38, 24, A.outline);
  heroEllipse(c, 52, 80, 22, 18, A.greenDark);
  heroEllipse(c, 76, 80, 22, 18, [64, 128, 56, 255]);
  heroEllipse(c, 64, 70, 20, 16, A.green);
  heroEllipse(c, 56, 68, 10, 7, A.greenHi);
  heroEllipse(c, 82, 86, 5, 3, [160, 210, 112, 160]);
}

function assetDecorCactus(c) {
  heroEllipse(c, 64, 110, 28, 7, [20, 18, 26, 110]);
  heroRect(c, 56, 22, 16, 88, A.outline);
  heroRect(c, 59, 24, 10, 86, A.greenDark);
  heroRect(c, 61, 26, 5, 82, A.green);
  heroRect(c, 30, 56, 28, 12, A.outline);
  heroRect(c, 32, 58, 26, 9, A.greenDark);
  heroRect(c, 32, 40, 12, 26, A.outline);
  heroRect(c, 34, 42, 8, 22, A.green);
  heroRect(c, 80, 66, 26, 12, A.outline);
  heroRect(c, 82, 68, 24, 9, A.greenDark);
  heroRect(c, 94, 48, 12, 28, A.outline);
  heroRect(c, 96, 50, 8, 24, A.green);
  for (let i = 0; i < 5; i++) heroRect(c, 62 + (i % 2) * 4, 34 + i * 14, 2, 5, A.greenHi);
}

function assetDecorSand(c) {
  heroRect(c, 0, 0, 128, 128, [196, 164, 108, 255]);
  for (let i = 0; i < 5; i++) {
    const y = 20 + i * 22;
    heroEllipse(c, 34 + (i % 3) * 28, y, 26, 7, [218, 188, 132, 255]);
    heroEllipse(c, 30 + (i % 3) * 28, y - 2, 18, 4, [232, 206, 154, 255]);
  }
  for (let i = 0; i < 14; i++) heroEllipse(c, 8 + (i * 37) % 116, 12 + (i * 53) % 108, 2, 1, [176, 142, 88, 255]);
}

function assetDecorCoffin(c) {
  heroEllipse(c, 64, 112, 34, 7, [20, 18, 26, 140]);
  heroPoly(c, [[46, 20], [82, 20], [92, 48], [86, 104], [42, 104], [36, 48]], A.outline);
  heroPoly(c, [[50, 24], [78, 24], [87, 48], [81, 100], [47, 100], [41, 48]], A.woodDark);
  heroPoly(c, [[54, 28], [74, 28], [82, 48], [77, 96], [51, 96], [46, 48]], [122, 86, 52, 255]);
  heroRect(c, 62, 40, 4, 46, [74, 50, 30, 255]);
  heroRect(c, 50, 54, 28, 4, [74, 50, 30, 255]);
  heroRect(c, 60, 38, 2, 40, A.woodHi);
  heroDiamond(c, 64, 82, 5, A.goldDark);
}

function assetDecorCross(c) {
  heroEllipse(c, 64, 112, 30, 7, [20, 18, 26, 140]);
  heroRect(c, 46, 98, 36, 12, A.outline);
  heroRect(c, 48, 100, 32, 8, A.stoneDark);
  heroRect(c, 58, 24, 12, 78, A.outline);
  heroRect(c, 60, 26, 8, 74, A.woodDark);
  heroRect(c, 61, 28, 3, 70, [132, 96, 62, 255]);
  heroRect(c, 38, 44, 52, 12, A.outline);
  heroRect(c, 40, 46, 48, 8, A.woodDark);
  heroRect(c, 42, 47, 44, 3, [132, 96, 62, 255]);
  heroDiamond(c, 64, 50, 5, A.wood);
}

function assetDecorBones(c) {
  heroEllipse(c, 64, 106, 34, 7, [20, 18, 26, 120]);
  heroEllipse(c, 64, 78, 20, 17, A.outline);
  heroEllipse(c, 64, 76, 17, 14, A.bone);
  heroRect(c, 54, 72, 6, 7, A.black);
  heroRect(c, 68, 72, 6, 7, A.black);
  heroRect(c, 60, 84, 8, 4, A.boneDark);
  heroThickLine(c, 30, 100, 98, 76, 3, A.outline);
  heroThickLine(c, 30, 100, 98, 76, 2, A.bone);
  for (let i = 0; i < 4; i++) {
    heroEllipse(c, 32 + i * 22, 96 - i * 7, 4, 3, A.boneDark);
  }
  heroThickLine(c, 36, 84, 92, 104, 3, A.outline);
  heroThickLine(c, 36, 84, 92, 104, 2, A.boneDark);
  heroEllipse(c, 92, 104, 6, 5, A.bone);
}

// --- Мебель и убранство ---
function assetFireplace(c) {
  heroRect(c, 12, 30, 104, 92, A.outline);
  heroRect(c, 16, 34, 96, 88, A.stoneDark);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const x = 18 + col * 19;
      const y = 36 + row * 17;
      heroRect(c, x, y, 17, 15, row % 2 ? A.stone : [138, 122, 132, 255]);
      heroRect(c, x + 1, y + 1, 15, 3, A.stoneHi);
    }
  }
  heroRect(c, 34, 58, 60, 62, A.outline);
  heroRect(c, 38, 62, 52, 58, [24, 18, 20, 255]);
  bossFlame(c, 64, 108, 52, 0, { main: A.flame, core: A.flameCore });
  heroRect(c, 30, 112, 68, 10, A.stoneDark);
  heroRect(c, 32, 114, 64, 4, A.stoneHi);
}

function assetChurchCross(c) {
  heroRect(c, 54, 14, 20, 92, A.outline);
  heroRect(c, 58, 18, 12, 84, A.goldDark);
  heroRect(c, 60, 20, 4, 80, A.gold);
  heroRect(c, 30, 42, 68, 20, A.outline);
  heroRect(c, 34, 46, 60, 12, A.goldDark);
  heroRect(c, 36, 48, 56, 4, A.gold);
  heroDiamond(c, 64, 52, 6, A.goldHi);
  heroRect(c, 44, 104, 40, 12, A.outline);
  heroRect(c, 46, 106, 36, 8, A.stoneDark);
}

function assetBench(c) {
  heroEllipse(c, 64, 110, 44, 7, [20, 18, 26, 120]);
  heroRect(c, 16, 72, 96, 14, A.outline);
  heroRect(c, 18, 74, 92, 10, A.woodDark);
  heroRect(c, 20, 75, 88, 4, A.woodHi);
  heroRect(c, 16, 52, 96, 10, A.outline);
  heroRect(c, 18, 54, 92, 6, A.wood);
  heroRect(c, 24, 86, 10, 24, A.outline);
  heroRect(c, 26, 88, 6, 20, A.woodDark);
  heroRect(c, 94, 86, 10, 24, A.outline);
  heroRect(c, 96, 88, 6, 20, A.woodDark);
}

function assetForgeFurnace(c) {
  heroRect(c, 18, 38, 92, 82, A.outline);
  heroRect(c, 22, 42, 84, 78, A.stoneDark);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      heroRect(c, 24 + col * 21, 44 + row * 19, 19, 17, row % 2 ? A.stone : [142, 126, 138, 255]);
    }
  }
  heroRect(c, 34, 62, 60, 44, A.outline);
  heroRect(c, 38, 66, 52, 40, [30, 18, 14, 255]);
  bossFlame(c, 64, 104, 40, 1, { main: A.flame, core: A.flameCore });
  heroRect(c, 72, 10, 28, 42, A.outline);
  heroRect(c, 76, 14, 20, 38, A.stoneDark);
  heroRect(c, 78, 16, 16, 6, A.stone);
  heroRect(c, 12, 110, 104, 10, A.stoneDark);
}

function assetAnvil(c) {
  heroEllipse(c, 64, 114, 40, 7, [20, 18, 26, 130]);
  heroRect(c, 40, 94, 48, 18, A.outline);
  heroRect(c, 44, 96, 40, 14, A.steelDark);
  heroRect(c, 48, 98, 32, 4, A.steel);
  heroRect(c, 52, 72, 24, 24, A.outline);
  heroRect(c, 56, 74, 16, 20, A.steelDark);
  heroPoly(c, [[18, 54], [110, 54], [100, 72], [76, 76], [52, 76], [28, 72]], A.outline);
  heroPoly(c, [[24, 58], [104, 58], [96, 68], [74, 72], [54, 72], [32, 68]], A.steel);
  heroLine(c, 34, 60, 96, 60, A.steelHi);
  heroRect(c, 26, 52, 28, 10, A.steelDark);
}

function assetTavernTable(c) {
  heroEllipse(c, 64, 110, 44, 8, [20, 18, 26, 120]);
  heroRect(c, 14, 58, 100, 16, A.outline);
  heroRect(c, 18, 60, 92, 12, A.woodDark);
  heroRect(c, 20, 62, 88, 5, A.woodHi);
  heroRect(c, 24, 74, 12, 34, A.outline);
  heroRect(c, 27, 76, 6, 30, A.woodDark);
  heroRect(c, 92, 74, 12, 34, A.outline);
  heroRect(c, 95, 76, 6, 30, A.woodDark);
  heroRect(c, 40, 48, 16, 12, A.outline);
  heroRect(c, 42, 50, 12, 8, A.steelDark);
  heroRect(c, 74, 46, 12, 14, A.outline);
  heroRect(c, 76, 48, 8, 10, A.green);
}

function assetTavernChair(c) {
  heroEllipse(c, 64, 116, 30, 6, [20, 18, 26, 120]);
  heroRect(c, 34, 52, 60, 14, A.outline);
  heroRect(c, 38, 54, 52, 10, A.woodDark);
  heroRect(c, 38, 54, 52, 4, A.woodHi);
  heroRect(c, 34, 66, 60, 10, A.outline);
  heroRect(c, 38, 68, 52, 6, A.wood);
  heroRect(c, 38, 76, 10, 38, A.outline);
  heroRect(c, 41, 78, 4, 34, A.woodDark);
  heroRect(c, 80, 76, 10, 38, A.outline);
  heroRect(c, 83, 78, 4, 34, A.woodDark);
}

function assetBeerBarrel(c) {
  heroEllipse(c, 64, 114, 34, 7, [20, 18, 26, 130]);
  heroRect(c, 32, 24, 64, 90, A.outline);
  heroEllipse(c, 64, 28, 32, 12, A.outline);
  heroRect(c, 36, 26, 56, 86, A.woodDark);
  heroEllipse(c, 64, 30, 28, 8, [154, 104, 58, 255]);
  for (let i = 0; i < 5; i++) heroRect(c, 36 + i * 12, 26, 4, 86, i % 2 ? A.wood : [116, 74, 42, 255]);
  heroRect(c, 30, 42, 68, 8, A.steelDark);
  heroRect(c, 30, 88, 68, 8, A.steelDark);
  heroRect(c, 32, 43, 64, 3, A.steel);
  heroRect(c, 32, 89, 64, 3, A.steel);
  heroEllipse(c, 64, 68, 10, 8, A.goldDark);
  heroEllipse(c, 64, 67, 7, 5, A.gold);
}

function assetWineBottle(c) {
  heroEllipse(c, 64, 114, 24, 6, [20, 18, 26, 120]);
  heroRect(c, 56, 20, 16, 18, A.outline);
  heroRect(c, 59, 22, 10, 16, [64, 96, 52, 255]);
  heroRect(c, 48, 36, 32, 78, A.outline);
  heroRect(c, 52, 40, 24, 72, [96, 28, 48, 255]);
  heroRect(c, 54, 42, 8, 68, [152, 44, 66, 255]);
  heroRect(c, 50, 62, 28, 30, [186, 42, 58, 255]);
  heroRect(c, 52, 64, 8, 24, [230, 120, 120, 255]);
  heroRect(c, 56, 14, 16, 8, A.goldDark);
  heroRect(c, 58, 15, 12, 4, A.gold);
}

function assetCounterGoods(c) {
  heroRect(c, 10, 62, 108, 50, A.outline);
  heroRect(c, 14, 66, 100, 42, A.woodDark);
  heroRect(c, 18, 68, 92, 8, A.woodHi);
  heroRect(c, 18, 80, 92, 24, A.wood);
  for (let i = 0; i < 6; i++) heroRect(c, 18 + i * 16, 78, 2, 28, A.woodDark);
  // Товары на прилавке.
  heroEllipse(c, 34, 52, 11, 12, A.outline);
  heroEllipse(c, 34, 51, 8, 9, A.red);
  heroEllipse(c, 32, 48, 3, 3, A.redHi);
  heroRect(c, 50, 38, 18, 24, A.outline);
  heroRect(c, 53, 41, 12, 18, A.greenDark);
  heroRect(c, 55, 43, 8, 4, A.greenHi);
  heroRect(c, 76, 44, 16, 18, A.outline);
  heroRect(c, 79, 47, 10, 12, A.goldDark);
  heroRect(c, 81, 48, 6, 4, A.goldHi);
  heroRect(c, 94, 40, 16, 22, A.outline);
  heroRect(c, 97, 43, 10, 16, A.blueDark);
  heroRect(c, 99, 45, 6, 4, A.blueHi);
}

function assetStorage(c) {
  heroEllipse(c, 64, 116, 34, 6, [20, 18, 26, 130]);
  heroRect(c, 22, 12, 84, 104, A.outline);
  heroRect(c, 26, 16, 76, 96, A.woodDark);
  heroRect(c, 30, 20, 32, 88, A.wood);
  heroRect(c, 66, 20, 32, 88, A.wood);
  heroRect(c, 32, 22, 28, 84, [154, 108, 66, 255]);
  heroRect(c, 68, 22, 28, 84, [154, 108, 66, 255]);
  heroRect(c, 30, 60, 32, 6, A.woodDark);
  heroRect(c, 66, 60, 32, 6, A.woodDark);
  heroRect(c, 58, 56, 12, 12, A.outline);
  heroRect(c, 61, 58, 6, 8, A.gold);
  heroRect(c, 44, 40, 6, 14, A.woodHi);
  heroRect(c, 80, 40, 6, 14, A.woodHi);
}

function assetDecorFountain(c) {
  heroEllipse(c, 64, 112, 46, 8, [20, 18, 26, 130]);
  heroEllipse(c, 64, 82, 48, 26, A.outline);
  heroEllipse(c, 64, 78, 44, 22, A.stoneDark);
  heroEllipse(c, 64, 76, 38, 17, A.water);
  heroEllipse(c, 60, 72, 30, 12, A.waterHi);
  heroRect(c, 56, 34, 16, 44, A.outline);
  heroRect(c, 59, 36, 10, 42, A.stone);
  heroRect(c, 48, 30, 32, 10, A.outline);
  heroRect(c, 51, 32, 26, 6, A.stoneHi);
  for (let i = 0; i < 5; i++) {
    const x = 28 + i * 18;
    heroLine(c, x, 34, x + (i % 2 ? 6 : -6), 54, [184, 232, 248, 190]);
  }
  heroEllipse(c, 64, 24, 8, 8, [210, 246, 255, 200]);
}

// --- Предметы, экипировка и еда ---
function assetSword(c) {
  heroPoly(c, [[64, 10], [74, 22], [74, 82], [64, 94], [54, 82], [54, 22]], A.outline);
  heroPoly(c, [[64, 16], [70, 26], [70, 80], [64, 88], [58, 80], [58, 26]], A.steel);
  heroLine(c, 64, 18, 64, 84, A.steelHi);
  heroRect(c, 40, 80, 48, 10, A.outline);
  heroRect(c, 42, 82, 44, 6, A.gold);
  heroRect(c, 58, 90, 12, 24, A.outline);
  heroRect(c, 61, 92, 6, 20, A.leatherDark);
  heroRect(c, 61, 94, 2, 16, A.leather);
  heroEllipse(c, 64, 116, 8, 7, A.outline);
  heroEllipse(c, 64, 116, 6, 5, A.gold);
}

function assetAxe(c) {
  heroRect(c, 58, 20, 12, 96, A.outline);
  heroRect(c, 61, 22, 6, 92, A.wood);
  heroRect(c, 62, 24, 2, 88, A.woodHi);
  heroPoly(c, [[58, 24], [28, 34], [20, 56], [28, 74], [58, 70]], A.outline);
  heroPoly(c, [[54, 30], [32, 38], [27, 54], [33, 66], [54, 64]], A.steel);
  heroPoly(c, [[27, 54], [18, 48], [20, 62]], A.steelHi);
  heroLine(c, 40, 36, 34, 64, A.steelDark);
  heroRect(c, 56, 44, 16, 8, A.leatherDark);
}

function assetSpear(c) {
  heroRect(c, 59, 26, 10, 92, A.outline);
  heroRect(c, 61, 28, 6, 88, A.wood);
  heroRect(c, 62, 30, 2, 84, A.woodHi);
  heroPoly(c, [[64, 4], [80, 34], [64, 48], [48, 34]], A.outline);
  heroPoly(c, [[64, 10], [74, 34], [64, 42], [54, 34]], A.steel);
  heroLine(c, 64, 12, 64, 40, A.steelHi);
  heroRect(c, 54, 44, 20, 8, A.leatherDark);
  heroRect(c, 56, 46, 16, 3, A.gold);
}

function assetBow(c) {
  heroThickLine(c, 40, 18, 84, 34, 4, A.outline);
  heroThickLine(c, 84, 34, 96, 64, 4, A.outline);
  heroThickLine(c, 96, 64, 84, 94, 4, A.outline);
  heroThickLine(c, 84, 94, 40, 110, 4, A.outline);
  heroThickLine(c, 40, 18, 84, 34, 2, A.wood);
  heroThickLine(c, 84, 34, 96, 64, 2, A.wood);
  heroThickLine(c, 96, 64, 84, 94, 2, A.wood);
  heroThickLine(c, 84, 94, 40, 110, 2, A.wood);
  heroLine(c, 40, 18, 40, 110, [226, 216, 184, 255]);
  heroRect(c, 34, 54, 16, 22, A.outline);
  heroRect(c, 37, 56, 10, 18, A.leatherDark);
  heroRect(c, 39, 58, 6, 3, A.leatherHi);
  heroPoly(c, [[28, 64], [8, 56], [8, 72]], A.outline);
  heroPoly(c, [[24, 64], [12, 59], [12, 69]], A.steel);
}

function assetCrossbow(c) {
  heroRect(c, 52, 44, 24, 70, A.outline);
  heroRect(c, 56, 46, 16, 66, A.woodDark);
  heroRect(c, 58, 48, 6, 60, A.woodHi);
  heroPoly(c, [[18, 48], [54, 36], [54, 56], [18, 70]], A.outline);
  heroPoly(c, [[22, 50], [50, 42], [50, 52], [22, 64]], A.steelDark);
  heroPoly(c, [[74, 48], [110, 36], [110, 56], [74, 70]], A.outline);
  heroPoly(c, [[78, 50], [106, 42], [106, 52], [78, 64]], A.steelDark);
  heroLine(c, 22, 52, 106, 52, A.bone);
  heroRect(c, 58, 34, 12, 34, A.outline);
  heroRect(c, 61, 36, 6, 30, A.wood);
  heroPoly(c, [[64, 12], [74, 34], [54, 34]], A.steelHi);
  heroRect(c, 38, 94, 52, 12, A.outline);
  heroRect(c, 42, 96, 44, 8, A.wood);
  heroRect(c, 58, 106, 12, 12, A.outline);
  heroRect(c, 61, 108, 6, 8, A.leatherDark);
}

function assetShield(c, size) {
  const half = size === 'small' ? 28 : size === 'large' ? 44 : 36;
  const top = size === 'small' ? 38 : size === 'large' ? 14 : 24;
  const bottom = size === 'small' ? 94 : size === 'large' ? 118 : 108;
  heroPoly(c, [[64, top], [64 + half, top + 12], [64 + half - 5, bottom - 26],
    [64, bottom], [64 - half + 5, bottom - 26], [64 - half, top + 12]], A.outline);
  heroPoly(c, [[64, top + 6], [64 + half - 7, top + 17], [64 + half - 11, bottom - 30],
    [64, bottom - 8], [64 - half + 11, bottom - 30], [64 - half + 7, top + 17]], A.steelDark);
  heroPoly(c, [[64, top + 12], [64 + half - 14, top + 22], [64 + half - 17, bottom - 34],
    [64, bottom - 16], [64 - half + 17, bottom - 34], [64 - half + 14, top + 22]], size === 'small' ? A.blue : A.blueDark);
  heroLine(c, 64, top + 16, 64, bottom - 20, A.blueHi);
  heroDiamond(c, 64, top + 36, size === 'large' ? 9 : 7, A.gold);
  heroDiamond(c, 64, top + 36, size === 'large' ? 5 : 4, A.goldHi);
}

function assetBoots(c) {
  heroEllipse(c, 64, 112, 38, 7, [20, 18, 26, 120]);
  heroRect(c, 26, 42, 30, 58, A.outline);
  heroRect(c, 30, 44, 22, 54, A.leatherDark);
  heroRect(c, 32, 46, 12, 50, A.leather);
  heroRect(c, 22, 90, 38, 16, A.outline);
  heroRect(c, 24, 92, 34, 12, A.leatherDark);
  heroRect(c, 26, 94, 30, 4, A.leatherHi);
  heroRect(c, 72, 42, 30, 58, A.outline);
  heroRect(c, 76, 44, 22, 54, A.leatherDark);
  heroRect(c, 78, 46, 12, 50, A.leather);
  heroRect(c, 68, 90, 38, 16, A.outline);
  heroRect(c, 70, 92, 34, 12, A.leatherDark);
  heroRect(c, 72, 94, 30, 4, A.leatherHi);
  for (let i = 0; i < 3; i++) {
    heroRect(c, 40, 56 + i * 12, 14, 4, A.leatherHi);
    heroRect(c, 86, 56 + i * 12, 14, 4, A.leatherHi);
  }
}

function assetHead(c) {
  heroEllipse(c, 64, 74, 34, 34, A.outline);
  heroEllipse(c, 64, 74, 31, 31, A.skin);
  heroEllipse(c, 52, 64, 14, 10, [240, 198, 154, 255]);
  heroRect(c, 50, 66, 7, 7, A.black);
  heroRect(c, 72, 66, 7, 7, A.black);
  heroRect(c, 60, 84, 9, 4, A.skinDark);
  heroRect(c, 54, 94, 20, 3, [180, 110, 96, 255]);
  heroRect(c, 40, 42, 48, 12, A.leatherDark);
  heroRect(c, 42, 34, 44, 12, A.leather);
  heroRect(c, 44, 36, 30, 4, A.leatherHi);
}

function assetHelmet(c) {
  heroEllipse(c, 64, 70, 38, 36, A.outline);
  heroEllipse(c, 64, 66, 35, 32, A.steelDark);
  heroEllipse(c, 64, 62, 31, 27, A.steel);
  heroEllipse(c, 52, 52, 11, 8, A.steelHi);
  heroRect(c, 42, 64, 44, 16, A.outline);
  heroRect(c, 46, 66, 16, 12, A.black);
  heroRect(c, 66, 66, 16, 12, A.black);
  heroRect(c, 62, 42, 4, 48, A.steelDark);
  heroRect(c, 34, 84, 60, 8, A.steelDark);
  heroRect(c, 36, 85, 56, 3, A.steelHi);
  heroPoly(c, [[56, 34], [64, 12], [72, 34]], A.red);
  heroPoly(c, [[60, 34], [64, 18], [68, 34]], A.redHi);
}

function assetArmor(c) {
  heroPoly(c, [[34, 22], [52, 16], [76, 16], [94, 22], [104, 46], [96, 86], [80, 108], [64, 114], [48, 108], [32, 86], [24, 46]], A.outline);
  heroPoly(c, [[38, 28], [54, 22], [74, 22], [90, 28], [98, 48], [90, 84], [76, 102], [64, 106], [52, 102], [38, 84], [30, 48]], A.steelDark);
  heroPoly(c, [[44, 34], [56, 28], [72, 28], [84, 34], [90, 50], [84, 80], [72, 94], [64, 98], [56, 94], [44, 80], [38, 50]], A.steel);
  heroLine(c, 64, 30, 64, 96, A.steelHi);
  heroRect(c, 42, 54, 44, 8, A.goldDark);
  heroRect(c, 60, 52, 8, 12, A.gold);
  heroPoly(c, [[24, 26], [44, 18], [52, 36], [38, 48], [26, 40]], A.outline);
  heroPoly(c, [[28, 29], [42, 23], [47, 36], [37, 43], [30, 38]], A.steelDark);
  heroPoly(c, [[84, 26], [104, 20], [112, 34], [100, 46], [86, 40]], A.outline);
  heroPoly(c, [[88, 29], [101, 25], [106, 34], [99, 41], [89, 38]], A.steelDark);
}

function assetRing(c) {
  heroEllipse(c, 64, 78, 34, 34, A.outline);
  heroEllipse(c, 64, 78, 28, 28, A.goldDark);
  heroEllipse(c, 64, 78, 20, 20, [0, 0, 0, 0]);
  heroEllipse(c, 64, 78, 30, 30, A.gold);
  heroEllipse(c, 64, 78, 22, 22, [0, 0, 0, 0]);
  heroEllipse(c, 52, 60, 6, 4, A.goldHi);
  heroPoly(c, [[64, 26], [76, 42], [64, 56], [52, 42]], A.outline);
  heroPoly(c, [[64, 30], [72, 42], [64, 52], [56, 42]], A.blueHi);
  heroDiamond(c, 64, 41, 3, A.white);
}

function assetAmulet(c) {
  heroThickLine(c, 34, 24, 64, 66, 3, A.outline);
  heroThickLine(c, 64, 66, 94, 24, 3, A.outline);
  heroThickLine(c, 34, 24, 64, 66, 1, A.gold);
  heroThickLine(c, 64, 66, 94, 24, 1, A.gold);
  heroEllipse(c, 64, 84, 24, 28, A.outline);
  heroEllipse(c, 64, 84, 20, 24, A.goldDark);
  heroEllipse(c, 64, 82, 15, 19, A.blue);
  heroEllipse(c, 58, 78, 6, 8, A.blueHi);
  heroDiamond(c, 64, 82, 5, A.white);
}

function assetKey(c) {
  heroEllipse(c, 44, 58, 26, 26, A.outline);
  heroEllipse(c, 44, 58, 20, 20, A.goldDark);
  heroEllipse(c, 44, 58, 11, 11, [0, 0, 0, 0]);
  heroEllipse(c, 44, 58, 23, 23, A.gold);
  heroEllipse(c, 44, 58, 13, 13, [0, 0, 0, 0]);
  heroRect(c, 66, 54, 44, 8, A.outline);
  heroRect(c, 68, 56, 40, 4, A.gold);
  heroRect(c, 84, 62, 8, 20, A.outline);
  heroRect(c, 86, 64, 4, 16, A.gold);
  heroRect(c, 96, 62, 10, 18, A.outline);
  heroRect(c, 98, 64, 6, 14, A.gold);
  heroRect(c, 98, 72, 6, 4, A.goldDark);
}

function assetPotion(c) {
  heroEllipse(c, 64, 114, 32, 6, [20, 18, 26, 120]);
  heroRect(c, 54, 18, 20, 18, A.outline);
  heroRect(c, 58, 20, 12, 14, [218, 226, 236, 220]);
  heroRect(c, 54, 34, 20, 12, A.outline);
  heroEllipse(c, 64, 78, 36, 34, A.outline);
  heroEllipse(c, 64, 78, 31, 29, A.redDark);
  heroEllipse(c, 62, 74, 24, 22, A.red);
  heroEllipse(c, 54, 62, 10, 8, A.redHi);
  heroEllipse(c, 76, 90, 5, 4, A.redHi);
  heroRect(c, 46, 22, 10, 8, A.leatherDark);
  heroRect(c, 72, 22, 10, 8, A.leatherDark);
}

function assetGold(c) {
  heroEllipse(c, 64, 102, 46, 14, [20, 18, 26, 120]);
  for (let i = 0; i < 4; i++) {
    heroEllipse(c, 38 + i * 18, 98 - (i % 2) * 8, 14, 6, A.outline);
    heroEllipse(c, 38 + i * 18, 96 - (i % 2) * 8, 11, 4, A.goldDark);
    heroEllipse(c, 38 + i * 18, 95 - (i % 2) * 8, 8, 2, A.gold);
  }
  for (let i = 0; i < 3; i++) {
    heroEllipse(c, 48 + i * 16, 84 - (i % 2) * 6, 12, 5, A.outline);
    heroEllipse(c, 48 + i * 16, 82 - (i % 2) * 6, 9, 3, A.gold);
    heroEllipse(c, 48 + i * 16, 81 - (i % 2) * 6, 5, 1, A.goldHi);
  }
  heroEllipse(c, 64, 74, 8, 4, A.goldHi);
}

function assetStaff(c, kind) {
  const wood = kind === 'magic' ? A.purpleDark : kind === 'druid' ? A.greenDark : A.wood;
  heroThickLine(c, 52, 116, 76, 28, 3, A.outline);
  heroThickLine(c, 52, 116, 76, 28, 1, wood);
  heroLine(c, 54, 112, 74, 34, kind === 'druid' ? A.green : A.woodHi);
  if (kind === 'magic') {
    heroEllipse(c, 78, 22, 18, 18, A.outline);
    heroEllipse(c, 78, 22, 14, 14, A.blueDark);
    heroEllipse(c, 78, 22, 9, 9, A.blueHi);
    heroEllipse(c, 74, 18, 3, 3, A.white);
  } else if (kind === 'druid') {
    heroEllipse(c, 78, 26, 16, 12, A.outline);
    heroEllipse(c, 78, 24, 13, 9, A.green);
    heroLine(c, 78, 24, 92, 12, A.greenHi);
    heroEllipse(c, 94, 10, 7, 5, A.greenHi);
    heroRect(c, 60, 54, 12, 5, A.leatherDark);
  } else {
    heroEllipse(c, 76, 24, 12, 12, A.outline);
    heroEllipse(c, 76, 24, 9, 9, A.woodDark);
    heroEllipse(c, 76, 22, 5, 4, A.woodHi);
  }
}

function assetWand(c) {
  heroThickLine(c, 42, 104, 84, 36, 3, A.outline);
  heroThickLine(c, 42, 104, 84, 36, 1, A.wood);
  heroLine(c, 44, 100, 82, 40, A.woodHi);
  heroPoly(c, [[84, 34], [96, 14], [100, 34], [118, 40], [100, 48], [96, 68], [84, 50], [66, 42]], A.outline);
  heroPoly(c, [[85, 35], [95, 22], [98, 35], [110, 40], [98, 45], [95, 58], [85, 46], [74, 41]], A.gold);
  heroDiamond(c, 92, 41, 5, A.blueHi);
  heroRect(c, 54, 76, 12, 5, A.leatherDark);
}

function assetFetish(c) {
  heroThickLine(c, 64, 12, 64, 36, 2, A.leatherDark);
  heroEllipse(c, 64, 48, 20, 18, A.outline);
  heroEllipse(c, 64, 46, 17, 15, A.bone);
  heroRect(c, 54, 42, 6, 6, A.black);
  heroRect(c, 68, 42, 6, 6, A.black);
  heroRect(c, 60, 54, 8, 3, A.boneDark);
  heroPoly(c, [[48, 62], [80, 62], [88, 104], [72, 118], [64, 108], [56, 118], [40, 104]], A.outline);
  heroPoly(c, [[52, 64], [76, 64], [82, 102], [70, 112], [64, 104], [58, 112], [46, 102]], A.purpleDark);
  for (let i = 0; i < 3; i++) {
    heroLine(c, 52 + i * 12, 58, 44 + i * 10, 30, A.red);
    heroEllipse(c, 43 + i * 10, 28, 4, 3, A.redHi);
  }
  heroDiamond(c, 64, 82, 6, A.gold);
}

function assetMagicOrb(c) {
  heroEllipse(c, 64, 118, 34, 6, [20, 18, 26, 130]);
  heroEllipse(c, 64, 78, 34, 34, [86, 158, 232, 90]);
  heroEllipse(c, 64, 78, 28, 28, A.outline);
  heroEllipse(c, 64, 78, 24, 24, A.purpleDark);
  heroEllipse(c, 62, 74, 18, 18, A.purple);
  heroEllipse(c, 54, 66, 8, 7, A.blueHi);
  heroEllipse(c, 74, 88, 5, 4, [190, 150, 255, 180]);
  heroRect(c, 52, 106, 24, 8, A.outline);
  heroRect(c, 55, 108, 18, 4, A.gold);
}

function assetCloak(c, kind) {
  const cloth = kind === 'mantle' ? [122, 58, 74, 255] : kind === 'burka' ? [90, 90, 58, 255] : A.cloth;
  const clothDark = kind === 'mantle' ? [90, 42, 58, 255] : kind === 'burka' ? [58, 58, 36, 255] : A.clothDark;
  const clothHi = kind === 'mantle' ? [176, 106, 122, 255] : kind === 'burka' ? [138, 138, 90, 255] : A.clothHi;
  heroPoly(c, [[38, 26], [64, 14], [90, 26], [102, 110], [84, 120], [64, 108], [44, 120], [26, 110]], A.outline);
  heroPoly(c, [[42, 30], [64, 19], [86, 30], [96, 106], [82, 114], [64, 104], [46, 114], [32, 106]], clothDark);
  heroPoly(c, [[48, 34], [64, 24], [80, 34], [88, 102], [78, 108], [64, 100], [50, 108], [40, 102]], cloth);
  heroRect(c, 30, 26, 68, 8, A.outline);
  heroRect(c, 32, 28, 64, 4, clothHi);
  heroLine(c, 64, 28, 64, 104, clothDark);
  heroDiamond(c, 64, 26, 5, A.gold);
  heroRect(c, 44, 112, 12, 4, clothHi);
  heroRect(c, 72, 112, 12, 4, clothHi);
}

function assetBread(c) {
  heroEllipse(c, 64, 106, 42, 8, [20, 18, 26, 120]);
  heroEllipse(c, 64, 76, 44, 28, A.outline);
  heroEllipse(c, 64, 74, 40, 24, [176, 118, 58, 255]);
  heroEllipse(c, 60, 68, 32, 16, [218, 160, 88, 255]);
  heroEllipse(c, 52, 60, 16, 7, [244, 198, 128, 255]);
  for (let i = 0; i < 3; i++) heroLine(c, 44 + i * 16, 60, 52 + i * 16, 84, [154, 96, 44, 255]);
  for (let i = 0; i < 8; i++) heroEllipse(c, 28 + i * 11, 88, 2, 1, [238, 200, 146, 255]);
}

function assetMeat(c) {
  heroEllipse(c, 64, 106, 40, 8, [20, 18, 26, 120]);
  heroEllipse(c, 64, 74, 40, 30, A.outline);
  heroEllipse(c, 64, 72, 36, 26, [146, 48, 48, 255]);
  heroEllipse(c, 58, 64, 26, 16, [190, 76, 68, 255]);
  heroEllipse(c, 50, 58, 13, 7, [230, 128, 112, 255]);
  heroThickLine(c, 88, 88, 108, 110, 5, A.outline);
  heroThickLine(c, 88, 88, 108, 110, 3, A.bone);
  heroEllipse(c, 108, 110, 7, 7, A.bone);
  for (let i = 0; i < 3; i++) heroEllipse(c, 56 + i * 12, 84, 3, 2, [116, 34, 38, 255]);
}

function assetCheese(c) {
  heroEllipse(c, 64, 108, 40, 7, [20, 18, 26, 120]);
  heroPoly(c, [[24, 92], [46, 34], [102, 48], [98, 96]], A.outline);
  heroPoly(c, [[30, 88], [49, 40], [96, 52], [92, 90]], A.gold);
  heroPoly(c, [[49, 40], [96, 52], [90, 58], [54, 48]], A.goldHi);
  for (let i = 0; i < 5; i++) {
    heroEllipse(c, 48 + (i * 17) % 42, 62 + (i * 11) % 24, 5, 4, A.goldDark);
  }
  heroRect(c, 24, 90, 76, 6, A.goldDark);
}

function assetApple(c) {
  heroEllipse(c, 64, 110, 30, 6, [20, 18, 26, 120]);
  heroEllipse(c, 64, 74, 36, 34, A.outline);
  heroEllipse(c, 64, 72, 32, 30, A.redDark);
  heroEllipse(c, 64, 70, 28, 26, A.red);
  heroEllipse(c, 54, 60, 10, 8, A.redHi);
  heroRect(c, 61, 30, 6, 18, A.woodDark);
  heroPoly(c, [[67, 34], [92, 18], [88, 38], [70, 42]], A.outline);
  heroPoly(c, [[70, 34], [88, 22], [85, 35], [72, 38]], A.green);
  heroLine(c, 70, 34, 84, 25, A.greenHi);
}

function assetStew(c) {
  heroEllipse(c, 64, 110, 42, 7, [20, 18, 26, 120]);
  heroEllipse(c, 64, 78, 44, 28, A.outline);
  heroEllipse(c, 64, 76, 40, 24, A.woodDark);
  heroEllipse(c, 64, 72, 34, 18, [112, 74, 44, 255]);
  heroEllipse(c, 64, 70, 29, 13, [166, 92, 46, 255]);
  for (let i = 0; i < 6; i++) {
    heroEllipse(c, 44 + (i * 13) % 40, 64 + (i * 7) % 10, 5, 3, i % 2 ? [224, 132, 58, 255] : A.green);
  }
  heroRect(c, 34, 92, 60, 6, A.woodHi);
}

function assetSpriteTable() {
  assetSprite('floor', function (c) { assetFloor(c, false); });
  assetSprite('floorDim', function (c) { assetFloor(c, true); });
  assetSprite('wall', function (c) { assetWall(c, false); });
  assetSprite('wallDim', function (c) { assetWall(c, true); });
  assetSprite('wallWindow', assetWallWindow);
  assetSprite('stairs', assetStairs);
  assetSprite('fog', assetFog);
  assetSprite('torch', assetTorch);
  assetSprite('torchFlame', function (c) { assetFlame(c, 0); });
  assetSprite('torchFlame2', function (c) { assetFlame(c, 1); });
  assetSprite('torchFlame3', function (c) { assetFlame(c, 2); });
  assetSprite('trapSpike', assetTrapSpike);
  assetSprite('trapNeedle', assetTrapNeedle);
  assetSprite('trapFlame', assetTrapFlame);
  assetSprite('trapDisarmed', assetTrapDisarmed);
  assetSprite('trapTriggered', assetTrapTriggered);
  assetSprite('player', assetPlayer);
  assetSprite('boss', assetBossStub);
  assetSprite('decorStone', assetDecorStone);
  assetSprite('decorGrass', assetDecorGrass);
  assetSprite('decorMoss', assetDecorMoss);
  assetSprite('decorMushroom', assetDecorMushroom);
  assetSprite('decorPuddle', assetDecorPuddle);
  assetSprite('decorLake', assetDecorLake);
  assetSprite('decorStream', assetDecorStream);
  assetSprite('decorTree', assetDecorTree);
  assetSprite('decorPine', assetDecorPine);
  assetSprite('decorBush', assetDecorBush);
  assetSprite('decorCactus', assetDecorCactus);
  assetSprite('decorSand', assetDecorSand);
  assetSprite('decorCoffin', assetDecorCoffin);
  assetSprite('decorCross', assetDecorCross);
  assetSprite('decorBones', assetDecorBones);
  assetSprite('fireplace', assetFireplace);
  assetSprite('churchCross', assetChurchCross);
  assetSprite('bench', assetBench);
  assetSprite('forgeFurnace', assetForgeFurnace);
  assetSprite('anvil', assetAnvil);
  assetSprite('tavernTable', assetTavernTable);
  assetSprite('tavernChair', assetTavernChair);
  assetSprite('beerBarrel', assetBeerBarrel);
  assetSprite('wineBottle', assetWineBottle);
  assetSprite('counterGoods', assetCounterGoods);
  assetSprite('storage', assetStorage);
  assetSprite('decorFountain', assetDecorFountain);
  assetSprite('sword', assetSword);
  assetSprite('axe', assetAxe);
  assetSprite('spear', assetSpear);
  assetSprite('bow', assetBow);
  assetSprite('crossbow', assetCrossbow);
  assetSprite('shield', function (c) { assetShield(c, 'normal'); });
  assetSprite('shieldSmall', function (c) { assetShield(c, 'small'); });
  assetSprite('shieldLarge', function (c) { assetShield(c, 'large'); });
  assetSprite('boots', assetBoots);
  assetSprite('head', assetHead);
  assetSprite('helmet', assetHelmet);
  assetSprite('armor', assetArmor);
  assetSprite('ring', assetRing);
  assetSprite('amulet', assetAmulet);
  assetSprite('key', assetKey);
  assetSprite('potion', assetPotion);
  assetSprite('gold', assetGold);
  assetSprite('staff', function (c) { assetStaff(c, 'staff'); });
  assetSprite('magicStaff', function (c) { assetStaff(c, 'magic'); });
  assetSprite('druidStaff', function (c) { assetStaff(c, 'druid'); });
  assetSprite('wand', assetWand);
  assetSprite('fetish', assetFetish);
  assetSprite('magicOrb', assetMagicOrb);
  assetSprite('cloak', function (c) { assetCloak(c, 'cloak'); });
  assetSprite('mantle', function (c) { assetCloak(c, 'mantle'); });
  assetSprite('burka', function (c) { assetCloak(c, 'burka'); });
  assetSprite('bread', assetBread);
  assetSprite('meat', assetMeat);
  assetSprite('cheese', assetCheese);
  assetSprite('apple', assetApple);
  assetSprite('stew', assetStew);
}

assetSpriteTable();

generateIso();

const isoPng = encodePNG(isoData, ISO_WIDTH, ISO_HEIGHT);
const isoPath = path.join(__dirname, '..', 'assets', 'tiny-dungeon-iso.png');
fs.writeFileSync(isoPath, isoPng);
console.log('Сгенерировано: ' + isoPath + ' (' + ISO_WIDTH + 'x' + ISO_HEIGHT + ', ' + ISO_COUNT + ' клеток)');
