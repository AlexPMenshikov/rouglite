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

// Игра не грузит ничего внешнего, поэтому политика строгая; Google Fonts
// разрешён отдельно — он подключается <link> в rougelite.html.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' ws: wss:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
});

/**
 * Origin для WebSocket-хендшейка: игра живёт в локальной сети без TLS, поэтому
 * «свой» Origin — совпадающий с запросом по схеме и хосту. Так проходят IP и
 * localhost, а страница с чужого домена, открытая в браузере хоста, отклоняется.
 */
function isAllowedOrigin(origin, requestHost, requestProtocol = 'http:') {
  if (!origin) return true; // не браузерный клиент (тесты, curl, сам хост)
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (!parsed.host || !requestHost) return false;
  if (parsed.protocol.toLowerCase() !== requestProtocol.toLowerCase()) return false;
  return parsed.host.toLowerCase() === String(requestHost).toLowerCase();
}

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
        ...SECURITY_HEADERS,
        'Content-Length': stat.size,
        'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
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

module.exports = { createStaticFileHandler, resolvePublicFile, isAllowedOrigin };
