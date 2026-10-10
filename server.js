'use strict';

const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { WebSocketServer } = require('ws');
const { RoomManager } = require('./server/room-manager');

const ROOT = __dirname;
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function resolvePublicFile(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(urlPath, 'http://localhost').pathname);
  } catch {
    return null;
  }
  if (pathname === '/') pathname = '/rougelite.html';
  if (!/^\/(?:rougelite\.html|(?:js|css|assets)\/[a-zA-Z0-9._-]+)$/.test(pathname)) return null;
  const filePath = path.resolve(ROOT, '.' + pathname);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) return null;
  return filePath;
}

function createLanServer() {
  const httpServer = http.createServer((request, response) => {
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
      } else {
        fs.createReadStream(filePath).pipe(response);
      }
    });
  });
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 8 * 1024 * 1024,
  });
  const rooms = new RoomManager();

  httpServer.on('upgrade', (request, socket, head) => {
    if (request.url !== '/ws') {
      socket.destroy();
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, (client) => {
      webSocketServer.emit('connection', client, request);
    });
  });
  webSocketServer.on('connection', (socket) => rooms.handleConnection(socket));

  return {
    httpServer,
    webSocketServer,
    listen(port = 0, host = '0.0.0.0') {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => {
          httpServer.removeListener('error', reject);
          resolve(httpServer.address());
        });
      });
    },
    close() {
      webSocketServer.close();
      return new Promise((resolve, reject) => {
        httpServer.close((error) => error ? reject(error) : resolve());
      });
    },
  };
}

function lanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address);
    }
  }
  return addresses;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 0);
  const app = createLanServer();
  app.listen(port).then((address) => {
    const url = 'http://localhost:' + address.port;
    console.log('Roguelite LAN host is ready.');
    console.log('Host game: ' + url);
    for (const ip of lanAddresses()) {
      console.log('Players can connect: http://' + ip + ':' + address.port);
    }
    console.log('Press Ctrl+C to stop the server.');
    if (process.platform === 'win32') {
      execFile(process.env.ComSpec || 'cmd.exe', ['/c', 'start', '', url], { windowsHide: true }, (error) => {
        if (error) console.error('Open this address in your browser: ' + url);
      });
    } else if (process.env.BROWSER) {
      execFile(process.env.BROWSER, [url], { windowsHide: true });
    }
  }).catch((error) => {
    console.error('Could not start LAN host:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { createLanServer, lanAddresses, resolvePublicFile };
