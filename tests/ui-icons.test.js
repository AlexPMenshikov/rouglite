'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// Иконки интерфейса — код, а не файлы: список имён в js/assets.js, а
// использование — в js/ui.js. Расхождение в обе стороны означает либо
// невидимую иконку, либо мёртвый спрайт.
const uiSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui.js'), 'utf8');
const usedIcons = new Set([...uiSource.matchAll(/'(ui[A-Za-z0-9]+)'/g)].map((match) => match[1]));

function iconNames() {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'assets.js'] });
  return new Set(sandbox.RK.Assets.iconNames());
}

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
