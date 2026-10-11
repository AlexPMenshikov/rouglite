'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createStaticFileHandler, resolvePublicFile } = require('../server/static-files');

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
