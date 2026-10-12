'use strict';

// Игровая логика в Node. Раньше забег вёл браузер хоста, и подключённые игроки
// зависели от его окна: свернутое окно останавливает requestAnimationFrame,
// а с ним и продвижение хода. Здесь движок крутится в процессе сервера, который
// браузером не управляется, поэтому окно хоста на ход больше не влияет.
//
// Скрипты движка — те же самые, что грузит браузер, без единой правки под Node:
// ui.js, render.js, input.js и network.js остаются на клиенте, а RK.UI /
// RK.Audio / RK.Effects заменяются сбором событий забега.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Порядок соответствует rougelite.html: конфигурация и данные идут раньше
// потребителей.
const ENGINE_SCRIPTS = [
  'config.js',
  'rng.js',
  'map.js',
  'entities.js',
  'items.js',
  'fov.js',
  'narrator.js',
  'classes.js',
  'meta.js',
  'combat.js',
];

// Шаг длится C.WALK_MS и завершается в tickWalk. Браузер зовёт его из
// requestAnimationFrame, сервер — из таймера: кадров у свёрнутого окна нет,
// а таймер процесса работает всегда.
const TICK_MS = 16;
// Предохранитель от бесконечного шага: автопроход по карте конечен, но очередь
// действий комнаты не должна вставать из-за одного зависшего забега.
const MAX_ACTION_MS = 30000;

function loadEngine(collect) {
  const sandbox = {
    console,
    performance: { now: () => performance.now() },
    crypto,
    // Единственное обращение движка к DOM — resizeCanvas за canvas. На сервере
    // рисовать нечего, поэтому getElementById возвращает null и шаг пропускается.
    document: { getElementById: () => null },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const file of ENGINE_SCRIPTS) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
    vm.runInContext(source, sandbox, { filename: file });
  }
  sandbox.RK.Audio = {
    start: () => true,
    setFloor() {},
    playStep() {},
    playAttack() {},
    playAbility() {},
  };
  sandbox.RK.Effects = { add() {}, addDamage() {}, addShot() {}, notePlayerHit() {} };
  // События забега, которые уедут игрокам вместе со снимком: журнал — общий для
  // партии, экраны NPC открываются тому, кто их вызвал.
  sandbox.RK.UI = {
    msg(text) { collect.log.push({ text: String(text) }); },
    narratorMsg(text) { collect.log.push({ text: String(text), narrator: true }); },
    refresh() {},
    syncNetworkState() {},
    show() {},
    showMerchant() { collect.screens.push('merchant'); },
    showBlacksmith() { collect.screens.push('blacksmith'); },
    over(win, floor, level, banked) {
      collect.over = { win: !!win, floor, level, banked: banked || 0 };
    },
  };
  return sandbox;
}

function wait(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Один забег сетевой комнаты.
 *
 * @param {object} options
 * @param {Array<{id: string, name: string, classId: string}>} options.players партия, первый — хост
 * @param {{size?: string, style?: string}} [options.runOptions] размер и стиль карты
 * @param {number} [options.luck] удача из мет-прогресса хоста
 */
function createRun({ players, runOptions = {}, luck = 0, onStep } = {}) {
  if (!Array.isArray(players) || !players.length) throw new Error('createRun: нужна хотя бы одна партия');
  const collect = { log: [], screens: [], over: null };
  const sandbox = loadEngine(collect);
  const { RK } = sandbox;

  // Удача хоста идёт в забег с хоста: она влияет на добычу золота всей партии.
  RK.Meta.data.luck = luck;

  const [hero, ...rest] = players;
  RK.Combat.newRun({
    size: runOptions.size,
    style: runOptions.style,
    hero: { id: hero.id, name: hero.name, classId: hero.classId },
  });
  for (const member of rest) RK.Combat.addNetworkPlayer(member.id, member.name, member.classId);

  let actor = null;
  let disposed = false;

  return {
    /**
     * Выполняет действие от имени игрока и дожидается конца анимации шага.
     * Разрешается, когда забег снова свободен для следующего действия.
     *
     * @param {(playerId: string, action: string, args: unknown[]) => void} [onStep]
     *   вызывается после каждого завершённого шага: автопроход из нескольких
     *   клеток должен доходить до клиентов по снимку на клетку, а не прыжком
     */
    async act(playerId, action, args, onStep) {
      if (disposed) return false;
      actor = playerId;
      const applied = RK.Combat.performAction(playerId, action, args);
      const deadline = performance.now() + MAX_ACTION_MS;
      let steps = RK.Combat.stepsDone();
      // Промежуточные снимки шлём синхронно, до ожидания следующего тика: иначе
      // шаг был бы виден на один тик позже, чем он реально проигран.
      while (RK.Combat.busy()) {
        if (performance.now() > deadline) {
          throw new Error('Забег не завершил действие за ' + MAX_ACTION_MS + ' мс');
        }
        RK.Combat.tickWalk();
        const done = RK.Combat.stepsDone();
        if (done !== steps) {
          steps = done;
          if (onStep) onStep();
        }
        await wait(TICK_MS);
      }
      return applied;
    },

    /** Полное состояние забега для рассылки игрокам. */
    snapshot() {
      return RK.Combat.createSnapshot();
    },

    /**
     * Забирает события, накопленные с прошлого вызова: строки журнала, запросы
     * экранов NPC от текущего игрока и итог забега, если он закончился.
     *
     * Вызывается и посреди действия — по одному разу на шаг автопрохода, — и
     * поэтому ходивший не сбрасывается: он остаётся тем, кто сейчас ходит, а
     * подменяется следующим вызовом act().
     */
    takeEvents() {
      const events = {
        actor,
        log: collect.log,
        screen: collect.screens.length ? { playerId: actor, name: collect.screens.pop() } : null,
        over: collect.over,
      };
      collect.log = [];
      return events;
    },

    dispose() {
      disposed = true;
    },
  };
}

module.exports = { createRun, ENGINE_SCRIPTS };
