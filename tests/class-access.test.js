'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createSandbox, Element } = require('./helpers/sandbox');

function setupRunControls(elements) {
  for (const id of ['btn-play', 'btn-class-select-back', 'btn-class-select-start',
    'btn-host-room', 'btn-join-room', 'btn-start-coop']) {
    elements.set(id, new Element('button'));
  }
  for (const id of ['class-select-list', 'class-select-bank', 'shop-list', 'shop-classes']) {
    elements.set(id, new Element('div'));
  }
  elements.set('player-name', new Element('input'));
  elements.set('map-size', Object.assign(new Element('select'), { value: 'compact' }));
  elements.set('map-style', Object.assign(new Element('select'), { value: 'stone' }));
}

test('all classes are unlocked and can be selected without spending banked gold', () => {
  const { sandbox, elements } = createSandbox({ ui: true });
  setupRunControls(elements);
  sandbox.RK.Meta.data.bank = 0;
  sandbox.RK.Meta.load();
  sandbox.RK.UI.init();

  for (const classId of Object.keys(sandbox.RK.Classes.CLASS_DEFS)) {
    assert.equal(sandbox.RK.Meta.data.classes[classId], true, `${classId} is unlocked`);
    assert.equal(sandbox.RK.Meta.buyClass(classId), true, `${classId} can be selected`);
    assert.equal(sandbox.RK.Meta.data.selectedClass, classId);
    assert.equal(sandbox.RK.Meta.data.bank, 0, 'selecting a class does not spend gold');
  }

  elements.get('btn-play').listeners.click();
  for (const classId of Object.keys(sandbox.RK.Classes.CLASS_DEFS)) {
    sandbox.RK.Meta.buyClass(classId);
    sandbox.RK.UI.show('class-select');
    const cards = elements.get('class-select-list').children;
    const card = cards.find((entry) => entry.className.includes('selected'));
    assert.ok(card, `${classId} is selectable in single-player class selection`);
  }

  sandbox.RK.Network = { isHost: () => true };
  elements.get('btn-start-coop').listeners.click();
  assert.equal(sandbox.RK.UI.screen(), 'class-select');
  for (const classId of Object.keys(sandbox.RK.Classes.CLASS_DEFS)) {
    sandbox.RK.Meta.buyClass(classId);
    sandbox.RK.UI.show('class-select');
    const card = elements.get('class-select-list').children.find((entry) => entry.className.includes('selected'));
    assert.ok(card, `${classId} is selectable in multiplayer class selection`);
  }

  let started = false;
  sandbox.RK.Network.startGame = () => { started = true; return true; };
  elements.get('btn-class-select-start').listeners.click();
  assert.equal(started, true, 'host can start the multiplayer run with the selected class');
});

test('a guest picks a class through the same screen and sends it to the server', () => {
  const { sandbox, elements } = createSandbox({ ui: true });
  setupRunControls(elements);
  let sentClass = null;
  sandbox.RK.Network = {
    isHost: () => false,
    inRoom: () => true,
    selectClass(classId) { sentClass = classId; return true; },
  };
  sandbox.RK.UI.init();

  elements.get('btn-start-coop').listeners.click();
  assert.equal(sandbox.RK.UI.screen(), 'class-select', 'гость открывает тот же экран выбора класса');
  assert.equal(elements.get('btn-class-select-start').textContent, 'ГОТОВО');

  sandbox.RK.Meta.buyClass('archer');
  elements.get('btn-class-select-start').listeners.click();
  assert.equal(sentClass, 'archer', 'выбранный класс уходит на сервер');
  assert.equal(sandbox.RK.UI.screen(), 'menu', 'гость возвращается в лобби, забег стартует хост');
});

test('entering a room asks for a class first, then joins with it', () => {
  const { sandbox, elements } = createSandbox({ ui: true });
  setupRunControls(elements);
  elements.set('lan-room-code', Object.assign(new Element('input'), { value: 'ROOM42' }));
  const joins = [];
  sandbox.RK.Network = {
    isHost: () => false,
    inRoom: () => false,
    joinRoom(code, name) { joins.push([code, name]); return true; },
    refreshRooms() { return true; },
  };
  sandbox.RK.UI.init();

  elements.get('btn-join-room').listeners.click();
  assert.equal(sandbox.RK.UI.screen(), 'class-select', 'вход в комнату идёт через выбор класса');
  assert.equal(elements.get('btn-class-select-start').textContent, 'ПОДКЛЮЧИТЬСЯ');
  assert.deepEqual(joins, [], 'до выбора класса соединения ещё нет');

  sandbox.RK.Meta.buyClass('archer');
  elements.get('btn-class-select-start').listeners.click();

  assert.deepEqual(joins, [['ROOM42', 'Игрок']], 'joinRoom уносит код комнаты и выбранный класс');
  assert.equal(sandbox.RK.Meta.data.selectedClass, 'archer', 'класс берётся из Meta');
});
