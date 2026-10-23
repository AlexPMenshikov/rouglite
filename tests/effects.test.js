'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// effects.js читает performance.now(): без управляемого времени проверить время
// жизни эффекта нельзя, поэтому часы заменяем на ручные.

function recordingContext() {
  const calls = [];
  const gradient = { addColorStop() {} };
  const canvas = { width: 192, height: 192 };
  const methods = [
    'arc', 'fillText', 'fill', 'stroke', 'moveTo', 'lineTo', 'beginPath', 'save',
    'restore', 'translate', 'drawImage', 'fillRect', 'clearRect', 'closePath', 'setLineDash',
  ];
  const ctx = new Proxy({ canvas }, {
    get(target, property) {
      if (property === 'canvas') return canvas;
      if (typeof property === 'string' && methods.includes(property)) {
        return (...args) => calls.push([property, ...args]);
      }
      if (property === 'createRadialGradient' || property === 'createLinearGradient') {
        return (...args) => {
          calls.push(['gradient', ...args]);
          return gradient;
        };
      }
      if (property in target) return target[property];
      return () => {};
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
  return { ctx, calls, canvas };
}

function mutableTime(sandbox) {
  let time = 0;
  sandbox.performance.now = () => time;
  return {
    set(value) { time = value; },
    get value() { return time; },
  };
}

// Проекция вида: у каждого вида своя геометрия, эффекты берут её у него.
function flatProjector(tile = 16) {
  return {
    tile,
    point(x, y) { return { x: x * tile, y: y * tile }; },
  };
}

test('ring effect lives for CONFIG.EFFECT.LIFE and then disappears', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'effects.js'], stubEffects: false });
  const clock = mutableTime(sandbox);
  const Effects = sandbox.RK.Effects;

  Effects.add(1, 1, '#ffffff');
  assert.equal(Effects.active(), true);

  clock.set(sandbox.RK.CONFIG.EFFECT.LIFE + 1);
  Effects.tick(clock.value);
  assert.equal(Effects.active(), false, 'просроченный эффект удаляется');
});

test('notePlayerHit keeps a red flash until the effect time is over', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'effects.js'], stubEffects: false });
  const clock = mutableTime(sandbox);
  const { ctx, calls } = recordingContext();

  sandbox.RK.Effects.notePlayerHit();
  assert.equal(sandbox.RK.Effects.active(), true);

  clock.set(sandbox.RK.CONFIG.EFFECT.LIFE / 2);
  sandbox.RK.Effects.draw(ctx, flatProjector());
  assert.ok(calls.some(([name]) => name === 'gradient'), 'вспышка рисуется, пока не истекла');

  const gradients = calls.length;
  clock.set(sandbox.RK.CONFIG.EFFECT.LIFE + 1);
  sandbox.RK.Effects.draw(ctx, flatProjector());
  assert.equal(calls.length, gradients, 'после истечения времени вспышки больше нет');
});

test('damage and shot effects are drawn with the right content', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'effects.js'], stubEffects: false });
  const clock = mutableTime(sandbox);
  const { ctx, calls } = recordingContext();
  const Effects = sandbox.RK.Effects;

  Effects.addDamage(1, 1, 12, '#ff0000');
  Effects.addShot(0, 0, 2, 0, '#ffe9a8');

  clock.set(0);
  Effects.draw(ctx, flatProjector());

  assert.ok(calls.some(([name, text]) => name === 'fillText' && text === '12'), 'урон выводится текстом');
  assert.ok(calls.some(([name]) => name === 'moveTo'), 'выстрел рисуется отрезком');
  assert.ok(calls.some(([name]) => name === 'lineTo'), 'выстрел рисуется отрезком');
});

test('ring effect draws a growing circle and an outline', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'effects.js'], stubEffects: false });
  const clock = mutableTime(sandbox);
  const { ctx, calls } = recordingContext();

  sandbox.RK.Effects.add(1, 1, '#00ff00');
  clock.set(0);
  sandbox.RK.Effects.draw(ctx, flatProjector());

  const arcs = calls.filter(([name]) => name === 'arc');
  assert.equal(arcs.length, 2, 'внутренний круг и внешний контур');
  assert.equal(arcs[0][3], sandbox.RK.CONFIG.EFFECT.MAX_R * 0.35, 'в начале кольцо маленькое');
});

test('удар рисует вспышку, искры, дугу и кровь', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'effects.js'], stubEffects: false });
  const clock = mutableTime(sandbox);
  const { ctx, calls } = recordingContext();

  sandbox.RK.Effects.add(1, 1, '#ffdd55', { hit: true, blood: true });
  clock.set(0);
  sandbox.RK.Effects.draw(ctx, flatProjector());

  const arcs = calls.filter(([name]) => name === 'arc');
  assert.ok(arcs.length > 2, 'к кольцу добавлена дуга удара');
  assert.ok(calls.some(([name]) => name === 'lineTo'), 'искры рисуются отрезками');
  assert.ok(calls.some(([name]) => name === 'fillRect'), 'капли крови рисуются квадратами');
});

test('настройки качества гасят фон и частицы, тряска отключается', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'effects.js'], stubEffects: false });
  const clock = mutableTime(sandbox);
  const { ctx, calls } = recordingContext();
  sandbox.RK.Meta = { data: { effectsQuality: 'full', screenShake: true } };

  sandbox.RK.Effects.draw(ctx, Object.assign(flatProjector(), { ambient: 'dust' }));
  const fullAmbient = calls.filter(([name]) => name === 'fillRect').length;
  assert.ok(fullAmbient > 0, 'полное качество рисует фон');

  calls.length = 0;
  sandbox.RK.Meta.data.effectsQuality = 'off';
  sandbox.RK.Effects.draw(ctx, Object.assign(flatProjector(), { ambient: 'dust' }));
  assert.equal(calls.filter(([name]) => name === 'fillRect').length, 0, 'выключенное качество не рисует фон');

  sandbox.RK.Meta.data.effectsQuality = 'full';
  sandbox.RK.Effects.add(1, 1, '#ff5252', { hit: true, shake: 4 });
  const shake = sandbox.RK.Effects.shakeOffset(clock.value);
  assert.ok(shake.x !== 0 || shake.y !== 0, 'тряска сдвигает кадр');

  sandbox.RK.Meta.data.screenShake = false;
  const still = sandbox.RK.Effects.shakeOffset(clock.value);
  assert.equal(still.x, 0, 'выключенная тряска не двигает кадр по x');
  assert.equal(still.y, 0, 'выключенная тряска не двигает кадр по y');
});
