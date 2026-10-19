const assert = require('node:assert/strict');
const test = require('node:test');

const { MockWebSocket, createNetworkSandbox, createRenderSandbox, createSandbox } = require('./helpers/sandbox');

test('the room list from the server reaches the menu as-is', () => {
  const { sandbox } = createNetworkSandbox();
  const shown = [];
  sandbox.RK.UI.networkRooms = (rooms) => shown.push(rooms);

  sandbox.RK.Network.refreshRooms();
  const socket = MockWebSocket.lastConnection;
  socket.emit('open');
  socket.emit('message', {
    data: JSON.stringify({
      type: 'rooms',
      rooms: [{
        code: 'ABC123',
        started: false,
        capacity: 4,
        players: [{ name: 'Хост', host: true, connected: true }],
      }],
    }),
  });

  assert.equal(shown.length, 1);
  assert.equal(shown[0][0].code, 'ABC123');
  assert.equal(shown[0][0].players[0].name, 'Хост');
});

test('a turn snapshot shows the party log and opens the screen for the actor only', () => {
  const { sandbox } = createNetworkSandbox();
  const seen = [];
  sandbox.RK.UI.msg = (text) => seen.push(text);
  sandbox.RK.UI.narratorMsg = (text) => seen.push('narrator: ' + text);
  sandbox.RK.UI.showMerchant = () => seen.push('экран торговца');
  sandbox.RK.UI.showBlacksmith = () => seen.push('экран кузнеца');
  const applied = [];
  sandbox.RK.Combat = { applySnapshot: (state, id) => applied.push([state.game.turn, id]) };
  sandbox.RK.Render = { draw() {} };

  sandbox.RK.Network.joinRoom('ABC123', 'Гость');
  const socket = MockWebSocket.lastConnection;
  socket.emit('open');
  socket.emit('message', {
    data: JSON.stringify({
      type: 'joined',
      room: 'ABC123',
      playerId: 'guest-1',
      token: 'tok',
      players: [],
      state: null,
    }),
  });

  const snapshot = { game: { turn: 0 }, map: { w: 1 } };
  socket.emit('message', {
    data: JSON.stringify({
      type: 'state',
      turn: 1,
      actor: 'guest-1',
      state: snapshot,
      log: [{ text: 'Вы бьёте Крысу на 7' }, { text: 'Ярочь: +3 HP', narrator: true }],
      screen: { playerId: 'host-1', name: 'merchant' },
    }),
  });

  assert.deepEqual(seen, ['Вы бьёте Крысу на 7', 'narrator: Ярочь: +3 HP']);
  assert.deepEqual(applied, [[0, 'guest-1']]);
  assert.equal(seen.includes('экран торговца'), false, 'чужой экран открывать нельзя');

  seen.length = 0;
  socket.emit('message', {
    data: JSON.stringify({
      type: 'state',
      turn: 2,
      actor: 'guest-1',
      state: { game: { turn: 1 }, map: { w: 1 } },
      screen: { playerId: 'guest-1', name: 'merchant' },
    }),
  });
  assert.deepEqual(seen, ['экран торговца']);
});

