'use strict';

const http = require('node:http');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { WebSocketServer } = require('ws');
const { RoomManager } = require('./server/room-manager');
const { createStaticFileHandler, resolvePublicFile, isAllowedOrigin } = require('./server/static-files');

const WS_PATH = '/ws';

function createLanServer({ checkOrigin = isAllowedOrigin } = {}) {
  const httpServer = http.createServer(createStaticFileHandler());
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 2 * 1024 * 1024,
    perMessageDeflate: {
      threshold: 1024,
      zlibDeflateOptions: { memLevel: 7, level: 3 },
      zlibInflateOptions: { chunkSize: 10 * 1024 },
      concurrencyLimit: 10,
    },
  });
  const rooms = new RoomManager();
  rooms.webSocketServer = webSocketServer;

  httpServer.on('upgrade', (request, socket, head) => {
    if (request.url !== WS_PATH) {
      socket.destroy();
      return;
    }
    // Проверка Origin закрывает cross-site WebSocket hijacking: без неё любая страница в браузере хоста может подключиться к комнате.
    const forwardedProto = typeof request.headers['x-forwarded-proto'] === 'string'
      ? request.headers['x-forwarded-proto'].split(',')[0].trim().toLowerCase()
      : '';
    const requestProtocol = forwardedProto === 'https' || forwardedProto === 'http'
      ? forwardedProto + ':'
      : (request.socket.encrypted ? 'https:' : 'http:');
    const forwardedHost = request.headers['x-forwarded-host'];
    const requestHost = typeof forwardedHost === 'string' ? forwardedHost.split(',')[0].trim() : request.headers.host;
    if (!checkOrigin(request.headers.origin, requestHost, requestProtocol)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, (client) => {
      webSocketServer.emit('connection', client, request);
    });
  });
  webSocketServer.on('connection', (socket) => rooms.handleConnection(socket));
  // Иначе полумёртвые соединения держат слоты комнат до системного таймаута.
  rooms.startHeartbeat();
  rooms.startSweeper();

  let closing = null;
  return {
    httpServer,
    webSocketServer,
    rooms,
    listen(port = 0, host = '0.0.0.0') {
      return new Promise((resolve, reject) => {
        const onError = (error) => {
          httpServer.removeListener('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          httpServer.removeListener('error', onError);
          resolve(httpServer.address());
        };
        httpServer.once('error', onError);
        httpServer.once('listening', onListening);
        httpServer.listen(port, host);
      });
    },
    close() {
      if (closing) return closing;
      rooms.stopHeartbeat();
      rooms.stopSweeper();
      closing = new Promise((resolve, reject) => {
        const forceClose = setTimeout(() => {
          for (const client of webSocketServer.clients) client.terminate();
        }, 5000);
        if (forceClose.unref) forceClose.unref();
        for (const client of webSocketServer.clients) {
          if (client.readyState === 1) client.close(1001, 'Server shutting down');
        }
        webSocketServer.close();
        if (!httpServer.listening) {
          clearTimeout(forceClose);
          resolve();
          return;
        }
        httpServer.close((error) => {
          clearTimeout(forceClose);
          if (error) reject(error);
          else resolve();
        });
      });
      return closing;
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
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(signal + ' received; shutting down gracefully.');
    app.close().then(() => { process.exitCode = 0; }).catch((error) => {
      console.error('Error during shutdown:', error.message);
      process.exitCode = 1;
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
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
