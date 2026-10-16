'use strict';

// Проверяет, что каждый скрипт разбирается: они подключаются <script>-тегами
// без сборщика, поэтому потерянная точка с запятой видна только в рантайме
// браузера — то есть у игрока. Файлы сервера сборщиком тоже не проходят.
// Проверка только синтаксическая: код не выполняется и опечатки в именах не
// ищутся — ошибку вида RK.Nender поймает падение или тест.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { BROWSER_SCRIPTS } = require('./script-list');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'rougelite.html'), 'utf8');
const gameScripts = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map((match) => match[1]);

if (!gameScripts.length) {
  console.error('Не найдено ни одного <script src="js/..."> в rougelite.html');
  process.exit(1);
}

// Порядок загрузки — часть контракта: скрипты рассчитывают друг на друга через
// window.RK, и перестановка ломает запуск без единой синтаксической ошибки.
// rougelite.html разбирать скриптом нельзя, поэтому эталон живёт в script-list.js,
// а эта проверка следит, чтобы страница ему соответствовала.
const expectedScripts = BROWSER_SCRIPTS.map((file) => `js/${file}`);
if (gameScripts.length !== expectedScripts.length ||
    gameScripts.some((file, index) => file !== expectedScripts[index])) {
  console.error('Порядок <script> в rougelite.html разошёлся с BROWSER_SCRIPTS.');
  console.error(`  в HTML:  ${gameScripts.join(', ')}`);
  console.error(`  эталон:  ${expectedScripts.join(', ')}`);
  console.error('Исправь один из списков: scripts/script-list.js или rougelite.html.');
  process.exit(1);
}

// Серверные и служебные файлы не подключаются <script>-тегами, поэтому
// собираем их из каталогов: новый файл больше не оказывается вне проверки.
const SERVER_FILES = fs.readdirSync(path.join(root, 'server'))
  .filter((name) => name.endsWith('.js'))
  .sort()
  .map((name) => `server/${name}`);
const TOOL_FILES = fs.readdirSync(path.join(root, 'scripts'))
  .filter((name) => name.endsWith('.js'))
  .sort()
  .map((name) => `scripts/${name}`);

// Скрипты игры рассчитывают друг на другие через window.RK и на DOM, поэтому
// достаточно пустого контекста с window.
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

for (const relative of SERVER_FILES.concat(TOOL_FILES)) {
  try {
    new vm.Script(fs.readFileSync(path.join(root, relative), 'utf8'), { filename: relative });
    process.stdout.write(`  ok ${relative}\n`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${relative}: ${error.message}`);
  }
}

const total = gameScripts.length + SERVER_FILES.length + TOOL_FILES.length;
if (failures) {
  console.error(`\n${failures} из ${total} файлов не разбирается.`);
  process.exit(1);
}
console.log(`\n${total} файлов разобраны без ошибок.`);
