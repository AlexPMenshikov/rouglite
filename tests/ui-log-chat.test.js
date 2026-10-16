const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, Element } = require('./helpers/sandbox');

function createUI() {
  const { sandbox, elements } = createSandbox({ ui: true });
  return { ui: sandbox.RK.UI, elements, sandbox };
}

function setupRunControls(elements) {
  for (const id of ['btn-play', 'btn-class-select-back', 'btn-class-select-start',
    'btn-host-room', 'btn-join-room', 'btn-start-coop']) {
    elements.set(id, new Element('button'));
  }
  elements.set('map-size', new Element('select'));
  elements.set('map-style', new Element('select'));
}

test('default log keeps important events and DEBUG enables detailed messages', () => {
  const { ui, elements } = createUI();
  elements.set('log', new Element());
  elements.set('debug-log', new Element());
  setupRunControls(elements);
  ui.init();
  const log = elements.get('log');
  const toggle = elements.get('debug-log');

  // Важные события попадают в лог всегда, обычные — только с DEBUG.
  ui.msg('Moved north');
  ui.msg('Игрок достиг уровня 2');
  assert.equal(log.children.length, 1);

  toggle.checked = true;
  toggle.listeners.change();
  ui.msg('Moved east');
  assert.equal(log.children.length, 2);

  toggle.checked = false;
  toggle.listeners.change();
  ui.msg('Moved west');
  assert.equal(log.children.length, 2);
});

test('the log is capped so long runs do not grow without bound', () => {
  const { ui, elements } = createUI();
  const log = new Element();
  elements.set('log', log);
  ui.init();
  ui.chatEnabled(false);
  for (let i = 0; i < 400; i++) ui.chatMessage({ name: 'Гость', text: 'привет ' + i });
  assert.ok(log.children.length <= 100, 'chat entries must be trimmed');
});

test('chat messages are rendered as text, not HTML', () => {
  const { ui, elements } = createUI();
  elements.set('chat-messages', new Element());
  ui.chatMessage({ name: '<guest>', text: '<script>alert(1)</script>' });
  const entry = elements.get('chat-messages').children[0];
  assert.equal(entry.children[0].textContent, '<guest>: ');
  assert.equal(entry.children[1].textContent, '<script>alert(1)</script>');
});

test('the combat log collapses into a strip and comes back from the same button', () => {
  const { ui, elements } = createUI();
  elements.set('log-panel', new Element());
  elements.set('btn-log-toggle', new Element());
  setupRunControls(elements);
  ui.init();

  const panel = elements.get('log-panel');
  const toggle = elements.get('btn-log-toggle');
  assert.equal(panel.classList.contains('collapsed'), false, 'по умолчанию журнал раскрыт');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');

  toggle.listeners.click();
  assert.equal(panel.classList.contains('collapsed'), true, 'журнал сворачивается');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(labelOf(toggle), 'Журнал', 'в полосе остаётся надпись, по которой её открыть');

  toggle.listeners.click();
  assert.equal(panel.classList.contains('collapsed'), false, 'журнал раскрывается обратно');
  assert.equal(labelOf(toggle), 'Свернуть');
});

// Подпись кнопки лежит в собственном узле: иконка рядом с ней, иначе смена
// текста стирала бы картинку.
function labelOf(button) {
  const label = button.children.find((child) => child.className === 'btn-label');
  return label ? label.textContent : null;
}

test('hud buttons get an icon and a label span drawn from engine sprites', () => {
  const { sandbox, elements } = createSandbox({ ui: true });
  const ui = sandbox.RK.UI;
  for (const id of ['btn-potion', 'btn-sound', 'btn-log-toggle']) elements.set(id, new Element());
  setupRunControls(elements);
  // Текст кнопки в разметке: ui.js разбирает кнопку на иконку и подпись, но
  // подпись берёт из разметки, а не из своей копии строк.
  elements.get('btn-potion').textContent = 'Выпить зелье (R) ×1';
  sandbox.drawnSprites.length = 0;
  ui.init();

  const potion = elements.get('btn-potion');
  const icon = iconOf(potion);
  assert.ok(icon, 'у кнопки зелья есть иконка');
  assert.equal(potion.children.length, 2, 'в кнопке ровно иконка и подпись');
  assert.equal(labelOf(potion), 'Выпить зелье (R) ×1', 'текст кнопки уехал в отдельный узел');
  assert.ok(sandbox.drawnSprites.includes('potion'),
    'иконка нарисована спрайтом из движка: ' + sandbox.drawnSprites.join(','));

  // Подпись у таких кнопок меняется каждым refresh (зелья, навык, звук), и
  // меняться она должна не трогая иконку.
  const toggle = elements.get('btn-log-toggle');
  const toggleIcon = iconOf(toggle);
  toggle.listeners.click();
  assert.equal(iconOf(toggle), toggleIcon, 'смена подписи не пересоздаёт иконку');
  assert.equal(labelOf(toggle), 'Журнал');
});

function iconOf(button) {
  return button.children.find((child) => child.className === 'btn-icon');
}

