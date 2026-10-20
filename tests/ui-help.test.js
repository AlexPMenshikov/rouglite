'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');
const CONFIG = require('../js/config');

// Справка игрока собирается из игровых данных: классы, их навыки и вместимость
// комнаты берутся из конфига, а не из текста, который однажды забыли обновить.
function helpContext() {
  const { sandbox, elements } = createSandbox({ ui: true });
  sandbox.RK.UI.show('help');
  return { RK: sandbox.RK, html: elements.get('help-content').innerHTML };
}

test('the help lists every class from the config', () => {
  const { RK, html } = helpContext();

  for (const classId of CONFIG.PLAYER_CLASSES) {
    const def = RK.Classes.getClassDef(classId);
    assert.ok(html.includes(def.name), `${def.name}: класс есть в справке`);
  }
});

test('the help lists the skills of every class', () => {
  const { RK, html } = helpContext();

  for (const classId of CONFIG.PLAYER_CLASSES) {
    for (const skill of RK.Skills.skillsFor(classId)) {
      assert.ok(html.includes(skill.name), `${skill.name}: навык есть в справке`);
    }
  }
});

test('the help shows the room capacity from the config', () => {
  const { html } = helpContext();

  assert.ok(html.includes('до ' + CONFIG.MAX_PLAYERS + ' игроков'),
    'в справке стоит настоящая вместимость комнаты');
});

test('the help does not mention the renamed tank class', () => {
  const { html } = helpContext();

  assert.ok(!html.includes('Танк'), 'старое имя класса ушло из справки');
});
