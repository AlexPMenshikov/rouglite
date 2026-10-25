'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, readUiSources } = require('./helpers/sandbox');

// Иконки интерфейса — код, а не файлы: список имён в js/assets.js, а
// использование — в файлах js/ui-*.js и в деревьях навыков. Расхождение в обе
// стороны означает либо невидимую иконку, либо мёртвый спрайт.
const uiSource = readUiSources();
const usedIcons = new Set([...uiSource.matchAll(/'(ui[A-Za-z0-9]+)'/g)].map((match) => match[1]));

function iconNames() {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'assets.js'] });
  return new Set(sandbox.RK.Assets.iconNames());
}

function skillIconNames() {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'classes.js', 'skills.js'] });
  const names = new Set();
  const defs = sandbox.RK.Skills.SKILL_DEFS;
  for (const classId of Object.keys(defs)) {
    for (const skill of defs[classId]) {
      if (skill.icon) names.add(skill.icon);
    }
  }
  return names;
}

// Иконки способностей ссылаются из skills.js, не из ui-*.js.
for (const name of skillIconNames()) usedIcons.add(name);

test('every icon used by the interface exists in the sprite list', () => {
  const known = iconNames();

  for (const name of usedIcons) {
    assert.ok(known.has(name), `${name}: иконка есть в UI_ICON_SPRITES`);
  }
});

test('no sprite in the icon list is unused', () => {
  const known = iconNames();

  for (const name of known) {
    assert.ok(usedIcons.has(name), `${name}: спрайт иконки кем-то используется`);
  }
});

test('каждая способность имеет иконку из списка UI', () => {
  const known = iconNames();
  const skillIcons = skillIconNames();
  assert.equal(skillIcons.size, 12, 'ровно 12 иконок способностей');
  for (const name of skillIcons) {
    assert.ok(known.has(name), `${name}: иконка навыка есть в UI_ICON_SPRITES`);
  }
});
