'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, startRunAsClass, placeAdjacentEnemy } = require('./helpers/sandbox');

// Храм: жрица открывает свой экран, лечение стоит золота, а благословение
// держится несколько ходов и не копится от клика к клику.

function cityRun(seed) {
  const { sandbox } = createSandbox({ seed });
  const RK = sandbox.RK;
  startRunAsClass(RK, 'paladin');
  return { sandbox, RK, player: RK.GAME.player };
}

test('the priest opens the temple screen', () => {
  const { sandbox, RK } = cityRun(311);
  const priest = RK.GAME.npcs.find((npc) => npc.kind === 'priest');

  assert.ok(priest, 'жрица в городе есть');
  assert.equal(RK.Npc.service(priest), 'temple', 'у жрицы храм');

  RK.Combat.openNpcScreen(priest);

  assert.deepEqual(sandbox.uiScreens, ['temple']);
});

test('the temple heal costs gold and restores health', () => {
  const { RK, player } = cityRun(312);
  player.gold = 10;
  player.hp = 1;

  assert.equal(RK.Combat.templeHeal(), true);
  assert.equal(player.hp, player.maxHp, 'здоровье восстановлено');
  assert.equal(player.gold, 10 - RK.CONFIG.TEMPLE_HEAL_COST, 'золото за лечение снято');
});

test('the temple heal fails without gold', () => {
  const { RK, player } = cityRun(313);
  player.gold = 0;
  player.hp = 1;

  assert.equal(RK.Combat.templeHeal(), false);
  assert.equal(player.hp, 1, 'здоровье не тронуто');
});

test('the blessing holds for a few turns and does not stack', () => {
  const { RK, player } = cityRun(314);
  const atk = player.atk;

  assert.equal(RK.Combat.templeBlessing(), true);
  assert.equal(player.blessingTurns, RK.CONFIG.BLESSING_TURNS);
  assert.equal(player.atk, atk, 'атака не растёт навсегда');

  RK.Combat.templeBlessing();
  assert.equal(player.blessingTurns, RK.CONFIG.BLESSING_TURNS,
    'повторное благословение не копит время');
});

test('the blessing ends with the turns', () => {
  const { RK, player } = cityRun(315);
  RK.Combat.templeBlessing();

  for (let i = 0; i < RK.CONFIG.BLESSING_TURNS; i++) RK.Combat.skipTurn();

  assert.equal(player.blessingTurns, 0, 'благословение истекло');
});

test('the blessing adds attack to the blow', () => {
  // Один и тот же seed: бросок урона одинаковый, разница — только благословение.
  const plain = cityRun(316);
  const blessed = cityRun(316);
  const plainEnemy = placeAdjacentEnemy(plain.RK, 'rat', { hp: 100000, maxHp: 100000 });
  const blessedEnemy = placeAdjacentEnemy(blessed.RK, 'rat', { hp: 100000, maxHp: 100000 });

  blessed.RK.Combat.templeBlessing();
  plain.RK.Combat.playerAction(plainEnemy.enemy.x, plainEnemy.enemy.y);
  blessed.RK.Combat.playerAction(blessedEnemy.enemy.x, blessedEnemy.enemy.y);

  const plainDamage = 100000 - plainEnemy.enemy.hp;
  const blessedDamage = 100000 - blessedEnemy.enemy.hp;
  assert.equal(blessedDamage - plainDamage, blessed.RK.CONFIG.BLESSING_ATTACK_BONUS);
});
