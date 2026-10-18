'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, findOpenNeighbor, placeAdjacentEnemy, startRunAsClass } = require('./helpers/sandbox');

// Ключи, замки и сила — единственные способы пройти запертую дверь. Ошибка здесь
// запирает игрока в комнате навсегда, поэтому проверяются все три исхода:
// ключ расходуется, взлом может провалиться, выбивание тратит ходы и шумит.

function setUpRun(RK, classId) {
  RK.CONFIG.ENABLE_WORLD = false;
  startRunAsClass(RK, classId || 'paladin');
  RK.GAME.enemies = [];
  RK.Map.traps = [];
}

/** Ставит объект перед героем и поворачивает его туда. */
function faceObject(RK, object) {
  const p = RK.GAME.player;
  const [dx, dy] = findOpenNeighbor(RK);
  p.facingX = dx;
  p.facingY = dy;
  object.x = p.x + dx;
  object.y = p.y + dy;
  return object;
}

function makeDoor(RK, state, keyId) {
  return faceObject(RK, {
    x: 0, y: 0, asset: 'door', orientation: 'horizontal', state: state || 'locked',
    keyId: keyId || 'iron', hp: RK.CONFIG.DOOR_HP, maxHp: RK.CONFIG.DOOR_HP,
  });
}

test('a key opens a locked door and is spent', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  setUpRun(RK);
  const door = makeDoor(RK, 'locked');
  RK.Map.doors.push(door);
  RK.GAME.player.backpack.push({ kind: 'key', keyId: 'iron', count: 2, name: 'Железный ключ' });
  const key = RK.GAME.player.backpack.at(-1);

  assert.equal(RK.Combat.interact('use'), true);
  assert.equal(door.state, 'open');
  assert.equal(key.count, 1, 'один ключ из стопки израсходован');
  assert.ok(RK.GAME.player.backpack.includes(key), 'пока ключи остались, стопка в рюкзаке');

  // Второе применение ключа исчерпывает стопку и убирает её из рюкзака.
  door.state = 'locked';
  assert.equal(RK.Combat.interact('use'), true);
  assert.equal(door.state, 'open');
  assert.ok(!RK.GAME.player.backpack.includes(key), 'пустая стопка ключей удалена');
});

test('a foreign key does not open a locked door', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  setUpRun(RK);
  const door = makeDoor(RK, 'locked', 'iron');
  RK.Map.doors.push(door);
  RK.GAME.player.backpack.push({ kind: 'key', keyId: 'gold', count: 1 });

  assert.equal(RK.Combat.interact('use'), false);
  assert.equal(door.state, 'locked');
  assert.equal(RK.GAME.player.backpack.at(-1).count, 1, 'чужой ключ не расходуется');
});

test('picking a lock can succeed or fail and always advances the turn', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  setUpRun(RK);
  const door = makeDoor(RK, 'locked');
  RK.Map.doors.push(door);
  const turnBefore = RK.GAME.turn;
  const original = RK.RNG.chance;

  RK.RNG.chance = () => false;
  assert.equal(RK.Combat.interact('pick'), true);
  assert.equal(door.state, 'locked', 'провал не открывает замок');
  assert.equal(RK.GAME.turn, turnBefore + 1, 'попытка взлома — ход');

  RK.RNG.chance = () => true;
  assert.equal(RK.Combat.interact('pick'), true);
  assert.equal(door.state, 'closed', 'успешный взлом снимает замок, но не открывает дверь');
  RK.RNG.chance = original;
});

test('forced breaking hits durability until the door gives way and wakes enemies', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  setUpRun(RK);
  const door = makeDoor(RK, 'closed');
  RK.Map.doors.push(door);
  const sleeper = RK.Entities.makeEnemy('rat', RK.GAME.player.x + 2, RK.GAME.player.y, 1);
  sleeper.alerted = false;
  RK.GAME.enemies = [sleeper];

  assert.equal(RK.Combat.interact('force'), true);
  assert.ok(door.hp < door.maxHp, 'удар по двери снимает прочность');
  assert.equal(sleeper.alerted, false, 'пока дверь держится, шума нет');

  while (door.hp > 0) RK.Combat.interact('force');
  assert.equal(door.state, 'broken');
  assert.equal(sleeper.alerted, true, 'выбитая дверь будит врагов в радиусе шума');
});

