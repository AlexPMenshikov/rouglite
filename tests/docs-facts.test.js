'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const CONFIG = require('../js/config');
const { MAX_PLAYERS } = require('../server/room-manager');

// README описывает репозиторий, но факты о классах и вместимости комнаты он
// берёт из кода: без проверки текст разъезжается с игрой при первом же
// добавлении класса или смене лимита.
const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

test('the README names every class of the game', () => {
  const { sandbox } = require('./helpers/sandbox').createSandbox({ scripts: ['config.js', 'classes.js'] });

  for (const classId of CONFIG.PLAYER_CLASSES) {
    const name = sandbox.RK.Classes.getClassDef(classId).name.toLowerCase();
    assert.ok(readme.toLowerCase().includes(name), `${name}: класс назван в README`);
  }
});

test('the README shows the room capacity from the config', () => {
  const match = readme.match(/до (\d+) игроков/);

  assert.ok(match, 'в README есть вместимость комнаты');
  assert.equal(Number(match[1]), CONFIG.MAX_PLAYERS, 'в README та же цифра, что в конфиге');
});

test('the server takes the room capacity from the config', () => {
  assert.equal(MAX_PLAYERS, CONFIG.MAX_PLAYERS, 'сервер и клиент знают одно число');
});
