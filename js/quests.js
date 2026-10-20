// Задания: выдача, прогресс и сдача. Логика живёт рядом с NPC (js/npc.js),
// а забег не знает — нужное приходит контекстом.
(function () {
  // Контекст забега задаёт бой (js/combat.js): модуль сам о забеге не знает.
  var context = null;

  function game() {
    return context && context.getGame ? context.getGame() : null;
  }

  function localPlayerId() {
    return context && context.localPlayerId ? context.localPlayerId() : 'local';
  }

  // Идентификатор и заказчик задания. id нужен журналу (сдача по кнопке),
  // giver — NPC, у которого задание сдаётся. Стартовое задание забега даёт торговец,
  // иначе его было бы некому закрыть.
  function registerQuest(quest, giver, fromOffer) {
    var run = game();
    if (!run) return quest;
    run.questSeq = (run.questSeq || 0) + 1;
    quest.id = (giver || 'run') + '#' + run.questSeq;
    quest.giver = giver || null;
    // Владелец задания — герой, который его принял. В одиночке это 'local',
    // в комнате — id игрока из партии. UI и сдача фильтруют по нему.
    quest.ownerId = localPlayerId();
    // Цепочка сдвигается только у заданий, взятых из предложения NPC.
    quest.fromOffer = !!fromOffer;
    if (!quest.progress) quest.progress = 0;
    return quest;
  }

  function questReady(quest) {
    return !!quest && quest.progress >= quest.target;
  }

  // Прогресс идёт всем активным заданиям нужного вида: NPC-задания и стартовое
  // живут в одном списке, поэтому отдельная ссылка на «главное» задание не нужна.
  // Одно событие засчитывается каждому подходящему заданию — иначе первое
  // заблокировало бы остальные: убитый демон шёл бы только стартовой цели.
  function advanceQuest(kind, detail, amount) {
    var run = game();
    var amt = amount || 1;
    if (!run || !run.quests || !run.quests.length) return;
    for (var qi = 0; qi < run.quests.length; qi++) {
      var q = run.quests[qi];
      if (q.completed || q.kind !== kind) continue;
      if (kind === 'kill') {
        var matched = false;
        var types = q.enemyTypes || [q.type];
        for (var ti = 0; ti < types.length; ti++) {
          if (types[ti] === detail) { matched = true; break; }
          // Босс того же типа засчитывается в kill-квест на базового моба:
          // 'boss_demon' подходит под задание 'убить демонов'.
          if (typeof detail === 'string' && detail.indexOf('boss_') === 0 && types[ti] === detail.slice(5)) { matched = true; break; }
        }
        if (!matched) continue;
      }
      // visit — задание на дорогу: засчитывается только нужная локация.
      if (kind === 'visit' && q.type !== detail) continue;
      if (q.progress >= q.target) continue;
      q.progress = Math.min(q.target, q.progress + amt);
      RK.GameUI.log(questReady(q)
        ? 'Задание выполнено: ' + q.description + '. Сдайте его заказчику.'
        : 'Прогресс задания: ' + q.progress + '/' + q.target + '.');
    }
  }

  // Сдача задания: награда, репутация и следующее предложение заказчика.
  function deliverQuest(quest, npc) {
    var run = game();
    if (!run || !run.player) return false;
    quest.completed = true;
    var reward = quest.reward || 0;
    run.player.gold += reward;
    if (RK.Faction && RK.Faction.changeReputation && reward) {
      RK.Faction.changeReputation(reward / 10);
    }
    RK.GameUI.log('Задание сдано: ' + (quest.description || 'задание') + ' (+' + reward + ' золота).');
    if (npc && quest.fromOffer) {
      npc.accepted = true;
      if (npc.questChain && npc.questChainIndex < npc.questChain.length - 1) {
        npc.questChainIndex++;
        npc.offer = npc.questChain[npc.questChainIndex];
      }
    }
    RK.GameUI.refresh();
    return true;
  }

  // Сдача задания заказчику: герой стоит рядом, цель выполнена.
  function turnInQuest(npcId) {
    var run = game();
    if (!run || !run.player) return false;
    var npc = RK.Npc.findByKind(run.npcs, npcId == null ? 'merchant' : npcId);
    if (!npc) return false;
    if (!RK.Npc.isNear(npc, run.player.x, run.player.y)) {
      RK.GameUI.log('Подойдите к ' + RK.Npc.nameOf(npc) + ', чтобы сдать задание.');
      return false;
    }
    // Сдаётся та работа, которую NPC выдал: кроме неё у него может висеть
    // заказ забега, а он сдаётся по кнопке в журнале.
    var ready = (run.quests || []).filter(function (q) {
      return !q.completed && q.giver === npc.id && questReady(q);
    });
    var quest = ready.find(function (q) { return q.fromOffer; }) || ready[0];
    if (!quest) {
      RK.GameUI.log(RK.Npc.nameOf(npc) + ': выполненных заданий нет.');
      return false;
    }
    return deliverQuest(quest, npc);
  }

  // Сдача задания из журнала: закрывается ровно то, что нажали.
  function turnInQuestAny(questId) {
    var run = game();
    if (!run || !run.player) return false;
    var quest = (run.quests || []).find(function (q) { return q.id === questId; });
    if (!quest || quest.completed) return false;
    if (!questReady(quest)) {
      RK.GameUI.log('Задание ещё не выполнено: ' + quest.progress + '/' + quest.target + '.');
      return false;
    }
    var npc = quest.giver ? RK.Npc.findByKind(run.npcs, quest.giver) : null;
    if (quest.giver && (!npc || !RK.Npc.isNear(npc, run.player.x, run.player.y))) {
      RK.GameUI.log('Подойдите к ' + RK.Npc.nameOf(npc || { kind: quest.giver }) + ', чтобы сдать задание.');
      return false;
    }
    return deliverQuest(quest, npc);
  }

  // Задание берёт NPC, рядом с которым стоит герой. Идентификатор приходит и из
  // сети, поэтому берётся только из списка забега, а не из аргумента как такового.
  function acceptQuest(npcId) {
    var run = game();
    if (!run || !run.player) return false;
    var npc = npcId == null
      ? RK.Npc.findByKind(run.npcs, 'merchant')
      : RK.Npc.findByKind(run.npcs, npcId);
    if (!npc || !npc.offer || !RK.Npc.isNear(npc, run.player.x, run.player.y)) return false;
    var q = registerQuest(npc.offer, npc.id, true);
    run.quests.push(q);
    npc.offer = null;
    npc.accepted = true;
    RK.GameUI.log('Задание принято: ' + q.description);
    RK.GameUI.refresh();
    return true;
  }

  // Выбор ответа в диалоге: переход к узлу или принятие задания через action.
  function dialogueChoice(npcId, choiceIndex) {
    var run = game();
    if (!run || !run.player) return false;
    var npc = npcId == null ? null : RK.Npc.findByKind(run.npcs, npcId);
    if (!npc || !RK.Npc.isNear(npc, run.player.x, run.player.y)) return false;
    var result = RK.Npc.chooseDialogue(npc, choiceIndex);
    if (!result) return false;
    if (result.choice && result.choice.action === 'acceptQuest') acceptQuest(npcId);
    RK.GameUI.refresh();
    return true;
  }

  RK.Quests = RK.Quests || {};
  RK.Quests.setContext = function (value) { context = value || null; };
  RK.Quests.registerQuest = registerQuest;
  RK.Quests.questReady = questReady;
  RK.Quests.advanceQuest = advanceQuest;
  RK.Quests.deliverQuest = deliverQuest;
  RK.Quests.turnInQuest = turnInQuest;
  RK.Quests.turnInQuestAny = turnInQuestAny;
  RK.Quests.acceptQuest = acceptQuest;
  RK.Quests.dialogueChoice = dialogueChoice;
})();
