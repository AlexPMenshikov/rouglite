'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..', '..');
const { GAME_SCRIPTS, UI_SCRIPTS } = require('../../scripts/script-list');

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
    // Все подписки хранятся списком: в браузере addEventListener копит
    // обработчики, и лишняя подписка в коде видна только по счётчику.
    if (!this.listenerList) this.listenerList = {};
    if (!this.listenerList[type]) this.listenerList[type] = [];
    this.listenerList[type].push(callback);
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
// Открытые экраны пишутся в uiScreens: по нему видно, какой экран открылся.
function stubUi(sandbox) {
  sandbox.uiScreens = [];
  sandbox.RK.UI = {
    screen: () => 'menu',
    msg() {},
    narratorMsg() {},
    show() {},
    refresh() {},
    syncNetworkState() {},
    over() {},
    showMerchant() { sandbox.uiScreens.push('merchant'); },
    showBlacksmith() { sandbox.uiScreens.push('blacksmith'); },
    showTavern() { sandbox.uiScreens.push('tavern'); },
    showGuild() { sandbox.uiScreens.push('guild'); },
    showTemple() { sandbox.uiScreens.push('temple'); },
    showStorage() { sandbox.uiScreens.push('storage'); },
    showNpc() { sandbox.uiScreens.push('npc'); },
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
    addFireball(...args) { sandbox.addedEffects.push(args); },
    addLightning(...args) { sandbox.addedEffects.push(args); },
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
 * @param {boolean} [options.stubEffects] подменять RK.Effects заглушкой; выключите,
 *   чтобы проверить настоящий effects.js из списка scripts.
 */
function createSandbox({ ui = false, render = false, scripts = GAME_SCRIPTS, seed, storage, stubEffects: withEffectStub = true } = {}) {
  if (seed === undefined) seed = ++sandboxSeedCounter;
  const elements = new Map();
  // callbacks из document.addEventListener: main.js стартует только по DOMContentLoaded.
  const documentListeners = {};
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
    addEventListener(type, callback) { documentListeners[type] = callback; },
  };
  const sharedStorage = storage || new Map();
  const fillRandom = createSeedSource(seed);
  // keydown input.js слушает на window: sandbox.window ссылается на сам sandbox.
  const windowListeners = {};
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
    addEventListener(type, callback) { windowListeners[type] = callback; },
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
    sandbox.resolutionScale = 1;
    sandbox.RK.Render = {
      draw() {},
      hasVisibleBoss: () => false,
      getCameraOffset: () => ({ x: 0, y: 0 }),
      getMode: () => 'graphics',
      setMode: () => true,
      // Пресеты чёткости повторяют render.js: экран настроек строится по этому списку.
      resolutionScales: () => [1, 1.5, 2],
      resolutionScale: () => sandbox.resolutionScale,
      setResolutionScale(value) {
        sandbox.resolutionScale = value;
        return true;
      },
      refreshTooltip() {},
    };
    sandbox.RK.Audio = { isEnabled: () => false, setEnabled() {} };
    sandbox.RK.Network = null;
  } else {
    loadScripts(sandbox, scripts);
    // Связка с интерфейсом: песочница играет за браузер, и сообщения игры
    // доходят до подменённого RK.UI. Связка браузерная, поэтому её грузим
    // здесь руками: в игровом списке её нет.
    if (sandbox.RK.GameUI) loadScripts(sandbox, ['ui-binding.js']);
    stubUi(sandbox);
  }
  stubAudio(sandbox);
  if (!ui && withEffectStub) stubEffects(sandbox);

  if (render && !sandbox.RK.Render) {
    loadScripts(sandbox, ['scene.js', 'view.js', 'view-topdown.js', 'view-ascii.js', 'view-iso.js', 'render.js']);
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

  return { sandbox, elements, Element, storage: sharedStorage, documentListeners, windowListeners };
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
  const calls = [];
  let time = 0;
  const gradient = { addColorStop() {} };
  const canvasContext = new Proxy({
    fillText(glyph) { glyphs.push(glyph); calls.push(['fillText', glyph]); },
    createRadialGradient: (...args) => {
      calls.push(['createRadialGradient', ...args]);
      return gradient;
    },
    createLinearGradient: (...args) => {
      calls.push(['createLinearGradient', ...args]);
      return gradient;
    },
    // Анимация воды видна только по смещению штриховки, поэтому stroke() пишет его в отдельный массив.
    stroke() {
      calls.push(['stroke']);
      if (this.getLineDash().length) dashOffsets.push(this.lineDashOffset);
    },
    setLineDash(lines) { this.currentLineDash = lines; },
    getLineDash() { return this.currentLineDash || []; },
  }, {
    get(target, property) {
      if (property === 'canvas') return null;
      if (property in target) return target[property];
      if (typeof property === 'string') {
        return (...args) => { calls.push([property, ...args]); };
      }
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
  loadScripts(sandbox, [
    'config.js', 'meta.js', 'classes.js', 'narrator.js', 'npc.js',
    'scene.js', 'view.js', 'view-topdown.js', 'view-ascii.js', 'view-iso.js', 'render.js',
  ]);
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
    calls,
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

/**
 * Контекст для audio.js: Web Audio в node:vm нет, поэтому граф синтеза
 * собирается заглушками. Узлы запоминают параметры и расписания, а таймеры
 * motif-планировщика выполняются тестом вручную — иначе прогон зависел бы
 * от реального времени.
 */
function createAudioSandbox() {
  const nodes = { gains: [], oscillators: [], filters: [], sources: [], noises: [] };
  const timers = new Map();
  let timerId = 0;
  let time = 0;

  function makeParam(initial) {
    return {
      value: initial || 0,
      events: [],
      setValueAtTime(value, at) { this.value = value; this.events.push(['setValueAtTime', value, at]); },
      exponentialRampToValueAtTime(value, at) { this.events.push(['ramp', value, at]); },
      setTargetAtTime(value, at, tau) { this.events.push(['target', value, at, tau]); },
      cancelScheduledValues(at) { this.events.push(['cancel', at]); },
    };
  }

  function makeNode(type, extra) {
    return Object.assign({
      type: type,
      connect() {},
      disconnect() {},
      start() {},
      stop() {},
    }, extra || {});
  }

  class FakeAudioContext {
    constructor() {
      this.sampleRate = 8000;
      this.state = 'running';
      this.destination = makeNode('destination');
    }
    get currentTime() { return time; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createGain() {
      const node = makeNode('gain', { gain: makeParam(1) });
      nodes.gains.push(node);
      return node;
    }
    createDynamicsCompressor() {
      return makeNode('compressor', {
        threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 },
        attack: { value: 0 }, release: { value: 0 },
      });
    }
    createOscillator() {
      const node = makeNode('oscillator', { frequency: makeParam(0), detune: makeParam(0) });
      nodes.oscillators.push(node);
      return node;
    }
    createBiquadFilter() {
      const node = makeNode('filter', { frequency: makeParam(0), Q: makeParam(0) });
      nodes.filters.push(node);
      return node;
    }
    createBufferSource() {
      const node = makeNode('bufferSource', { buffer: null, loop: false, playbackRate: makeParam(1) });
      nodes.sources.push(node);
      return node;
    }
    createBuffer(channels, length, rate) {
      const buffer = {
        length: length,
        sampleRate: rate,
        getChannelData: () => new Float32Array(length),
      };
      nodes.noises.push(buffer);
      return buffer;
    }
  }

  const storage = new Map();
  const sandbox = {
    AudioContext: FakeAudioContext,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback: callback, delay: delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  loadScripts(sandbox, ['config.js', 'audio.js']);
  return {
    sandbox,
    nodes,
    storage,
    setTime(value) { time = value; },
    timerCount() { return timers.size; },
    /** Выполняет ближайший запланированный таймер. */
    runTimer() {
      const first = timers.entries().next();
      if (first.done) return false;
      timers.delete(first.value[0]);
      first.value[1].callback();
      return true;
    },
  };
}

/**
 * Исходники всех файлов интерфейса (js/ui-*.js) одной строкой.
 * Интерфейс разбит на файлы по экранам, поэтому проверки «какие действия и
 * спрайты использует интерфейс» смотрят все файлы сразу.
 */
function readUiSources() {
  const dir = path.join(projectRoot, 'js');
  return fs.readdirSync(dir)
    .filter((name) => /^ui.*\.js$/.test(name))
    .sort()
    .map((name) => fs.readFileSync(path.join(dir, name), 'utf8'))
    .join('\n');
}

module.exports = {
  GAME_SCRIPTS,
  UI_SCRIPTS,
  projectRoot,
  Element,
  MockWebSocket,
  createAudioSandbox,
  createCanvasContext,
  createNetworkSandbox,
  createRenderSandbox,
  createSandbox,
  findOpenNeighbor,
  placeAdjacentEnemy,
  readUiSources,
  startRunAsClass,
};