test('a strong hit breaks a chest and spills its contents', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  setUpRun(RK);
  const chest = faceObject(RK, {
    x: 0, y: 0, asset: 'chest', state: 'closed',
    hp: RK.CONFIG.CHEST_HP, maxHp: RK.CONFIG.CHEST_HP, items: [RK.Items.spawnPotion(0, 0)],
  });
  RK.Map.chests.push(chest);

  while (chest.state !== 'broken') RK.Combat.interact('force');

  assert.equal(chest.opened, true);
  assert.equal(chest.looted, false, 'в разбитом сундуке был предмет');
  assert.equal(chest.state, 'broken');
});

test('storage is neither locked nor broken', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  setUpRun(RK);
  const storage = faceObject(RK, { x: 0, y: 0, asset: 'chest', state: 'closed', storage: true, items: [] });
  RK.Map.chests.push(storage);
  const opened = [];
  RK.UI.showStorage = () => opened.push(true);

  assert.equal(RK.Combat.interact('pick'), false);
  assert.equal(RK.Combat.interact('force'), false);
  assert.equal(storage.state, 'closed');
  assert.equal(RK.Combat.interact('use'), true);
  assert.deepEqual(opened, [true], 'обычное взаимодействие открывает экран хранилища');
});

test('an archer disarms a trap into the backpack and sets it back down', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  setUpRun(RK, 'archer');
  const trap = faceObject(RK, {
    x: 0, y: 0, asset: 'trap', type: 'needle', state: 'armed', damage: 7,
  });
  RK.Map.traps.push(trap);
  const original = RK.RNG.chance;

  RK.RNG.chance = () => true;
  assert.equal(RK.Combat.interact('pick'), true);
  RK.RNG.chance = original;

  const carried = RK.GAME.player.backpack.find((item) => item.kind === 'trap');
  assert.ok(carried, 'снятая ловушка уходит в рюкзак лучника');
  assert.equal(carried.trapType, 'needle');
  assert.equal(carried.trapDamage, 7, 'урон ловушки сохраняется при переносе');
  assert.ok(!RK.Map.traps.includes(trap), 'снятая ловушка покидает карту');

  // Возврат: лучник ставит перенесённую ловушку на свободную клетку перед собой.
  const index = RK.GAME.player.backpack.indexOf(carried);
  assert.equal(RK.Combat.placeCarriedTrap(index), true);
  const placed = RK.Map.traps.at(-1);
  assert.equal(placed.type, 'needle');
  assert.equal(placed.damage, 7);
  assert.equal(placed.state, 'armed');
  assert.equal(placed.owner, RK.GAME.player.id);
  assert.ok(!RK.GAME.player.backpack.includes(carried), 'единственная ловушка ушла из рюкзака');
});

test('only an archer can set a trap, and never onto an occupied or distant tile', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  setUpRun(RK, 'paladin');
  const trap = RK.Items.spawnTrapItem({ type: 'spike', damage: 5 }, 0, 0);
  const index = RK.GAME.player.backpack.push(trap) - 1;

  assert.equal(RK.Combat.placeCarriedTrap(index), false, 'паладин не умеет ставить ловушки');
  assert.ok(RK.GAME.player.backpack.includes(trap));

  // Тот же предмет у лучника: без взгляда в соседнюю клетку поставить нельзя.
  RK.Classes.applyToPlayer(RK.GAME.player, 'archer');
  RK.GAME.player.facingX = 0;
  RK.GAME.player.facingY = 0;
  assert.equal(RK.Combat.placeCarriedTrap(index), false, 'нужен взгляд на соседнюю клетку');

  const { dx, dy } = placeAdjacentEnemy(RK, 'rat');
  RK.GAME.player.facingX = dx;
  RK.GAME.player.facingY = dy;
  assert.equal(RK.Combat.placeCarriedTrap(index), false, 'на врага ловушку не поставить');
  // Ловушка занятой клетки не появилась.
  assert.equal((RK.Map.traps || []).length, 0);
  assert.ok(RK.GAME.player.backpack.includes(trap));
});
