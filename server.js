'use strict';

const http = require('node:http');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { WebSocketServer } = require('ws');
const { RoomManager } = require('./server/room-manager');
const { createStaticFileHandler, resolvePublicFile } = require('./server/static-files');

function createLanServer() {
  const httpServer = http.createServer(createStaticFileHandler());
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
