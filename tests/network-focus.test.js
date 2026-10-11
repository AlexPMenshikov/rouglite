const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.listeners = {};
    MockWebSocket.lastConnection = this;
  }

  addEventListener(type, callback) {
    this.listeners[type] = callback;
  }

  send() {}

  emit(type, event) {
    if (type === 'open') this.readyState = MockWebSocket.OPEN;
    this.listeners[type](event);
  }
}

MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;

test('host camera focus stays on the host while a guest is the active player', () => {
  const sandbox = {
    WebSocket: MockWebSocket,
    location: { protocol: 'http:', host: 'localhost' },
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {},
    },
    RK: {
      Meta: { data: {} },
      UI: {
        networkStatus() {},
        networkPlayers() {},
        showLobby() {},
      },
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(projectRoot, 'js', 'network.js'), 'utf8'),
    sandbox,
    { filename: 'network.js' },
  );

  sandbox.RK.Network.createRoom('Host');
  const socket = MockWebSocket.lastConnection;
  socket.emit('open');
  socket.emit('message', {
    data: JSON.stringify({
      type: 'room-created',
      room: 'ABCD',
      playerId: 'host-id',
      token: 'session-token',
      host: true,
      players: [],
    }),
  });

  const host = { id: 'host-id', x: 4, y: 7 };
  const guest = { id: 'guest-id', x: 20, y: 15 };
  sandbox.RK.GAME = { players: [host, guest], player: guest };

  assert.equal(sandbox.RK.Network.isHost(), true);
  assert.equal(sandbox.RK.Network.focusPlayer(), host);
});

test('render keeps the host viewport and visibility during a guest turn', () => {
  const context = new Proxy({}, {
    get(_target, property) {
      if (property === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
  });
  const canvas = {
    width: 0,
    height: 0,
    getContext() { return context; },
  };
  const sandbox = {
    document: {
      getElementById() { return canvas; },
      createElement() { return { ...canvas }; },
    },
    performance: { now: () => 0 },
    RK: {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const file of ['config.js']) {
    vm.runInContext(
      fs.readFileSync(path.join(projectRoot, 'js', file), 'utf8'),
      sandbox,
      { filename: file },
    );
  }

  const host = { id: 'host-id', x: 4, y: 7 };
  const guest = { id: 'guest-id', x: 20, y: 15 };
  const map = {
    h: 1,
    w: 2,
    vis: [[false, true]],
    explored: [[true, true]],
    tiles: [[1, 1]],
    zones: [],
    blood: [],
    torches: [],
    doors: [],
    chests: [],
    stair: { x: 0, y: 0 },
  };
  const renderedVisibility = [];
  let visibilityPlayer;
  sandbox.RK.Map = map;
  sandbox.RK.GAME = {
    player: guest,
    players: [host, guest],
    enemies: [],
    items: [],
    floor: 1,
  };
  sandbox.RK.Network = { focusPlayer: () => host };
  sandbox.RK.Combat = { getDrawPos: () => guest };
  sandbox.RK.Fov = {
    computeVisibility(x, y) {
      visibilityPlayer = { x, y };
      return [[true, false]];
    },
  };
  sandbox.RK.Assets = {
    floorGrayAmount: () => 0,
    drawFloorTile(_context, _floor, _tile, visible) {
      renderedVisibility.push(visible);
    },
    draw() { return true; },
  };
  sandbox.RK.Items = { RARITY_COLORS: {} };
  sandbox.RK.Entities = { DEFS: {} };
  sandbox.RK.Effects = { draw() {} };

  vm.runInContext(
    fs.readFileSync(path.join(projectRoot, 'js', 'render.js'), 'utf8'),
    sandbox,
    { filename: 'render.js' },
  );
  sandbox.RK.Render.draw();
  assert.deepEqual(visibilityPlayer, { x: host.x, y: host.y });
  assert.deepEqual(visibilityPlayer, { x: host.x, y: host.y });
  assert.deepEqual(visibilityPlayer, { x: host.x, y: host.y });
  assert.equal(map.vis[0][0], false);
  assert.equal(map.vis[0][1], true);
  const camera = sandbox.RK.Render.getCameraOffset();
  assert.equal(camera.x, host.x + 0.5 - sandbox.RK.CONFIG.COLS / 2);
  assert.equal(camera.y, host.y + 0.5 - sandbox.RK.CONFIG.ROWS / 2);
});
