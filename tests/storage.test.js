'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

function cityRun(seed) {
  const { sandbox } = createSandbox({ seed });
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'medium', style: 'stone' });
  return RK;
}

function storageOf(RK) {
  return (RK.Map.chests || []).find((chest) => chest.storage) || null;
}

function item(name) {
  return { name, kind: 'loot', rarity: 'common', count: 1, value: 10 };
}

/** Ставит героя на свободную клетку вплотную к хранилищу. */
function standNearStorage(RK, chest) {
  const tile = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
    .map(([dx, dy]) => ({ x: chest.x + dx, y: chest.y + dy }))
    .find((point) => RK.MapGen.isMapWalkable(RK.Map, point.x, point.y));
  assert.ok(tile, 'рядом с хранилищем есть свободная клетка');
  RK.GAME.player.x = tile.x;
  RK.GAME.player.y = tile.y;
  RK.GAME.player.facingX = chest.x - tile.x;
  RK.GAME.player.facingY = chest.y - tile.y;
  return tile;
}

/** Уводит героя на клетку не ближе minDist от хранилища. */
function standAwayFromStorage(RK, chest, minDist) {
  const map = RK.Map;
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (Math.abs(x - chest.x) + Math.abs(y - chest.y) < minDist) continue;
      if (!RK.MapGen.isMapWalkable(map, x, y)) continue;
      RK.GAME.player.x = x;
      RK.GAME.player.y = y;
      return { x, y };
    }
  }
  throw new Error('нет проходимой клетки вдали от хранилища');
}

/** Прокручивает шаги автопрохода до конца. */
function settleWalk(RK) {
  let guard = 0;
  while (RK.Combat.busy() && guard++ < 1000) RK.Combat.tickWalk(1e6);
}

/** Ставит героя так, чтобы путь к хранилищу не проходил через выходы локации. */
function standClearOfStorage(RK, chest) {
  const map = RK.Map;
  const exits = new Set((map.exits || []).map((exit) => exit.x + ',' + exit.y));
  const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  let best = null;
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const distance = Math.abs(x - chest.x) + Math.abs(y - chest.y);
      if (distance < 2 || (best && distance >= best.distance)) continue;
      if (!RK.MapGen.isMapWalkable(map, x, y)) continue;
      if (exits.has(x + ',' + y)) continue;
      const path = neighbours
        .map(([dx, dy]) => RK.MapGen.findPath(x, y, chest.x + dx, chest.y + dy, null))
        .find((found) => found);
      if (!path || path.some((tile) => exits.has(tile.x + ',' + tile.y))) continue;
      best = { x, y, distance };
    }
  }
  assert.ok(best, 'есть клетка с путём к хранилищу в обход выходов');
  RK.GAME.player.x = best.x;
  RK.GAME.player.y = best.y;
  return best;
}

function collectMessages(RK) {
  const messages = [];
  RK.UI.msg = (text) => messages.push(String(text));
  return messages;
}

test('the city keeps exactly one storage chest next to the spawn', () => {
  const RK = cityRun(401);
  const chest = storageOf(RK);
  assert.ok(chest, 'в городе есть хранилище');
  const distance = Math.max(Math.abs(chest.x - RK.Map.spawn.x), Math.abs(chest.y - RK.Map.spawn.y));
  assert.ok(distance >= 1 && distance <= 4, 'хранилище стоит рядом со спавном: ' + distance);
  assert.equal(chest.asset, 'storage', 'хранилище рисуется своим спрайтом');
  assert.equal(chest.state, 'closed', 'закрытое хранилище держит клетку занятой');
  assert.equal(chest.keyId, undefined, 'хранилище не запирается ключом');
  assert.equal(RK.MapGen.isMapWalkable(RK.Map, chest.x, chest.y), false, 'сквозь хранилище не пройти');
  const decorations = RK.Map.decorations || [];
  assert.equal(
    decorations.some((decoration) => decoration.x === chest.x && decoration.y === chest.y),
    false,
    'клетка хранилища свободна от декораций',
  );
  assert.equal((RK.Map.chests || []).filter((entry) => !entry.storage).length, 0,
    'в городе нет сундуков с лутом');
});

test('every city layout places the storage on a free tile', () => {
  for (const seed of [11, 22, 33, 44, 55, 66]) {
    const RK = cityRun(seed);
    const chest = storageOf(RK);
    assert.ok(chest, 'seed ' + seed + ': хранилище поставлено');
    assert.equal(RK.MapGen.isMapWalkable(RK.Map, chest.x, chest.y), false,
      'seed ' + seed + ': клетка хранилища занята');
    const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
      .some(([dx, dy]) => RK.MapGen.isMapWalkable(RK.Map, chest.x + dx, chest.y + dy));
    assert.ok(neighbors, 'seed ' + seed + ': к хранилищу можно подойти');
  }
});

