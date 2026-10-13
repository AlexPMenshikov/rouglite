'use strict';

// Общий харнес для тестов игровых систем. Браузерные скрипты живут в глобальном
// RK, поэтому тесты гоняют их в node:vm с минимальным DOM-стабом: раньше стаб
// копировался по файлам и разъезжался с js/config.js.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..', '..');

// Порядок как в rougelite.html; render.js и main.js подключаются по запросу.
const GAME_SCRIPTS = [
  'config.js',
  'rng.js',
  'map.js',
  'world.js',
  'entities.js',
  'items.js',
  'fov.js',
  'classes.js',
  'meta.js',
  'narrator.js',
  'npc.js',
  'combat.js',
  'debug.js',
];

// ui.js обращается к Items, Classes, Narrator и NPC — нужен весь набор, а не только конфиг.
const UI_SCRIPTS = [
  'config.js',
  'rng.js',
  'entities.js',
  'items.js',
  'narrator.js',
  'classes.js',
  'npc.js',
  'meta.js',
  'ui.js',
];

// classList поверх className: toggle затирал строку классов, а contains всегда отвечал
// false — проверка «панель свернута?» молча проходила при любом состоянии.
class ClassList {
  constructor(element) {
    this.element = element;
  }

  list() {
    return String(this.element.className || '').split(/\s+/).filter(Boolean);
  }

  contains(name) {
    return this.list().includes(name);
  }

  add(name) {
    if (!this.contains(name)) this.element.className = this.list().concat(name).join(' ');
  }

  remove(name) {
    this.element.className = this.list().filter((entry) => entry !== name).join(' ');
  }

  toggle(name, on) {
    if (on === undefined) {
      if (this.contains(name)) this.remove(name);
      else this.add(name);
      return;
    }
    if (on) this.add(name);
    else this.remove(name);
  }
}

class Element {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.listeners = {};
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.className = '';
    this.value = '';
    this.width = 0;
    this.height = 0;
    this.disabled = false;
    this.checked = false;
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.classList = new ClassList(this);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  // Без этих геттеров цикл обрезки лога (`while (children.length > max)`) не завершается.
  get firstChild() {
    return this.children[0] || null;
  }

  get lastChild() {
    return this.children[this.children.length - 1] || null;
  }

  get childNodes() {
    return this.children;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index === -1) throw new Error('removeChild: узел не найден');
    this.children.splice(index, 1);
    return child;
  }

  replaceChildren(...nodes) {
    this.children = nodes;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  addEventListener(type, callback) {
    this.listeners[type] = callback;
  }

  querySelector() {
    return new Element('div');
  }

  find(predicate) {
    return this.children.find(predicate);
  }

  getContext() {
    return createCanvasContext();
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 320, height: 240, right: 320, bottom: 240 };
  }

  reportValidity() {
    return true;
  }

  cloneNode() {
    const copy = new Element(this.tagName);
    copy.textContent = this.textContent;
    copy.className = this.className;
    return copy;
  }

  set textContent(value) {
    this.children = [];
    this._textContent = value;
  }

  get textContent() {
    if (this._textContent != null) return this._textContent;
    return this.children.map((child) => child.textContent).join('');
  }

  set innerHTML(value) {
    this.children = [];
    this._innerHTML = value;
  }

  get innerHTML() {
    return this._innerHTML || '';
  }
}

