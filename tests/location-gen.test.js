'use strict';

// Разнообразие локаций: профили генерации из js/config.js применяются к
// планировке и декорациям. Каждая проверка изолирована: своя карта, свой seed.

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, createRenderSandbox } = require('./helpers/sandbox');

const CONFIG = require('../js/config');

// Стили берутся из графа мира (js/world.js): иначе тест проверял бы не ту карту,
// в которую игрок попадает через ворота.
const STYLE_BY_TYPE = {
  city: 'stone',
  wilderness: 'forest',
  mountains: 'mountain',
  desert: 'desert',
  dungeon: 'cave',
  crypt: 'crypt',
  ruins: 'ruins',
  sewers: 'sewer',
};

const WATER_ASSETS = new Set(['decorLake', 'decorStream']);

function generate(type, seed, width = 64, height = 46) {
  const { sandbox } = createSandbox({ seed });
  const RK = sandbox.RK;
  const map = RK.MapGen.generateLocation(type, 1, seed, width, height, STYLE_BY_TYPE[type] || 'stone');
  return { RK, map };
}

function roomStats(map) {
  const rooms = map.rooms || [];
  const area = rooms.reduce((sum, room) => sum + room.w * room.h, 0);
  return { count: rooms.length, avgArea: rooms.length ? area / rooms.length : 0 };
}

function assets(map, kind) {
  const wanted = new Set((map.decorations || []).map((decoration) => decoration.asset));
  return [...wanted].filter((asset) => (kind === 'water' ? WATER_ASSETS.has(asset) : !WATER_ASSETS.has(asset)));
}

// Просторство комнаты: сколько пола вокруг её центра. Число проходимых клеток
// для сравнения не годится — в склепе длинные коридоры съедают открытость.
function openness(map) {
  const rooms = map.rooms || [];
  if (!rooms.length) return 0;
  let sum = 0;
  for (const room of rooms) {
    let free = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = room.cx + dx;
        const y = room.cy + dy;
        if (x >= 0 && y >= 0 && x < map.w && y < map.h && map.tiles[y][x] === 1) free++;
      }
    }
    sum += free;
  }
  return sum / rooms.length;
}

test('склеп строит тесные комнаты, пустыня — просторные', () => {
  const { map: crypt } = generate('crypt', 4242);
  const { map: desert } = generate('desert', 4242);

  const cryptRooms = roomStats(crypt);
  const desertRooms = roomStats(desert);
  assert.ok(cryptRooms.count > 0 && desertRooms.count > 0, 'у обеих локаций есть комнаты');
  assert.ok(cryptRooms.avgArea < desertRooms.avgArea,
    `комнаты склепа мельче: ${cryptRooms.avgArea.toFixed(1)} против ${desertRooms.avgArea.toFixed(1)}`);
  assert.ok(cryptRooms.count > desertRooms.count,
    'в склепе комнат больше, чем в пустыне');
  assert.ok(openness(crypt) < openness(desert),
    `в пустыне свободнее: ${openness(crypt).toFixed(1)} против ${openness(desert).toFixed(1)} клеток у центра комнаты`);
});

test('декорации каждой локации берутся только из её профиля', () => {
  for (const type of Object.keys(STYLE_BY_TYPE)) {
    const profile = CONFIG.LOCATION_GEN[type];
    assert.ok(profile, `${type}: профиль есть в конфиге`);
    const { map } = generate(type, 9090);
    assert.equal(map.locationType, type, `${type}: карта помнит свой тип`);
    for (const asset of assets(map, 'solid')) {
      assert.ok(profile.decor.includes(asset), `${type}: лишняя декорация ${asset}`);
    }
    assert.ok(assets(map, 'solid').length > 0, `${type}: локация не пустая`);
  }
});

test('лес, пустыня и склеп наполнены своими декорациями', () => {
  const { map: forest } = generate('wilderness', 555);
  const { map: desert } = generate('desert', 555);
  const { map: crypt } = generate('crypt', 555);

  assert.ok(assets(forest).includes('decorTree'), 'в лесу есть деревья');
  assert.ok(assets(forest).includes('decorBush'), 'в лесу есть кустарники');
  assert.ok(assets(desert).includes('decorCactus'), 'в пустыне есть кактусы');
  assert.ok(assets(desert).includes('decorSand'), 'в пустыне есть песок');
  assert.ok(assets(crypt).includes('decorCoffin'), 'в склепе есть гробы');
  assert.ok(assets(crypt).includes('decorCross'), 'в склепе есть кресты');
  assert.ok(assets(crypt).includes('decorBones'), 'в склепе есть кости');
  assert.ok(!assets(crypt).includes('decorTree'), 'в склепе деревьев нет');
});

test('вода стоит в лесу и не стоит в пустыне, склепе и городе', () => {
  assert.ok(assets(generate('wilderness', 777).map, 'water').length > 0, 'в лесу есть вода');
  assert.ok(assets(generate('sewers', 777).map, 'water').length > 0, 'в канализации есть вода');
  for (const dry of ['desert', 'crypt', 'ruins', 'city']) {
    assert.equal(assets(generate(dry, 777).map, 'water').length, 0, `${dry}: воды нет`);
  }
});

