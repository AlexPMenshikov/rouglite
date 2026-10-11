const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

class Element {
  constructor() {
    this.listeners = {};
    this.children = [];
    this.classList = { toggle() {} };
    this.style = {};
    this.disabled = false;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.scrollTop = 0;
    this.value = '';
  }

  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
  setAttribute() {}
  addEventListener(type, callback) { this.listeners = this.listeners || {}; this.listeners[type] = callback; }
  querySelector() { return new Element(); }
  set textContent(value) { this.children = []; this._text = value; }
  get textContent() { return this._text || ''; }
  set innerHTML(value) { this.children = []; this._html = value; }
  get innerHTML() { return this._html || ''; }
}

function createUI() {
  const elements = new Map();
  const sandbox = {
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, new Element());
        return elements.get(id);
      },
      createElement() { return new Element(); },
      createTextNode(text) { const node = new Element(); node.textContent = text; return node; },
    },
    RK: { CONFIG: {}, Narrator: { NAME: 'Рассказчик' } },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8'), sandbox);
  return { ui: sandbox.RK.UI, elements };
}

test('default log keeps important events and DEBUG enables detailed messages', () => {
  const { ui, elements } = createUI();
  elements.set('log', new Element());
  elements.set('debug-log', new Element());
  elements.get('debug-log').addEventListener('change', function () {
    ui.debugLogEnabled(elements.get('debug-log').checked);
  });
  ui.msg('Moved north');
  ui.msg('Игрок достиг уровня 2');
  const log = elements.get('log');
  assert.equal(log.children.length, 1);

  const toggle = elements.get('debug-log');
  toggle.checked = true;
  toggle.listeners.change();
  ui.msg('Moved east');
  assert.equal(log.children.length, 2);
  toggle.checked = false;
  toggle.listeners.change();
  ui.msg('Moved west');
  assert.equal(log.children.length, 2);
});

test('chat messages are rendered as text, not HTML', () => {
  const { ui, elements } = createUI();
  elements.set('chat-messages', new Element());
  ui.chatMessage({ name: '<guest>', text: '<script>alert(1)</script>' });
  const entry = elements.get('chat-messages').children[0];
  assert.equal(entry.children[0].textContent, '<guest>: ');
  assert.equal(entry.children[1].textContent, '<script>alert(1)</script>');
});
