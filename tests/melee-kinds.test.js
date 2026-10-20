'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, createRenderSandbox } = require('./helpers/sandbox');
const CONFIG = require('../js/config');

// Виды ближнего боя живут в одном списке: лут, экипировка и рендер обязаны
// знать одинаковый набор, иначе вид без глифа рисуется вопросительным знаком.

test('every melee kind has a glyph for the ascii mode', () => {
  const { sandbox } = createRenderSandbox();
  const glyphs = sandbox.RK.Render.typeGlyphs();

  for (const kind of CONFIG.MELEE_KINDS) {
    assert.ok(glyphs[kind], `${kind}: глиф есть в текстовом режиме`);
  }
});

test('every melee kind has a built-in sprite', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'assets.js'] });
  const built = new Set(sandbox.RK.Assets.builtinFallbackNames());

  for (const kind of CONFIG.MELEE_KINDS) {
    assert.ok(built.has(kind), `${kind}: спрайт строится во встроенном наборе`);
  }
});

test('the mage weapon kinds are a part of the melee kinds', () => {
  for (const kind of CONFIG.MAGE_WEAPON_KINDS) {
    assert.ok(CONFIG.MELEE_KINDS.includes(kind), `${kind}: магическое оружие в списке ближнего боя`);
  }
});

test('the status names come from the status registry', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'status-defs.js'] });

  for (const [id, def] of Object.entries(sandbox.RK.Statuses.DEFS)) {
    assert.ok(def.name, `${id}: у статуса есть название`);
  }
});
