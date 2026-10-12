const assert = require('node:assert/strict');
const test = require('node:test');

const { MockWebSocket, createNetworkSandbox, createRenderSandbox } = require('./helpers/sandbox');

test('host camera focus stays on the host while a guest is the active player', () => {
  const { sandbox } = createNetworkSandbox();

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
  const { sandbox } = createRenderSandbox();

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
    doors: [{ x: 0, y: 0 }],
    chests: [{ x: 1, y: 0 }],
    stair: { x: 0, y: 0 },
  };
  let visibilityPlayer;
  sandbox.RK.Map = map;
  sandbox.RK.GAME = {
    player: guest,
    players: [host, guest],
    enemies: [{
      type: 'rat',
      name: 'Крыса',
      x: 1,
      y: 0,
      alive: true,
      hp: 7,
      maxHp: 12,
      atk: 4,
    }],
    items: [],
    floor: 1,
    merchant: { x: 1, y: 0 },
  };
  sandbox.RK.Network = { focusPlayer: () => host };
  sandbox.RK.Combat = { getDrawPos: () => guest };
  // Видимость считается от хоста, а не от активного игрока: Fov запоминает, для
  // кого пересчитали, и render.js обязан брать именно эту точку.
  sandbox.RK.Fov = {
    computeVisibility(x, y) {
      visibilityPlayer = { x, y };
      return [[true, false]];
    },
  };
  sandbox.RK.Assets = {
    floorGrayAmount: () => 0,
    drawFloorTile() {},
    draw() { return true; },
  };
  sandbox.RK.Items = { RARITY_COLORS: {} };
  sandbox.RK.Entities = { DEFS: {} };
  sandbox.RK.Effects = { draw() {} };

  sandbox.RK.Render.draw();
  assert.deepEqual(visibilityPlayer, { x: host.x, y: host.y });
  assert.equal(map.vis[0][0], false);
  assert.equal(map.vis[0][1], true);
  const camera = sandbox.RK.Render.getCameraOffset();
  assert.equal(camera.x, host.x + 0.5 - sandbox.RK.CONFIG.COLS / 2);
  assert.equal(camera.y, host.y + 0.5 - sandbox.RK.CONFIG.ROWS / 2);
  assert.equal(sandbox.RK.Render.getHoverInfo({ x: 1, y: 0 }), 'Крыса\nHP: 7/12\nУрон: 4');
  assert.equal(sandbox.RK.Render.getHoverInfo({ x: 0, y: 0 }), '');
  map.vis[0][0] = true;
  assert.equal(sandbox.RK.Render.getHoverInfo({ x: 0, y: 0 }), 'Дверь — E: взаимодействовать');
  map.chests = [];
  sandbox.RK.GAME.enemies[0].alive = false;
  assert.equal(sandbox.RK.Render.getHoverInfo({ x: 1, y: 0 }), 'Торговец — E: торговля');
});
