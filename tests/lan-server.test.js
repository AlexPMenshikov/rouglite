const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { RoomManager, MAX_PLAYERS, ACTION_RULES } = require('../server/room-manager');
const { createLanServer } = require('../server');
const { createSandbox } = require('./helpers/sandbox');

const runStore = require('../server/run-store');

// Каталог забегов на время теста: реальный data/runs трогать нельзя.
const previousRunsDir = process.env.RUNS_DIR;
const testRunsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouglite-runs-'));
process.env.RUNS_DIR = testRunsDir;
test.after(() => {
  if (previousRunsDir === undefined) delete process.env.RUNS_DIR;
  else process.env.RUNS_DIR = previousRunsDir;
  fs.rmSync(testRunsDir, { recursive: true, force: true });
});

class MockSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.messages = [];
  }

  send(data) {
    this.messages.push(JSON.parse(data));
  }

  ping() {
    this.pingCount = (this.pingCount || 0) + 1;
  }

  terminate() {
    this.readyState = 3;
    this.terminated = true;
  }

  close() {
    this.readyState = 3;
    this.emit('close');
  }

  request(message) {
    this.emit('message', Buffer.from(JSON.stringify(message)));
  }

  last(type) {
    return this.messages.filter((message) => message.type === type).at(-1);
  }
}

function connect(manager) {
  const socket = new MockSocket();
  manager.handleConnection(socket);
  return socket;
}

// Сервер считает забег в своём процессе, поэтому снимок приходит через очередь
// задач: тест ждёт его, а не читает сокет сразу после отправки действия.
function waitForState(socket, count = 1) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 10000;
    const poll = () => {
      const states = socket.messages
        .filter((message) => message.type === 'state')
        .map((message) => message.state);
      if (states.length >= count) return resolve(states);
      if (Date.now() > deadline) return reject(new Error('снимок не пришёл'));
      setTimeout(poll, 5);
    };
    poll();
  });
}

function startRoom(manager, host, options = { size: 'compact', style: 'stone' }) {
  host.request({ type: 'start', options });
  return waitForState(host);
}

// Автопроход публикует снимок на каждый шаг, поэтому «действие кончилось» — это
// не «снимок пришёл», а «снимки перестали приходить».
function waitForSettledStates(socket, from = 0, stabilityMs = 500, deadlineMs = 20000) {
  const count = () => socket.messages.filter((message) => message.type === 'state').length;
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + deadlineMs;
    let stableSince = null;
    let lastCount = count();
    const poll = () => {
      const current = count();
      if (current > from) {
        if (stableSince === null || current !== lastCount) {
          stableSince = Date.now();
          lastCount = current;
        } else if (Date.now() - stableSince >= stabilityMs) {
          return resolve(socket.messages.filter((message) => message.type === 'state').map((m) => m.state));
        }
      }
      if (Date.now() > deadline) return reject(new Error('забег не успокоился'));
      setTimeout(poll, 10);
    };
    poll();
  });
}

// Каждое действие проходит две таблицы: ACTION_RULES на сервере проверяет
// аргументы, ACTION_HANDLERS в combat.js исполняет. Правило без обработчика
// пропускает запрос в пустоту, а обработчик без правила отвергает рабочее
// действие — расхождение ловится только здесь, потому что таблицы живут в
// разных файлах.
function actionHandlerNames() {
  const { sandbox } = createSandbox({});
  return new Set(Object.keys(sandbox.RK.Combat.actionHandlers()));
}

test('every accepted action has a handler, and every handler a rule', () => {
  const handled = actionHandlerNames();
  const accepted = new Set(Object.keys(ACTION_RULES));

  for (const name of accepted) {
    assert.ok(handled.has(name), `правило для '${name}' есть, а обработчика нет`);
  }
  for (const name of handled) {
    assert.ok(accepted.has(name), `обработчик '${name}' есть, а правила нет`);
  }
});

test('action aliases share the rule of their canonical action', () => {
  // Псевдоним принимает ровно те же аргументы, иначе клиент прошлой версии
  // упёрся бы в отказ там, где раньше проходил.
  const groups = [
    ['storeInWarehouse', ['storeItem', 'guildStore']],
    ['templeHeal', ['heal', 'applyTempleHeal']],
    ['templeBlessing', ['applyBlessing', 'blessing', 'applyTempleBlessing']],
  ];
  for (const [canonical, aliases] of groups) {
    for (const alias of aliases) {
      assert.equal(ACTION_RULES[alias], ACTION_RULES[canonical],
        `${alias} должен проверяться тем же правилом, что и ${canonical}`);
    }
  }
});

test('ACTION_RULES has no prototype, so a fake action name cannot pass', () => {
  assert.equal(Object.getPrototypeOf(ACTION_RULES), null);
  assert.ok(!Object.prototype.hasOwnProperty.call(ACTION_RULES, 'constructor'));
  assert.ok(!Object.prototype.hasOwnProperty.call(ACTION_RULES, 'toString'));
});

function heroFrom(state, id) {
  return state.game.players.find((player) => player.id === id);
}

// Матрицы карты едут в снимке сжатыми (map.matrices), а разворачивает их
// клиент в applySnapshot. Тесты ходят по снимку напрямую, поэтому распаковывают
// сами — тем же кодом, что и движок.
function tilesFrom(state) {
  const raw = state.map.tiles;
  if (raw) return raw;
  return (state.map.matrices.tiles || []).map((runs) => {
    const row = [];
    for (let i = 0; i < runs.length; i += 2) {
      for (let k = 0; k < runs[i + 1]; k++) row.push(runs[i]);
    }
    return row;
  });
}

// Свободная соседняя клетка по правилам tryStep: пол, без закрытой двери,
// сундука, врага и другого участника партии.
function freeStep(state, hero) {
  const tiles = tilesFrom(state);
  const blocked = (x, y) => {
    const row = tiles[y];
    if (!row || row[x] !== 1) return true;
    if ((state.map.doors || []).some((door) => door.x === x && door.y === y &&
        door.state !== 'open' && door.state !== 'broken')) return true;
    if ((state.map.chests || []).some((chest) => chest.x === x && chest.y === y &&
        chest.state !== 'open' && chest.state !== 'broken')) return true;
    return state.game.enemies.some((enemy) => enemy.alive && enemy.x === x && enemy.y === y) ||
      state.game.players.some((player) => player.hp > 0 && player.x === x && player.y === y);
  };
  const step = [[0, 1], [1, 0], [0, -1], [-1, 0]].find(([dx, dy]) => !blocked(hero.x + dx, hero.y + dy));
  assert.ok(step, 'у героя нет свободной соседней клетки');
  return step;
}