test('battle effects from the server are replayed on the client', () => {
  const { sandbox } = createNetworkSandbox();
  const calls = [];
  sandbox.RK.Combat = { applySnapshot: () => true };
  sandbox.RK.Render = { draw() {} };
  sandbox.RK.Effects = {
    add: (...args) => calls.push(['add', ...args]),
    addDamage: (...args) => calls.push(['addDamage', ...args]),
    addShot: (...args) => calls.push(['addShot', ...args]),
    addFireball: (...args) => calls.push(['addFireball', ...args]),
    addLightning: (...args) => calls.push(['addLightning', ...args]),
    notePlayerHit: (...args) => calls.push(['notePlayerHit', ...args]),
    draw() {},
    tick() {},
    active: () => false,
  };

  sandbox.RK.Network.joinRoom('ABC123', 'Гость');
  const socket = MockWebSocket.lastConnection;
  socket.emit('open');
  socket.emit('message', {
    data: JSON.stringify({
      type: 'joined', room: 'ABC123', playerId: 'guest-1', token: 'tok', players: [], state: null,
    }),
  });
  socket.emit('message', {
    data: JSON.stringify({
      type: 'state',
      turn: 3,
      actor: 'guest-1',
      state: { game: { turn: 3 }, map: { w: 1 } },
      effects: [
        ['addFireball', 1, 1, 3, 4, { life: 280 }],
        ['addDamage', 3, 4, 12, '#ffcc66'],
        ['draw', 1, 2],
        ['не метод', 1],
      ],
    }),
  });

  assert.deepEqual(calls.map((entry) => entry[0]), ['addFireball', 'addDamage'],
    'проигрываются только известные эффекты');
  assert.deepEqual(calls[0].slice(0, 5), ['addFireball', 1, 1, 3, 4], 'аргументы доходят как есть');
  assert.equal(calls[0][5].life, 280, 'настройки эффекта едут как есть');
});

test('a disconnected room session schedules automatic token resume with backoff', () => {
  const { sandbox } = createNetworkSandbox();
  sandbox.RK.Network.joinRoom('ABCD', 'Гость');
  const first = MockWebSocket.lastConnection;
  first.emit('open');
  first.emit('message', { data: JSON.stringify({
    type: 'joined', room: 'ABCD', playerId: 'guest-1', token: 'tok', players: [], state: null,
  }) });

  first.emit('close', { code: 1006 });
  assert.equal(typeof sandbox.pendingTimeout, 'function', 'a retry is scheduled');
  sandbox.pendingTimeout();
  const second = MockWebSocket.lastConnection;
  assert.notEqual(second, first, 'automatic resume opens a new socket');
  assert.match(second.url, /\/ws$/);
  assert.equal(sandbox.RK.Network.room(), 'ABCD');
});

test('a player in a room gets a fresh connection instead of reusing its old one', () => {
  const { sandbox } = createNetworkSandbox();
  sandbox.RK.Network.joinRoom('ABCD', 'Гость');
  const first = MockWebSocket.lastConnection;
  first.emit('open');
  first.emit('message', {
    data: JSON.stringify({
      type: 'joined',
      room: 'ABCD',
      playerId: 'guest-1',
      token: 'tok',
      players: [],
      state: null,
    }),
  });
  assert.equal(sandbox.RK.Network.inRoom(), true);

  sandbox.RK.Network.joinRoom('WXYZ', 'Гость');
  const second = MockWebSocket.lastConnection;
  assert.notEqual(second, first, 'одним соединением нельзя вступить в две комнаты');
  second.emit('open');
  assert.equal(sandbox.RK.Network.room(), 'WXYZ');
  assert.equal(sandbox.RK.Network.inRoom(), false, 'до ответа сервера игрок ещё не в комнате');
});

test('every client watches its own hero: the snapshot picks it out of the shared party', () => {
  const source = createSandbox({ seed: 7 }).sandbox.RK;
  source.Combat.newRun({ size: 'compact', style: 'stone' });
  source.Combat.addNetworkPlayer('guest-1', 'Гость', 'archer');
  const snapshot = source.Combat.createSnapshot();

  for (const id of ['local', 'guest-1']) {
    const client = createSandbox({ seed: 7 }).sandbox.RK;
    assert.equal(client.Combat.applySnapshot(snapshot, id), true);
    assert.equal(client.GAME.player.id, id);
    assert.equal(client.GAME.players.length, 2);
  }
});

