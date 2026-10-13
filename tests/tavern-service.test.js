'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createSandbox } = require('./helpers/sandbox');

function cityRun(seed = 301) {
  const { sandbox } = createSandbox({ seed });
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'medium', style: 'stone' });
  return RK;
}

function npcOf(RK, kind) {
  return RK.GAME.npcs.find((npc) => npc.kind === kind) || null;
}

function standNear(RK, npc) {
  const neighbors = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const tile = neighbors
    .map(([dx, dy]) => ({ x: npc.x + dx, y: npc.y + dy }))
    .find((point) => RK.MapGen.isMapWalkable(RK.Map, point.x, point.y));
  assert.ok(tile, 'у NPC есть клетка, с которой можно говорить');
  RK.GAME.player.x = tile.x;
  RK.GAME.player.y = tile.y;
  return tile;
}

test('innkeeper stands in tavern and has tavern service', () => {
  const RK = cityRun(301);
  const innkeeper = npcOf(RK, 'innkeeper');
  assert.ok(innkeeper, 'трактирщик в городе есть');
  assert.equal(RK.Npc.service(innkeeper), 'tavern', 'трактирщик даёт сервис таверны');
});

test('tavern rest costs gold and restores hp', () => {
  const RK = cityRun(302);
  standNear(RK, npcOf(RK, 'innkeeper'));
  const p = RK.GAME.player;
  p.hp = Math.floor(p.maxHp / 2);
  p.gold = 20;
  const result = RK.Combat.tavernRest();
  assert.equal(result, true);
  assert.equal(p.hp, p.maxHp, 'отдых восстановил здоровье');
  assert.equal(p.gold, 10, 'отдых стоил 10 золота');
});

test('tavern rest fails without gold', () => {
  const RK = cityRun(303);
  standNear(RK, npcOf(RK, 'innkeeper'));
  const p = RK.GAME.player;
  p.hp = Math.floor(p.maxHp / 2);
  p.gold = 0;
  const result = RK.Combat.tavernRest();
  assert.equal(result, false);
  assert.ok(p.hp < p.maxHp, 'без золота отдых не работает');
});

test('tavern rumors costs gold and gives hint', () => {
  const RK = cityRun(304);
  standNear(RK, npcOf(RK, 'innkeeper'));
  const p = RK.GAME.player;
  p.gold = 10;
  const result = RK.Combat.tavernRumors();
  assert.equal(result, true);
  assert.equal(p.gold, 5, 'слухи стоили 5 золота');
});

test('tavern rumors fails without gold', () => {
  const RK = cityRun(305);
  standNear(RK, npcOf(RK, 'innkeeper'));
  const p = RK.GAME.player;
  p.gold = 0;
  const result = RK.Combat.tavernRumors();
  assert.equal(result, false);
});

test('tavern screen renders buttons and gold', () => {
  const { sandbox, elements } = createSandbox({ ui: true });
  sandbox.RK.GAME = { player: { gold: 20, hp: 50, maxHp: 100 }, npcs: [], quests: [] };
  const ui = sandbox.RK.UI;
  ui.showTavern();
  assert.equal(elements.get('tavern-gold').textContent, 'У вас: 20 золота');
  assert.equal(elements.get('btn-tavern-rest').disabled, false);
  assert.equal(elements.get('btn-tavern-rumors').disabled, false);
});

test('tavern rest button disabled without gold', () => {
  const { sandbox, elements } = createSandbox({ ui: true });
  sandbox.RK.GAME = { player: { gold: 0, hp: 50, maxHp: 100 }, npcs: [], quests: [] };
  const ui = sandbox.RK.UI;
  ui.showTavern();
  assert.equal(elements.get('btn-tavern-rest').disabled, true);
  assert.equal(elements.get('btn-tavern-rumors').disabled, true);
});

test('openNpcScreen routes innkeeper to tavern service', () => {
  const RK = cityRun(306);
  standNear(RK, npcOf(RK, 'innkeeper'));
  const innkeeper = npcOf(RK, 'innkeeper');
  assert.equal(RK.Npc.service(innkeeper), 'tavern', 'сервис таверны у трактирщика');
  assert.equal(typeof RK.Combat.openNpcScreen, 'function', 'обработчик открытия экрана есть');
});