// Путь по снимку до клетки: тот же граф, что видит движок, поэтому обход не
// зависит от внутренностей карты. Враги путь не блокируют: шаг в клетку с врагом
// превращается в удар, и герой проходит дальше, когда тот падает.
function pathTo(state, from, to, heroId) {
  const width = state.map.w;
  const height = state.map.h;
  const tiles = tilesFrom(state);
  const blocked = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return true;
    if (tiles[y][x] !== 1) return true;
    if ((state.map.doors || []).some((door) => door.x === x && door.y === y &&
        door.state !== 'open' && door.state !== 'broken')) return true;
    if ((state.map.chests || []).some((chest) => chest.x === x && chest.y === y &&
        chest.state !== 'open' && chest.state !== 'broken')) return true;
    // Соседа по партии нельзя занимать: шаг в такую клетку отклоняется без
    // снимка, и ожидание следующего зависло бы навсегда.
    return state.game.players.some((player) => player.hp > 0 &&
      player.x === x && player.y === y && player.id !== heroId);
  };
  const previous = new Map([[`${from.x},${from.y}`, null]]);
  const queue = [[from.x, from.y]];
  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === to.x && y === to.y) break;
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const key = `${x + dx},${y + dy}`;
      if (previous.has(key) || blocked(x + dx, y + dy)) continue;
      previous.set(key, [x, y]);
      queue.push([x + dx, y + dy]);
    }
  }
  if (!previous.has(`${to.x},${to.y}`)) return null;
  const path = [];
  let cursor = [to.x, to.y];
  while (cursor) {
    path.unshift(cursor);
    cursor = previous.get(`${cursor[0]},${cursor[1]}`);
  }
  return path.slice(1);
}

test('talking to an NPC in a room opens its screen for the player who asked', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const { playerId } = host.last('room-created');
  await startRoom(manager, host);

  const walkTo = async (tile) => {
    for (let step = 0; step < 400; step++) {
      const state = host.last('state').state;
      const hero = heroFrom(state, playerId);
      if (`${hero.x},${hero.y}` === `${tile.x},${tile.y}`) return;
      const path = pathTo(state, hero, tile, playerId);
      assert.ok(path && path.length, 'герой может дойти до NPC');
      const before = host.messages.filter((message) => message.type === 'state').length;
      host.request({
        type: 'action',
        action: 'tryStep',
        args: [path[0][0] - hero.x, path[0][1] - hero.y],
      });
      await waitForState(host, before + 1);
    }
    throw new Error('герой не дошёл до NPC');
  };

  // Подходим к NPC пешком по карте из снимка: забег считает сервер, клиент
  // не может поставить героя рядом с NPC напрямую.
  const talkTo = async (kind) => {
    const state = host.last('state').state;
    const npc = state.game.npcs.find((entry) => entry.kind === kind);
    assert.ok(npc, kind + ' стоит в городе');
    const hero = heroFrom(state, playerId);
    const tile = [[0, 1], [1, 0], [0, -1], [-1, 0]]
      .map(([dx, dy]) => ({ x: npc.x + dx, y: npc.y + dy }))
      .find((option) => pathTo(state, hero, option, playerId));
    assert.ok(tile, 'к ' + kind + ' можно дойти пешком');
    await walkTo(tile);
    const arrived = heroFrom(host.last('state').state, playerId);
    assert.equal(`${arrived.x},${arrived.y}`, `${tile.x},${tile.y}`, 'герой дошёл до NPC');
    const beforeTalk = host.messages.filter((message) => message.type === 'state').length;
    host.request({ type: 'action', action: 'playerAction', args: [npc.x, npc.y] });
    await waitForState(host, beforeTalk + 1);
    return host.last('state').screen;
  };

  // Ближайший собеседник открывает разговор, служебные NPC — свои экраны.
  const start = host.last('state').state;
  const heroStart = heroFrom(start, playerId);
  const nearest = start.game.npcs
    .filter((npc) => ['guard', 'priest', 'scholar'].includes(npc.kind))
    .map((npc) => ({
      npc,
      path: pathTo(start, heroStart, { x: npc.x, y: npc.y + 1 }, playerId)
        || pathTo(start, heroStart, { x: npc.x + 1, y: npc.y }, playerId),
    }))
    .filter((option) => option.path && option.path.length)
    .sort((a, b) => a.path.length - b.path.length)[0];
  assert.ok(nearest, 'до какого-то NPC можно дойти пешком');

  const screen = await talkTo(nearest.npc.kind);
  assert.equal(screen.playerId, playerId, 'экран открылся у того, кто заговорил');
  assert.equal(screen.name, 'npc');
  assert.equal(screen.npcId, nearest.npc.id, 'экран знает, с кем говорит');
  assert.equal((await talkTo('innkeeper')).name, 'tavern', 'трактирщик открывает таверну');
  assert.equal((await talkTo('ancient_guard')).name, 'guild', 'Древний страж открывает гильдию');

  // Чужой вид NPC в действии не проходит: список видов берётся из конфига.
  host.request({ type: 'action', action: 'acceptQuest', args: ['__proto__'] });
  assert.match(host.last('error').message, /Недопустимое/);
});

