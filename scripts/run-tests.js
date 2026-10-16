'use strict';

// Автосборка списка тестов из каталога tests: новый файл не теряется из прогона.
// Категория файла выводится из имени: integration — ui-*, lan-*, network-*,
// class-access, static-files; остальное считается unit.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const testsDir = path.join(root, 'tests');
const mode = process.argv[2];

if (mode !== 'unit' && mode !== 'integration') {
  console.error('Использование: node scripts/run-tests.js unit|integration');
  process.exit(2);
}

const files = fs.readdirSync(testsDir)
  .filter((name) => /^.*\.test\.js$/.test(name))
  .sort();

const isIntegration = (name) =>
  /^ui-/.test(name) ||
  /^lan-/.test(name) ||
  /^network-/.test(name) ||
  name === 'class-access.test.js' ||
  name === 'static-files.test.js';

const selected = files.filter((name) =>
  mode === 'integration' ? isIntegration(name) : !isIntegration(name));

if (selected.length === 0) {
  console.log(`Нет тестов категории "${mode}".`);
  process.exit(0);
}

console.log(`Запуск ${selected.length} тестов категории "${mode}": ${selected.join(', ')}`);

const result = spawnSync(
  process.execPath,
  ['--test', ...selected.map((name) => `tests/${name}`)],
  { cwd: root, stdio: 'inherit' }
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status == null ? 1 : result.status);