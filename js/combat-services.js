// Городские службы: таверна, храм, склад и торговля.
(function () {
  var C = RK.CONFIG;

  // Экран NPC открывает нажавший клавишу. В сетевой комнате забег идёт на сервере,
  // поэтому просьба едет в снимке события и экран открывается у этого игрока.
  function openNpcScreen(npc) {
    var service = RK.Npc.service(npc);
    // Служба NPC и имя экрана совпадают: у жрицы служба temple, и экран храма.
    if (service) RK.GameUI.screen(service);
    else RK.GameUI.screen('npc', npc.id);
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
      RK.GameUI.log('Рядом нет хранилища.');
      return false;
    }
    chest.items = chest.items || [];
    if (chest.items.length >= (RK.CONFIG.CHEST_CAPACITY || 20)) {
      RK.GameUI.log('Хранилище полно.');
      return false;
    }
    var item = p.backpack.splice(index, 1)[0];
    chest.items.push(item);
    chest.looted = false;
    RK.GameUI.log('Положено в хранилище: ' + item.name);
    RK.GameUI.refresh();
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
      RK.GameUI.log('Хранилище пусто.');
      return false;
    }
    if (itemIndex == null) itemIndex = 0;
    if (itemIndex < 0 || itemIndex >= chest.items.length) return false;
    var item = chest.items.splice(itemIndex, 1)[0];
    RK.GAME.player.backpack.push(item);
    chest.looted = chest.items.length === 0;
    RK.GameUI.log('Взято из хранилища: ' + item.name);
    RK.GameUI.refresh();
    return true;
  }

  function openChest(chest) {
    if (!chest) return false;
    if (chest.items == null) chest.items = [];
    chest.state = chest.state === 'broken' ? 'broken' : 'open';
    chest.opened = true;
    chest.looted = chest.items.length === 0;
    if (chest.items.length) RK.GameUI.log('Сундук открыт: внутри ' + chest.items.length + ' предметов.');
    else RK.GameUI.log('Сундук пуст.');
    RK.GameUI.refresh();
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
    RK.GameUI.log('Предмет хранится в гильдейском складе: ' + item.name);
    RK.GameUI.refresh();
    return true;
  }

  // Лечение в храме: восстанавливает здоровье героя за пожертву.
  function templeHeal() {
    var p = RK.GAME && RK.GAME.player;
    if (!p) return false;
    var cost = C.TEMPLE_HEAL_COST || 0;
    if (p.gold < cost) {
      RK.GameUI.log('Недостаточно золота для лечения. Нужно: ' + cost + '.');
      return false;
    }
    p.gold -= cost;
    p.hp = p.maxHp;
    RK.GameUI.log('Молитва здоровья: здоровье восстановлено. -' + cost + ' золота.');
    RK.GameUI.refresh();
    return true;
  }

  // Благословение храма: прибавка к атаке на несколько ходов. Постоянная
  // прибавка копилась бы от клика к клику, и атаку можно было бы накрутить.
  function templeBlessing() {
    var p = RK.GAME && RK.GAME.player;
    if (!p) return false;
    p.blessingTurns = C.BLESSING_TURNS;
    RK.GameUI.log('Благословение: +' + C.BLESSING_ATTACK_BONUS + ' к атаке на ' +
      C.BLESSING_TURNS + ' хода.');
    RK.GameUI.refresh();
    return true;
  }

  // Отдых в таверне: восстановление HP за золото.
  function tavernRest() {
    var p = RK.GAME && RK.GAME.player;
    if (!p) return false;
    var cost = C.TAVERN_REST_COST || 10;
    if (p.gold < cost) {
      RK.GameUI.log('Недостаточно золота для отдыха. Нужно: ' + cost + '.');
      return false;
    }
    p.gold -= cost;
    p.hp = p.maxHp;
    RK.GameUI.log('Отдых: здоровье восстановлено. -' + cost + ' золота.');
    RK.GameUI.refresh();
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
      RK.GameUI.log('Вы уже в городе.');
      return false;
    }
    if (!RK.World || !RK.World.travelTo || !RK.World.travelTo(target)) return false;
    RK.GameUI.log('Телепорт: вы переноситесь в город.');
    RK.GameUI.refresh();
    return true;
  }

  // Слухи в таверне: подсказка о мире или заданиях.
  function tavernRumors() {
    var p = RK.GAME && RK.GAME.player;
    if (!p) return false;
    var cost = C.TAVERN_RUMORS_COST || 5;
    if (p.gold < cost) {
      RK.GameUI.log('Недостаточно золота на слухи. Нужно: ' + cost + '.');
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
    RK.GameUI.log('Слухи: ' + rumor + ' (-' + cost + ' золота)');
    RK.GameUI.refresh();
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
      RK.GameUI.log('Недостаточно золота для покупки. Нужно: ' + cost + '.');
      return false;
    }
    p.gold -= cost;
    RK.Inventory.addFoodToBackpack(p.backpack, RK.Items.spawnFood(0, 0, def.id));
    RK.GameUI.log('Куплено: ' + def.name + '. -' + cost + ' золота.');
    RK.GameUI.refresh();
    return true;
  }

  function upgradeEquipment(slot) {
    var p = RK.GAME.player;
    if (!nearService('blacksmith')) {
      RK.GameUI.log('Подойдите к кузнецу, чтобы улучшить экипировку.');
      return false;
    }
    var item = p && p.equipment && p.equipment[slot];
    if (!item || !item.baseStats) {
      RK.GameUI.log('В этом слоте нет улучшаемой экипировки.');
      return false;
    }
    if (item.upgradeLevel >= C.UPGRADE_MAX) {
      RK.GameUI.log('Предмет уже улучшен до максимума (' + C.UPGRADE_MAX + ').');
      return false;
    }
    var cost = RK.Items.getUpgradeCost(item);
    if (cost == null || p.gold < cost) {
      RK.GameUI.log('Недостаточно золота. Нужно: ' + (cost || 0) + '.');
      return false;
    }
    p.gold -= cost;
    var ok = RK.Items.upgradeItem(item);
    if (ok) {
      RK.CombatRun.recomputePlayerStats();
      RK.GameUI.log(item.name + ' улучшен до +' + item.upgradeLevel + '! (' + item.summary + ')');
      RK.GameUI.refresh();
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
