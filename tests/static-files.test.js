'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createStaticFileHandler, resolvePublicFile, isAllowedOrigin } = require('../server/static-files');

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
  assert.equal(isAllowedOrigin('not-a-url', '192.168.0.5:8080'), false);
});
