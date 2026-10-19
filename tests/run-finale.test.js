'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, startRunAsClass } = require('./helpers/sandbox');

// Финал забега и автосохранение: числа и порядок вызовов важнее текста экрана,
// поэтому проверяем пол, результат, банк и факт записи.

function setUpRun() {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  RK.CONFIG.ENABLE_WORLD = false;
  const player = startRunAsClass(RK, 'paladin');
  RK.GAME.enemies = [];
  RK.World.clearRun = () => {};
  RK.UI.over = () => {};
  return { sandbox, RK, player };
}

function standOnStairs(RK, player) {
  player.x = RK.Map.stair.x;
  player.y = RK.Map.stair.y;
  return RK.Map.stair;
}

test('the stairs descend one floor and announce it', () => {
  const { RK, player } = setUpRun();
  const stair = standOnStairs(RK, player);
  const messages = [];
  RK.UI.msg = (text) => messages.push(text);

  RK.Combat.playerAction(stair.x, stair.y);

  assert.equal(RK.GAME.floor, 2);
  assert.ok(messages.some((text) => /спускаетесь на этаж 2/.test(text)), 'спуск сообщается игроку');
});

test('the stairs never finish the run: there is no victory floor', () => {
  const { RK, player } = setUpRun();
  const stair = standOnStairs(RK, player);
  RK.GAME.floor = 40;
  const over = [];
  RK.UI.over = (...args) => over.push(args);

  RK.Combat.playerAction(stair.x, stair.y);

  assert.equal(RK.GAME.floor, 41, 'лестница просто уводит на этаж ниже');
  assert.equal(RK.GAME.over, false, 'победы нет — забег продолжается');
  assert.equal(RK.GAME.result, null);
  assert.equal(over.length, 0, 'экран финала не открывается');
});

test('zero health ends the run as a defeat', () => {
  const { RK, player } = setUpRun();
  const over = [];
  RK.UI.over = (...args) => over.push(args);
  const cleared = [];
  RK.World.clearRun = () => cleared.push(1);

  RK.Combat.setPlayerStats({ hp: 0, maxHp: player.maxHp, atk: player.atk, def: player.def });

  assert.equal(RK.GAME.over, true);
  assert.equal(RK.GAME.result, 'defeat');
  assert.equal(over[0][0], false, 'экран финала сообщает поражение');
  assert.equal(cleared.length, 1);
});

// Экран итогов получает причину смерти последним смертельным уроном.
test('the death cause names hunger, a regular enemy, and a boss', () => {
  // Голод: герой истощён и добит нехваткой еды.
  const hungerRun = setUpRun();
  const hungerOver = [];
  hungerRun.RK.UI.over = (...args) => hungerOver.push(args);
  hungerRun.player.hunger = 0;
  hungerRun.player.hp = hungerRun.RK.CONFIG.HUNGER_STARVING_HP_LOSS;
  hungerRun.RK.Combat.skipTurn();
  assert.equal(hungerRun.RK.GAME.deathCause, 'От голода');
  assert.equal(hungerOver[0][6], 'От голода', 'причина голода доходит до экрана');

  // Обычный враг и босс: видимый сосед с высоким уроном добивает героя.
  for (const [behavior, expected] of [['normal', 'От удара врага'], ['boss', 'От удара босса']]) {
    const { RK, player } = setUpRun();
    const over = [];
    RK.UI.over = (...args) => over.push(args);
    const enemy = placeAdjacentEnemy(RK, player, behavior);
    player.hp = 1;
    RK.Combat.skipTurn();
    assert.equal(enemy.hp > 0, true, 'враг пережил ход');
    assert.equal(RK.GAME.deathCause, expected, expected);
    assert.equal(over[0][6], expected);
  }
});

// Ставит врага в соседнюю проходимую клетку и делает его зрячим, чтобы ход
// врагов сразу привёл к удару по герою.
function placeAdjacentEnemy(RK, player, behavior) {
  const type = Object.keys(RK.Entities.DEFS).find((key) => RK.Entities.DEFS[key].behavior === behavior);
  assert.ok(type, 'в реестре врагов есть тип ' + behavior);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const x = player.x + dx;
    const y = player.y + dy;
    if (!RK.MapGen.isWalkable(x, y) || RK.Combat.getEnemyAt(x, y)) continue;
    const enemy = RK.Entities.makeEnemy(type, x, y, RK.GAME.floor);
    enemy.atk = 999;
    enemy.hp = 9999;
    enemy.maxHp = 9999;
    enemy.alerted = true;
    RK.GAME.enemies.push(enemy);
    return enemy;
  }
  throw new Error('placeAdjacentEnemy: нет свободной соседней клетки');
}

test('the bank receives the gold of the whole party with luck applied', () => {
  const { RK, player } = setUpRun();
  RK.Combat.addNetworkPlayer('guest-1', 'Гость');
  const guest = RK.GAME.players.find((member) => member.id === 'guest-1');
  player.gold = 40;
  guest.gold = 60;
  RK.Meta.data.luck = 1;

  const banked = [];
  RK.Meta.addBank = (value) => banked.push(value);

  RK.Combat.setPlayerStats({ hp: 0, maxHp: player.maxHp, atk: player.atk, def: player.def });

  const expected = Math.floor(40 * 1.15) + Math.floor(60 * 1.15);
  assert.equal(banked.length, 1);
  assert.equal(banked[0], expected, 'золото каждого героя уходит в банк с учётом удачи');
});

test('autosave happens every SAVE_EVERY_TURNS and never in a network room', () => {
  const { RK } = setUpRun();
  let saves = 0;
  RK.World.saveRun = () => { saves += 1; return true; };

  RK.GAME.turn = RK.CONFIG.SAVE_EVERY_TURNS - 1;
  RK.Combat.skipTurn();
  assert.equal(RK.GAME.turn, RK.CONFIG.SAVE_EVERY_TURNS);
  assert.equal(saves, 1, 'круговой ход сохраняется');

  RK.GAME.turn = RK.CONFIG.SAVE_EVERY_TURNS + 10;
  RK.Combat.skipTurn();
  assert.equal(saves, 1, 'не по расписанию запись не идёт');

  RK.GAME.turn = RK.CONFIG.SAVE_EVERY_TURNS * 2 - 1;
  RK.Network = { inRoom: () => true };
  RK.Combat.skipTurn();
  assert.equal(saves, 1, 'в сетевой комнате состояние считает сервер');
});