test('a quest is taken and handed in over the wire', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const { playerId } = host.last('room-created');
  await startRoom(manager, host);

  // Подходим к стражу пешком: только рядом с NPC забег берёт и сдаёт задание.
  const start = host.last('state').state;
  const guard = start.game.npcs.find((npc) => npc.kind === 'guard');
  assert.ok(guard, 'в городе есть страж');
  const before = start.game.quests.length;

  const stand = [[0, 1], [1, 0], [0, -1], [-1, 0]]
    .map(([dx, dy]) => ({ x: guard.x + dx, y: guard.y + dy }))
    .find((tile) => pathTo(start, heroFrom(start, playerId), tile, playerId));
  assert.ok(stand, 'к стражу можно дойти пешком');

  for (let step = 0; step < 200; step++) {
    const state = host.last('state').state;
    const hero = heroFrom(state, playerId);
    if (`${hero.x},${hero.y}` === `${stand.x},${stand.y}`) break;
    const next = pathTo(state, hero, stand, playerId);
    assert.ok(next && next.length, 'шаг к стражу найден');
    const marks = host.messages.filter((message) => message.type === 'state').length;
    host.request({
      type: 'action',
      action: 'tryStep',
      args: [next[0][0] - hero.x, next[0][1] - hero.y],
    });
    await waitForState(host, marks + 1);
  }

  const beforeTake = host.messages.filter((message) => message.type === 'state').length;
  host.request({ type: 'action', action: 'acceptQuest', args: ['guard'] });
  await waitForState(host, beforeTake + 1);
  const quests = host.last('state').state.game.quests;
  assert.equal(quests.length, before + 1, 'задание взято по сети');
  const taken = quests[quests.length - 1];
  assert.equal(taken.giver, 'guard', 'у задания есть заказчик');
  assert.ok(taken.id, 'у задания есть id для сдачи из журнала');

  // Невыполненное задание не сдаётся: ни по заказчику, ни по id из журнала.
  const beforeTurnIn = host.messages.filter((message) => message.type === 'state').length;
  host.request({ type: 'action', action: 'turnInQuest', args: ['guard'] });
  await waitForState(host, beforeTurnIn + 1);
  host.request({ type: 'action', action: 'turnInQuestAny', args: [taken.id] });
  await waitForState(host, beforeTurnIn + 2);
  const afterTurnIn = host.last('state').state.game.quests
    .find((quest) => quest.id === taken.id);
  assert.equal(afterTurnIn.completed, undefined, 'невыполненное задание не закрылось');
  assert.equal(afterTurnIn.progress, 0, 'прогресс не сдвинулся сам собой');

  host.request({ type: 'action', action: 'turnInQuestAny', args: ['x'.repeat(200)] });
  assert.match(host.last('error').message, /Недопустимое/);
});

test('an abandoned room is dropped after 20 minutes, a connected one is kept', () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const code = host.last('room-created').room;
  const guest = connect(manager);
  guest.request({ type: 'join', room: code, name: 'Guest' });

  const room = manager.rooms.get(code);
  let disposed = false;
  let saved = null;
  room.run = { dispose: () => { disposed = true; } };
  // Подметалка зовёт обработчик до освобождения забега: переживший сервер
  // забег обязан сохраниться на диск, иначе порядок вызовов его убьёт.
  manager.onIdleRoom = (target) => { saved = target.code; };

  // Все сокеты ушли, но времени ещё прошло достаточно.
  host.emit('close');
  guest.emit('close');
  room.lastActivity = Date.now() - 19 * 60 * 1000;
  manager.sweepIdleRooms();
  assert.equal(manager.rooms.has(code), true, '19 минут — комната ещё жива');
  assert.equal(disposed, false);

  room.lastActivity = Date.now() - 21 * 60 * 1000;
  manager.sweepIdleRooms();
  assert.equal(manager.rooms.has(code), false, '21 минута без игроков — комната удалена');
  assert.equal(saved, code, 'забег сохранён до освобождения');
  assert.equal(disposed, true, 'движок освобождён вместе с комнатой');
});

test('a room with a connected but silent player is not swept away', () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const code = host.last('room-created').room;

  // Игрок не прислал ни одного сообщения, но сокет открыт: комната его.
  manager.rooms.get(code).lastActivity = Date.now() - 60 * 60 * 1000;
  manager.sweepIdleRooms();
  assert.equal(manager.rooms.has(code), true, 'открытый сокет держит комнату');
});

test('a run saved on disk comes back with the same heroes after a server restart', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const created = host.last('room-created');
  const { room: code } = created;
  const guest = connect(manager);
  guest.request({ type: 'join', room: code, name: 'Guest' });

  await startRoom(manager, host);
  const hostId = created.playerId;
  const guestId = guest.last('joined').playerId;
  const [state] = host.last('state') ? [host.last('state').state] : [];
  assert.equal(state.world.current, 'city_start');

  // Забег уходит на диск при переходе локации, а не на каждом шаге.
  let next = await walkToExit(host, hostId, 'gate_north', 'city_start');
  assert.equal(next.world.current, 'wilderness_forest',
    `герой не дошёл до выхода: локация ${next.world.current}, turn ${next.game.turn}, ` +
    `герой ${heroFrom(next, hostId).x},${heroFrom(next, hostId).y}`);
  const savedPath = path.join(testRunsDir, code + '.json');
  assert.ok(fs.existsSync(savedPath), 'забег сохранён при переходе');
  const forestEnemies = next.game.enemies.length;

  // Перезапуск сервера: память очищена, на диске остался только забег.
  manager.stopHeartbeat();
  manager.stopSweeper();
  for (const socket of [host, guest]) socket.emit('close');

  const revived = new RoomManager();
  const returning = connect(revived);
  returning.request({
    type: 'reconnect',
    room: code,
    token: created.token,
    name: 'Host',
  });
  const resumed = returning.last('host-reconnected') || returning.last('joined');
  assert.ok(resumed, 'комната поднялась с диска');
  assert.equal(resumed.playerId, hostId, 'хост вернул свой герой по токену');
  assert.ok(resumed.state, 'клиент получил состояние');
  assert.equal(resumed.state.world.current, 'wilderness_forest');
  assert.equal(resumed.state.game.enemies.length, forestEnemies, 'лес восстановлен');

  // Восстановленный забег играется: герой ходит тем же забегом. Состояние после
  // переподключения приходит в ответе на reconnect, а не отдельным снимком.
  // Шаг даёт два снимка — промежуточный на анимацию и итоговый, поэтому берём
  // последний, а не первый.
  const turnBeforeStep = resumed.state.game.turn;
  const heroBefore = heroFrom(resumed.state, hostId);
  const [dx, dy] = freeStep(resumed.state, heroBefore);
  const live = revived.rooms.get(code).run.snapshot();
  const liveHero = heroFrom(live, hostId);
  assert.equal(live.game.turn, turnBeforeStep,
    `движок и файл разошлись: файл ${turnBeforeStep}, движок ${live.game.turn}`);
  assert.deepEqual([liveHero.x, liveHero.y], [heroBefore.x, heroBefore.y],
    'герой в движке на другой клетке');
  const before = returning.messages.filter((message) => message.type === 'state').length;
  returning.request({ type: 'action', action: 'tryStep', args: [dx, dy] });
  await waitForState(returning, before + 1);
  // Покадровая публикация отдаёт итоговый снимок после промежуточного, поэтому
  // ждём последний: первый приходит на середине анимации шага.
  const states = (await waitForSettledStates(returning, before + 1)).slice(before);
  const afterStep = states[states.length - 1];
  assert.equal(afterStep.game.turn, turnBeforeStep + 1,
    `шаг не засчитан: было ${turnBeforeStep}, стало ${afterStep.game.turn}, ` +
    `снимков ${states.length}, герой ${heroBefore.x},${heroBefore.y}, шаг ${dx},${dy}`);
  const heroAfter = heroFrom(afterStep, hostId);
  assert.equal(heroAfter.x, heroBefore.x + dx);
  assert.equal(heroAfter.y, heroBefore.y + dy);

  // Чужой токен в восстановленной комнате по-прежнему не проходит.
  const impostor = connect(revived);
  impostor.request({ type: 'reconnect', room: code, token: 'wrong-token-value', name: 'Host' });
  assert.equal(impostor.last('error').code, 'bad-token');
  revived.stopHeartbeat();
  revived.stopSweeper();
});

