'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// Рассказчик тянет строки из таблицы через RK.RNG, поэтому песочница даёт
// управляемые chance/rand и пишет реплики в массив вместо журнала.

function narratorSandbox({ turn = 0, floor = 1, hp = 100, maxHp = 100 } = {}) {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'rng.js', 'narrator.js'] });
  const messages = [];
  sandbox.RK.UI.narratorMsg = (text) => messages.push(text);
  const rng = { randValue: 0, chanceValue: false };
  sandbox.RK.RNG = {
    rand: () => rng.randValue,
    chance: () => rng.chanceValue,
  };
  const game = { turn, floor, player: { hp, maxHp } };
  sandbox.RK.Narrator.initRun(game);
  return { sandbox, messages, rng, game };
}

test('runStart and floorStart speak formatted lines', () => {
  const { messages, rng, game, sandbox } = narratorSandbox();
  sandbox.RK.Narrator.onEvent('runStart');
  assert.equal(messages.length, 1);
  assert.equal(messages[0], 'Ещё один герой спускается вниз. Я уже ставлю на третий этаж.');

  rng.chanceValue = true;
  sandbox.RK.Narrator.onEvent('floorStart', { floor: 2 });
  assert.equal(messages[1], 'Этаж 2. Запах сырости и амбиции.', 'номер этажа подставляется в реплику');
});

test('low health is announced once per floor', () => {
  const { messages, rng, game, sandbox } = narratorSandbox({ hp: 10 });
  rng.chanceValue = true;
  const lowHp = () => messages.filter((text) => /HP на исходе|на грани|главой «Ой»/.test(text)).length;

  sandbox.RK.Narrator.onEvent('turnEnd');
  assert.equal(lowHp(), 1, 'при низком здоровье реплика звучит');

  game.turn = 1;
  sandbox.RK.Narrator.onEvent('turnEnd');
  assert.equal(lowHp(), 1, 'второй раз на том же этаже тот же текст не повторяется');
});

test('kill, boss kill, level up, rest, death and victory speak on cue', () => {
  const { messages, rng, sandbox } = narratorSandbox();
  const Narrator = sandbox.RK.Narrator;

  Narrator.onEvent('kill', {});
  assert.equal(messages.length, 0, 'рядовой враг молчит без броска');
  Narrator.onEvent('kill', { boss: true });
  assert.equal(messages.length, 1, 'босс всегда комментируется');

  Narrator.onEvent('levelUp');
  Narrator.onEvent('rest');
  assert.equal(messages.length, 1, 'без броска повышение уровня и отдых молчат');

  Narrator.onEvent('death');
  Narrator.onEvent('victory');
  assert.equal(messages.length, 3, 'смерть и победа всегда имеют реплику');
  assert.ok(messages[1].includes('История оборвалась'));
  assert.ok(messages[2].includes('Точка пройдена'));
});

test('twist rules add stats until their turn runs out', () => {
  const { messages, rng, game, sandbox } = narratorSandbox();
  const Narrator = sandbox.RK.Narrator;

  rng.randValue = 0;
  rng.chanceValue = true;
  Narrator.onEvent('turnEnd');
  assert.equal(Narrator.getMods(game.turn).atkBonus, 3, 'ярость даёт +3 атаки');
  assert.equal(messages[messages.length - 1], 'Сегодня у вас ярость! Атака +3 на 5 ходов.');
  assert.equal(Narrator.activeRulesSummary(), 'Ярость (+3 атк) (5 х.)');

  Narrator.tick(game.turn + 4);
  assert.equal(Narrator.getMods(game.turn + 4).atkBonus, 3, 'пока не истёк срок');
  Narrator.tick(game.turn + 5);
  assert.equal(Narrator.getMods(game.turn + 5).atkBonus, 0, 'срок вышел — бонуса нет');
  assert.equal(Narrator.activeRulesSummary(), '');
});

test('floor-scoped greed disappears on the next floor start', () => {
  const { rng, game, sandbox } = narratorSandbox();
  const Narrator = sandbox.RK.Narrator;

  rng.randValue = 0.55;
  rng.chanceValue = true;
  Narrator.onEvent('turnEnd');
  assert.equal(Narrator.getMods(game.turn).goldMul, 2, 'жадность удваивает золото');
  assert.ok(Narrator.activeRulesSummary().includes('Жадность'), 'правило этажа видно в сводке');

  Narrator.onEvent('floorStart', { floor: 2 });
  assert.equal(Narrator.getMods(game.turn).goldMul, 1, 'спуск ниже снимает правило этажа');
  assert.equal(Narrator.activeRulesSummary(), '');
});

test('without a run the narrator reports no modifiers', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'rng.js', 'narrator.js'] });
  const mods = sandbox.RK.Narrator.getMods(0);

  assert.equal(mods.atkBonus, 0);
  assert.equal(mods.goldMul, 1);
  assert.equal(mods.freezeEnemies, false);
  assert.equal(sandbox.RK.Narrator.activeRulesSummary(), '');
});
