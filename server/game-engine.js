'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ENGINE_SCRIPTS } = require('../scripts/script-list');

// Шаг длится C.WALK_MS и завершается в tickWalk. Браузер зовёт его из
// requestAnimationFrame, сервер — из таймера: кадров у свёрнутого окна нет.
const TICK_MS = 16;
// Предохранитель от бесконечного шага: автопроход конечен, но очередь действий
// комнаты не должна вставать из-за одного зависшего забега.
const MAX_ACTION_MS = 30000;

function loadEngine(collect) {
  const sandbox = {
    console,
    performance: { now: () => performance.now() },
    crypto,
    // Единственное обращение движка к DOM — resizeCanvas за canvas: на сервере
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
  // Эффектов на сервере не видно: вызовы копятся и уезжают клиентам вместе со
  // снимком, где клиент проигрывает их своим RK.Effects.
  sandbox.RK.Effects = {};
  for (const method of sandbox.RK.CONFIG.EFFECT_METHODS || []) {
    sandbox.RK.Effects[method] = (...args) => collect.effects.push([method, ...args]);
  }
  // События забега уезжают игрокам вместе со снимком: журнал общий, экраны NPC
  // открываются тому, кто их вызвал. Сервер работает без интерфейса — он
  // собирает те же события, что браузер показывает.
  sandbox.RK.GameUI.setHandlers({
    log(text) { collect.log.push({ text: String(text) }); },
    narrate(text) { collect.log.push({ text: String(text), narrator: true }); },
    screen(name, npcId) {
      // Панель едет к игроку, который её вызвал. Экран игры — переключение
      // вида: клиент открывает его сам, когда приходит снимок забега.
      if (sandbox.RK.GameUI.SCREENS[name] !== 'panel') return;
      collect.screens.push(npcId ? { name, npcId } : { name });
    },
    refresh() {},
    syncState() {},
    over(win, floor, level, banked) {
      collect.over = { win: !!win, floor, level, banked: banked || 0 };
    },
  });
  return sandbox;
}

function wait(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Один забег сетевой комнаты. players — партия, первый хост; runOptions — размер
 * и стиль карты; luck — удача из мет-прогресса хоста.
 */
function createRun({ players, runOptions = {}, luck = 0, snapshot, onStep } = {}) {
  if (!Array.isArray(players) || !players.length) throw new Error('createRun: нужна хотя бы одна партия');
  const collect = { log: [], screens: [], over: null, effects: [] };
  const sandbox = loadEngine(collect);
  const { RK } = sandbox;

  // Удача хоста идёт в забег с ним: влияет на добычу золота всей партии.
  RK.Meta.data.luck = luck;

  if (snapshot) {
    // Восстановление забега с диска. Снимок приходит из файла, поэтому
    // applySnapshot проверяет его ровно так же, как сообщение из сокета.
    if (!RK.Combat.applySnapshot(snapshot, players[0].id)) {
      throw new Error('createRun: сохранённый забег не читается');
    }
  } else {
    const [hero, ...rest] = players;
    RK.Combat.newRun({
      size: runOptions.size,
      style: runOptions.style,
      hero: {
        id: hero.id,
        name: hero.name,
        classId: runOptions.classId || hero.classId,
      },
    });
    for (const member of rest) RK.Combat.addNetworkPlayer(member.id, member.name, member.classId);
  }

  let actor = null;
  let disposed = false;

  return {
    /**
     * Выполняет действие от имени игрока и дожидается конца анимации шага.
     * Разрешается, когда забег снова свободен. onStep зовётся после каждого
     * завершённого шага: автопроход должен доходить до клиентов по снимку на
     * клетку, а не прыжком.
     */
    async act(playerId, action, args, onStep) {
      if (disposed) return false;
      actor = playerId;
      const applied = RK.Combat.performAction(playerId, action, args);
      const deadline = performance.now() + MAX_ACTION_MS;
      let steps = RK.Combat.stepsDone();
      // Промежуточные снимки шлём синхронно, до ожидания тика: иначе шаг был бы
      // виден на тик позже, чем проигран.
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

    /**
     * Подключает игрока к идущему забегу. Когда комната принимает новичка после
     * старта, партия уже сформирована, поэтому он добавляется тем же путём,
     * что и при createRun, и получает снимки вместе с остальными игроками.
     */
    addPlayer(id, name, classId) {
      if (disposed) return false;
      return RK.Combat.addNetworkPlayer(id, name, classId);
    },

    /** Убирает выгнанного игрока из партии: его герой не должен оставаться на карте. */
    removePlayer(id) {
      if (disposed) return false;
      return RK.Combat.removeNetworkPlayer(id);
    },

    /** Полное состояние забега для рассылки игрокам. */
    snapshot() {
      return RK.Combat.createSnapshot();
    },

    /**
     * Забирает события с прошлого вызова: журнал, экраны NPC от текущего игрока,
     * вызовы эффектов и итог забега. Зовётся и посреди действия (раз на шаг
     * автопрохода), поэтому ходивший не сбрасывается, а подменяется следующим
     * вызовом act().
     */
    takeEvents() {
      const events = {
        actor,
        log: collect.log,
        effects: collect.effects,
        // Экран NPC несёт вид и, для разговора, id NPC: экран открывается у того,
        // кто вызвал действие.
        screen: collect.screens.length ? { playerId: actor, ...collect.screens.pop() } : null,
        over: collect.over,
      };
      collect.log = [];
      collect.effects = [];
      return events;
    },

    dispose() {
      disposed = true;
    },
  };
}

module.exports = { createRun, ENGINE_SCRIPTS };
