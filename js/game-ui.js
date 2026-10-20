// Контракт между игрой и интерфейсом. Игра сообщает «что произошло», а
// интерфейс решает, «как это показать». Контракт один и на клиента, и на
// сервер: сервер собирает из тех же событий журнал и экраны, что браузер
// показывает.
//
// Игровой код зовёт только эти функции. RK.UI — внутреннее дело интерфейса:
// на сервере его нет вовсе, и игра об этом не знает.
(function () {
  // Экраны, которые открывает игра, и то, кто их показывает:
  //   panel — панель едет в снимок, и её открывает клиент. В сетевой комнате
  //           забег идёт на сервере, и клиент лишь исполняет просьбу игры.
  //   view  — переключение вида на своей стороне: экран игры клиент открывает
  //           сам, когда приходит снимок забега.
  var SCREENS = Object.freeze({
    merchant: 'panel',
    blacksmith: 'panel',
    tavern: 'panel',
    guild: 'panel',
    temple: 'panel',
    storage: 'panel',
    npc: 'panel',
    game: 'view',
  });

  var handlers = null;

  RK.GameUI = {
    SCREENS: SCREENS,

    // Сообщение в журнал игры.
    log: function (text) {
      if (handlers && handlers.log) handlers.log(String(text));
    },

    // Реплика рассказчика: в журнале помечается отдельно.
    narrate: function (text) {
      if (handlers && handlers.narrate) handlers.narrate(String(text));
    },

    // Экран: имя из SCREENS и, для NPC, его идентификатор.
    screen: function (name, npcId) {
      if (handlers && handlers.screen) handlers.screen(name, npcId || null);
    },

    // Просьба перерисовать: состояние изменилось, а что именно — решает интерфейс.
    refresh: function () {
      if (handlers && handlers.refresh) handlers.refresh();
    },

    // То же, но с учётом сетевого состояния: приехал снимок из комнаты.
    syncState: function () {
      if (handlers && handlers.syncState) handlers.syncState();
    },

    // Забег окончен: чем кончился и с каким счётом.
    over: function (win, floor, level, banked, stats, player, deathCause) {
      if (handlers && handlers.over) {
        handlers.over(win, floor, level, banked, stats, player, deathCause);
      }
    },

    // Связка с приёмником: браузер показывает, сервер собирает.
    setHandlers: function (next) {
      handlers = next || null;
    },
  };
})();