test('equipped items show their sprite in the character panel and inventory', () => {
  const { ui, elements, sandbox } = createUI();
  const RK = sandbox.RK;
  const weapon = { kind: 'loot', slot: 'weapon', name: 'Меч', asset: 'sword', rarity: 'rare' };
  const boots = { kind: 'loot', slot: 'boots', name: 'Сапоги', asset: 'boots', rarity: 'common' };
  RK.GAME = {
    floor: 1,
    turn: 1,
    locationMode: false,
    quests: [],
    player: {
      name: 'Герой', className: 'Паладин', classId: 'paladin', level: 1, hp: 20, maxHp: 20,
      atk: 5, def: 1, xp: 0, gold: 0, potionHeal: 30,
      equipment: { weapon: weapon, boots: boots },
      backpack: [],
    },
  };
  RK.Combat = {
    getZoneAt: () => null,
    getZoneMods: () => ({ atkBonus: 0, defBonus: 0 }),
  };
  const withIcon = (slots) => slots.filter((slot) =>
    slot.children.some((child) => child.tagName === 'CANVAS'));

  sandbox.drawnSprites.length = 0;
  ui.show('game');
  assert.ok(sandbox.drawnSprites.includes('sword'), 'спрайт оружия нарисован');
  assert.ok(sandbox.drawnSprites.includes('boots'), 'спрайт сапог нарисован');
  assert.equal(withIcon(elements.get('equipment-slots').children).length, 2,
    'в панели персонажа иконка есть у обоих надетых предметов');

  ui.showInventory();
  assert.equal(withIcon(elements.get('inventory-equipment-slots').children).length, 2,
    'в окне инвентаря иконки тоже есть');
});

test('the teleport button is enabled only outside the city and sends the action', () => {
  const { ui, elements, sandbox } = createUI();
  const RK = sandbox.RK;
  const calls = [];
  let locationId = 'city_start';
  RK.World = { current: () => ({ id: locationId }) };
  RK.GAME = {
    floor: 1,
    turn: 1,
    locationMode: true,
    quests: [],
    player: {
      name: 'Герой', className: 'Паладин', classId: 'paladin', level: 1, hp: 20, maxHp: 20,
      atk: 5, def: 1, xp: 0, gold: 0, potionHeal: 30, equipment: {}, backpack: [],
    },
  };
  RK.Combat = {
    getZoneAt: () => null,
    getZoneMods: () => ({ atkBonus: 0, defBonus: 0 }),
    teleportToCity: () => { calls.push(true); return true; },
  };
  ui.init();
  ui.show('game');

  const button = elements.get('btn-teleport-city');
  assert.equal(button.disabled, true, 'в городе телепорт недоступен');

  locationId = 'wilderness_forest';
  ui.refresh();
  assert.equal(button.disabled, false, 'вне города телепорт доступен');
  button.listeners.click();
  assert.equal(calls.length, 1, 'кнопка шлёт действие телепорта');
});

test('single-player start opens class selection and starts with a freely selected class', () => {
  const { ui, elements, sandbox } = createUI();
  setupRunControls(elements);
  elements.set('player-name', new Element('input'));
  elements.set('map-size', Object.assign(new Element('select'), { value: 'compact' }));
  elements.set('map-style', Object.assign(new Element('select'), { value: 'crypt' }));
  let startedWith = null;
  sandbox.RK.Combat = { newRun(options) {
    startedWith = { options, classId: sandbox.RK.Meta.data.selectedClass };
    ui.show('game');
  } };
  ui.init();

  elements.get('btn-play').listeners.click();
  assert.equal(ui.screen(), 'class-select');
  assert.equal(startedWith, null);

  assert.equal(sandbox.RK.Meta.data.classes.berserker, true, 'берсерк доступен без покупки');
  assert.equal(sandbox.RK.Meta.data.bank, 0, 'выбор класса не тратит золото');
  sandbox.RK.Meta.buyClass('berserker');
  elements.get('btn-class-select-start').listeners.click();
  assert.equal(startedWith.classId, 'berserker');
  assert.deepEqual(JSON.parse(JSON.stringify(startedWith.options)), { size: 'compact', style: 'crypt' });
  assert.equal(ui.screen(), 'game');
});

test('multiplayer start sends the selected class to the server', () => {
  const { ui, elements, sandbox } = createUI();
  setupRunControls(elements);
  elements.set('player-name', new Element('input'));
  elements.set('map-size', Object.assign(new Element('select'), { value: 'compact' }));
  elements.set('map-style', Object.assign(new Element('select'), { value: 'crypt' }));
  let startOptions = null;
  sandbox.RK.Network = {
    isHost: () => true,
    startGame(options) { startOptions = options; return true; },
  };
  ui.init();

  elements.get('btn-start-coop').listeners.click();
  assert.equal(ui.screen(), 'class-select');
  sandbox.RK.Meta.buyClass('archer');
  elements.get('btn-class-select-start').listeners.click();

  assert.equal(startOptions.classId, 'archer');
  assert.equal(startOptions.size, 'compact');
  assert.equal(startOptions.style, 'crypt');
});

test('game canvas stays visible when chat is enabled', () => {
  const { ui, elements } = createUI();
  elements.set('chat-panel', new Element());
  elements.set('chat-input', new Element());
  elements.set('btn-chat-send', new Element());
  elements.set('canvas-wrap', new Element());
  elements.set('game-main', new Element());
  setupRunControls(elements);
  ui.init();

  // Игра на экране: поле видно.
  ui.show('game');
  const canvas = elements.get('canvas-wrap');
  const gameMain = elements.get('game-main');
  assert.equal(canvas.classList.contains('hidden'), false, 'игровое поле должно быть видно');

  // Чат включён — поле остаётся видимым.
  ui.chatEnabled(true);
  assert.equal(canvas.classList.contains('hidden'), false, 'чат не должен скрывать игровое поле');
  assert.equal(gameMain.classList.contains('hidden'), false, 'основная область игры должна оставаться видимой');

  // Чат выключен — поле всё ещё видно.
  ui.chatEnabled(false);
  assert.equal(canvas.classList.contains('hidden'), false, 'игровое поле должно оставаться видимым');
});
