'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createAudioSandbox } = require('./helpers/sandbox');

// Аудио проверяется через граф заглушек Web Audio: таймеры motif-планировщика
// тест запускает сам, иначе прогон зависел бы от реального времени.

// Главные осцилляторы дрона помнят частоту; осцилляторы вибрато только ставят .value.
function droneFrequencies(helpers) {
  return helpers.nodes.oscillators
    .filter((node) => node.frequency.events.length > 0)
    .map((node) => node.frequency.events[0][1]);
}

test('громкость по умолчанию 0.5 и хранится под своим ключом', () => {
  const helpers = createAudioSandbox();
  assert.equal(helpers.sandbox.RK.Audio.getVolume(), 0.5);

  helpers.sandbox.RK.Audio.setVolume(0.9);
  assert.equal(helpers.sandbox.RK.Audio.getVolume(), 0.9);
  assert.equal(helpers.storage.get('rogalite_audio_volume_v1'), '0.9');
});

test('setVolume держит громкость в пределах 0..1', () => {
  const helpers = createAudioSandbox();
  const Audio = helpers.sandbox.RK.Audio;

  Audio.setVolume(-1);
  assert.equal(Audio.getVolume(), 0);
  Audio.setVolume(7);
  assert.equal(Audio.getVolume(), 1);
  Audio.setVolume('не число');
  assert.equal(Audio.getVolume(), 0.5, 'нечисловое значение не должно ломать громкость');
});

test('start без Web Audio не падает и честно возвращает false', () => {
  const helpers = createAudioSandbox();
  delete helpers.sandbox.AudioContext;
  assert.equal(helpers.sandbox.RK.Audio.start(), false);
});

test('темы этажей задают корневую ноту дрона', () => {
  const roots = [
    [1, 130.81], [3, 130.81],
    [4, 174.61], [6, 174.61],
    [7, 146.83], [9, 146.83],
    [10, 55], [12, 55],
  ];
  for (const [floor, root] of roots) {
    const helpers = createAudioSandbox();
    helpers.sandbox.RK.Audio.setFloor(floor);
    assert.ok(
      droneFrequencies(helpers).some((value) => Math.abs(value - root) < 0.005),
      `этаж ${floor} обязан играть тему с корнем ${root}`,
    );
  }
});

test('смена этажа гасит старую тему и поднимает новую', () => {
  const helpers = createAudioSandbox();
  helpers.sandbox.RK.Audio.setFloor(1);
  helpers.sandbox.RK.Audio.setFloor(4);

  const frequencies = droneFrequencies(helpers);
  assert.ok(frequencies.includes(174.61), 'новая тема звучит');
  assert.ok(frequencies.includes(130.81 / 4), 'старая тема ещё затухает');
  const faded = helpers.nodes.gains.some((gain) =>
    gain.gain.events.some((event) => event[0] === 'ramp' && event[1] === 0.0001),
  );
  assert.ok(faded, 'старая тема получает затухание');
  // Плюс таймер остановки старых узлов: его не держат в activeTimers, но он живёт.
  assert.equal(helpers.timerCount(), 2, 'старые таймеры сняты, остался планировщик и затухание');
});

test('motif-планировщик играет мотив и ставит себя снова', () => {
  const helpers = createAudioSandbox();
  helpers.sandbox.RK.Audio.start();
  const oscillatorsBefore = helpers.nodes.oscillators.length;

  assert.equal(helpers.timerCount(), 1);
  assert.equal(helpers.runTimer(), true, 'ближайший таймер выполнился');
  assert.ok(helpers.nodes.oscillators.length > oscillatorsBefore, 'мотив создал осцилляторы');
  assert.equal(helpers.timerCount(), 1, 'планировщик запланировал следующий мотив');
});

test('setEnabled глушит мастер-шину и возвращает звук', () => {
  const helpers = createAudioSandbox();
  const Audio = helpers.sandbox.RK.Audio;
  Audio.setVolume(1);

  Audio.setEnabled(false);
  assert.equal(Audio.isEnabled(), false);
  assert.ok(
    helpers.nodes.gains[0].gain.events.some((event) => event[0] === 'target' && event[1] === 0),
    'выключенный звук тянет мастер-усиление к нулю',
  );

  Audio.setEnabled(true);
  assert.equal(Audio.isEnabled(), true);
  assert.ok(
    helpers.nodes.gains[0].gain.events.some((event) => event[0] === 'target' && event[1] === 0.65),
    'включённый звук возвращает мастер-усиление к 0.65 от громкости',
  );
});

test('звуковые эффекты проходят через sfx-шину', () => {
  const helpers = createAudioSandbox();
  helpers.sandbox.RK.Audio.start();
  const oscillatorsBefore = helpers.nodes.oscillators.length;

  helpers.sandbox.RK.Audio.playAttack();
  const newOscillators = helpers.nodes.oscillators.slice(oscillatorsBefore);
  assert.equal(newOscillators.length, 2, 'удар — два тона');
  assert.deepEqual(newOscillators.map((node) => node.type), ['square', 'triangle']);
});