test('a finished run drops its save, and a fresh room code cannot read another one', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const { room: code } = host.last('room-created');
  await startRoom(manager, host);

  const file = path.join(testRunsDir, code + '.json');
  runStore.saveRun(code, host.last('state').state, [{ id: 'host', token: 'x'.repeat(32), name: 'H', classId: 'paladin', host: true }]);
  assert.ok(fs.existsSync(file), 'файл забега создан');
  runStore.deleteRun(code);
  assert.equal(fs.existsSync(file), false, 'финал забега убирает сохранение');
  assert.equal(runStore.loadRun(code), null);

  // Код приходит от клиента, поэтому имя файла собирается только из букв
  // и цифр: иначе '../../..' стал бы путём за пределами каталога.
  for (const hostile of ['../../etc/passwd', '..\\..\\windows', 'lowercase', '', 'ABC', 'A/B']) {
    assert.equal(runStore.loadRun(hostile), null, 'враждебный код отвергнут: ' + hostile);
    assert.equal(runStore.saveRun(hostile, { game: {}, map: {} }, []), false);
  }
  assert.equal(runStore.loadRun('ZZZZZZ'), null, 'несуществующей комнаты нет');
});

test('a corrupt or oversized save is refused instead of crashing the server', () => {
  const code = 'CRPT01';
  const file = path.join(testRunsDir, code + '.json');
  for (const payload of ['{битый', '[]', JSON.stringify({ version: 9, state: {} }),
    JSON.stringify({ version: 1, state: { game: {} } })]) {
    fs.writeFileSync(file, payload, 'utf8');
    assert.equal(runStore.loadRun(code), null, 'битое сохранение отвергнуто');
  }
  fs.writeFileSync(file, JSON.stringify({ version: 1, state: { game: { player: {} }, map: {} }, players: 'нет' }), 'utf8');
  const loaded = runStore.loadRun(code);
  assert.ok(loaded, 'состояние без партии читается: партия пустая');
  assert.deepEqual(loaded.players, []);
});

test('room protocol keeps disconnected heroes and restores reconnect tokens', () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: '<Host>' });
  const created = host.last('room-created');
  assert.equal(created.players[0].name, 'Host');

  const guest = connect(manager);
  guest.request({ type: 'join', room: created.room, name: 'Guest', classId: 'berserker' });
  const joined = guest.last('joined');
  assert.equal(joined.state, null);
  assert.equal(joined.players.length, 2);

  guest.request({ type: 'chat', text: 'Hello team' });
  assert.equal(host.last('chat').playerId, joined.playerId);
  assert.equal(host.last('chat').name, 'Guest');
  assert.equal(host.last('chat').text, 'Hello team');
  assert.equal(guest.last('chat').text, 'Hello team');

  guest.request({ type: 'chat', text: '   ' });
  assert.equal(guest.messages.filter((message) => message.type === 'chat').length, 1);

  guest.emit('close');
  assert.equal(host.last('players').players[1].connected, false);

  // Простое подключение с тем же именем не должно забирать чужую сессию:
  // вернуть отключённого героя можно только по токену.
  const sameNameReconnect = connect(manager);
  sameNameReconnect.request({ type: 'join', room: created.room, name: 'Guest' });
  const rejoined = sameNameReconnect.last('joined');
  assert.notEqual(rejoined.playerId, joined.playerId, 'a fresh join must not reuse a hero');
  assert.notEqual(rejoined.token, joined.token);

  const impostor = connect(manager);
  impostor.request({ type: 'join', room: created.room, name: 'Impostor' });
  assert.notEqual(impostor.last('joined').playerId, joined.playerId);

  const withBadToken = connect(manager);
  withBadToken.request({ type: 'reconnect', room: created.room, token: 'wrong', name: 'Guest' });
  assert.equal(withBadToken.last('error').code, 'bad-token');
  assert.equal(withBadToken.last('joined'), undefined);

  const restored = connect(manager);
  restored.request({
    type: 'reconnect',
    room: created.room,
    token: joined.token,
    name: 'Guest',
  });
  assert.equal(restored.last('joined').playerId, joined.playerId);
});

