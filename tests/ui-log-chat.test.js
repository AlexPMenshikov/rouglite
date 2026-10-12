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
