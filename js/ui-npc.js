// Экраны NPC: разговор, таверна, торговец, кузнец, гильдия и храм.
(function () {
  var C = RK.CONFIG;
  var UI = RK.UI;

  // NPC, с которым открыт экран разговора: в сетевой комнате это id из события.
  var talkNpcId = null;

  function el(id) { return UI.el(id); }
  function setText(id, text) { UI.setText(id, text); }
  function clearNode(node) { UI.clearNode(node); }
  function makeButton(spriteName, text, className) { return UI.makeButton(spriteName, text, className); }
  function commit(action, args, rerender) { UI.commit(action, args, rerender); }

  function findNpc(npcId) {
    var npcs = (RK.GAME && RK.GAME.npcs) || [];
    for (var i = 0; i < npcs.length; i++) {
      if (npcs[i] && npcs[i].id === npcId) return npcs[i];
    }
    return null;
  }

  function findNpcByKind(kind) {
    var npcs = (RK.GAME && RK.GAME.npcs) || [];
    for (var i = 0; i < npcs.length; i++) {
      if (npcs[i] && npcs[i].kind === kind) return npcs[i];
    }
    return null;
  }

  // Экран разговора: текст узла и кнопки выборов или принятия задания.
  function renderTalkScreen() {
    var titleEl = el('talk-title');
    var textEl = el('talk-text');
    var actionsEl = el('talk-actions');
    if (!titleEl || !textEl || !actionsEl) return;
    var npc = findNpc(talkNpcId);
    var talk = npc ? RK.Npc.dialogue(npc) : null;
    setText('talk-title', talk ? talk.name : 'Житель');
    textEl.textContent = talk ? talk.text : 'Здесь никого нет.';
    clearNode(actionsEl);
    if (!talk) return;

    // Ветвящийся диалог: кнопки выборов узла.
    if (talk.choices && talk.choices.length) {
      for (var i = 0; i < talk.choices.length; i++) {
        var choice = talk.choices[i];
        var btn = makeButton('uiQuest', choice.text);
        btn.addEventListener('click', function (idx) {
          return function () { commit('dialogueChoice', [npc.id, idx], renderTalkScreen); };
        }(i));
        actionsEl.appendChild(btn);
      }
      return;
    }

    // Одиночное предложение: строка с кнопкой принятия.
    if (talk.offer) {
      var row = document.createElement('div');
      row.className = 'merchant-row merchant-quest-offer-row';
      row.style.borderColor = '#ffd166';
      row.style.background = 'rgba(255, 209, 102, 0.1)';
      var label = document.createElement('span');
      label.className = 'name';
      label.textContent = '📜 ' + talk.offer.description + ' — награда: ' + talk.offer.reward + ' золота';
      var accept = makeButton('uiQuest', 'Принять задание');
      accept.addEventListener('click', function () {
        commit('acceptQuest', [npc.id], renderTalkScreen);
      });
      row.appendChild(label);
      row.appendChild(accept);
      actionsEl.appendChild(row);
    }
  }

  function showNpc(npcId) {
    talkNpcId = npcId;
    UI.show('talk');
  }

  function showTavern() {
    UI.show('tavern');
  }

  function renderTavernScreen() {
    var g = RK.GAME || null;
    var p = g ? UI.displayPlayer() : null;
    if (!p) return;
    setText('tavern-gold', 'У вас: ' + p.gold + ' золота');
    // Кнопки подписаны один раз в initTavernControls: подписка на каждой
    // перерисовке копила обработчики, и один клик списывал золото по разу.
    var restBtn = el('btn-tavern-rest');
    if (restBtn) {
      restBtn.disabled = p.gold < (C.TAVERN_REST_COST || 10) || p.hp >= p.maxHp;
    }
    var rumorsBtn = el('btn-tavern-rumors');
    if (rumorsBtn) {
      rumorsBtn.disabled = p.gold < (C.TAVERN_RUMORS_COST || 5);
    }
    // Меню трактирщика: каждое блюдо стоит value × TAVERN_FOOD_MARKUP.
    var foodList = el('tavern-food-list');
    if (foodList) {
      clearNode(foodList);
      var markup = C.TAVERN_FOOD_MARKUP || 2;
      (C.FOODS || []).forEach(function (food) {
        var price = food.value * markup;
        var row = document.createElement('div');
        row.className = 'merchant-row';
        var label = document.createElement('span');
        label.className = 'name';
        label.textContent = food.name + ' — ' + price + ' золота';
        var buyBtn = makeButton('uiQuest', 'Купить');
        buyBtn.disabled = p.gold < price;
        buyBtn.addEventListener('click', function () {
          commit('tavernBuyFood', [food.id], renderTavernScreen);
        });
        row.appendChild(label);
        row.appendChild(buyBtn);
        foodList.appendChild(row);
      });
    }
  }

  // Доска заданий заказчика: сдача выполненного и его предложение. Ею пользуются
  // торговец и храм — правило одно, различается только способ сдачи.
  function renderQuestDesk(containerId, npcKind, rerender, turnIn) {
    var desk = el(containerId);
    if (!desk) return;
    clearNode(desk);
    var npc = findNpcByKind(npcKind);
    var me = UI.myPlayerId();
    var quests = (RK.GAME && RK.GAME.quests) || [];
    var ready = quests.filter(function (q) {
      return !q.completed && q.giver === npcKind && q.ownerId === me && q.progress >= q.target;
    });
    for (var i = 0; i < ready.length && npc; i++) {
      var quest = ready[i];
      var turnRow = document.createElement('div');
      turnRow.className = 'merchant-row';
      var turnLabel = document.createElement('span');
      turnLabel.className = 'name';
      turnLabel.textContent = 'Сдать: ' + (quest.description || 'задание');
      var turnBtn = makeButton('uiQuest', 'Сдать');
      turnBtn.addEventListener('click', (function (q) {
        return function () { turnIn(q); };
      }(quest)));
      turnRow.appendChild(turnLabel);
      turnRow.appendChild(turnBtn);
      desk.appendChild(turnRow);
    }
    if (!npc || !npc.offer) return;
    var offerRow = document.createElement('div');
    offerRow.className = 'merchant-row merchant-quest-offer-row';
    var name = document.createElement('span');
    name.className = 'name';
    name.textContent = '📜 ' + (npc.offer.description || 'задание') +
      ' — награда: ' + (npc.offer.reward || 0) + ' золота';
    var acceptBtn = makeButton('uiQuest', 'Принять задание');
    acceptBtn.addEventListener('click', function () {
      commit('acceptQuest', [npc.id], rerender);
    });
    offerRow.appendChild(name);
    offerRow.appendChild(acceptBtn);
    desk.appendChild(offerRow);
  }

  function renderMerchantScreen() {
    var player = RK.GAME && RK.GAME.player;
    var list = el('merchant-inventory');
    if (!player || !list) return;
    setText('merchant-gold', 'У вас: ' + player.gold + ' золота');
    clearNode(list);

    // Сдача задания торговцу: сдвиг цепочки предложений.
    renderQuestDesk('merchant-quest-offer', 'merchant', renderMerchantScreen, function () {
      commit('turnInQuest', ['merchant'], renderMerchantScreen);
    });

    function addSaleRow(item, label, index) {
      var row = document.createElement('div');
      row.className = 'merchant-row rarity-' + (item.rarity || 'common');
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = label + (item.summary ? ' — ' + item.summary : '');
      var button = makeButton('uiGold', 'Продать — ' + RK.Combat.getSellValue(item));
      button.addEventListener('click', function (idx) {
        return function () { commit('sellInventoryItem', [idx], renderMerchantScreen); };
      }(index));
      row.appendChild(name);
      row.appendChild(button);
      list.appendChild(row);
    }

    var backpack = player.backpack || [];
    var equippedItems = C.SLOTS.map(function (slot) { return player.equipment[slot]; });
    var sellEntries = UI.sortedEntries(backpack, UI.defaultSortMode(), 'all').filter(function (entry) {
      return !entry.item.equipped && equippedItems.indexOf(entry.item) === -1;
    });
    for (var i = 0; i < sellEntries.length; i++) {
      var sellable = sellEntries[i].item;
      addSaleRow(sellable, (sellable.name || 'Предмет') +
        (sellable.count > 1 ? ' ×' + sellable.count : ''), sellEntries[i].index);
    }
    if (!sellEntries.length) {
      var empty = document.createElement('div');
      empty.className = 'merchant-row';
      empty.textContent = 'У вас нет предметов для продажи.';
      list.appendChild(empty);
    }
  }

  function showMerchant() {
    renderMerchantScreen();
    UI.show('merchant');
  }

  function showBlacksmith() {
    UI.show('blacksmith');
  }

  // Доска гильдии: дела Древнего стража, его текущее предложение и склад.
  function renderGuildScreen() {
    var g = RK.GAME || null;
    var rep = (RK.Faction && RK.Faction.getReputation) ? RK.Faction.getReputation() : { reputation: 0 };
    setText('guild-reputation', 'Репутация: ' + (rep ? (rep.reputation != null ? rep.reputation : '') : ''));
    var listEl = el('guild-quest-list');
    clearNode(listEl);
    var me = UI.myPlayerId();
    var quests = g && g.quests ? g.quests : [];
    var guard = findNpcByKind('ancient_guard');
    // Экран ведёт дела Древнего стража: чужие задания сдаются в журнале.
    var active = quests.filter(function (q) {
      return !q.completed && q.giver === 'ancient_guard' && q.ownerId === me;
    });
    if (!active.length || !listEl) {
      if (listEl) {
        var empty = document.createElement('div');
        empty.className = 'merchant-row';
        empty.textContent = guard && guard.offer
          ? 'Активных заданий нет. Страж ждёт, когда вы возьмёте работу.'
          : 'Нет активных заданий.';
        listEl.appendChild(empty);
      }
    } else {
      for (var i = 0; i < active.length; i++) {
        var q = active[i];
        var row = document.createElement('div');
        row.className = 'merchant-row';
        var name = document.createElement('span');
        name.className = 'name';
        name.textContent = (q.description || 'Задание') +
          (q.progress != null && q.target != null ? ' (' + q.progress + '/' + q.target + ')' : '');
        row.appendChild(name);
        if (q.progress >= q.target) {
          var btn = makeButton('uiQuest', 'Сдать');
          btn.addEventListener('click', function (quest) {
            return function () {
              commit('turnInQuestAny', [quest.id], renderGuildScreen);
            };
          }(q));
          row.appendChild(btn);
        }
        listEl.appendChild(row);
      }
    }
    if (!guard || !guard.offer) return;
    var offerRow = document.createElement('div');
    offerRow.className = 'merchant-row merchant-quest-offer-row';
    offerRow.style.borderColor = '#ffd166';
    offerRow.style.background = 'rgba(255, 209, 102, 0.1)';
    var offerName = document.createElement('span');
    offerName.className = 'name';
    offerName.textContent = '📜 ' + guard.offer.description + ' — награда: ' + guard.offer.reward + ' золота';
    var accept = makeButton('uiQuest', 'Принять задание');
    accept.addEventListener('click', function () {
      commit('acceptQuest', [guard.id], renderGuildScreen);
    });
    offerRow.appendChild(offerName);
    offerRow.appendChild(accept);
    if (listEl) listEl.appendChild(offerRow);
  }

  function renderTempleScreen() {
    var g = RK.GAME || null;
    var p = g ? UI.displayPlayer() : null;
    var rep = (RK.Faction && RK.Faction.getReputation) ? RK.Faction.getReputation() : { reputation: 0 };
    setText('temple-reputation', 'Репутация: ' + (rep ? (rep.reputation != null ? rep.reputation : '') : ''));
    // Доска жрицы: её задание и сдача выполненного — как у торговца.
    renderQuestDesk('temple-quest-offer', 'priest', renderTempleScreen, function () {
      commit('turnInQuest', ['priest'], renderTempleScreen);
    });
    var healRow = el('temple-heal-row');
    clearNode(healRow);
    if (healRow) {
      var cost = C.TEMPLE_HEAL_COST || 0;
      var healBtn = makeButton('potion', 'Исцелить (' + cost + ' золота)');
      healBtn.disabled = !p || p.hp >= p.maxHp || p.gold < cost;
      healBtn.addEventListener('click', function () {
        if (RK.Combat && RK.Combat.templeHeal) {
          commit('templeHeal', [], renderTempleScreen);
          return;
        }
        // Экран живёт и без боевого движка: лечение просто восстанавливает здоровье.
        if (p) {
          p.gold -= cost;
          p.hp = p.maxHp;
          RK.UI.msg('Молитва здоровья: здоровье восстановлено.');
          renderTempleScreen();
          RK.UI.refresh();
        }
      });
      healRow.appendChild(healBtn);
    }
  }

  function showGuildStore() {
    UI.show('guild');
    var g = RK.GAME || null;
    var p = g ? UI.displayPlayer() : null;
    // Склад — отдельный список: в общий с заданиями он стирал доску гильдии.
    var listEl = el('guild-store-list');
    // Список предметов в рюкзаке для хранения
    if (listEl) {
      clearNode(listEl);
      var backpack = (p && p.backpack) || [];
      if (!backpack.length) {
        var empty = document.createElement('div');
        empty.className = 'merchant-row';
        empty.textContent = 'Рюкзак пуст.';
        listEl.appendChild(empty);
      }
      for (var i = 0; i < backpack.length; i++) {
        var item = backpack[i];
        var row = document.createElement('div');
        row.className = 'merchant-row rarity-' + (item.rarity || 'common');
        var name = document.createElement('span');
        name.className = 'name';
        name.textContent = (item.name || 'Предмет') +
          (item.count > 1 ? ' ×' + item.count : '') +
          (item.summary ? ' — ' + item.summary : '');
        var storeBtn = makeButton('uiInventory', 'Хранить');
        storeBtn.addEventListener('click', function (idx) {
          return function () {
            if (RK.Combat && RK.Combat.storeInWarehouse) {
              commit('storeInWarehouse', [idx], showGuildStore);
            } else if (p && p.backpack) {
              p.backpack.splice(idx, 1);
              showGuildStore();
            }
          };
        }(i));
        row.appendChild(name);
        row.appendChild(storeBtn);
        listEl.appendChild(row);
      }
    }
  }

  function showTempleBlessing() {
    var g = RK.GAME || null;
    var p = g ? UI.displayPlayer() : null;
    if (!p) return;
    if (RK.Combat && RK.Combat.templeBlessing) {
      commit('templeBlessing', [], renderTempleScreen);
      return;
    }
    // Экран живёт и без боевого движка: благословение держится несколько ходов.
    p.blessingTurns = C.BLESSING_TURNS;
    RK.UI.msg('Благословение: +' + C.BLESSING_ATTACK_BONUS + ' к атаке на ' +
      C.BLESSING_TURNS + ' хода.');
  }

  function renderBlacksmithScreen() {
    var g = RK.GAME;
    var p = g ? UI.displayPlayer() : null;
    var listEl = el('blacksmith-list');
    if (!p || !listEl) return;
    setText('blacksmith-gold', 'Ваше золото: ' + p.gold);
    setText('blacksmith-max-level', String(C.UPGRADE_MAX));
    clearNode(listEl);

    var hasUpgradable = false;
    for (var si = 0; si < C.SLOTS.length; si++) {
      var slot = C.SLOTS[si];
      var item = p.equipment && p.equipment[slot];
      if (!item || !item.baseStats || item.upgradeLevel >= C.UPGRADE_MAX) continue;
      hasUpgradable = true;
      var cost = RK.Items.getUpgradeCost(item);
      var row = document.createElement('div');
      row.className = 'merchant-row rarity-' + (item.rarity || 'common');
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = C.SLOT_LABELS[slot] + ': ' + item.name +
        (item.summary ? ' — ' + item.summary : '');
      var btn = makeButton('uiUpgrade', 'Улучшить (+' + (item.upgradeLevel + 1) + ') — ' + cost + ' золота');
      btn.disabled = p.gold < cost;
      btn.addEventListener('click', function (s) {
        return function () { commit('upgradeEquipment', [s], renderBlacksmithScreen); };
      }(slot));
      row.appendChild(name);
      row.appendChild(btn);
      listEl.appendChild(row);
    }

    if (!hasUpgradable) {
      var empty = document.createElement('div');
      empty.className = 'merchant-row';
      empty.textContent = 'Нет экипировки, которую можно улучшить (макс. ' + C.UPGRADE_MAX + ' уровней).';
      listEl.appendChild(empty);
    }
  }

  // Кнопки таверны подписываются один раз: иначе каждая перерисовка экрана
  // добавляла бы ещё один обработчик, и клик списывал бы золото несколько раз.
  function initTavernControls() {
    UI.onClick('btn-tavern-rest', function () { commit('tavernRest', [], renderTavernScreen); });
    UI.onClick('btn-tavern-rumors', function () { commit('tavernRumors', [], renderTavernScreen); });
  }

  // Торговца рисует его собственная кнопка: экран открывается уже готовым.
  UI.registerRenderer('merchant', renderMerchantScreen, { onShow: false, onSync: true });
  UI.registerRenderer('blacksmith', renderBlacksmithScreen, { onSync: true });
  UI.registerRenderer('talk', renderTalkScreen);
  UI.registerRenderer('tavern', renderTavernScreen);
  UI.registerRenderer('guild', renderGuildScreen, { onSync: true });
  UI.registerRenderer('temple', renderTempleScreen, { onSync: true });

  RK.UI.showNpc = showNpc;
  RK.UI.showTavern = showTavern;
  RK.UI.showMerchant = showMerchant;
  RK.UI.showBlacksmith = showBlacksmith;
  RK.UI.showGuild = function () { UI.show('guild'); };
  RK.UI.showTemple = function () { UI.show('temple'); };
  RK.UI.showGuildStore = showGuildStore;
  RK.UI.showTempleBlessing = showTempleBlessing;
  RK.UI.renderGuildScreen = renderGuildScreen;
  RK.UI.renderTempleScreen = renderTempleScreen;
  RK.UI.renderBlacksmithScreen = renderBlacksmithScreen;

  UI.onInit(initTavernControls);
})();