test('heartbeat tolerates one missed pong, and send closes slow clients before buffers grow', () => {
  const manager = new RoomManager();
  manager.webSocketServer = { clients: new Set() };
  const socket = connect(manager);
  manager.webSocketServer.clients.add(socket);

  manager.startHeartbeat(5);
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 1000;
    const check = () => {
      if (socket.terminated) {
        manager.stopHeartbeat();
        return reject(new Error('terminated on first missing pong'));
      }
      if (socket.pingCount >= 2) {
        socket.emit('pong');
        socket.bufferedAmount = 2 * 1024 * 1024;
        manager.send(socket, { type: 'state' });
        manager.stopHeartbeat();
        assert.equal(socket.closeCode, 1013);
        resolve();
        return;
      }
      if (Date.now() > deadline) {
        manager.stopHeartbeat();
        reject(new Error('heartbeat did not send pings'));
        return;
      }
      setTimeout(check, 2);
    };
    const originalClose = socket.close.bind(socket);
    socket.close = (code, reason) => {
      socket.closeCode = code;
      socket.closeReason = reason;
      originalClose();
    };
    check();
  });
});

test('host-selected class is used when the multiplayer run starts', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  host.request({ type: 'start', options: { size: 'compact', style: 'stone', classId: 'archer' } });

  const [state] = await waitForState(host);
  assert.equal(heroFrom(state, host.last('room-created').playerId).classId, 'archer');
});

test('a guest moves while the host browser is silent — the run lives on the server', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const room = host.last('room-created').room;

  const guest = connect(manager);
  guest.request({ type: 'join', room, name: 'Guest' });
  const guestId = guest.last('joined').playerId;

  const [initial] = await startRoom(manager, host);
  assert.equal(initial.game.turn, 0);
  const before = heroFrom(initial, guestId);

  // Свёрнутое окно хоста не присылает ни кадров, ни запросов: сокет хоста с
  // этого момента молчит, а ход госта всё равно должен разыграться.
  const [dx, dy] = freeStep(initial, before);
  guest.request({ type: 'action', action: 'tryStep', args: [dx, dy] });

  const [, next] = await waitForState(guest, 2);
  const after = heroFrom(next, guestId);
  assert.equal(next.game.turn, 1, 'ход должен засчитаться');
  assert.equal(after.x, before.x + dx, 'гость должен сместиться');
  assert.equal(after.y, before.y + dy);
  assert.equal(after.id, guestId, 'снимок не должен терять личность героя');

  // Хост тоже получает тот же снимок и рисует ту же карту.
  const hostSnapshot = host.last('state').state;
  assert.deepEqual(hostSnapshot.game.players.map((player) => [player.id, player.x, player.y]),
    next.game.players.map((player) => [player.id, player.x, player.y]));
});
test('the room list shows every room with the players inside it', async () => {
  const manager = new RoomManager();
  manager.webSocketServer = { clients: new Set() };
  const host = connect(manager);
  manager.webSocketServer.clients.add(host);

  const browser = connect(manager);
  manager.webSocketServer.clients.add(browser);
  browser.request({ type: 'list' });
  assert.deepEqual(browser.last('rooms').rooms, []);

  host.request({ type: 'create', name: 'Хост' });
  const room = host.last('room-created').room;
  const guest = connect(manager);
  guest.request({ type: 'join', room, name: 'Гость' });
  guest.emit('close');

  const listed = browser.last('rooms').rooms;
  assert.equal(listed.length, 1);
  assert.equal(listed[0].code, room);
  assert.equal(listed[0].started, false);
  assert.equal(listed[0].capacity, MAX_PLAYERS);
  assert.deepEqual(listed[0].players.map((player) => [player.name, player.host, player.connected]), [
    ['Хост', true, true],
    ['Гость', false, false],
  ]);

  await startRoom(manager, host);
  const started = browser.last('rooms').rooms;
  assert.equal(started[0].started, true, 'список помечает идущий забег');

  // После входа в комнату подписка на список снимается.
  const entering = connect(manager);
  manager.webSocketServer.clients.add(entering);
  entering.request({ type: 'list' });
  entering.request({ type: 'join', room, name: 'Третий' });
  const seenBefore = entering.messages.filter((message) => message.type === 'rooms').length;
  guest.request({ type: 'chat', text: 'пинг' });
  assert.equal(entering.messages.filter((message) => message.type === 'rooms').length, seenBefore);
});

test('tavern and temple actions reach the engine over the wire', async () => {
  // Правило без обработчика принимает запрос и молча ничего не делает. Проверяется
  // не результат, а путь до журнала: герой начинает без золота, поэтому отдых и
  // слухи честно откажут строкой «Недостаточно золота» — а действие без
  // обработчика до журнала не доходит вовсе.
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  await startRoom(manager, host);

  for (const action of ['tavernRest', 'tavernRumors', 'templeHeal', 'templeBlessing']) {
    const before = host.messages.filter((message) => message.type === 'state').length;
    host.request({ type: 'action', action, args: [] });
    await waitForState(host, before + 1);
    // Журнал едет в обёртке сообщения, а не внутри снимка.
    const message = host.messages.filter((entry) => entry.type === 'state').at(-1);
    const lines = message.log || [];
    assert.ok(lines.length > 0, `${action} дошёл до движка и ответил в журнал`);
  }

  const errors = host.messages.filter((message) => message.type === 'error');
  assert.deepEqual(errors.map((message) => message.message), [],
    'службы не должны отвергаться сервером');
});

test('a finished run is broadcast once, with the party log and the host gold', () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const code = host.last('room-created').room;
  const guest = connect(manager);
  guest.request({ type: 'join', room: code, name: 'Guest' });

  // Забег подставляется готовым: доводить партию до смерти через протокол
  // недетерминированно, а проверяется здесь формат последнего снимка.
  const room = manager.rooms.get(code);
  let disposed = false;
  const events = {
    actor: host.last('room-created').playerId,
    log: [{ text: 'Вы бьёте Крысу на 7' }, { text: 'Отдых...', narrator: true }],
    screen: { playerId: host.last('room-created').playerId, name: 'merchant' },
    over: { win: true, floor: 10, level: 3, banked: 250 },
  };
  room.run = {
    snapshot: () => ({ game: { turn: 7, over: true, result: 'victory', runSeed: 42 }, map: { w: 1 } }),
    takeEvents: () => events,
    dispose: () => { disposed = true; },
  };
  manager.publish(room, room.run, events);

  const message = host.last('state');
  assert.equal(message.turn, 7);
  assert.deepEqual(message.log, events.log);
  assert.deepEqual(message.screen, events.screen);
  assert.equal(message.banked, 250);
  assert.equal(guest.last('state').banked, 250, 'последний снимок уходит всем');
  assert.equal(disposed, true, 'движок отпускается вместе с забегом');
  assert.equal(room.run, null, 'комната ждёт следующего забега');

  host.request({ type: 'action', action: 'skipTurn', args: [] });
  assert.match(host.last('error').message, /ещё не начат/);
});

