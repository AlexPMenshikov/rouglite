'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

function pngSize(file, dir) {
  const buf = fs.readFileSync(path.join(__dirname, '..', 'assets', dir || 'sprites', file));
  assert.equal(buf.toString('ascii', 1, 4), 'PNG', file + ': сигнатура PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

// Загрузка тайлсета идёт через Image, которого в node:vm нет: тест сам решает,
// когда картинка «загрузилась» или «упала», и гонит цепочку до конца.

function assetsSandbox() {
  const images = [];
  class FakeImage {
    constructor() {
      this.width = 0;
      this.height = 0;
      this._handled = false;
      this._src = '';
      images.push(this);
    }
    set src(value) { this._src = value; }
    get src() { return this._src; }
  }
  const { sandbox } = createSandbox({ scripts: ['config.js', 'entities.js', 'assets.js'] });
  sandbox.Image = FakeImage;
  return { sandbox, images };
}

function handleImage(image, options) {
  if (image.src.indexOf('assets/sprites/') === 0) {
    if (options.hiResOk && !options.rootOnly) {
      [image.width, image.height] = [256, 256];
      image.onload();
    } else {
      image.onerror();
    }
    return;
  }
  if (image.src.indexOf('assets/ui/') === 0) {
    if (options.hiResOk && options.uiOk !== false) {
      [image.width, image.height] = [256, 256];
      image.onload();
    } else {
      image.onerror();
    }
    return;
  }
  if (image.src === 'assets/tiny-dungeon-iso.png') {
    if (options.isoOk) {
      [image.width, image.height] = options.isoSize || [5440, 64];
      image.onload();
    } else {
      image.onerror();
    }
    return;
  }
  if (image.src === 'assets/floor-dark.png') {
    if (options.floorDark) {
      [image.width, image.height] = options.floorDark;
      image.onload();
    } else {
      image.onerror();
    }
    return;
  }
  // Запасной путь — файл в корне assets вместо папки sprites.
  // Остальные файлы: успех только при hiResOk, иначе окончательный отказ.
  if (options.hiResOk && image.src.indexOf('assets/') === 0 && image.src.indexOf('assets/sprites/') !== 0) {
    [image.width, image.height] = [256, 256];
    image.onload();
  } else {
    image.onerror();
  }
}

// Гоняет цепочку загрузки, пока done не вернётся. Повторные попытки (src меняется
// внутри onerror) помечаем необработанными — иначе вторая попытка не сработает.
function settle(helpers, options = {}) {
  const full = Object.assign({ floorDark: null, hiResOk: false }, options);
  let done = null;
  helpers.sandbox.RK.Assets.setEnabled(true, (error, loaded) => { done = { error, loaded }; });
  let guard = 0;
  while (done === null && guard++ < 20000) {
    const pending = helpers.images.filter((image) => !image._handled);
    if (!pending.length) break;
    for (const image of pending) {
      const before = image.src;
      image._handled = true;
      handleImage(image, full);
      if (image.src !== before) image._handled = false;
    }
  }
  assert.ok(done !== null, 'загрузка обязана завершиться');
  return done;
}

function recordingDrawContext(captures) {
  return new Proxy({}, {
    get(target, property) {
      if (property === 'drawImage') return (sprite, dx, dy, size) => captures.push({ width: sprite.width, size });
      if (property in target) return target[property];
      return () => {};
    },
    set(target, property, value) { target[property] = value; return true; },
  });
}

test('встроенные тайлы включаются без картинок и выключаются в настройках', () => {
  const { sandbox } = assetsSandbox();

  let done = null;
  sandbox.RK.Assets.setEnabled(false, (error, loaded) => { done = { error, loaded }; });

  assert.deepEqual(done, { error: null, loaded: false });
  assert.equal(sandbox.RK.Assets.enabled(), false);
  assert.equal(sandbox.RK.Assets.source(), 'builtin');
  assert.equal(sandbox.localStorage.getItem('rouglite_tileset_enabled_v1'), 'false');
  const names = sandbox.RK.Assets.builtinFallbackNames();
  assert.ok(names.includes('torchFlame2') && names.includes('torchFlame3'), 'кадры пламени есть во встроенном наборе');
});

test('walk-кадры и усиленные враги запрашиваются вместе с остальными спрайтами', () => {
  const { sandbox, images } = assetsSandbox();

  settle({ sandbox, images }, { hiResOk: true });

  const requested = images.map((image) => image.src);
  assert.ok(requested.includes('assets/sprites/playerPaladin_walk1.png'), 'кадр героя в списке загрузки');
  assert.ok(requested.includes('assets/sprites/boss_slime_walk2.png'), 'кадр босса в списке загрузки');
  assert.ok(requested.includes('assets/sprites/wolf_enhanced.png'), 'усиленный враг в списке загрузки');
  assert.ok(requested.includes('assets/sprites/merchant.png'), 'NPC-торговец в списке загрузки');
  assert.ok(requested.includes('assets/sprites/ancient_guard.png'), 'древний страж в списке загрузки');
});

test('спрайты загружаются из assets/sprites без атласа', () => {
  const { sandbox, images } = assetsSandbox();

  const done = settle({ sandbox, images }, { hiResOk: true });
  const requested = images.map((image) => image.src);

  assert.equal(done.error, null);
  assert.equal(done.loaded, true, 'файлы спрайтов считаются загруженными');
  assert.equal(sandbox.RK.Assets.source(), 'assets');
  assert.equal(sandbox.RK.Assets.enabled(), true);
  assert.equal(sandbox.localStorage.getItem('rouglite_tileset_enabled_v1'), 'true');
  assert.ok(!requested.includes('assets/tiny-dungeon.png'), 'атлас 16×16 больше не запрашивается');
  assert.ok(!requested.includes('assets/spritesheet.png'), 'запасной атлас тоже убран');
});

test('если PNG нет, остаются встроенные спрайты', () => {
  const { sandbox, images } = assetsSandbox();

  const done = settle({ sandbox, images }, { hiResOk: false });

  assert.equal(done.error, null);
  assert.equal(done.loaded, false);
  assert.equal(sandbox.RK.Assets.source(), 'builtin');
  assert.equal(sandbox.RK.Assets.enabled(), true);
});

test('файл можно положить в корень assets вместо папки sprites', () => {
  const { sandbox, images } = assetsSandbox();

  const done = settle({ sandbox, images }, { hiResOk: true, rootOnly: true });

  assert.equal(done.loaded, true);
  assert.equal(sandbox.RK.Assets.source(), 'assets', 'единичные файлы дают источник assets');
});

test('иконки интерфейса запрашиваются из assets/ui', () => {
  const { sandbox, images } = assetsSandbox();

  settle({ sandbox, images }, { hiResOk: true });
  const requested = images.map((image) => image.src);

  assert.ok(requested.includes('assets/ui/uiPlay.png'), 'иконка кнопки лежит в assets/ui');
  assert.ok(requested.includes('assets/ui/uiSkillFireball.png'), 'иконка навыка лежит в assets/ui');
  assert.ok(!requested.includes('assets/sprites/uiPlay.png'), 'в assets/sprites иконку не ищем');
});

test('без PNG иконки остаётся встроенная копия 16×16', () => {
  const { sandbox, images } = assetsSandbox();

  settle({ sandbox, images }, { hiResOk: true, uiOk: false });
  const icons = [];
  const world = [];

  sandbox.RK.Assets.draw(recordingDrawContext(icons), 'uiPlay', 0, 0, 16);
  sandbox.RK.Assets.draw(recordingDrawContext(world), 'sword', 0, 0, 16);
  assert.equal(icons[0].width, 16, 'иконка осталась встроенной');
  assert.equal(world[0].width, 256, 'остальные спрайты загрузились из PNG');
});

test('картинка пола меньше SPR отвергается, остальные файлы не портят кадр', () => {
  const { sandbox, images } = assetsSandbox();
  const captures = [];

  settle({ sandbox, images }, { floorDark: [8, 8] });

  sandbox.RK.Assets.drawFloorTile(recordingDrawContext(captures), 4, 1, true, true, 0, 0, 16);
  assert.equal(captures[0].width, sandbox.RK.Assets.SPRITE, 'маленькая картинка заменяется встроенным тайлом');
});

test('картинка пола не меньше SPR подхватывается', () => {
  const { sandbox, images } = assetsSandbox();
  const captures = [];

  settle({ sandbox, images }, { floorDark: [32, 32] });

  sandbox.RK.Assets.drawFloorTile(recordingDrawContext(captures), 4, 1, true, true, 0, 0, 16);
  assert.equal(captures[0].width, 32, 'подходящая по размеру картинка рисуется как есть');
});

test('изо-атлас нарезается на полы и стены всех стилей', () => {
  const { sandbox, images } = assetsSandbox();

  settle({ sandbox, images }, { isoOk: true });

  const names = sandbox.RK.Assets.isoSpriteNames();
  const set = new Set(names);
  const styles = Object.keys(sandbox.RK.CONFIG.MAP_STYLES);

  for (const base of ['iso_floor', 'iso_wall', 'iso_floorDim', 'iso_wallDim', 'iso_fog']) {
    assert.ok(set.has(base), 'есть базовый тайл ' + base);
  }
  for (const style of styles) {
    for (let shade = 0; shade < 5; shade++) {
      assert.ok(set.has('iso_floor_' + style + '_' + shade), 'пол ' + style + ' ' + shade);
      assert.ok(set.has('iso_wall_' + style + '_' + shade), 'стена ' + style + ' ' + shade);
    }
  }
  // Приглушённые копии нужны всем тайлам, кроме тумана.
  for (const name of names) {
    if (name === 'iso_fog' || name.indexOf('_dim') >= 0) continue;
    assert.ok(set.has(name + '_dim'), 'есть приглушённая копия ' + name);
  }
  assert.equal(sandbox.RK.Assets.isoFloor(styles[0], 1, true, true).width, 64);
  assert.equal(sandbox.RK.Assets.isoWall(styles[0], 1, true, true).height, 64);
  assert.notEqual(sandbox.RK.Assets.isoFloor(styles[0], 1, false, true), sandbox.RK.Assets.isoFloor(styles[0], 1, true, true), 'невидимая клетка берёт приглушённый тайл');
  assert.equal(sandbox.RK.Assets.isoFloor(styles[0], 1, true, false), sandbox.RK.Assets.isoFloor(styles[1] || styles[0], 2, false, false), 'неисследованная клетка скрыта туманом');
});

test('изо-атлас меньше 64 пикселей не загружается', () => {
  const { sandbox, images } = assetsSandbox();

  settle({ sandbox, images }, { isoOk: true, isoSize: [32, 32] });

  assert.equal(sandbox.RK.Assets.isoSpriteNames().length, 0, 'мелкая картинка отклонена');
});

test('герои классов лежат в 256×256, а кадры шага различаются', () => {
  const classes = ['Paladin', 'Berserker', 'Archer', 'Mage'];
  for (const name of classes) {
    const idle = 'player' + name + '.png';
    assert.deepEqual(pngSize(idle), [256, 256], idle + ': размер');
    const walk1 = fs.readFileSync(path.join(__dirname, '..', 'assets', 'sprites', 'player' + name + '_walk1.png'));
    const walk2 = fs.readFileSync(path.join(__dirname, '..', 'assets', 'sprites', 'player' + name + '_walk2.png'));
    assert.deepEqual(pngSize('player' + name + '_walk1.png'), [256, 256], name + ': первый кадр');
    assert.deepEqual(pngSize('player' + name + '_walk2.png'), [256, 256], name + ': второй кадр');
    assert.notDeepEqual(walk1, walk2, name + ': кадры шага обязаны отличаться');
  }
});

test('обычные и усиленные враги лежат в 256×256 и различаются', () => {
  const enemies = [
    'slime', 'rat', 'skeleton', 'archer', 'bat', 'demon', 'wolf', 'spider', 'eagle',
    'goat', 'scorpion', 'mummy', 'cultist', 'zombie', 'ghost', 'ghoul', 'golem', 'croc', 'shaman',
  ];
  for (const name of enemies) {
    const base = name + '.png';
    const elite = name + '_enhanced.png';
    assert.deepEqual(pngSize(base), [256, 256], base + ': размер');
    assert.deepEqual(pngSize(elite), [256, 256], elite + ': размер');
    assert.notDeepEqual(
      fs.readFileSync(path.join(__dirname, '..', 'assets', 'sprites', base)),
      fs.readFileSync(path.join(__dirname, '..', 'assets', 'sprites', elite)),
      name + ': усиленный спрайт отличается от обычного'
    );
  }
});

test('NPC лежат в 256×256 и различаются силуэтом', () => {
  const npcs = ['merchant', 'blacksmith', 'guard', 'priest', 'scholar', 'innkeeper', 'ancient_guard'];
  const seen = new Map();
  for (const name of npcs) {
    const file = name + '.png';
    assert.deepEqual(pngSize(file), [256, 256], file + ': размер');
    const bytes = fs.readFileSync(path.join(__dirname, '..', 'assets', 'sprites', file)).toString('base64');
    assert.ok(!seen.has(bytes), name + ': спрайт отличается от ' + seen.get(bytes));
    seen.set(bytes, name);
  }
});

test('боссы лежат в 256×256, стойка и кадры шага различаются', () => {
  const bosses = ['slime', 'rat', 'bone', 'archer', 'bat', 'brute', 'witch', 'knight', 'demon', 'lich'];
  for (const name of bosses) {
    const idle = 'boss_' + name + '.png';
    assert.deepEqual(pngSize(idle), [256, 256], idle + ': размер');
    const walk1 = fs.readFileSync(path.join(__dirname, '..', 'assets', 'sprites', 'boss_' + name + '_walk1.png'));
    const walk2 = fs.readFileSync(path.join(__dirname, '..', 'assets', 'sprites', 'boss_' + name + '_walk2.png'));
    assert.deepEqual(pngSize('boss_' + name + '_walk1.png'), [256, 256], name + ': первый кадр');
    assert.deepEqual(pngSize('boss_' + name + '_walk2.png'), [256, 256], name + ': второй кадр');
    assert.notDeepEqual(walk1, walk2, name + ': кадры шага обязаны отличаться');
    assert.notDeepEqual(fs.readFileSync(path.join(__dirname, '..', 'assets', 'sprites', idle)), walk1, name + ': стойка отличается от шага');
  }
});

test('все файлы спрайтов лежат в 256×256, атласа 16×16 нет', () => {
  const dir = path.join(__dirname, '..', 'assets', 'sprites');
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.png'))) {
    assert.deepEqual(pngSize(file), [256, 256], file + ': размер');
  }
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'assets', 'tiny-dungeon.png')), false, 'tiny-dungeon.png удалён');
});

test('иконки интерфейса лежат в assets/ui в 256×256', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'assets.js'] });
  const names = sandbox.RK.Assets.iconNames();

  for (const name of names) {
    assert.deepEqual(pngSize(name + '.png', 'ui'), [256, 256], name + ': размер');
  }
  const files = fs.readdirSync(path.join(__dirname, '..', 'assets', 'ui')).filter((file) => file.endsWith('.png'));
  assert.equal(files.length, names.length, 'в assets/ui нет лишних PNG');
});
