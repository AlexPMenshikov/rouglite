const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox, Element } = require('./helpers/sandbox');

function createUI() {
  const { sandbox, elements } = createSandbox({ ui: true });
  return { ui: sandbox.RK.UI, elements };
}

test('default log keeps important events and DEBUG enables detailed messages', () => {
  const { ui, elements } = createUI();
  elements.set('log', new Element());
  elements.set('debug-log', new Element());
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