test('декорации не мешают проходу', () => {
  const { RK, map } = generate('wilderness', 31337);
  for (const decoration of map.decorations) {
    assert.equal(map.tiles[decoration.y][decoration.x], 1, `${decoration.asset}: только на полу`);
    assert.equal(RK.MapGen.isMapWalkable(map, decoration.x, decoration.y), true,
      `${decoration.asset}: клетка проходима`);
  }
});

test('одинаковый seed даёт одинаковые комнаты и декорации', () => {
  const { map: first } = generate('crypt', 20250);
  const { map: second } = generate('crypt', 20250);
  // Карты рождаются в vm: deepStrictEqual сравнил бы прототипы песочницы, а не данные.
  assert.equal(JSON.stringify(first.rooms), JSON.stringify(second.rooms));
  assert.equal(JSON.stringify(first.decorations), JSON.stringify(second.decorations));

  const { map: forest } = generate('wilderness', 20250);
  assert.notEqual(JSON.stringify(first.rooms), JSON.stringify(forest.rooms),
    'профиль локации меняет планировку');
});

test('этаж вне мира генерируется с базовым профилем', () => {
  const { sandbox } = createSandbox({ seed: 5 });
  const RK = sandbox.RK;
  const map = RK.MapGen.generate(1, 12345, 60, 40, 'stone');
  const base = RK.CONFIG.DEFAULT_LOCATION_GEN;

  assert.equal(map.locationType, null);
  for (const asset of assets(map, 'solid')) {
    assert.ok(base.decor.includes(asset), `базовый профиль: лишняя декорация ${asset}`);
  }
  assert.ok(assets(map, 'water').length > 0, 'на этаже вне мира вода остаётся');
});

test('переход через ворота приносит декорации той локации, куда пришли', () => {
  const { sandbox } = createSandbox({ seed: 8 });
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'medium', style: 'stone' });

  assert.equal(RK.World.travel('gate_north'), true);
  const forest = RK.Map;
  assert.equal(forest.style, 'forest', 'лес рисуется своей палитрой');
  for (const asset of assets(forest, 'solid')) {
    assert.ok(RK.CONFIG.LOCATION_GEN.wilderness.decor.includes(asset), `лес: лишняя декорация ${asset}`);
  }

  assert.equal(RK.World.travel('cave_entrance'), true);
  const crypt = RK.Map;
  assert.equal(crypt.locationType, 'crypt');
  for (const asset of assets(crypt, 'solid')) {
    assert.ok(RK.CONFIG.LOCATION_GEN.crypt.decor.includes(asset), `склеп: лишняя декорация ${asset}`);
  }
});

test('каждая локация делится на 2–3 зала своего профиля', () => {
  for (const type of Object.keys(STYLE_BY_TYPE)) {
    const { map } = generate(type, 1234);
    const styles = map.regionStyles;
    assert.ok(styles.length >= 2 && styles.length <= 3, `${type}: 2–3 стиля залов, а не ${styles.length}`);
    assert.equal(styles[0], STYLE_BY_TYPE[type], `${type}: первый стиль — стиль самой локации`);
    for (const style of styles) {
      assert.ok(CONFIG.MAP_STYLES[style], `${type}: неизвестный стиль ${style}`);
    }
    for (const room of map.rooms) {
      assert.ok(Number.isInteger(room.region) && room.region >= 0 && room.region < styles.length,
        `${type}: комната ссылается на настоящий зал`);
    }
    for (const row of map.regions) {
      for (const region of row) {
        assert.ok(Number.isInteger(region) && region >= 0 && region < styles.length,
          `${type}: клетка ссылается на настоящий зал`);
      }
    }
  }
});

test('залы повторяются при одном seed и действительно разные', () => {
  const { map: first } = generate('ruins', 30303);
  const { map: second } = generate('ruins', 30303);
  assert.equal(JSON.stringify(first.regionStyles), JSON.stringify(second.regionStyles));
  assert.equal(JSON.stringify(first.regions), JSON.stringify(second.regions));

  const used = new Set();
  for (const row of first.regions) for (const region of row) used.add(region);
  assert.ok(used.size >= 2, `в локации несколько залов: ${[...used].join(', ')}`);
});

test('ASCII-режим рисует декорации локации', () => {
  const { sandbox, glyphs } = createRenderSandbox();
  sandbox.RK.CONFIG.COLS = 2;
  sandbox.RK.CONFIG.ROWS = 2;
  const player = { id: 'player', x: 0, y: 0, hp: 10 };
  sandbox.RK.Map = {
    w: 2,
    h: 2,
    tiles: [[1, 1], [1, 1]],
    vis: [[true, true], [true, true]],
    explored: [[true, true], [true, true]],
    decorations: [
      { x: 1, y: 1, asset: 'decorTree' },
      { x: 0, y: 1, asset: 'decorCoffin' },
    ],
    doors: [],
    chests: [],
    traps: [],
    torches: [],
  };
  sandbox.RK.GAME = { player, players: [player], items: [], enemies: [] };
  sandbox.RK.Combat = { getDrawPos: () => player };

  sandbox.RK.Render.setMode('ascii');
  sandbox.RK.Render.draw();

  assert.ok(glyphs.includes('♣'), 'дерево нарисовано глифом');
  assert.ok(glyphs.includes('='), 'гроб нарисован глифом');
});