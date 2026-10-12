'use strict';

// Проверяет, что каждый скрипт разбирается. Скрипты игры подключаются
// <script>-тегами без сборщика, поэтому потерянная точка с запятой или
// незакрытая скобка видны только в рантайме браузера — то есть у игрока.
// Сюда же входят файлы сервера: они не проходят через сборщик тоже.
//
// Проверка только синтаксическая: код не выполняется и опечатки в именах не
// ищутся. Ошибку вида RK.Nender разбор не заметит — её поймает падение или
// тест, обращающийся к этому символу.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'rougelite.html'), 'utf8');
const gameScripts = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map((match) => match[1]);

if (!gameScripts.length) {
  console.error('Не найдено ни одного <script src="js/..."> в rougelite.html');
  process.exit(1);
}

const SERVER_SCRIPTS = ['server.js', 'server/room-manager.js', 'server/static-files.js'];

// Скрипты игры рассчитывают друг на друга через window.RK и подписываются на DOM,
// поэтому для проверки синтаксиса достаточно пустого контекста с window.
const sandbox = { window: null };
sandbox.window = sandbox;
vm.createContext(sandbox);

let failures = 0;

for (const relative of gameScripts) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  try {
    new vm.Script(source, { filename: relative });
    process.stdout.write(`  ok ${relative}\n`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${relative}: ${error.message}`);
  }
}

// Файлы сервера — обычные CommonJS-модули, их достаточно разобрать компилятором.
for (const relative of SERVER_SCRIPTS) {
  try {
    new vm.Script(fs.readFileSync(path.join(root, relative), 'utf8'), { filename: relative });
    process.stdout.write(`  ok ${relative}\n`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${relative}: ${error.message}`);
  }
}

const total = gameScripts.length + SERVER_SCRIPTS.length;
if (failures) {
  console.error(`\n${failures} из ${total} файлов не разбирается.`);
  process.exit(1);
}
console.log(`\n${total} файлов разобраны без ошибок.`);
