'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const CONFIG = require('../js/config');
const { ENGINE_SCRIPTS } = require('../scripts/script-list');
const { createSandbox } = require('./helpers/sandbox');

// Игра и интерфейс разведены контрактом: игровой код говорит через RK.GameUI,
// и про интерфейс не знает. Один интерфейс — у клиента, другой приёмник — у
// сервера, и ни один из них не подменяет другой.

const jsDir = path.join(__dirname, '..', 'js');

function readSource(name) {
  return fs.readFileSync(path.join(jsDir, name), 'utf8');
}

// Комментарии вырезаются: контракт в своей шапке объясняет, что RK.UI —
// внутреннее дело интерфейса, и это знание ему нужно. Проверка — про код.
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('игровой код не знает про интерфейс', () => {
  for (const file of ENGINE_SCRIPTS) {
    const code = codeOnly(readSource(file));
    assert.ok(!code.includes('RK.UI'),
      file + ' ссылается на RK.UI: игровой код говорит через контракт');
  }
});

test('серверный движок работает без интерфейса', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server', 'game-engine.js'), 'utf8');
  assert.ok(!source.includes('RK.UI'),
    'движок не подменяет интерфейс: у него свой приёмник контракта');
  assert.ok(!source.includes('sandbox.RK.UI'),
    'движок не создаёт объект интерфейса');
});

test('контракт доставляет события приёмнику', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'game-ui.js'] });
  const seen = [];
  sandbox.RK.GameUI.setHandlers({
    log: (text) => seen.push(['log', text]),
    narrate: (text) => seen.push(['narrate', text]),
    screen: (name, npcId) => seen.push(['screen', name, npcId]),
    refresh: () => seen.push(['refresh']),
    syncState: () => seen.push(['syncState']),
    over: (win, floor, level, banked) => seen.push(['over', win, floor, level, banked]),
  });
  const UI = sandbox.RK.GameUI;

  UI.log('сообщение');
  UI.narrate('реплика рассказчика');
  UI.screen('tavern');
  UI.screen('npc', 'priest');
  UI.refresh();
  UI.syncState();
  UI.over(false, 2, 3, 10);

  assert.deepEqual(seen, [
    ['log', 'сообщение'],
    ['narrate', 'реплика рассказчика'],
    ['screen', 'tavern', null],
    ['screen', 'npc', 'priest'],
    ['refresh'],
    ['syncState'],
    ['over', false, 2, 3, 10],
  ]);
});

test('без приёмника контракт молчит, а не падает', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'game-ui.js'] });
  const UI = sandbox.RK.GameUI;
  UI.log('сообщение');
  UI.narrate('реплика');
  UI.screen('tavern');
  UI.refresh();
  UI.syncState();
  UI.over(false, 1, 1, 0);
  UI.setHandlers(null);
  UI.log('ещё одно');
});

test('каждый экран, который открывает игра, есть в контракте', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'game-ui.js'] });
  const screens = sandbox.RK.GameUI.SCREENS;
  const used = new Set();

  for (const file of ENGINE_SCRIPTS) {
    const source = readSource(file);
    for (const match of source.matchAll(/RK\.GameUI\.screen\('([a-z]+)'/g)) {
      used.add(match[1]);
    }
  }
  assert.ok(used.size > 0, 'игра открывает экраны');

  for (const name of used) {
    assert.ok(screens[name], 'экрана ' + name + ' нет в контракте');
  }
});

test('служба NPC — это панель из контракта', () => {
  const { sandbox } = createSandbox({});
  const screens = sandbox.RK.GameUI.SCREENS;
  for (const kind of CONFIG.NPC_KINDS) {
    const service = sandbox.RK.Npc.def(kind).service;
    if (!service) continue;
    assert.equal(screens[service], 'panel',
      'служба ' + kind + ' открывает экран ' + service + ', и он должен быть панелью');
  }
});

test('у каждого экрана контракта есть открывалка в браузере', () => {
  const { sandbox } = createSandbox({ scripts: ['config.js', 'game-ui.js'] });
  const binding = readSource('ui-binding.js');
  for (const name of Object.keys(sandbox.RK.GameUI.SCREENS)) {
    assert.ok(binding.includes(name + ': function'),
      'экрана ' + name + ' нечем открыть в браузере');
  }
});
