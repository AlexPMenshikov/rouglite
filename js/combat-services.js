// Городские службы: таверна, храм, склад и торговля.
(function () {
  var C = RK.CONFIG;

  // Экран NPC открывает нажавший клавишу. В сетевой комнате забег идёт на сервере,
  // поэтому вызов RK.UI приходит из снимка события и открывает экран у этого игрока.
  function openNpcScreen(npc) {
    var service = RK.Npc.service(npc);
    if (service === 'merchant') RK.UI.showMerchant();
    else if (service === 'blacksmith') RK.UI.showBlacksmith();
    else if (service === 'tavern') RK.UI.showTavern();
    else if (service === 'guild') RK.UI.showGuild();
    else if (service === 'temple') RK.UI.showTemple();
    else RK.UI.showNpc(npc.id);
  }

  // Ближайшее хранилище: обмен предметами возможен только у него.
  function nearestStorage() {
    var chests = (RK.Map && RK.Map.chests) || [];
    if (!chests.length) return null;
    var p = RK.GAME.player;
    var nearest = null;
    var best = 9999;
    for (var i = 0; i < chests.length; i++) {
      var c = chests[i];
      if (!c || !c.storage) continue;
      var dist = Math.abs(c.x - p.x) + Math.abs(c.y - p.y);
      if (dist < best) { best = dist; nearest = c; }
    }
    return best <= 2 ? nearest : null;
  }

  // Положить предмет из рюкзака в хранилище (индекс в рюкзаке).
  function storeInChest(index) {
    var p = RK.GAME && RK.GAME.player;
    if (!p || !p.backpack || !p.backpack[index]) return false;
    var chest = nearestStorage();
    if (!chest) {
      RK.UI.msg('Рядом нет хранилища.');
      return false;
    }
    chest.items = chest.items || [];
    if (chest.items.length >= (RK.CONFIG.CHEST_CAPACITY || 20)) {
      RK.UI.msg('Хранилище полно.');
      return false;
    }
    var item = p.backpack.splice(index, 1)[0];
    chest.items.push(item);
    chest.looted = false;
    RK.UI.msg('Положено в хранилище: ' + item.name);
    RK.UI.refresh();
    return true;
  }

  // Взять предмет из хранилища: takeFromChest(index) берёт у ближайшего.
  function takeFromChest(chest, itemIndex) {
    if (Number.isInteger(chest) && itemIndex == null) {
      itemIndex = chest;
      chest = null;
    }
    if (!chest) chest = nearestStorage();
    if (!chest || !Array.isArray(chest.items) || !chest.items.length) {
      RK.UI.msg('Хранилище пусто.');
      return false;
    }
    if (itemIndex == null) itemIndex = 0;
    if (itemIndex < 0 || itemIndex >= chest.items.length) return false;
    var item = chest.items.splice(itemIndex, 1)[0];
    RK.GAME.player.backpack.push(item);
    chest.looted = chest.items.length === 0;
    RK.UI.msg('Взято из хранилища: ' + item.name);
    RK.UI.refresh();
    return true;
  }

  function openChest(chest) {
    if (!chest) return false;
    if (chest.items == null) chest.items = [];
    chest.state = chest.state === 'broken' ? 'broken' : 'open';
    chest.opened = true;
    chest.looted = chest.items.length === 0;
    if (chest.items.length) RK.UI.msg('Сундук открыт: внутри ' + chest.items.length + ' предметов.');
    else RK.UI.msg('Сундук пуст.');
    RK.UI.refresh();
    return true;
  }

  // Warehouse: хранение предметов в гильдейском складу.
  function storeInWarehouse(index) {
    if (!RK.GAME || !RK.GAME.player || !RK.GAME.player.backpack || !RK.GAME.player.backpack[index]) return false;
    var item = RK.GAME.player.backpack[index];
    // В режиме локации items могут переноситься в placedLocationItems
    if (RK.GAME.locationMode && RK.World && RK.World.current() && RK.World.current().type === 'city') {
      RK.GAME.placedLocationItems = RK.GAME.placedLocationItems || [];
      RK.GAME.placedLocationItems.push(item);
    }
    RK.GAME.player.backpack.splice(index, 1);
    RK.UI.msg('Предмет хранится в гильдейском складе: ' + item.name);
    RK.UI.refresh();
    return true;
  }

  // Лечение в храме: восстанавливает здоровье героя за пожертву.
  function templeHeal() {
    var p = RK.GAME && RK.GAME.player;
    if (!p) return false;
    var cost = C.TEMPLE_HEAL_COST || 0;
    if (p.gold < cost) {
      RK.UI.msg('Недостаточно золота для лечения. Нужно: ' + cost + '.');
      return false;
    }
    p.gold -= cost;
    p.hp = p.maxHp;
    RK.UI.msg('Молитва здоровья: здоровье восстановлено. -' + cost + ' золота.');
    RK.UI.refresh();
    return true;
  }

  // Благословение храма: прибавка к атаке на несколько ходов. Постоянная
  // прибавка копилась бы от клика к клику, и атаку можно было бы накрутить.
  function templeBlessing() {
    var p = RK.GAME && RK.GAME.player;
    if (!p) return false;
    p.blessingTurns = C.BLESSING_TURNS;
    RK.UI.msg('Благословение: +' + C.BLESSING_ATTACK_BONUS + ' к атаке на ' +
      C.BLESSING_TURNS + ' хода.');
    RK.UI.refresh();
    return true;
  }

  // Отдых в таверне: восстановление HP за золото.
  function tavernRest() {
    var p = RK.GAME && RK.GAME.player;
    if (!p) return false;
    var cost = C.TAVERN_REST_COST || 10;
    if (p.gold < cost) {
      RK.UI.msg('Недостаточно золота для отдыха. Нужно: ' + cost + '.');
      return false;
    }
    p.gold -= cost;
    p.hp = p.maxHp;
    RK.UI.msg('Отдых: здоровье восстановлено. -' + cost + ' золота.');
    RK.UI.refresh();
    return true;
  }

  // Кемпинг: вход и выход одним действием (toggle). Логика — в js/camp.js.
  function campRest() {
    if (!RK.Camp || !RK.Camp.rest) return false;
    return RK.Camp.rest() === true;
  }

  // Телепорт в город: возврат из любой локации без обратного пути.
  function teleportToCity() {
    if (!RK.GAME || RK.GAME.over || !RK.GAME.locationMode) return false;
    var target = C.WORLD_START_LOCATION;
    if (RK.GAME && RK.GAME.locationId === target) {
      RK.UI.msg('Вы уже в городе.');
      return false;
    }
    if (!RK.World || !RK.World.travelTo || !RK.World.travelTo(target)) return false;
    RK.UI.msg('Телепорт: вы переноситесь в город.');
    RK.UI.refresh();
    return true;
  }

  // Слухи в таверне: подсказка о мире или заданиях.
  function tavernRumors() {
    var p = RK.GAME && RK.GAME.player;
    if (!p) return false;
    var cost = C.TAVERN_RUMORS_COST || 5;
    if (p.gold < cost) {
      RK.UI.msg('Недостаточно золота на слухи. Нужно: ' + cost + '.');
      return false;
    }
    p.gold -= cost;
    var rumors = [
      'В лесу на севере скелеты сильнее, чем в южных рощах.',
      'Склеп охраняет древний страж. Будь готов к тяжёлому бою.',
      'Торговец даст больше золота, если принесёшь редкие предметы.',
      'Кузнец улучшает экипировку до +5. Запаситесь золотом.',
      'Жрица благословляет на +10% атаки до конца хода.',
      'В городе гильдия хранит репутацию. Сдавайте задания Древнему стражу.',
    ];
    var rumor = rumors[RK.RNG.int(0, rumors.length - 1)];
    RK.UI.msg('Слухи: ' + rumor + ' (-' + cost + ' золота)');
    RK.UI.refresh();
    return true;
  }

  // Покупка еды у трактирщика: блюдо уходит в рюкзак стаком.
  function tavernBuyFood(foodId) {
    var p = RK.GAME && RK.GAME.player;
    if (!p) return false;
    var foods = C.FOODS || [];
    var def = null;
    for (var i = 0; i < foods.length; i++) {
      if (foods[i].id === foodId) { def = foods[i]; break; }
    }
    if (!def) return false;
    var cost = def.value * (C.TAVERN_FOOD_MARKUP || 2);
    if (p.gold < cost) {
      RK.UI.msg('Недостаточно золота для покупки. Нужно: ' + cost + '.');
      return false;
    }
    p.gold -= cost;
    RK.Inventory.addFoodToBackpack(p.backpack, RK.Items.spawnFood(0, 0, def.id));
    RK.UI.msg('Куплено: ' + def.name + '. -' + cost + ' золота.');
    RK.UI.refresh();
    return true;
  }

  function upgradeEquipment(slot) {
    var p = RK.GAME.player;
    if (!nearService('blacksmith')) {
      RK.UI.msg('Подойдите к кузнецу, чтобы улучшить экипировку.');
      return false;
    }
    var item = p && p.equipment && p.equipment[slot];
    if (!item || !item.baseStats) {
      RK.UI.msg('В этом слоте нет улучшаемой экипировки.');
      return false;
    }
    if (item.upgradeLevel >= C.UPGRADE_MAX) {
      RK.UI.msg('Предмет уже улучшен до максимума (' + C.UPGRADE_MAX + ').');
      return false;
    }
    var cost = RK.Items.getUpgradeCost(item);
    if (cost == null || p.gold < cost) {
      RK.UI.msg('Недостаточно золота. Нужно: ' + (cost || 0) + '.');
      return false;
    }
    p.gold -= cost;
    var ok = RK.Items.upgradeItem(item);
    if (ok) {
      RK.CombatRun.recomputePlayerStats();
      RK.UI.msg(item.name + ' улучшен до +' + item.upgradeLevel + '! (' + item.summary + ')');
      RK.UI.refresh();
      return true;
    }
    p.gold += cost;
    return false;
  }

  // Услуга доступна рядом с её NPC. В локации без торговца ограничения нет:
  // продавать и улучшать можно где угодно, как и на этажах без NPC.
  function nearService(kind) {
    if (!RK.GAME.locationMode) return true;
    var npc = RK.Npc.findByKind(RK.GAME.npcs, kind);
    if (!npc) return true;
    return RK.Npc.isNear(npc, RK.GAME.player.x, RK.GAME.player.y);
  }

  function consumeKey(keyId) {
    var backpack = RK.GAME.player.backpack || [];
    for (var i = 0; i < backpack.length; i++) {
      var key = backpack[i];
      if (key.kind !== 'key' || key.keyId !== keyId || key.count < 1) continue;
      key.count--;
      if (key.count === 0) backpack.splice(i, 1);
      return true;
    }
    return false;
  }

  RK.CombatServices = {
    openNpcScreen: openNpcScreen,
    nearestStorage: nearestStorage,
    storeInChest: storeInChest,
    takeFromChest: takeFromChest,
    openChest: openChest,
    storeInWarehouse: storeInWarehouse,
    templeHeal: templeHeal,
    templeBlessing: templeBlessing,
    tavernRest: tavernRest,
    campRest: campRest,
    teleportToCity: teleportToCity,
    tavernRumors: tavernRumors,
    tavernBuyFood: tavernBuyFood,
    upgradeEquipment: upgradeEquipment,
    nearService: nearService,
    consumeKey: consumeKey,
  };
})();