test('items move between the backpack and the storage by index', () => {
  const RK = cityRun(402);
  const chest = storageOf(RK);
  standNearStorage(RK, chest);
  const sword = item('Меч');
  RK.GAME.player.backpack.push(sword);
  const index = RK.GAME.player.backpack.length - 1;

  assert.equal(RK.Combat.storeInChest(index), true, 'вещь из рюкзака ложится в хранилище');
  assert.equal(RK.GAME.player.backpack.includes(sword), false, 'вещь ушла из рюкзака');
  assert.equal(chest.items.length, 1, 'вещь лежит в хранилище');
  assert.equal(chest.items[0].name, 'Меч');

  assert.equal(RK.Combat.takeFromChest(0), true, 'взять можно по индексу у ближайшего хранилища');
  assert.equal(RK.GAME.player.backpack.includes(sword), true, 'вещь вернулась в рюкзак');
  assert.equal(chest.items.length, 0, 'хранилище опустело');
});

test('the storage trades only with a hero standing next to it', () => {
  const RK = cityRun(403);
  const chest = storageOf(RK);
  const messages = collectMessages(RK);
  const shield = item('Щит');
  RK.GAME.player.backpack.push(shield);
  const index = RK.GAME.player.backpack.length - 1;
  standAwayFromStorage(RK, chest, 4);

  assert.equal(RK.Combat.storeInChest(index), false, 'вдали положить нельзя');
  assert.ok(RK.GAME.player.backpack.includes(shield), 'вещь осталась в рюкзаке');
  assert.deepEqual(messages, ['Рядом нет хранилища.']);

  chest.items.push(item('Лук'));
  assert.equal(RK.Combat.takeFromChest(0), false, 'вдали взять нельзя');
  assert.equal(chest.items.length, 1, 'содержимое хранилища не изменилось');
});

test('a full storage refuses the next item', () => {
  const RK = cityRun(406);
  const chest = storageOf(RK);
  standNearStorage(RK, chest);
  const capacity = RK.CONFIG.CHEST_CAPACITY;
  for (let i = 0; i < capacity; i++) chest.items.push(item('Хлам ' + i));
  RK.GAME.player.backpack.push(item('Копьё'));
  const messages = collectMessages(RK);

  assert.equal(RK.Combat.storeInChest(RK.GAME.player.backpack.length - 1), false, 'полное хранилище не берёт вещи');
  assert.match(messages[0], /Хранилище полно/);
  assert.equal(RK.GAME.player.backpack.some((entry) => entry.name === 'Копьё'), true, 'вещь осталась у героя');
});

test('E in front of the storage opens the exchange screen', () => {
  const RK = cityRun(405);
  const chest = storageOf(RK);
  standNearStorage(RK, chest);
  const opened = [];
  RK.UI.showStorage = () => { opened.push('storage'); return true; };

  assert.equal(RK.Combat.interact(), true, 'взаимодействие с хранилищем прошло');
  assert.deepEqual(opened, ['storage'], 'открылся экран обмена');
  assert.equal(chest.state, 'closed', 'хранилище не открывается как сундук с лутом');
  assert.equal(chest.opened, false, 'хранилище не помечается открытым');
});

test('a click on the storage walks up and opens the exchange screen', () => {
  const RK = cityRun(408);
  const chest = storageOf(RK);
  standClearOfStorage(RK, chest);
  const opened = [];
  RK.UI.showStorage = () => { opened.push('storage'); return true; };

  assert.equal(RK.Combat.playerAction(chest.x, chest.y), true, 'клик по хранилищу принят');
  assert.equal(RK.Combat.isAutoWalking(), true, 'герой сначала идёт к хранилищу');
  settleWalk(RK);

  assert.deepEqual(opened, ['storage'], 'дойдя, герой открывает экран обмена');
  assert.equal(chest.state, 'closed', 'хранилище не открывается как сундук');
});

test('the storage is neither picked nor broken with force', () => {
  const RK = cityRun(407);
  const chest = storageOf(RK);
  standNearStorage(RK, chest);
  const messages = collectMessages(RK);

  assert.equal(RK.Combat.interact('pick'), false, 'отмычка хранилищу не нужна');
  assert.equal(RK.Combat.interact('force'), false, 'сила хранилище не ломает');
  assert.deepEqual(messages, ['Хранилище не запирается.', 'Хранилище не ломается.']);
  assert.equal(chest.state, 'closed', 'состояние хранилища не изменилось');
  assert.equal(chest.hp, undefined, 'у хранилища нет прочности');
});

test('storage contents travel to network clients with the map state', () => {
  const RK = cityRun(404);
  const chest = storageOf(RK);
  standNearStorage(RK, chest);
  RK.GAME.player.backpack.push(item('Кольцо'));
  assert.equal(RK.Combat.storeInChest(RK.GAME.player.backpack.length - 1), true);

  const snapshot = RK.Combat.createSnapshot();
  const sent = snapshot.mapState.chests.find((entry) => entry.storage);
  assert.equal(sent.items.length, 1, 'содержимое хранилища уехало в снимке');
  assert.equal(sent.items[0].name, 'Кольцо');
  assert.equal(snapshot.map.chests, undefined, 'в геометрии карты сундуков нет');

  const restored = RK.Combat.restoreMap(snapshot.map, snapshot.mapState);
  assert.equal(restored.chests.find((entry) => entry.storage).items[0].name, 'Кольцо',
    'клиент разбирает снимок вместе с содержимым хранилища');
});
