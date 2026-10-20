// Связка игры с интерфейсом: игра говорит через контракт RK.GameUI, а тот
// смотрит в интерфейс. Здесь имя экрана превращается в вызов RK.UI.
//
// Файл только для браузера: у сервера свой приёмник, и он подменяет его после
// загрузки движка. Обращения идут по событию, а не при загрузке: интерфейс
// дописывает свои экраны по ходу, и методы сюда попадают уже готовыми.
(function () {
  var SCREEN_OPENERS = {
    merchant: function () { RK.UI.showMerchant(); },
    blacksmith: function () { RK.UI.showBlacksmith(); },
    tavern: function () { RK.UI.showTavern(); },
    guild: function () { RK.UI.showGuild(); },
    temple: function () { RK.UI.showTemple(); },
    storage: function () { RK.UI.showStorage(); },
    npc: function (npcId) { RK.UI.showNpc(npcId); },
    game: function () { RK.UI.show('game'); },
  };

  RK.GameUI.setHandlers({
    log: function (text) { RK.UI.msg(text); },
    narrate: function (text) { RK.UI.narratorMsg(text); },
    screen: function (name, npcId) {
      var open = SCREEN_OPENERS[name];
      if (open) open(npcId);
    },
    refresh: function () { RK.UI.refresh(); },
    syncState: function () { RK.UI.syncNetworkState(); },
    over: function (win, floor, level, banked, stats, player, deathCause) {
      RK.UI.over(win, floor, level, banked, stats, player, deathCause);
    },
  });
})();