test('room protocol enforces the player limit and rejects malformed actions', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const room = host.last('room-created').room;
  const guests = [];

  for (let i = 1; i < MAX_PLAYERS; i++) {
    const guest = connect(manager);
    guest.request({ type: 'join', room, name: 'Guest' + i });
    guests.push(guest);
  }
  const extra = connect(manager);
  extra.request({ type: 'join', room, name: 'Extra' });
  assert.match(extra.last('error').message, /максимальное число/);

  await startRoom(manager, host);
  guests[0].request({ type: 'action', action: 'constructor', args: [] });
  assert.match(guests[0].last('error').message, /Недопустимое/);
  guests[0].request({ type: 'action', action: 'toString', args: [] });
  assert.match(guests[0].last('error').message, /Недопустимое/);
  guests[0].request({ type: 'action', action: 'tryStep', args: [5, 0] });
  assert.match(guests[0].last('error').message, /Недопустимое/);
  guests[0].request({ type: 'action', action: 'playerAction', args: [95, 99999] });
  assert.match(guests[0].last('error').message, /Недопустимое/);
  guests[0].request({ type: 'action', action: 'interact', args: ['teleport'] });
  assert.match(guests[0].last('error').message, /Недопустимое/);
  for (let i = 0; i < 6; i++) guests[0].request({ type: 'chat', text: 'spam' });
  assert.equal(guests[0].last('chat-error').type, 'chat-error');
  for (let i = 0; i < 25; i++) {
    guests[0].request({ type: 'action', action: 'skipTurn', args: [] });
  }
  assert.match(guests[0].last('error').message, /Слишком много/);
});

test('walking with a held key outruns the action limit', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const { room, playerId } = host.last('room-created');
  await startRoom(manager, host);

  // Клиент ждёт снимка и сразу шлёт следующий шаг — так выглядит ходьба с
  // нажатой клавишей. Лимит обязан быть выше этого темпа, иначе игрок получает
  // «Слишком много действий» на девятом шаге обычной игры.
  const steps = 16;
  let refused = null;
  for (let i = 0; i < steps; i++) {
    const before = host.messages.filter((message) => message.type === 'state').length;
    const state = host.last('state').state;
    const hero = heroFrom(state, playerId);
    const [dx, dy] = freeStep(state, hero);
    host.request({ type: 'action', action: 'tryStep', args: [dx, dy] });
    const deadline = Date.now() + 3000;
    while (host.messages.filter((message) => message.type === 'state').length === before &&
      Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const error = host.last('error');
    if (error) {
      refused = error.message;
      break;
    }
  }
  assert.equal(refused, null, 'обычная ходьба не упирается в лимит действий');
});

test('a guest cannot start a run or read a room size outside the config', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const room = host.last('room-created').room;
  const guest = connect(manager);
  guest.request({ type: 'join', room, name: 'Guest' });

  guest.request({ type: 'start', options: {} });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(host.last('state'), undefined);
  assert.match(guest.last('error').message, /не поддерживается/);

  // 'constructor' есть у любого объекта: без hasOwnKey размер карты уехал бы
  // в игру как Object.prototype.constructor с width === undefined. Размер и
  // стиль откатываются к умолчаниям забега.
  host.request({ type: 'start', options: { size: 'constructor', style: 'toString' } });
  const [state] = await waitForState(host);
  assert.equal(state.map.w, 48);
  assert.equal(state.map.h, 34);
  assert.equal(state.game.mapStyle, 'stone');
});

test('an autowalk click reaches the room as one snapshot per step, not as a jump', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const { room, playerId } = host.last('room-created');
  const guest = connect(manager);
  guest.request({ type: 'join', room, name: 'Guest' });

  const [state] = await startRoom(manager, host);
  const hero = heroFrom(state, playerId);

  // Цель — клетка в нескольких шагах по прямой, до которой есть путь. Ищем по
  // всем четырём направлениям: на карте без открытого коридора вправо тест
  // падал бы на одной из восьми планировок. Дальше маршрут может прервать
  // встреченный враг, и это тоже верное поведение.
  let target = null;
  const tiles = tilesFrom(state);
  // Коридор проверяется целиком, а не по целевой клетке: закрытая дверь или
  // сундук посреди линии обрывают автопроход, и герой остаётся на месте.
  const corridorClear = (dx, dy, distance) => {
    for (let step = 1; step <= distance; step++) {
      const x = hero.x + dx * step;
      const y = hero.y + dy * step;
      if (!tiles[y] || tiles[y][x] !== 1) return false;
      if ((state.map.doors || []).some((door) => door.x === x && door.y === y &&
          door.state !== 'open' && door.state !== 'broken')) return false;
      if ((state.map.chests || []).some((chest) => chest.x === x && chest.y === y &&
          chest.state !== 'open' && chest.state !== 'broken')) return false;
    }
    return true;
  };
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    for (let d = 5; d >= 2 && !target; d--) {
      if (corridorClear(dx, dy, d)) target = { x: hero.x + dx * d, y: hero.y + dy * d };
    }
  }
  assert.ok(target, 'у героя должен быть проходимый коридор');

  const before = host.messages.filter((message) => message.type === 'state').length;
  host.request({ type: 'action', action: 'playerAction', args: [target.x, target.y] });
  const walkStates = (await waitForSettledStates(host, before)).slice(before);
  assert.ok(walkStates.length >= 1, 'действие должно прислать снимок');

  const cells = walkStates.map((snapshot) => {
    const party = heroFrom(snapshot, playerId);
    return [party.x, party.y];
  });
  let stepsTaken = 0;
  for (let i = 1; i < cells.length; i++) {
    const step = Math.abs(cells[i][0] - cells[i - 1][0]) + Math.abs(cells[i][1] - cells[i - 1][1]);
    assert.ok(step <= 1, 'шаг не должен перескакивать клетки: ' + JSON.stringify(cells));
    stepsTaken += step;
  }
  // Главное свойство: снимок уходит на каждый пройденный шаг. Если бы публикация
  // шла раз на действие, маршрут из нескольких клеток пришёл бы одним прыжком.
  assert.ok(walkStates.length >= Math.max(1, stepsTaken),
    'маршрут должен публиковать снимок на каждый шаг: ' + JSON.stringify(cells));
  const last = cells[cells.length - 1];
  assert.ok(last[0] !== hero.x || last[1] !== hero.y, 'герой сдвинулся с места');
  assert.ok(Math.abs(last[0] - hero.x) + Math.abs(last[1] - hero.y) <= Math.abs(target.x - hero.x) + Math.abs(target.y - hero.y));
});

