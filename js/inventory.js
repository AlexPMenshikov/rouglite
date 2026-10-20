// Инвентарь героя: рюкзак, экипировка, подбор вещей с пола и ловушки в рюкзаке.
// Модуль живёт рядом с вещами (js/items.js), а забег не знает — нужное приходит
// контекстом.
(function () {
  var C = RK.CONFIG;

  // Контекст забега задаёт бой (js/combat.js): модуль сам о забеге не знает.
  var context = null;

  function game() {
    return context && context.getGame ? context.getGame() : null;
  }

  function enemyAt(x, y) {
    return context && context.enemyAt ? context.enemyAt(x, y) : null;
  }

  function npcAt(x, y) {
    return context && context.npcAt ? context.npcAt(x, y) : null;
  }

  function partyPlayerAt(x, y, exceptId) {
    return context && context.partyPlayerAt ? context.partyPlayerAt(x, y, exceptId) : null;
  }

  function finishTurn() {
    if (context && context.finishTurn) context.finishTurn();
  }

  function recomputePlayerStats() {
    if (context && context.recomputePlayerStats) context.recomputePlayerStats();
  }

  function nearService(kind) {
    return context && context.nearService ? context.nearService(kind) : true;
  }

  function metaLuck() {
    return context && context.metaLuck ? context.metaLuck() : 0;
  }

  function advanceQuest(kind, detail, amount) {
    if (context && context.advanceQuest) context.advanceQuest(kind, detail, amount);
  }

  function addPotionToBackpack(backpack, potion) {
    for (var i = 0; i < backpack.length; i++) {
      var stack = backpack[i];
      if (stack.kind === 'potion' && stack.heal === potion.heal) {
        stack.count = (stack.count || 1) + (potion.count || 1);
        return;
      }
    }
    potion.count = potion.count || 1;
    backpack.push(potion);
  }

  function addFoodToBackpack(backpack, food) {
    for (var i = 0; i < backpack.length; i++) {
      var stack = backpack[i];
      if (stack.kind === 'food' && stack.asset === food.asset && stack.name === food.name && stack.hungerRestore === food.hungerRestore) {
        stack.count = (stack.count || 1) + (food.count || 1);
        return;
      }
    }
    food.count = food.count || 1;
    backpack.push(food);
  }

  function addTrapToBackpack(backpack, trap) {
    for (var i = 0; i < backpack.length; i++) {
      var stack = backpack[i];
      if (stack.kind === 'trap' && stack.trapType === trap.trapType && stack.trapDamage === trap.trapDamage) {
        stack.count = (stack.count || 1) + (trap.count || 1);
        return;
      }
    }
    trap.count = trap.count || 1;
    backpack.push(trap);
  }

  function removeTrapFromMap(trap) {
    var traps = RK.Map && RK.Map.traps ? RK.Map.traps : null;
    if (!traps) return false;
    var index = traps.indexOf(trap);
    if (index < 0) return false;
    traps.splice(index, 1);
    return true;
  }

  function placeCarriedTrap(index) {
    var run = game();
    var p = run && run.player;
    if (!p || !p.backpack || !p.backpack[index]) return false;
    var item = p.backpack[index];
    if (item.kind !== 'trap') return false;
    if (!RK.Classes.canSetTraps(p)) {
      RK.GameUI.log('Только лучник умеет взводить ловушки.');
      return false;
    }
    var tx = p.x + (p.facingX || 0);
    var ty = p.y + (p.facingY || 0);
    if (Math.max(Math.abs(tx - p.x), Math.abs(ty - p.y)) !== 1) {
      RK.GameUI.log('Повернитесь к соседней клетке, чтобы взвести ловушку.');
      return false;
    }
    if (!RK.MapGen.isInside(tx, ty) || !RK.MapGen.isWalkable(tx, ty)) {
      RK.GameUI.log('Перед вами нет места для ловушки — встаньте на проходимую клетку.');
      return false;
    }
    if (RK.MapGen.getTrapAt(tx, ty) || RK.MapGen.getDoorAt(tx, ty) ||
        RK.MapGen.getChestAt(tx, ty) || npcAt(tx, ty) ||
        enemyAt(tx, ty) || partyPlayerAt(tx, ty, p.id)) {
      RK.GameUI.log('Эта клетка занята — ловушку туда поставить нельзя.');
      return false;
    }
    var trap = {
      x: tx,
      y: ty,
      asset: 'trap',
      type: item.trapType || 'spike',
      state: 'armed',
      damage: RK.Items.trapItemDamage(item),
      owner: p.id,
    };
    RK.Map.traps.push(trap);
    item.count = (item.count || 1) - 1;
    if (item.count <= 0) p.backpack.splice(index, 1);
    RK.GameUI.log('Ловушка взведена: ' + RK.Items.trapItemName(item) + '.');
    RK.GameUI.refresh();
    finishTurn();
    return true;
  }

  // Единственное место, где бонусы экипировки попадают в характеристики.
  // sign = 1 при надевании, -1 при снятии.
  function applyGearBonuses(player, stats, sign) {
    var bonuses = player.gearBonuses;
    if (!bonuses) return;
    bonuses.atk += sign * (stats && stats.atk ? stats.atk : 0);
    bonuses.def += sign * (stats && stats.def ? stats.def : 0);
    bonuses.hp += sign * (stats && stats.hp ? stats.hp : 0);
    bonuses.luck += sign * (stats && stats.luck ? stats.luck : 0);
  }

  // Двуручное лежит в обеих руках: снять его можно из любой, а очистить — из всех.
  function clearItemSlots(player, item) {
    for (var i = 0; i < C.SLOTS.length; i++) {
      if (player.equipment[C.SLOTS[i]] === item) player.equipment[C.SLOTS[i]] = null;
    }
  }

  function unequipIntoBackpack(player, slot, index) {
    var item = player.equipment[slot];
    if (!item) return false;
    clearItemSlots(player, item);
    item.equipped = false;
    applyGearBonuses(player, item.stats, -1);
    if (index != null) {
      player.backpack.splice(index, 1);
      player.backpack.push(item);
    } else {
      player.backpack.push(item);
    }
    recomputePlayerStats();
    RK.GameUI.log('Снято: ' + item.name);
    RK.GameUI.refresh();
    return true;
  }

  function useInventoryItem(index) {
    var run = game();
    var p = run && run.player;
    if (!p || !p.backpack || !p.backpack[index]) return false;
    var item = p.backpack[index];
    if (item.kind === 'potion') return usePotion(index);
    if (item.kind === 'food') return useFood(index);
    if (item.kind === 'trap') return placeCarriedTrap(index);
    if (!item.slot) return false;
    var slot = RK.Classes.targetSlotFor(p, item);
    if (!slot) return false;
    var restriction = RK.Classes.equipRestriction(p, item, slot);
    if (restriction) {
      RK.GameUI.log(restriction);
      return false;
    }
    if (item.equipped) {
      // Предмет может лежать не в своём слоте: второе оружие берсерка сидит в offhand.
      var held = null;
      for (var s = 0; s < C.SLOTS.length; s++) {
        if (p.equipment[C.SLOTS[s]] === item) { held = C.SLOTS[s]; break; }
      }
      return unequipIntoBackpack(p, held || item.slot, index);
    }

    // Двуручное требует обе руки; вторую руку отдаёт второе оружие берсерка.
    var hands = RK.Classes.handsFor(p, item);
    for (var h = 0; h < hands.length; h++) {
      var occupant = p.equipment[hands[h]];
      if (occupant && occupant !== item && occupant.twoHanded && !item.twoHanded) {
        RK.GameUI.log('Обе руки заняты двуручным оружием.');
        return false;
      }
    }
    // Новый предмет уходит из рюкзака один раз, до снятия старых: splice по
    // индексу после push удалял бы только что снятую вещь.
    p.backpack.splice(index, 1);
    for (var h2 = 0; h2 < hands.length; h2++) {
      var current = p.equipment[hands[h2]];
      if (current && current !== item) {
        clearItemSlots(p, current);
        current.equipped = false;
        applyGearBonuses(p, current.stats, -1);
        p.backpack.push(current);
      }
    }
    for (var h3 = 0; h3 < hands.length; h3++) p.equipment[hands[h3]] = item;
    item.equipped = true;
    applyGearBonuses(p, item.stats, 1);
    recomputePlayerStats();
    RK.GameUI.log('Надето: ' + item.name + ' (' + item.summary + ')');
    RK.GameUI.refresh();
    return true;
  }

  function usePotion(index) {
    var run = game();
    var p = run && run.player;
    if (!p || !p.backpack) return false;
    var potionIndex = index;
    if (potionIndex == null) {
      potionIndex = -1;
      for (var i = 0; i < p.backpack.length; i++) {
        if (p.backpack[i].kind === 'potion') {
          potionIndex = i;
          break;
        }
      }
    }
    var potion = p.backpack[potionIndex];
    if (!potion || potion.kind !== 'potion') {
      RK.GameUI.log('В рюкзаке нет зелий.');
      return false;
    }
    if (p.hp >= p.maxHp) {
      RK.GameUI.log('Зелье можно выпить, когда здоровье будет неполным.');
      return false;
    }
    var healing = Math.min(p.maxHp - p.hp, potion.heal || p.potionHeal);
    p.hp += healing;
    potion.count = (potion.count || 1) - 1;
    if (potion.count <= 0) p.backpack.splice(potionIndex, 1);
    if (RK.Audio) RK.Audio.playAbility();
    RK.GameUI.log('Зелье лечения: +' + healing + ' HP.');
    RK.GameUI.refresh();
    return true;
  }

  function useFood(index) {
    var run = game();
    var p = run && run.player;
    if (!p || !p.backpack) return false;
    var foodIndex = index;
    if (foodIndex == null) {
      foodIndex = -1;
      for (var i = 0; i < p.backpack.length; i++) {
        if (p.backpack[i].kind === 'food') { foodIndex = i; break; }
      }
    }
    var food = p.backpack[foodIndex];
    if (!food || food.kind !== 'food') {
      RK.GameUI.log('В рюкзаке нет еды.');
      return false;
    }
    p.maxHunger = p.maxHunger || (RK.CONFIG && RK.CONFIG.FOOD_MAX_HUNGER) || 100;
    var restore = food.hungerRestore || (RK.CONFIG && RK.CONFIG.FOOD_HUNGER_RESTORE) || 28;
    var beforeHunger = p.hunger || 0;
    p.hunger = Math.min(p.maxHunger, beforeHunger + restore);
    var healing = 0;
    if ((food.heal || 0) > 0 && p.hp < p.maxHp) {
      healing = Math.min(p.maxHp - p.hp, food.heal || (RK.CONFIG && RK.CONFIG.FOOD_HEAL) || 0);
      p.hp += healing;
    }
    food.count = (food.count || 1) - 1;
    if (food.count <= 0) p.backpack.splice(foodIndex, 1);
    recomputePlayerStats();
    RK.GameUI.log('Съедено: ' + food.name + ' (+' + (p.hunger - beforeHunger) + ' голода' + (healing ? ', +' + healing + ' HP' : '') + ').');
    RK.GameUI.refresh();
    return true;
  }

  function dropInventoryItem(index) {
    var run = game();
    var p = run && run.player;
    if (!p || !p.backpack || !p.backpack[index]) return false;
    var item = p.backpack.splice(index, 1)[0];
    if (item.equipped) {
      clearItemSlots(p, item);
      applyGearBonuses(p, item.stats, -1);
      item.equipped = false;
      recomputePlayerStats();
    }
    item.x = p.x;
    item.y = p.y;
    item.type = item.type || C.SLOT_VISUAL_TYPES[item.slot] || 'gold';
    run.items.push(item);
    RK.GameUI.log('Вы выбросили: ' + item.name);
    RK.GameUI.refresh();
    return true;
  }

  function getSellValue(item) {
    if (!item) return 0;
    var value = item.value || (item.kind === 'potion' ? 15 : item.kind === 'key' ? 5 : 1);
    return Math.max(1, value * (item.count || 1));
  }

  function isEquippedItem(player, item) {
    if (!player || !item) return false;
    if (item.equipped) return true;
    var equipment = player.equipment || {};
    for (var slot in equipment) {
      if (equipment[slot] === item) return true;
    }
    return false;
  }

  function sellInventoryItem(index) {
    var run = game();
    var p = run && run.player;
    if (!p || !p.backpack || !p.backpack[index]) return false;
    if (!nearService('merchant')) {
      RK.GameUI.log('Подойдите к торговцу, чтобы продать предметы.');
      return false;
    }
    if (isEquippedItem(p, p.backpack[index])) {
      RK.GameUI.log('Сначала снимите экипировку, чтобы продать её.');
      return false;
    }
    var item = p.backpack.splice(index, 1)[0];
    var gold = getSellValue(item);
    p.gold += gold;
    RK.GameUI.log('Продано: ' + item.name + ' за ' + gold + ' золота.');
    RK.GameUI.refresh();
    return true;
  }

  function unequipSlot(slot) {
    var run = game();
    var p = run && run.player;
    if (!p || !slot || !p.equipment || !p.equipment[slot]) return false;
    return unequipIntoBackpack(p, slot, null);
  }

  function handlePickup() {
    var run = game();
    if (!run) return;
    var p = run.player;
    for (var i = run.items.length - 1; i >= 0; i--) {
      var it = run.items[i];
      if (it.x === p.x && it.y === p.y) {
        run.items.splice(i, 1);
        if (run.locationMode && run.placedLocationItems) {
          var persistentIndex = run.placedLocationItems.findIndex(function (item) {
            return item.id && item.id === it.id;
          });
          if (persistentIndex >= 0) run.placedLocationItems.splice(persistentIndex, 1);
        }
        if (it.type === 'gold' && it.kind !== 'loot') {
          var g = Math.max(1, Math.round((it.amt || 0) * (1 + metaLuck() * C.META_LUCK_GOLD_RATE) *
            RK.Narrator.getMods(run.turn).goldMul));
          p.gold += g;
          RK.GameUI.log('Золото +' + g);
        } else if (it.kind === 'key') {
          var keyStack = null;
          for (var keyIndex = 0; keyIndex < p.backpack.length; keyIndex++) {
            if (p.backpack[keyIndex].kind === 'key' && p.backpack[keyIndex].keyId === it.keyId) {
              keyStack = p.backpack[keyIndex];
              break;
            }
          }
          if (keyStack) keyStack.count += it.count || 1;
          else p.backpack.push(it);
          RK.GameUI.log('Подобран железный ключ.');
        } else if (it.type === 'potion' || it.kind === 'potion') {
          var potion = {};
          for (var potionProperty in it) potion[potionProperty] = it[potionProperty];
          potion.kind = 'potion';
          potion.type = 'potion';
          potion.name = potion.name || 'Зелье лечения';
          potion.heal = Math.max(potion.heal || 0, p.potionHeal);
          potion.summary = '+' + potion.heal + ' HP';
          addPotionToBackpack(p.backpack, potion);
          RK.GameUI.log('Зелье лечения добавлено в рюкзак (всего: ' +
            p.backpack.reduce(function (total, stack) {
              return total + (stack.kind === 'potion' ? (stack.count || 1) : 0);
            }, 0) + ').');
        } else if (it.kind === 'food' || it.type === 'food') {
          var foodPickup = {};
          for (var foodProperty in it) foodPickup[foodProperty] = it[foodProperty];
          foodPickup.kind = 'food';
          foodPickup.type = 'food';
          foodPickup.name = foodPickup.name || 'Еда';
          foodPickup.hungerRestore = foodPickup.hungerRestore || C.FOOD_HUNGER_RESTORE;
          foodPickup.heal = foodPickup.heal || C.FOOD_HEAL;
          foodPickup.summary = '+' + foodPickup.hungerRestore + ' голода, +' + foodPickup.heal + ' HP';
          addFoodToBackpack(p.backpack, foodPickup);
          RK.GameUI.log('Еда добавлена в рюкзак.');
        } else if (it.kind === 'loot') {
          var gear = {};
          for (var property in it) gear[property] = it[property];
          gear.x = p.x;
          gear.y = p.y;
          p.backpack.push(gear);
          var foundItem = {};
          for (var itemProperty in gear) foundItem[itemProperty] = gear[itemProperty];
          foundItem.floor = run.floor;
          run.stats.foundItems.push(foundItem);
          RK.GameUI.log('Подобран лут: ' + gear.name + ' (' + gear.summary + ')');
          advanceQuest('loot', null, 1);
        }
      }
    }
  }

  RK.Inventory = RK.Inventory || {};
  RK.Inventory.setContext = function (value) { context = value || null; };
  RK.Inventory.addPotionToBackpack = addPotionToBackpack;
  RK.Inventory.addFoodToBackpack = addFoodToBackpack;
  RK.Inventory.addTrapToBackpack = addTrapToBackpack;
  RK.Inventory.removeTrapFromMap = removeTrapFromMap;
  RK.Inventory.placeCarriedTrap = placeCarriedTrap;
  RK.Inventory.applyGearBonuses = applyGearBonuses;
  RK.Inventory.clearItemSlots = clearItemSlots;
  RK.Inventory.unequipIntoBackpack = unequipIntoBackpack;
  RK.Inventory.useInventoryItem = useInventoryItem;
  RK.Inventory.usePotion = usePotion;
  RK.Inventory.useFood = useFood;
  RK.Inventory.dropInventoryItem = dropInventoryItem;
  RK.Inventory.getSellValue = getSellValue;
  RK.Inventory.isEquippedItem = isEquippedItem;
  RK.Inventory.sellInventoryItem = sellInventoryItem;
  RK.Inventory.unequipSlot = unequipSlot;
  RK.Inventory.handlePickup = handlePickup;
})();