test('a snapshot step moves the hero one tile smoothly instead of teleporting', () => {
  const { sandbox } = createSandbox({ seed: 11 });
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  RK.GAME.enemies = [];
  const from = { x: RK.GAME.player.x, y: RK.GAME.player.y };

  const snapshot = RK.Combat.createSnapshot();
  snapshot.game.players[0].x = from.x + 1;
  RK.Combat.applySnapshot(snapshot, 'local');

  assert.equal(RK.Combat.busy(), true, 'шаг должен анимироваться');
  const start = RK.Combat.getDrawPos();
  assert.equal(start.x, from.x);
  assert.equal(start.y, from.y);
  RK.Combat.tickWalk(Infinity);
  assert.equal(RK.Combat.busy(), false);
  const end = RK.Combat.getDrawPos();
  assert.equal(end.x, from.x + 1);
  assert.equal(end.y, from.y);
});

test('render keeps the viewer viewport and recomputes visibility for the local hero', () => {
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
  // Снимок из сети несёт обзор того, кто ходил на сервере, поэтому клиент
  // обязан пересчитать видимость от своего героя, а не рисовать чужую.
  sandbox.RK.GAME = {
    player: host,
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
    npcs: [{ id: 'merchant', kind: 'merchant', x: 1, y: 0 }],
  };
  sandbox.RK.Combat = { getDrawPos: () => ({ x: host.x, y: host.y }) };
  sandbox.RK.Fov = {
    computeVisibility(x, y) {
      visibilityPlayer = { x, y };
      return [[false, true]];
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
  const camera = sandbox.RK.Render.getCameraOffset();
  assert.equal(camera.x, host.x + 0.5 - sandbox.RK.CONFIG.COLS / 2);
  assert.equal(camera.y, host.y + 0.5 - sandbox.RK.CONFIG.ROWS / 2);
  assert.equal(sandbox.RK.Render.getHoverInfo({ x: 1, y: 0 }), 'Крыса\nHP: 7/12\nУрон: 4');
  assert.equal(sandbox.RK.Render.getHoverInfo({ x: 0, y: 0 }), '');
  map.vis[0][0] = true;
  assert.equal(sandbox.RK.Render.getHoverInfo({ x: 0, y: 0 }), 'Дверь — E: взаимодействовать');
  map.chests = [];
  sandbox.RK.GAME.enemies[0].alive = false;
  assert.equal(sandbox.RK.Render.getHoverInfo({ x: 1, y: 0 }),
    'Странствующий торговец — E: торговля');
});

test('the drawn visibility lands back in RK.Map so hover tooltips work in a network client', () => {
  const { sandbox } = createRenderSandbox();

  const hero = { id: 'local', x: 4, y: 7 };
  // Снимок из сети несёт пустой map.vis: обзор считает клиент при отрисовке.
  const map = {
    h: 1,
    w: 2,
    vis: [[false, false]],
    explored: [[true, true]],
    tiles: [[1, 1]],
    zones: [],
    blood: [],
    torches: [],
    doors: [],
    chests: [],
    stair: null,
  };
  sandbox.RK.Map = map;
  sandbox.RK.GAME = {
    player: hero,
    players: [hero],
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
    npcs: [],
  };
  sandbox.RK.Combat = { getDrawPos: () => ({ x: hero.x, y: hero.y }) };
  sandbox.RK.Fov = { computeVisibility: () => [[false, true]] };
  sandbox.RK.Assets = {
    floorGrayAmount: () => 0,
    drawFloorTile() {},
    draw() { return true; },
  };
  sandbox.RK.Items = { RARITY_COLORS: {} };
  sandbox.RK.Entities = { DEFS: {} };
  sandbox.RK.Effects = { draw() {} };
  sandbox.RK.MapGen = { getTrapAt: () => null };

  assert.equal(sandbox.RK.Render.getHoverInfo({ x: 1, y: 0 }), '',
    'с пустым vis из снимка наведение ещё пусто');

  sandbox.RK.Render.draw();

  assert.equal(sandbox.RK.Map.vis[0][1], true,
    'кадр кладёт пересчитанный обзор обратно в RK.Map');
  assert.equal(sandbox.RK.Render.getHoverInfo({ x: 1, y: 0 }), 'Крыса\nHP: 7/12\nУрон: 4',
    'после кадра наведение видит врага, как в одиночной игре');
});