test('the host is rate limited on chat like every other player, and a dead room code is reported', () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });

  // Окно чата считается из состояния соединения. Если хост создаётся с неполным
  // набором полей, счётчики undefined и лимит не срабатывает никогда.
  for (let i = 0; i < 6; i++) host.request({ type: 'chat', text: 'spam ' + i });
  assert.equal(host.messages.filter((message) => message.type === 'chat').length, 5);
  assert.equal(host.last('chat-error').type, 'chat-error');

  // Клиент чинит сохранённую сессию по коду, а не по тексту ошибки.
  const stranger = connect(manager);
  stranger.request({ type: 'reconnect', room: 'NOSUCH', token: 'whatever', name: 'Guest' });
  assert.equal(stranger.last('error').code, 'no-room');
});

test('every class id from PLAYER_CLASSES survives the network, unknown ids fall back to paladin', () => {
  const CONFIG = require('../js/config');
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const { room } = host.last('room-created');

  // Отключённый игрок держит слот до истечения комнаты, поэтому список классов
  // проверяется на ответе «joined», а не через вещание хоста.
  const joinedClass = [];
  for (const classId of CONFIG.PLAYER_CLASSES) {
    const guest = connect(manager);
    guest.request({ type: 'join', room, name: 'Hero', classId });
    joinedClass.push(guest.last('joined').players.at(-1).classId);
  }
  assert.deepEqual(joinedClass, [...CONFIG.PLAYER_CLASSES]);

  const otherHost = connect(manager);
  otherHost.request({ type: 'create', name: 'Second' });
  const stranger = connect(manager);
  stranger.request({ type: 'join', room: otherHost.last('room-created').room, name: 'Nobody', classId: 'dragon' });
  assert.equal(stranger.last('joined').players.at(-1).classId, 'paladin');
});

test('LAN server serves the game, protects project files and accepts WebSocket rooms', async (t) => {
  const app = createLanServer();
  const address = await app.listen(0, '127.0.0.1');
  const base = 'http://127.0.0.1:' + address.port;
  let client;
  t.after(async () => {
    if (client) client.terminate();
    for (const connection of app.webSocketServer.clients) connection.terminate();
    await app.close();
  });

  const html = await fetch(base + '/');
  assert.equal(html.status, 200);
  assert.match(await html.text(), /ЛОКАЛЬНАЯ КООПЕРАТИВНАЯ ИГРА/);
  assert.equal((await fetch(base + '/css/style.css')).status, 200);
  assert.equal((await fetch(base + '/plan.md')).status, 400);
  assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);

  const { WebSocket } = require('ws');
  client = new WebSocket('ws://127.0.0.1:' + address.port + '/ws');
  await new Promise((resolve, reject) => {
    client.once('open', resolve);
    client.once('error', reject);
  });
  const response = new Promise((resolve) => {
    client.once('message', (data) => resolve(JSON.parse(data.toString())));
  });
  client.send(JSON.stringify({ type: 'create', name: 'Local' }));
  assert.equal((await response).type, 'room-created');
});

// Переход локации на сервере: герой доходит до выхода шагами tryStep, забег
// меняет локацию, и снимок уходит обеим сторонам. Раньше world.js не входил в
// ENGINE_SCRIPTS, поэтому сетевой забег работал в режиме этажей, а переходы
// не происходили вовсе.
// Доводит героя до выхода локации шагами tryStep и возвращает последний снимок.
// Переход срабатывает на шаге, поэтому стоя на клетке входа (там герой
// оказывается после перехода) нужно сойти, а не просто дойти до неё.
async function walkToExit(socket, playerId, exitId, fromLocation, limit = 300) {
  let state = socket.last('state').state;
  for (let step = 0; step < limit && state.world.current === fromLocation; step++) {
    const hero = heroFrom(state, playerId);
    const exit = state.map.exits.find((point) => point.id === exitId);
    const onExit = hero.x === exit.x && hero.y === exit.y;
    // Стоя на клетке входа, герой должен сойти: переход ловит шаг, а не стоянку.
    const tiles = tilesFrom(state);
    const away = onExit && [[0, 1], [1, 0], [0, -1], [-1, 0]]
      .find(([dx, dy]) => tiles[hero.y + dy] && tiles[hero.y + dy][hero.x + dx] === 1);
    assert.ok(!onExit || away, 'с клетки входа должен быть куда сойти');
    const path = onExit ? [[hero.x + away[0], hero.y + away[1]]]
      : pathTo(state, hero, exit, playerId);
    assert.ok(path && path.length, 'до выхода должен быть путь');
    const [x, y] = path[0];
    const before = socket.messages.filter((message) => message.type === 'state').length;
    socket.request({ type: 'action', action: 'tryStep', args: [x - hero.x, y - hero.y] });
    // Шаг публикуется дважды: промежуточный на анимацию и итоговый. Берём
    // последний — иначе забег «теряет» ход и дальнейший путь считается не оттуда.
    await waitForSettledStates(socket, before);
    state = socket.last('state').state;
  }
  return state;
}

