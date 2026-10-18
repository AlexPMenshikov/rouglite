'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// Загрузка тайлсета идёт через Image, которого в node:vm нет: тест сам решает,
// когда картинка «загрузилась» или «упала», и гонит цепочку до конца.

function assetsSandbox() {
  const images = [];
  class FakeImage {
    constructor() {
      this.width = 0;
      this.height = 0;
      this._triedRoot = false;
      this._handled = false;
      this._src = '';
      images.push(this);
    }
    set src(value) { this._src = value; }
    get src() { return this._src; }
  }
  const { sandbox } = createSandbox({ scripts: ['config.js', 'assets.js'] });
  sandbox.Image = FakeImage;
  return { sandbox, images };
}

function handleImage(image, options) {
  if (image.src === 'assets/tiny-dungeon.png') {
    image.onerror();
    return;
  }
  if (image.src === 'assets/spritesheet.png') {
    if (options.spritesheetOk) {
      [image.width, image.height] = options.spritesheetSize;
      image.onload();
    } else {
      image.onerror();
    }
    return;
  }
  if (image.src.indexOf('assets/sprites/') === 0) {
    image.onerror();
    return;
  }
  if (image.src === 'assets/floor-dark.png' && options.floorDark) {
    [image.width, image.height] = options.floorDark;
    image.onload();
    return;
  }
  // Повторная попытка загрузки спрайта из корня assets.
  if (options.hiResOk && image._triedRoot) {
    [image.width, image.height] = [32, 32];
    image.onload();
    return;
  }
  // Остальные файлы: успех только при hiResOk, иначе окончательный отказ.
  if (options.hiResOk) {
    [image.width, image.height] = [32, 32];
    image.onload();
  } else {
    image.onerror();
  }
}

// Гоняет цепочку загрузки, пока done не вернётся. Повторные попытки (src меняется
// внутри onerror) помечаем необработанными — иначе вторая попытка не сработает.
function settle(helpers, options = {}) {
  const full = Object.assign({ spritesheetOk: true, spritesheetSize: [160, 112], floorDark: null, hiResOk: false }, options);
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
});

test('первый рабочий атлас становится источником спрайтов', () => {
  const { sandbox, images } = assetsSandbox();

  const done = settle({ sandbox, images }, { hiResOk: false });

  assert.equal(done.error, null);
  assert.equal(done.loaded, true, 'атлас считается загруженным');
  assert.equal(sandbox.RK.Assets.source(), 'assets/spritesheet.png');
  assert.equal(sandbox.RK.Assets.enabled(), true);
  assert.equal(sandbox.localStorage.getItem('rouglite_tileset_enabled_v1'), 'true');
});

test('без атласа спрайты добираются по одному из корня assets', () => {
  const { sandbox, images } = assetsSandbox();

  const done = settle({ sandbox, images }, { spritesheetOk: false, hiResOk: true });

  assert.equal(done.loaded, true);
  assert.equal(sandbox.RK.Assets.source(), 'assets', 'единичные файлы дают источник assets');
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