// Канвас нужен только чтобы вызовы отрисовки не падали: методы ничего не рисуют.
function createCanvasContext() {
  return new Proxy({}, {
    get(target, property) {
      if (property === 'canvas') return null;
      if (property === 'createRadialGradient' || property === 'createLinearGradient') {
        return () => ({ addColorStop: () => {} });
      }
      if (property === 'measureText') return () => ({ width: 0 });
      if (property in target) return target[property];
      return () => {};
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
}

function loadScripts(sandbox, files) {
  for (const file of files) {
    const source = fs.readFileSync(path.join(projectRoot, 'js', file), 'utf8');
    vm.runInContext(source, sandbox, { filename: file });
  }
}

// Поверхность UI для ui.js и network.js. Список полный: частичный стаб расходится с
// кодом при первом же новом обращении, и тест падает на отсутствующем методе.
function stubUi(sandbox) {
  sandbox.RK.UI = {
    screen: () => 'menu',
    msg() {},
    narratorMsg() {},
    show() {},
    refresh() {},
    over() {},
    showMerchant() {},
    showBlacksmith() {},
    showNpc() {},
    gameTooltip() {},
    showLobby() {},
    networkStatus() {},
    networkPlayers() {},
    networkRooms() {},
    networkDisconnected() {},
    chatStatus() {},
    chatMessage() {},
    chatEnabled: false,
  };
}

function stubAudio(sandbox) {
  sandbox.RK.Audio = {
    start: () => true,
    setFloor() {},
    playStep() {},
    playAttack() {},
    playAbility() {},
    isEnabled: () => false,
    setEnabled() {},
  };
}

// Эффекты запоминают вызовы: на них проверяются навыки и сетевые снимки.
function stubEffects(sandbox) {
  sandbox.addedEffects = [];
  sandbox.RK.Effects = {
    add(...args) { sandbox.addedEffects.push(args); },
    addShot(...args) { sandbox.addedEffects.push(args); },
    addDamage() {},
    notePlayerHit() {},
    draw() {},
    tick() {},
    active: () => false,
  };
}

// Генератор карт берёт seed из crypto.getRandomValues, поэтому без стаба планировка была
// случайной и примерно один запуск из восьми падал. Здесь seed выдаётся по счётчику:
// тест воспроизводим, но не зависит от соседнего. Явный seed переопределяет счётчик.
let sandboxSeedCounter = 0;

/** Детерминированный источник 32-битных чисел (mulberry32). */
function createSeedSource(seed) {
  let state = seed >>> 0;
  return (view) => {
    for (let i = 0; i < view.length; i++) {
      state = (Math.imul(state ^ (state >>> 15), 1 | state) + 0x6d2b79f5) | 0;
      view[i] = (state ^ (state >>> 14)) >>> 0;
    }
    return view;
  };
}

/**
 * Создаёт изолированный игровой контекст.
 *
 * @param {boolean} [options.ui] загрузить ui.js и вести журнал отрисованных спрайтов
 * @param {boolean} [options.render] дополнительно загрузить render.js
 * @param {string[]} [options.scripts] свой список игровых скриптов
 * @param {number} [options.seed] seed для randomSeed(); по умолчанию следующий из счётчика
 * @param {Map} [options.storage] хранилище localStorage; по умолчанию своё на каждый
 *   вызов. Один и тот же Map у двух песочниц имитирует перезагрузку страницы.
 */
function createSandbox({ ui = false, render = false, scripts = GAME_SCRIPTS, seed, storage } = {}) {
  if (seed === undefined) seed = ++sandboxSeedCounter;
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element('div'));
      return elements.get(id);
    },
    createElement(tagName) {
      return new Element(tagName);
    },
    createTextNode(text) {
      const node = new Element('#text');
      node.textContent = String(text);
      return node;
    },
    addEventListener() {},
  };
  const sharedStorage = storage || new Map();
  const fillRandom = createSeedSource(seed);
  const sandbox = {
    document,
    localStorage: {
      getItem(key) { return sharedStorage.has(key) ? sharedStorage.get(key) : null; },
      setItem(key, value) { sharedStorage.set(key, String(value)); },
      removeItem(key) { sharedStorage.delete(key); },
    },
    crypto: { getRandomValues: fillRandom },
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  if (ui) {
    loadScripts(sandbox, UI_SCRIPTS);
    sandbox.drawnSprites = [];
    sandbox.RK.Assets = {
      draw: (_ctx, spriteName) => {
        sandbox.drawnSprites.push(spriteName);
        return true;
      },
      floorGrayAmount: () => 0,
      drawFloorTile() {},
      enabled: () => true,
      setEnabled(_enabled, callback) { if (callback) callback(null, false); },
      source: () => 'builtin',
      spriteNames: () => [],
    };
    sandbox.RK.Render = {
      draw() {},
      hasVisibleBoss: () => false,
      getCameraOffset: () => ({ x: 0, y: 0 }),
      getMode: () => 'graphics',
      setMode: () => true,
      refreshTooltip() {},
    };
    sandbox.RK.Audio = { isEnabled: () => false, setEnabled() {} };
    sandbox.RK.Network = null;
  } else {
    loadScripts(sandbox, scripts);
    stubUi(sandbox);
  }
  stubAudio(sandbox);
  if (!ui) stubEffects(sandbox);

  if (render && !sandbox.RK.Render) {
    loadScripts(sandbox, ['render.js']);
    sandbox.drawnSprites = [];
    sandbox.RK.Assets = {
      draw: (_ctx, spriteName) => {
        sandbox.drawnSprites.push(spriteName);
        return true;
      },
      floorGrayAmount: () => 0,
      drawFloorTile() {},
    };
  }

  return { sandbox, elements, Element, storage: sharedStorage };
}

/** Ближайшая проходимая клетка рядом с героем. */
function findOpenNeighbor(RK) {
  const { x, y } = RK.GAME.player;
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const found = directions.find(([dx, dy]) => {
    const nx = x + dx;
    const ny = y + dy;
    return RK.MapGen.isWalkable(nx, ny) &&
      !RK.MapGen.getDoorAt(nx, ny) &&
      !RK.MapGen.getChestAt(nx, ny) &&
      !(RK.Map.stair && RK.Map.stair.x === nx && RK.Map.stair.y === ny);
  });
  if (!found) throw new Error('findOpenNeighbor: у героя нет свободной соседней клетки');
  return found;
}

/** Начинает забег выбранным классом. */
function startRunAsClass(RK, classId, options = { size: 'compact', style: 'stone' }) {
  RK.Meta.data.selectedClass = classId;
  RK.Combat.newRun(options);
  return RK.GAME.player;
}

/** Ставит единственного неуязвимого врага вплотную к герою. */
function placeAdjacentEnemy(RK, type, { enhanced = false, atk = 0, hp = 10000 } = {}) {
  const [dx, dy] = findOpenNeighbor(RK);
  const enemy = RK.Entities.makeEnemy(
    type,
    RK.GAME.player.x + dx,
    RK.GAME.player.y + dy,
    RK.GAME.floor,
    enhanced,
  );
  enemy.hp = hp;
  enemy.maxHp = hp;
  enemy.atk = atk;
  enemy.def = 0;
  enemy.alerted = true;
  RK.GAME.enemies = [enemy];
  return { dx, dy, enemy };
}

/**
 * Контекст для render.js. Набор скриптов повторяет rougelite.html вместе с classes.js
 * и narrator.js: без RK.Classes отличающий класс обхода ловушек проверялся бы отключённым.
 *
 * @param {string} [options.classId] класс, выбранный в Meta
 * @param {object} [options.meta] состояние, записанное в localStorage как `rogalite_meta_v1`
 *   и переданное в RK.Meta.load()
 */
function createRenderSandbox({ classId, meta } = {}) {
  const glyphs = [];
  const dashOffsets = [];
  let time = 0;
  const gradient = { addColorStop() {} };
  const canvasContext = new Proxy({
    fillText(glyph) { glyphs.push(glyph); },
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    // Анимация воды видна только по смещению штриховки, поэтому stroke() пишет его в отдельный массив.
    stroke() {
      if (this.getLineDash().length) dashOffsets.push(this.lineDashOffset);
    },
    setLineDash(lines) { this.currentLineDash = lines; },
    getLineDash() { return this.currentLineDash || []; },
  }, {
    get(target, property) {
      if (property === 'canvas') return null;
      if (property in target) return target[property];
      return () => {};
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
  const elements = new Map();
  const canvas = { width: 192, height: 192, getContext: () => canvasContext };
  const stored = new Map();
  const sandbox = {
    document: {
      getElementById(id) {
        if (id === 'game') return canvas;
        if (!elements.has(id)) elements.set(id, new Element('div'));
        return elements.get(id);
      },
      createElement() { return new Element('canvas'); },
      createTextNode(text) {
        const node = new Element('#text');
        node.textContent = String(text);
        return node;
      },
      addEventListener() {},
    },
    localStorage: {
      getItem(key) { return stored.has(key) ? stored.get(key) : null; },
      setItem(key, value) { stored.set(key, value); },
      removeItem(key) { stored.delete(key); },
    },
    performance: { now: () => time },
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  loadScripts(sandbox, ['config.js', 'meta.js', 'classes.js', 'narrator.js', 'npc.js', 'render.js']);
  sandbox.RK.Assets = {
    draw: () => true,
    floorGrayAmount: () => 0,
    drawFloorTile() {},
  };
  sandbox.RK.Effects = { draw() {}, tick() {}, active: () => false };
  sandbox.RK.Network = null;
  if (classId) sandbox.RK.Meta.data.selectedClass = classId;
  // load() нужен только когда состояние подано извне: лишний затёр бы выбранный classId.
  if (meta) {
    stored.set('rogalite_meta_v1', JSON.stringify(meta));
    sandbox.RK.Meta.load();
  }
  return {
    sandbox,
    elements,
    glyphs,
    dashOffsets,
    stored,
    setTime(value) { time = value; },
    Element,
  };
}

// Сокет для network.js. Серверных ответов он не ждёт: последнее соединение доступно
// как MockWebSocket.lastConnection, а emit() разыгрывает входящее сообщение.
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.listeners = {};
    MockWebSocket.lastConnection = this;
  }

  addEventListener(type, callback) {
    this.listeners[type] = callback;
  }

  send() {}

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.listeners.close) this.listeners.close({ code: 1000, reason: '', wasClean: true });
  }

  emit(type, event) {
    if (type === 'open') this.readyState = MockWebSocket.OPEN;
    this.listeners[type](event);
  }
}

MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSED = 3;

/**
 * Контекст для network.js: MockWebSocket вместо сокета и location вместо
 * адресной строки. Сокет остаётся доступен через MockWebSocket.lastConnection,
 * поэтому тест сам разыгрывает серверные сообщения.
 */
function createNetworkSandbox() {
  const elements = new Map();
  const storage = new Map();
  const sandbox = {
    WebSocket: MockWebSocket,
    location: { protocol: 'http:', host: 'localhost' },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    setTimeout(callback) { sandbox.pendingTimeout = callback; return 1; },
    clearTimeout() {},
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, new Element('div'));
        return elements.get(id);
      },
      createElement(tagName) { return new Element(tagName); },
      addEventListener() {},
    },
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  loadScripts(sandbox, ['config.js', 'meta.js', 'network.js']);
  stubUi(sandbox);
  return { sandbox, elements, Element };
}

module.exports = {
  GAME_SCRIPTS,
  UI_SCRIPTS,
  projectRoot,
  Element,
  MockWebSocket,
  createCanvasContext,
  createNetworkSandbox,
  createRenderSandbox,
  createSandbox,
  findOpenNeighbor,
  placeAdjacentEnemy,
  startRunAsClass,
};
