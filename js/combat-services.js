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

  // Ближайшее хранилище: обмен идёт только с ним и только вплотную.
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

  // Сундук, с которым работает экран обмена: только городское хранилище.
  function tradeChest() {
    return nearestStorage();
  }

  // Положить предмет из рюкзака в сундук (индекс в рюкзаке).
  function storeInChest(index) {
    var p = RK.GAME && RK.GAME.player;
    if (!p || !p.backpack || !p.backpack[index]) return false;
    var chest = tradeChest();
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

  // Взять предмет из сундука по индексу: золото идёт в кошелёк, остальное в рюкзак.
  function takeFromChest(itemIndex) {
    var chest = tradeChest();
    if (!chest || !Array.isArray(chest.items) || !chest.items.length) {
      RK.GameUI.log(chest ? 'Сундук пуст.' : 'Рядом нет сундука.');
      return false;
    }
    if (itemIndex == null) itemIndex = 0;
    if (itemIndex < 0 || itemIndex >= chest.items.length) return false;
    var item = chest.items[itemIndex];
    if (chest.storage) {
      // Хранилище возвращает вещь как есть: индексы и ссылки не меняются.
      RK.GAME.player.backpack.push(item);
    } else {
      var entry = RK.Inventory && RK.Inventory.collectItem
        ? RK.Inventory.collectItem(RK.GAME, RK.GAME.player, item)
        : item;
      if (!entry) return false;
    }
    chest.items.splice(itemIndex, 1);
    chest.looted = chest.items.length === 0;
    RK.GameUI.log((chest.storage ? 'Взято из хранилища: ' : 'Взято из сундука: ') + item.name);
    RK.GameUI.refresh();
    return true;
  }

  // Взять всё из сундука сразу: золото в кошелёк, остальное в рюкзак.
  function takeAllFromChest() {
    var chest = tradeChest();
    if (!chest || !Array.isArray(chest.items) || !chest.items.length) {
      RK.GameUI.log(chest ? 'Сундук пуст.' : 'Рядом нет сундука.');
      return false;
    }
    var count = 0;
    while (chest.items.length) {
      var item = chest.items[0];
      if (chest.storage) RK.GAME.player.backpack.push(item);
      else if (!RK.Inventory.collectItem(RK.GAME, RK.GAME.player, item)) break;
      chest.items.shift();
      count++;
    }
    chest.looted = true;
    RK.GameUI.log((chest.storage ? 'Взято из хранилища: ' : 'Взято из сундука: ') +
      count + ' предмет(ов).');
    RK.GameUI.refresh();
    return true;
  }

  // Открытый сундук сразу убирает всё в рюкзак и показывает окно добычи:
  // так содержимое не потеряется, а игрок увидит, что именно нашёл.
  function openChest(chest) {
    if (!chest) return false;
    if (chest.items == null) chest.items = [];
    chest.state = chest.state === 'broken' ? 'broken' : 'open';
    chest.opened = true;
    var found = [];
    while (chest.items.length) {
      var item = chest.items[0];
      var entry = RK.Inventory && RK.Inventory.collectItem
        ? RK.Inventory.collectItem(RK.GAME, RK.GAME.player, item)
        : item;
      if (!entry) break;
      chest.items.shift();
      found.push(entry);
    }
    chest.looted = chest.items.length === 0;
    if (RK.GAME) RK.GAME.lootWindow = { items: found };
    RK.GameUI.screen('loot');
    RK.GameUI.log(found.length
      ? 'Сундук открыт: ' + found.length + ' предмет(ов) убрано в рюкзак.'
      : 'Сундук пуст.');
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
    if (RK.Limbs) RK.Limbs.restoreAll(p);
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
    if (RK.Limbs) RK.Limbs.restoreAll(p);
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

  function craftEquipment(slot, recipeId) {
    var p = RK.GAME && RK.GAME.player;
    if (!nearService('blacksmith')) {
      RK.GameUI.log('Подойдите к кузнецу, чтобы зачаровать экипировку.');
      return false;
    }
    var item = p && p.equipment && p.equipment[slot];
    if (!item || !item.baseStats) {
      RK.GameUI.log('В этом слоте нет экипировки для зачарования.');
      return false;
    }
    var recipe = RK.Items.findCraftingRecipe(recipeId);
    if (!recipe || item.slot !== slot || !RK.Items.canEnchantItem(item, recipeId, p)) {
      RK.GameUI.log('Этот рецепт нельзя применить к выбранной экипировке.');
      return false;
    }
    var available = RK.Inventory.countCraftingMaterials(p.backpack, recipe.materialId);
    if (available < recipe.cost) {
      RK.GameUI.log('Недостаточно материалов «' + RK.Items.CRAFTING_MATERIALS[recipe.materialId].name +
        '». Нужно: ' + recipe.cost + ', есть: ' + available + '.');
      return false;
    }
    if (!RK.Items.craftItem(item, recipeId, p, p.backpack)) {
      RK.GameUI.log('Не удалось зачаровать экипировку.');
      return false;
    }
    RK.CombatRun.recomputePlayerStats();
    RK.GameUI.log(item.name + ' зачарован: ' + item.enchantName + '. (' + item.summary + ')');
    RK.GameUI.refresh();
    return true;
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
    takeAllFromChest: takeAllFromChest,
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
    craftEquipment: craftEquipment,
    nearService: nearService,
    consumeKey: consumeKey,
  };
})();