test('the server moves the party between world locations and keeps their state', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const { room, playerId } = host.last('room-created');
  const guest = connect(manager);
  guest.request({ type: 'join', room, name: 'Guest' });

  const [city] = await startRoom(manager, host);
  assert.equal(city.game.locationMode, true, 'сетевой забег идёт по миру локаций');
  assert.equal(city.world.current, 'city_start');
  assert.equal(city.game.enemies.length, 0, 'в городе нет врагов');

  let state = await walkToExit(host, playerId, 'gate_north', 'city_start');
  assert.equal(state.world.current, 'wilderness_forest', 'шаг на выход переносит в лес');
  assert.equal(state.map.locationType, 'wilderness');
  assert.ok(state.game.enemies.length > 0, 'в лесу есть враги');
  const forestEnemies = state.game.enemies.length;
  assert.equal(guest.last('state').state.world.current, 'wilderness_forest',
    'переход виден обоим игрокам');
  // Карта текущей локации едет один раз: поле map, а не запись в visited.
  assert.equal(state.world.visited.wilderness_forest.mapSnapshot, undefined);
  assert.ok(state.world.visited.city_start.mapSnapshot);

  state = await walkToExit(host, playerId, 'gate_south', 'wilderness_forest');
  assert.equal(state.world.current, 'city_start', 'возврат в город');
  assert.equal(state.game.enemies.length, 0, 'в городе снова пусто');

  state = await walkToExit(host, playerId, 'gate_north', 'city_start');
  assert.equal(state.world.current, 'wilderness_forest');
  assert.equal(state.game.enemies.length, forestEnemies, 'лес восстановился вместе с врагами');
});

test('the teleport button returns the party to the city from anywhere', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const { room, playerId } = host.last('room-created');
  const guest = connect(manager);
  guest.request({ type: 'join', room, name: 'Guest' });

  await startRoom(manager, host);
  // Сначала уходим из города обычным переходом, затем возвращаемся телепортом.
  let state = await walkToExit(host, playerId, 'gate_north', 'city_start');
  assert.equal(state.world.current, 'wilderness_forest');

  const before = host.messages.filter((message) => message.type === 'state').length;
  host.request({ type: 'action', action: 'teleportToCity', args: [] });
  await waitForSettledStates(host, before);
  state = host.last('state').state;

  assert.equal(state.world.current, 'city_start', 'телепорт вернул партию в город');
  assert.equal(state.game.locationMode, true);
  assert.equal(guest.last('state').state.world.current, 'city_start', 'телепорт виден обоим игрокам');
});

test('a guest who joins after the start enters the run and returns to its own session', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const { room } = host.last('room-created');

  await startRoom(manager, host);

  const late = connect(manager);
  late.request({ type: 'join', room, name: 'Late', classId: 'berserker' });
  const joined = late.last('joined');
  assert.notEqual(joined.state, null, 'новичок получает актуальное состояние');

  // Добавление в забег идёт через очередь комнаты: ждём снимок с новичком.
  const [withNewcomer] = await waitForState(late, 1);
  assert.ok(heroFrom(withNewcomer, joined.playerId), 'новичок в партии забега');

  const hero = heroFrom(withNewcomer, joined.playerId);
  const [dx, dy] = freeStep(withNewcomer, hero);
  late.request({ type: 'action', action: 'tryStep', args: [dx, dy] });
  const [, afterStep] = await waitForState(late, 2);
  const moved = heroFrom(afterStep, joined.playerId);
  assert.equal(moved.x, hero.x + dx, 'новичок ходит');
  assert.equal(moved.y, hero.y + dy);

  // F5: игрок возвращается в свою сессию, а не в лобби и не в чужую партию.
  const reconnected = connect(manager);
  reconnected.request({ type: 'reconnect', room, token: joined.token, name: 'Late' });
  const restored = reconnected.last('joined');
  assert.equal(restored.playerId, joined.playerId);
  assert.notEqual(restored.state, null);
  assert.ok(heroFrom(restored.state, joined.playerId));
});

test('a guest picks a class before the start and the run uses it', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const { room } = host.last('room-created');
  const guest = connect(manager);
  guest.request({ type: 'join', room, name: 'Guest', classId: 'paladin' });
  const guestId = guest.last('joined').playerId;

  // Чужой класс не проходит: список берётся из конфига.
  guest.request({ type: 'selectClass', classId: 'dragon' });
  assert.match(guest.last('error').message, /Неизвестный/);

  guest.request({ type: 'selectClass', classId: 'archer' });
  const updated = host.last('players').players.find((player) => player.id === guestId);
  assert.equal(updated.classId, 'archer', 'сервер запомнил выбранный гостем класс');

  await startRoom(manager, host);
  assert.equal(heroFrom(host.last('state').state, guestId).classId, 'archer',
    'герой стартует выбранным классом');

  // После старта класс не сменить.
  guest.request({ type: 'selectClass', classId: 'paladin' });
  assert.match(guest.last('error').message, /идёт/);
});

test('the host kicks a disconnected player out of the room and the run', async () => {
  const manager = new RoomManager();
  const host = connect(manager);
  host.request({ type: 'create', name: 'Host' });
  const { room } = host.last('room-created');
  const guest = connect(manager);
  guest.request({ type: 'join', room, name: 'Guest', classId: 'berserker' });
  const guestId = guest.last('joined').playerId;

  await startRoom(manager, host);
  assert.ok(heroFrom(host.last('state').state, guestId), 'гость в партии');

  // Подключённого выгнать нельзя: он вернулся бы переподключением.
  host.request({ type: 'kick', playerId: guestId });
  assert.match(host.last('error').message, /ещё в игре/);

  guest.close();
  const disconnected = host.last('players').players.find((player) => player.id === guestId);
  assert.equal(disconnected.connected, false, 'гость отключён');

  const before = host.messages.filter((message) => message.type === 'state').length;
  host.request({ type: 'kick', playerId: guestId });
  assert.equal(host.last('players').players.some((player) => player.id === guestId), false,
    'игрок выгнан из комнаты');
  await waitForState(host, before + 1);
  assert.equal(heroFrom(host.last('state').state, guestId), undefined, 'герой ушёл из забега');

  // Гость не может выгонять и хоста не выгнать.
  const other = connect(manager);
  other.request({ type: 'join', room, name: 'Other' });
  other.request({ type: 'kick', playerId: host.last('room-created').playerId });
  assert.match(other.last('error').message, /только хост/);
  host.request({ type: 'kick', playerId: host.last('room-created').playerId });
  assert.match(host.last('error').message, /Такого игрока нет/);
});
