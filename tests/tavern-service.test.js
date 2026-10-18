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

test('tavern buy food spends gold and stacks in backpack', () => {
  const RK = cityRun(307);
  standNear(RK, npcOf(RK, 'innkeeper'));
  const p = RK.GAME.player;
  p.gold = 100;
  assert.equal(RK.Combat.tavernBuyFood('bread'), true);
  assert.equal(p.gold, 88, 'хлеб стоит value × 2 = 12');
  const bread = p.backpack.find((item) => item.kind === 'food' && item.foodId === 'bread');
  assert.ok(bread, 'хлеб в рюкзаке');
  assert.equal(bread.count, 1);
  assert.equal(RK.Combat.tavernBuyFood('bread'), true);
  assert.equal(p.gold, 76);
  assert.equal(p.backpack.find((item) => item.foodId === 'bread').count, 2, 'повторная покупка стакуется');
});

test('tavern buy food fails without gold and for unknown food', () => {
  const RK = cityRun(308);
  standNear(RK, npcOf(RK, 'innkeeper'));
  const p = RK.GAME.player;
  p.gold = 5;
  assert.equal(RK.Combat.tavernBuyFood('stew'), false, 'тушёное дороже');
  assert.equal(p.backpack.filter((item) => item.kind === 'food').length, 0, 'без золота еды нет');
  p.gold = 100;
  assert.equal(RK.Combat.tavernBuyFood('pizza'), false, 'неизвестное блюдо отклоняется');
  assert.equal(p.gold, 100, 'за неизвестное блюдо не платят');
});

test('tavern menu renders every food with price', () => {
  const { sandbox, elements } = createSandbox({ ui: true });
  sandbox.RK.GAME = { player: { gold: 100, hp: 50, maxHp: 100 }, npcs: [], quests: [] };
  const ui = sandbox.RK.UI;
  ui.showTavern();
  const list = elements.get('tavern-food-list');
  assert.equal(list.children.length, 5, 'в меню все пять блюд');
  assert.ok(list.children[0].textContent.includes('Хлеб — 12 золота'), list.children[0].textContent);
  assert.equal(list.children[0].children[1].disabled, false, 'с золотом кнопка активна');
});

test('tavern menu disables dishes the player cannot afford', () => {
  const { sandbox, elements } = createSandbox({ ui: true });
  sandbox.RK.GAME = { player: { gold: 9, hp: 50, maxHp: 100 }, npcs: [], quests: [] };
  const ui = sandbox.RK.UI;
  ui.showTavern();
  const list = elements.get('tavern-food-list');
  for (const row of list.children) {
    assert.equal(row.children[1].disabled, true, 'дешевшее блюдо тоже дороже 9 золота');
  }
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
