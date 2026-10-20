'use strict';

// Единый источник правды для порядка загрузки скриптов.
// Браузер (rougelite.html), сервер (game-engine.js) и тесты (sandbox.js)
// импортируют списки отсюда. Порядок важен: конфиг и данные — раньше потребителей.
//
// Порядок задаётся один раз в BROWSER_SCRIPTS. Остальные списки — срезы этого
// порядка: общий файл не может оказаться в engine-списке раньше, чем в браузере.

const BROWSER_SCRIPTS = [
  'config.js',
  'rng.js',
  'map.js',
  'world.js',
  'entities.js',
  'items.js',
  'fov.js',
  'assets.js',
  'audio.js',
  'effects.js',
  'narrator.js',
  'classes.js',
  'skills.js',
  'npc.js',
  'status-defs.js',
  'statuses.js',
  'combat.js',
  'combat-snapshot.js',
  'events.js',
  'camp.js',
  'debug.js',
  'meta.js',
  'render.js',
  'input.js',
  'ui.js',
  'network.js',
  'main.js',
];

// Файлы только браузера: рендер, ввод, интерфейс, сеть, точка входа. Сервер
// подменяет их заглушками, поэтому в node:vm они не грузятся.
const BROWSER_ONLY = [
  'assets.js',
  'audio.js',
  'effects.js',
  'render.js',
  'input.js',
  'ui.js',
  'network.js',
  'main.js',
];

// Интерфейсные тесты грузят только то, что рисует экраны.
const UI_FILES = [
  'config.js',
  'rng.js',
  'entities.js',
  'items.js',
  'narrator.js',
  'classes.js',
  'skills.js',
  'npc.js',
  'status-defs.js',
  'meta.js',
  'ui.js',
];

const without = (excluded) => BROWSER_SCRIPTS.filter((file) => excluded.indexOf(file) < 0);
const only = (allowed) => BROWSER_SCRIPTS.filter((file) => allowed.indexOf(file) >= 0);

// Комната отладки есть в браузере и тестах, но не в серверном движке.
const ENGINE_SCRIPTS = without(BROWSER_ONLY.concat(['debug.js']));
const GAME_SCRIPTS = without(BROWSER_ONLY);
const UI_SCRIPTS = only(UI_FILES);

// Обратная совместимость: старые экспорты, если кто-то реквайрит файл напрямую.
const SERVER_SCRIPTS = ENGINE_SCRIPTS;

module.exports = {
  BROWSER_SCRIPTS,
  ENGINE_SCRIPTS,
  GAME_SCRIPTS,
  UI_SCRIPTS,
  SERVER_SCRIPTS,
};
