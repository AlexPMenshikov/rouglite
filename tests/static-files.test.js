'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createStaticFileHandler, resolvePublicFile, isAllowedOrigin } = require('../server/static-files');

// Раскладка игрового экрана задана разметкой: журнал боя убран на экран
// настроек и лежит внизу, а игровое поле занимает всю ширину. HP/золото/опыт/
// ключи — в окне персонажа. Стабы DOM не видят настоящий HTML, поэтому
// расположение блоков проверяется по файлу.
const page = fs.readFileSync(path.join(__dirname, '..', 'rougelite.html'), 'utf8');

function inside(markup, id) {
  const start = markup.indexOf(`id="${id}"`);
  assert.notEqual(start, -1, `в разметке нет #${id}`);
  const openBefore = markup.lastIndexOf('<', start);
  const tag = markup.slice(openBefore, markup.indexOf('>', openBefore));
  const openTag = tag.lastIndexOf('<' + tag.match(/^<[a-z0-9]+/i)[0].slice(1));
  const close = markup.indexOf(`</${tag.match(/^<([a-z0-9]+)/i)[1]}>`, start);
  return { start, close, openTag };
}

function containerOf(markup, childId, parentId) {
  const parent = inside(markup, parentId);
  const child = inside(markup, childId);
  assert.ok(child.start > parent.start && child.start < parent.close,
    `#${childId} должен находиться внутри #${parentId}`);
}

test('the combat log lives at the bottom of the settings screen', () => {
  const log = inside(page, 'log-panel');
  const settings = inside(page, 'screen-settings');
  const resolution = inside(page, 'resolution-options');
  const nextScreen = inside(page, 'screen-saves');
  assert.ok(log.start > settings.start && log.start < nextScreen.start, 'журнал находится на экране настроек');
  assert.ok(resolution.start < log.start, 'журнал ниже настроек чёткости');
  assert.ok(inside(page, 'log').close < log.close, 'журнал внутри своей панели');
  assert.ok(page.includes('id="btn-log-toggle"'), 'у панели есть кнопка сворачивания');
  assert.ok(page.includes('DEBUG'), 'переключатель подробного лога остался у журнала');
  // Игровое поле больше не делит место с журналом.
  const body = inside(page, 'game-body');
  assert.ok(!(log.start > body.start && log.start < body.close), 'журнал убран с игрового экрана');
});

test('hp, gold, keys and xp are shown in the character panel', () => {
  for (const id of ['stat-hp', 'bar-hp-fill', 'stat-gold', 'stat-keys', 'stat-xp', 'bar-xp-fill']) {
    containerOf(page, id, 'stats-panel');
  }
  for (const id of ['stat-hp', 'stat-gold', 'stat-keys']) {
    assert.equal(inside(page, 'hud').close, inside(page, 'hud').close);
    assert.ok(inside(page, id).start > inside(page, 'hud').close,
      `#${id} не должен оставаться в верхней панели`);
  }
});

test('the menu provides the single-player start control required by ui.js', () => {
  assert.ok(page.includes('id="btn-play"'), 'single-player start button exists in the markup');
});

test('every button in the page keeps its label in the markup for ui.js to decorate', () => {
  // ui.js разбирает кнопки из разметки на иконку и подпись, поэтому текст
  // должен лежать прямо в кнопке. Кнопку журнала ui.js наполняет сам — она
  // сворачивает сама себя, и подпись в разметке была бы только дублем.
  const buttons = page.match(/<button[^>]*>[^<]*<\/button>/g) || [];
  const empty = buttons.filter((button) => {
    const body = button.replace(/<button[^>]*>/, '').replace(/<\/button>/, '').trim();
    return body.length === 0 && !button.includes('id="btn-log-toggle"');
  });
  assert.deepEqual(empty, [], 'кнопки без собственного текста');
});

test('static file resolver serves only explicit public roots', () => {
  assert.match(resolvePublicFile('/'), /rougelite\.html$/);
  assert.match(resolvePublicFile('/js/main.js?v=1'), /js[\\/]main\.js$/);
  assert.equal(resolvePublicFile('/server.js'), null);
  assert.equal(resolvePublicFile('/js/%2e%2e/server.js'), null);
  assert.equal(resolvePublicFile('/js/%252e%252e%252fserver.js'), null);
  assert.equal(resolvePublicFile('/%E0%A4%A'), null);
});

test('static file handler supports HEAD and rejects unsupported methods', async (t) => {
  const http = require('node:http');
  const server = http.createServer(createStaticFileHandler());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const head = await fetch(`${base}/rougelite.html`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.ok(Number(head.headers.get('content-length')) > 0);
  assert.equal(await head.text(), '');
const post = await fetch(`${base}/rougelite.html`, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});

test('responses carry hardening headers and a restrictive policy', async (t) => {
  const http = require('node:http');
  const server = http.createServer(createStaticFileHandler());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${base}/rougelite.html`);
  // Тело нужно дочитать: иначе соединение держится и закрытие сервера ждёт
  // таймаут keep-alive.
  await response.text();
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  const policy = response.headers.get('content-security-policy');
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /object-src 'none'/);
});

test('websocket origin check accepts same-host clients and rejects foreign pages', () => {
  // Клиент без Origin (тесты, curl, сам хост) допускается.
  assert.equal(isAllowedOrigin(undefined, '192.168.0.5:8080'), true);

  // Своя страница игры, открытая по IP или по localhost.
  assert.equal(isAllowedOrigin('http://192.168.0.5:8080', '192.168.0.5:8080'), true);
  assert.equal(isAllowedOrigin('http://localhost:8080', 'localhost:8080'), true);
  assert.equal(isAllowedOrigin('http://LOCALHOST:8080', 'localhost:8080'), true);

  // Чужая страница, открытая в браузере хоста, — это cross-site hijacking.
  assert.equal(isAllowedOrigin('http://evil.example', '192.168.0.5:8080'), false);
  assert.equal(isAllowedOrigin('http://localhost:9999', 'localhost:8080'), false);
  assert.equal(isAllowedOrigin('https://192.168.0.5:8080', '192.168.0.5:8080'), false);
  assert.equal(isAllowedOrigin('https://game.example', 'game.example', 'https:'), true);
  assert.equal(isAllowedOrigin('http://game.example', 'game.example', 'https:'), false);
  assert.equal(isAllowedOrigin('not-a-url', '192.168.0.5:8080'), false);
});
