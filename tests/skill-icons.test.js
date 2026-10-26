'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');
const CONFIG = require('../js/config');

// Иконки способностей и спрайты классов обязаны существовать во встроенном
// наборе: иначе кнопки и карточки классов рисуются пустыми.

test('у каждой способности есть иконка во встроенном наборе', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'classes.js', 'skills.js', 'assets.js'] });

  for (const classId of CONFIG.PLAYER_CLASSES) {
    const skills = sandbox.RK.Skills.skillsFor(classId);
    assert.equal(skills.length, 3, `${classId}: три способности`);
    for (const skill of skills) {
      assert.ok(skill.icon, `${skill.id}: поле icon заполнено`);
      assert.ok(
        sandbox.RK.Assets.builtinFallbackNames().includes(skill.icon),
        `${skill.id}: иконка ${skill.icon} рисуется встроенными средствами`,
      );
    }
  }
});

test('у каждого класса есть свой спрайт героя', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'classes.js', 'assets.js'] });

  for (const classId of CONFIG.PLAYER_CLASSES) {
    const asset = sandbox.RK.Classes.classAsset(classId);
    assert.ok(
      sandbox.RK.Assets.builtinFallbackNames().includes(asset),
      `${classId}: спрайт ${asset} во встроенном наборе`,
    );
  }
});

test('иконки способностей не повторяются между классами', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'classes.js', 'skills.js'] });

  const icons = [];
  for (const classId of CONFIG.PLAYER_CLASSES) {
    for (const skill of sandbox.RK.Skills.skillsFor(classId)) icons.push(skill.icon);
  }
  assert.equal(new Set(icons).size, icons.length, 'каждая способность рисует свою иконку');
});
