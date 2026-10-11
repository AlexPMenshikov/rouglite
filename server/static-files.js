'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
});
const PUBLIC_PATH = /^\/(?:rougelite\.html|(?:js|css|assets)\/[a-zA-Z0-9._-]+)$/;

function resolvePublicFile(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(urlPath, 'http://localhost').pathname);
  } catch {
    return null;
  }

  if (pathname === '/') pathname = '/rougelite.html';
  if (!PUBLIC_PATH.test(pathname)) return null;

  const filePath = path.resolve(ROOT, '.' + pathname);
  return filePath.startsWith(ROOT + path.sep) ? filePath : null;
}

function createStaticFileHandler() {
  return function serveStaticFile(request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
      return;
    }

    const filePath = resolvePublicFile(request.url);
    if (!filePath) {
      response.writeHead(400).end('Bad request');
      return;
    }

    fs.stat(filePath, (statError, stat) => {
      if (statError || !stat.isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }

      response.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }

      const stream = fs.createReadStream(filePath);
      stream.on('error', () => response.destroy());
      stream.pipe(response);
    });
  };
}

module.exports = { createStaticFileHandler, resolvePublicFile };
