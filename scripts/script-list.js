'use strict';

// Единый источник правды для порядка загрузки скриптов.
// Браузер (rougelite.html), сервер (game-engine.js) и тесты (sandbox.js)
// импортируют списки отсюда. Порядок важен: конфиг и данные — раньше потребителей.

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
  'npc.js',
  'combat.js',
  'debug.js',
  'meta.js',
  'render.js',
  'input.js',
  'ui.js',
  'network.js',
  'main.js',
];

const ENGINE_SCRIPTS = [
  'config.js',
  'rng.js',
  'map.js',
  'world.js',
  'entities.js',
  'items.js',
  'fov.js',
  'narrator.js',
  'classes.js',
  'npc.js',
  'meta.js',
  'combat.js',
];

const GAME_SCRIPTS = [
  'config.js',
  'rng.js',
  'map.js',
  'world.js',
  'entities.js',
  'items.js',
  'fov.js',
  'classes.js',
  'meta.js',
  'narrator.js',
  'npc.js',
  'combat.js',
  'debug.js',
];

const UI_SCRIPTS = [
  'config.js',
  'rng.js',
  'entities.js',
  'items.js',
  'narrator.js',
  'classes.js',
  'npc.js',
  'meta.js',
  'ui.js',
];

// Обратная совместимость: старые экспорты, если кто-то реквайрит файл напрямую.
const SERVER_SCRIPTS = ENGINE_SCRIPTS;

module.exports = {
  BROWSER_SCRIPTS,
  ENGINE_SCRIPTS,
  GAME_SCRIPTS,
  UI_SCRIPTS,
  SERVER_SCRIPTS,
};