// Бой: ход, взаимодействие и сборка модулей.
  // Каждый модуль отвечает за своё: забег и партия, движение и шаг, бой и
  // урон, городские службы. Здесь они собираются в один RK.Combat, потому
  // что его набор имён — контракт для интерфейса, сети и сервера.
(function () {
  var C = RK.CONFIG;

  // Режимы взаимодействия, разводимые клавишами E / L / F. Список общий с вводом
  // и серверной проверкой — свой набор в каждом месте разъезжался.
  var INTERACT = {
    USE: C.INTERACT_MODES[0],
    PICK: C.INTERACT_MODES[1],
    FORCE: C.INTERACT_MODES[2],
  };

  function playerAction(tx, ty) {
    if (!RK.GAME || RK.GAME.over || RK.CombatMove.busy()) return false;
    var p = RK.GAME.player;
    var door = RK.MapGen.getDoorAt(tx, ty);
    var chest = RK.MapGen.getChestAt(tx, ty);
    var npc = npcAt(tx, ty);
    var trap = RK.MapGen.getTrapAt(tx, ty);
    var exit = RK.GAME.locationMode && RK.Map.exits && RK.Map.exits.find(function (point) {
      return point.x === tx && point.y === ty;
    });
    // Клик по переходу — команда дойти и перейти: маршрут строит автопроход,
    // а сам переход случается шагом на клетку (checkStairs). Переход, на котором
    // герой уже стоит (партия встаёт на входные ворота), срабатывает сразу.
    var stair = !RK.GAME.locationMode ? RK.Map.stair : null;
    if (exit || (stair && stair.x === tx && stair.y === ty)) {
      RK.GameUI.log('Переход: ' + (exit ? exit.label : 'вниз, на этаж ' + (RK.GAME.floor + 1)) + '.');
      if (RK.GAME.player.x === tx && RK.GAME.player.y === ty) {
        RK.CombatMove.stopAutoWalk();
        RK.CombatRun.checkStairs();
        RK.GameUI.refresh();
        return true;
      }
      RK.CombatMove.beginAutoWalk(tx, ty);
      return RK.CombatMove.busy();
    }
    // Врага проверяем раньше предметов: враг, стоящий на ловушке, иначе перехватывал
    // бы клик, и лучник не стрелял бы вместо этого.
    var adj = RK.CombatRun.getEnemyAt(tx, ty);
    if (adj) {
      if (RK.Classes.canShoot(p)) {
        if (!RK.Classes.canReachTarget(p, tx, ty)) {
          RK.GameUI.log(RK.Classes.getClassDef(p.classId).name +
            ' стреляет на расстоянии видимости: цель слишком далеко или нет линии выстрела.');
          return false;
        }
        RK.CombatMove.setFacing(tx - p.x, ty - p.y);
        RK.CombatHit.doRangedAttack(adj);
        RK.CombatRun.finishTurn();
        return true;
      }
      if (RK.CombatMove.adjacent(p, adj)) {
        RK.CombatHit.doAttack(p, adj, true);
        RK.CombatRun.finishTurn();
        return true;
      }
      RK.CombatMove.tryMoveToward(tx, ty);
      return RK.CombatMove.busy();
    }
    // Открытые дверь и сундук не трогаем: клик по ним — обычный шаг.
    var closedDoor = door && !isOpened(door) ? door : null;
    var closedChest = chest && !isOpened(chest) ? chest : null;
    if (closedDoor || closedChest || npc || trap) {
      var target = closedDoor || closedChest || npc || trap;
      var dx = target.x - RK.GAME.player.x;
      var dy = target.y - RK.GAME.player.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) {
        if (closedDoor || closedChest) return approachAndUse(target);
        RK.GameUI.log(trap ? 'Подойдите вплотную, чтобы обезвредить ловушку.' : 'Подойдите к объекту вплотную, чтобы взаимодействовать.');
        return false;
      }
      RK.CombatMove.setFacing(dx, dy);
      if (npc) {
        RK.CombatServices.openNpcScreen(npc);
        return true;
      }
      if (trap && !closedDoor && !closedChest) {
        RK.GameUI.log('Ловушка под ногами. Нажмите L, чтобы обезвредить её.');
        return true;
      }
      if (closedDoor || closedChest) {
        return useTarget(target, { door: closedDoor, chest: closedChest });
      }
      return interact(INTERACT.USE);
    }
    if (!RK.MapGen.isWalkable(tx, ty)) return false;
    if (tx === p.x && ty === p.y) {
      skipTurn();
      return true;
    }
    // Соседняя клетка, в том числе по диагонали, — один шаг, как с нумпада:
    // tryStep уже знает диагональ и сам ставит взгляд, 8-направленный BFS не нужен.
    if (Math.max(Math.abs(tx - p.x), Math.abs(ty - p.y)) === 1) {
      return RK.CombatMove.tryStep(tx - p.x, ty - p.y);
    }
    RK.CombatMove.beginAutoWalk(tx, ty);
    return RK.CombatMove.busy();
  }

  function skipTurn() {
    if (!RK.GAME || RK.GAME.over || RK.CombatMove.busy()) return false;
    var p = RK.GAME.player;
    var mods = RK.Narrator.getMods(RK.GAME.turn);
    if (mods.restHeal > 0 && p.hp < p.maxHp) {
      var heal = Math.min(p.maxHp - p.hp, mods.restHeal);
      p.hp += heal;
      RK.GameUI.log('Отдых: +' + heal + ' HP');
    } else {
      RK.GameUI.log('Отдых...');
    }
    RK.Narrator.onEvent('rest');
    RK.CombatRun.finishTurn();
    return true;
  }

  function isOpened(object) {
    return object.state === 'open' || object.state === 'broken';
  }

  // Соседняя клетка, с которой можно дотянуться до предмета: сам предмет
  // непроходим, поэтому путь ищется только к его соседям.
  function approachTile(target) {
    var p = RK.GAME.player;
    var occ = RK.CombatMove.makeOccupancy(p);
    var best = null;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var x = target.x + dx;
        var y = target.y + dy;
        if (!RK.MapGen.isWalkable(x, y) || occ(x, y)) continue;
        var path = RK.MapGen.findPath(p.x, p.y, x, y, occ);
        if (!path) continue;
        if (!best || path.length < best.path.length) best = { x: x, y: y, path: path };
      }
    }
    return best;
  }

  // Клик по дальней двери или сундуку: сначала идём к соседней клетке,
  // затем открываем предмет. Прерывание автопрохода отменяет действие.
  function approachAndUse(target) {
    var stop = approachTile(target);
    if (!stop) {
      RK.GameUI.log('К объекту не подойти: путь перекрыт.');
      return false;
    }
    RK.CombatMove.beginAutoWalk(stop.x, stop.y, function () {
      if (!RK.GAME || RK.GAME.over) return;
      var hero = RK.GAME.player;
      var dx = target.x - hero.x;
      var dy = target.y - hero.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return;
      RK.CombatMove.setFacing(dx, dy);
      useTarget(target, {
        door: RK.MapGen.getDoorAt(target.x, target.y),
        chest: RK.MapGen.getChestAt(target.x, target.y),
      });
    });
    return true;
  }

  function interact(mode) {
    if (!RK.GAME || RK.GAME.over || RK.CombatMove.busy()) return false;
    var objects = facingObject();
    if (objects.exit) {
      RK.GameUI.log('Выход: ' + objects.exit.label + '. Встаньте на лестницу, чтобы перейти.');
      return false;
    }
    if (objects.npc) {
      if (mode !== INTERACT.USE) {
        RK.GameUI.log(RK.Npc.nameOf(objects.npc) + ' не нуждается в силе или отмычках.');
        return false;
      }
      RK.CombatServices.openNpcScreen(objects.npc);
      return true;
    }
    if (objects.trap && mode !== INTERACT.PICK) {
      RK.GameUI.log('Перед вами ловушка. Нажмите L, чтобы её обезврежить.');
      return false;
    }
    var target = objects.trap || objects.door || objects.chest;
    if (!target) {
      RK.GameUI.log('Перед вами нет двери, сундука или ловушки.');
      return false;
    }

    if (mode === INTERACT.PICK) return pickTarget(target, objects);
    if (mode === INTERACT.FORCE) return forceBreak(target, objects);
    return useTarget(target, objects);
  }

  function facingObject() {
    var p = RK.GAME && RK.GAME.player;
    if (!p) return null;
    var x = p.x + (p.facingX || 0);
    var y = p.y + (p.facingY || 0);
    return {
      door: RK.MapGen.getDoorAt(x, y),
      chest: RK.MapGen.getChestAt(x, y),
      npc: npcAt(x, y),
      trap: RK.MapGen.getTrapAt(x, y),
      exit: RK.GAME.locationMode && RK.Map.exits
        ? RK.Map.exits.find(function (point) { return point.x === x && point.y === y; })
        : null,
    };
  }

  function npcAt(x, y) {
    return RK.Npc.getAt(RK.GAME && RK.GAME.npcs, x, y);
  }

  // Взлом замка или обезвреживание ловушки (L).
  function pickTarget(target, objects) {
    if (target === objects.trap) return disarmTrap(target);
    if (target.storage) {
      RK.GameUI.log('Хранилище не запирается.');
      return false;
    }
    if (target.state !== 'locked') {
      RK.GameUI.log('Этот объект не заперт.');
      return false;
    }
    var luck = RK.GAME.player.gearBonuses && RK.GAME.player.gearBonuses.luck ? RK.GAME.player.gearBonuses.luck : 0;
    var chance = RK.CombatHit.clampChance(C.LOCKPICK_BASE_CHANCE + luck / C.LUCK_PER_LOCKPICK_TILE -
      RK.GAME.floor * C.FLOOR_LOCKPICK_PENALTY, C.LOCKPICK_MIN_CHANCE, C.LOCKPICK_MAX_CHANCE);
    if (RK.RNG.chance(chance)) {
      target.state = 'closed';
      RK.GameUI.log(objects.door ? 'Замок двери поддался.' : 'Замок сундука поддался.');
    } else {
      RK.GameUI.log('Не удалось вскрыть замок.');
    }
    RK.CombatRun.finishTurn();
    return true;
  }

  function disarmTrap(trap) {
    if (trap.state === 'disarmed') {
      RK.GameUI.log('Ловушка уже обезврежена.');
      return false;
    }
    var luck = RK.GAME.player.gearBonuses && RK.GAME.player.gearBonuses.luck ? RK.GAME.player.gearBonuses.luck : 0;
    var bonus = RK.Classes.disarmBonus(RK.GAME.player);
    var chance = RK.CombatHit.clampChance(C.TRAP_DISARM_BASE_CHANCE + luck / C.LUCK_PER_DISARM_TILE -
      RK.GAME.floor * C.FLOOR_LOCKPICK_PENALTY + bonus,
      C.TRAP_DISARM_MIN_CHANCE, C.TRAP_DISARM_MAX_CHANCE);
    if (RK.RNG.chance(chance)) {
      trap.state = 'disarmed';
      RK.GameUI.log(bonus > 0 ? 'Ловушка обезврежена (опыт сапожника: шанс выше).' : 'Ловушка обезврежена.');
      if (RK.Classes.canSetTraps(RK.GAME.player)) {
        RK.Inventory.addTrapToBackpack(RK.GAME.player.backpack, RK.Items.spawnTrapItem(trap, RK.GAME.player.x, RK.GAME.player.y));
        RK.Inventory.removeTrapFromMap(trap);
        RK.GameUI.log('Ловушка переходит в ваш рюкзак — установите её кнопкой «Установить».');
      }
    } else {
      RK.GameUI.log('Неудачный взлом: ловушка срабатывает.');
      RK.CombatHit.triggerTrapOnTile(trap.x, trap.y, RK.GAME.player);
    }
    RK.CombatRun.finishTurn();
    return true;
  }

  // Выбивание двери или взламывание сундука силой (F).
  function forceBreak(target, objects) {
    if (target.storage) {
      RK.GameUI.log('Хранилище не ломается.');
      return false;
    }
    if (target.state === 'open' || target.state === 'broken') {
      RK.GameUI.log(objects.door ? 'Дверь уже открыта или выбита.' : 'Сундук уже открыт или разбит.');
      return false;
    }
    target.hp -= Math.max(1, Math.floor(RK.GAME.player.atk / C.FORCE_BREAK_ATK_DIVISOR));
    RK.GameUI.log((objects.door ? 'Вы выбиваете дверь: ' : 'Вы ломаете сундук: ') +
      Math.max(0, target.hp) + '/' + target.maxHp + ' прочности.');
    if (target.hp > 0) {
      RK.CombatRun.finishTurn();
      return true;
    }
    target.state = 'broken';
    if (!objects.door) {
      RK.CombatServices.openChest(target);
      RK.GameUI.log('Сундук разбит! Шум привлёк врагов.');
    } else {
      RK.GameUI.log('Дверь выбита! Шум привлёк врагов.');
    }
    RK.CombatHit.wakeNearbyEnemies(target.x, target.y);
    RK.CombatRun.finishTurn();
    return true;
  }

  // Обычное взаимодействие (E): открыть/закрыть дверь, открыть сундук, экран хранилища.
  function useTarget(target, objects) {
    if (target.storage) {
      RK.GameUI.screen('storage');
      return true;
    }
    if (objects.door) {
      if (target.state === 'locked') {
        if (!RK.CombatServices.consumeKey(target.keyId)) {
          RK.GameUI.log('Дверь заперта. Нужен железный ключ (E), отмычка (L) или сила (F).');
          return false;
        }
        target.state = 'open';
        RK.GameUI.log('Вы открыли дверь железным ключом.');
      } else if (target.state === 'open') {
        if (isTileOccupied(target.x, target.y)) {
          RK.GameUI.log('Нельзя закрыть дверь, пока проход занят.');
          return false;
        }
        target.state = 'closed';
        RK.GameUI.log('Вы закрыли дверь.');
      } else if (target.state === 'closed') {
        target.state = 'open';
        RK.GameUI.log('Вы открыли дверь.');
      } else {
        RK.GameUI.log('Дверь уже выбита.');
        return false;
      }
      RK.CombatRun.finishTurn();
      return true;
    }
    if (target.state === 'open' || target.state === 'broken') {
      RK.GameUI.log('Сундук уже открыт.');
      return false;
    }
    if (target.state === 'locked') {
      if (!RK.CombatServices.consumeKey(target.keyId)) {
        RK.GameUI.log('Сундук заперт. Нужен железный ключ (E) или отмычка (L).');
        return false;
      }
      RK.GameUI.log('Вы открыли замок сундука железным ключом.');
    }
    RK.CombatServices.openChest(target);
    RK.CombatRun.finishTurn();
    return true;
  }

  function isTileOccupied(x, y) {
    if (RK.GAME.player.x === x && RK.GAME.player.y === y) return true;
    for (var i = 0; i < RK.GAME.enemies.length; i++) {
      if (RK.GAME.enemies[i].alive && RK.GAME.enemies[i].x === x && RK.GAME.enemies[i].y === y) return true;
    }
    return false;
  }

  // Действия от имени конкретного героя: их отправляют игроки сетевой комнаты,
  // где забег идёт на сервере. Таблица строится один раз, не на каждый вызов performAction.
  //
  // Таблица действий строится один раз, не на каждый вызов performAction.
  var ACTION_HANDLERS = null;
  function actionHandlers() {
    if (!ACTION_HANDLERS) {
      // Таблица без прототипа: иначе действие 'constructor' нашло бы
      // Object.prototype.constructor и упало бы при вызове.
      // Псевдонимы (storeItem, guildStore, heal и прочие) — это wire-имена, по которым
      // уже отправленные клиенты зовут то же самое действие. Отдельных функций за ними
      // нет: они указывают на каноническую, чтобы правка поведения меняла все имена разом.
      ACTION_HANDLERS = Object.assign(Object.create(null), {
        activateClassSkill: RK.Spells.activateClassSkill,
        castMageSpell: RK.Spells.castMageSpell,
        interact: interact,
        playerAction: playerAction,
        skipTurn: skipTurn,
        tryStep: RK.CombatMove.tryStep,
        usePotion: RK.Inventory.usePotion,
        useFood: RK.Inventory.useFood,
        storeInChest: RK.CombatServices.storeInChest,
        takeFromChest: RK.CombatServices.takeFromChest,
        useInventoryItem: RK.Inventory.useInventoryItem,
        dropInventoryItem: RK.Inventory.dropInventoryItem,
        unequipSlot: RK.Inventory.unequipSlot,
        sellInventoryItem: RK.Inventory.sellInventoryItem,
        upgradeEquipment: RK.CombatServices.upgradeEquipment,
        acceptQuest: RK.Quests.acceptQuest,
        dialogueChoice: RK.Quests.dialogueChoice,
        turnInQuest: RK.Quests.turnInQuest,
        turnInQuestAny: RK.Quests.turnInQuestAny,
        storeInWarehouse: RK.CombatServices.storeInWarehouse,
        templeBlessing: RK.CombatServices.templeBlessing,
        templeHeal: RK.CombatServices.templeHeal,
        tavernRest: RK.CombatServices.tavernRest,
        tavernRumors: RK.CombatServices.tavernRumors,
        tavernBuyFood: RK.CombatServices.tavernBuyFood,
        campRest: RK.CombatServices.campRest,
        teleportToCity: RK.CombatServices.teleportToCity,
      });
      var actionAliases = C.ACTION_ALIASES || {};
      for (var canonical in actionAliases) {
        if (!Object.prototype.hasOwnProperty.call(actionAliases, canonical)) continue;
        aliasHandlers(ACTION_HANDLERS, canonical, actionAliases[canonical]);
      }
    }
    return ACTION_HANDLERS;
  }

  var MAX_ACTION_ARGS = C.MAX_ACTION_ARGS;

  // Копирует обработчик на все псевдонимы одним присваиванием. Свой ключ важнее
  // псевдонима: иначе псевдоним канонического действия тихо подменил бы его
  // обработчик. Сервер проверяет псевдонимы так же (aliasRules в room-manager).
  function aliasHandlers(table, canonical, aliases) {
    aliases.forEach(function (name) {
      if (!Object.prototype.hasOwnProperty.call(table, name)) table[name] = table[canonical];
    });
  }

  function performAction(id, action, args) {
    if (!RK.CombatRun.setActivePlayer(id) || !RK.GAME.player.alive || RK.GAME.over) return false;
    args = Array.isArray(args) ? args : [];
    var handlers = actionHandlers();
    var handler = handlers[action];
    if (typeof handler !== 'function' || args.length > MAX_ACTION_ARGS) return false;
    var turn = RK.GAME.turn;
    var result = handler.apply(null, args);
    if (result === false) return RK.GAME.turn !== turn || RK.CombatMove.busy();
    if (RK.GAME.turn === turn && !RK.CombatMove.busy()) RK.CombatRun.finishTurn();
    return true;
  }

  function createSnapshot() {
    // Реализация живёт в js/combat-snapshot.js: там же и кодек map.matrices.
    return (RK.CombatSnapshot && RK.CombatSnapshot.createSnapshot)
      ? RK.CombatSnapshot.createSnapshot()
      : null;
  }

  function applySnapshot(snapshot, localPlayerId) {
    // Реализация перенесена в js/combat-snapshot.js; здесь только прокидываем
    // локальное состояние и хелперы, которые снаружи не экспортируем.
    if (!(RK.CombatSnapshot && RK.CombatSnapshot.applySnapshot)) return false;
    return RK.CombatSnapshot.applySnapshot(snapshot, localPlayerId, {
      getGame: function () { return RK.GAME; },
      setGame: function (game) { RK.GAME = game; },
      walk: RK.CombatMove.walk,
      resizeCanvas: RK.CombatRun.resizeCanvas,
    });
  }

  // Шаг приходит снимком, поэтому герои телепортировали бы на клетку за кадр.
  // Анимация шага для всей партии запускается здесь: логика уже отработала на
  // сервере, поэтому у interpolate нет продолжения — только отрисовка перехода.
  function animateSnapshotSteps(previousPositions) {
    // Логика оживления шага живёт в js/combat-snapshot.js, вместе с кодеком.
    return (RK.CombatSnapshot && RK.CombatSnapshot.animateSnapshotSteps)
      ? RK.CombatSnapshot.animateSnapshotSteps(previousPositions)
      : false;
  }

  // Контекст забега для вынесенных модулей: статусы, спавн, инвентарь, квесты
  // и спеллы. Модули о забеге не знают — всё нужное приходит отсюда.
  var runContext = {
    getGame: function () { return RK.GAME; },
    isParty: function (actor) {
      if (!RK.GAME || !actor) return false;
      return actor === RK.GAME.player || !!(RK.GAME.players && RK.GAME.players.indexOf(actor) !== -1);
    },
    onDamage: function (actor, amount, cause) {
      if (!RK.GAME || !RK.GAME.stats) return;
      RK.GAME.stats.damageReceived += amount;
      if (actor.hp <= 0) RK.CombatRun.noteDeathCause(cause || 'От урона со временем');
    },
    party: RK.CombatRun.party,
    enemyAt: RK.CombatRun.getEnemyAt,
    visibleEnemies: RK.CombatRun.visibleEnemies,
    npcAt: npcAt,
    partyPlayerAt: RK.CombatRun.getPartyPlayerAt,
    killEnemy: RK.CombatHit.killEnemy,
    applyStatus: RK.CombatHit.applyStatus,
    finishTurn: RK.CombatRun.finishTurn,
    recomputePlayerStats: RK.CombatRun.recomputePlayerStats,
    zoneMods: RK.CombatRun.getZoneMods,
    nearService: RK.CombatServices.nearService,
    metaLuck: RK.CombatRun.metaLuck,
    localPlayerId: RK.CombatRun.localPlayerId,
    advanceQuest: function (kind, detail, amount) {
      return RK.Quests.advanceQuest(kind, detail, amount);
    },
  };

  // Модули получают контекст один раз: забег он читает по требованию,
  // поэтому смена героя и новый этаж контекст не ломают.
  RK.Statuses.setContext(runContext);
  RK.Spawn.setContext(runContext);
  RK.Inventory.setContext(runContext);
  RK.Quests.setContext(runContext);
  RK.Spells.setContext(runContext);
  RK.CombatHit.setContext(runContext);

  // Инициализируем хендлеры действий до создания RK.Combat.
  actionHandlers();

  RK.Combat = {
    newRun: RK.CombatRun.newRun,
    createDebugContext: RK.CombatRun.createDebugContext,
    startFloor: RK.CombatRun.startFloor,

    playerAction: playerAction,
    skipTurn: skipTurn,
    tryStep: RK.CombatMove.tryStep,
    interact: interact,
    // Действия, которые коммитит интерфейс, обязаны быть на фасаде: тест
    // tests/quests.test.js сверяет имена из UI с RK.Combat.
    usePotion: RK.Inventory.usePotion,
    useFood: RK.Inventory.useFood,
    storeInChest: RK.CombatServices.storeInChest,
    takeFromChest: RK.CombatServices.takeFromChest,
    nearestStorage: RK.CombatServices.nearestStorage,
    useInventoryItem: RK.Inventory.useInventoryItem,
    placeCarriedTrap: RK.Inventory.placeCarriedTrap,
    dropInventoryItem: RK.Inventory.dropInventoryItem,
    unequipSlot: RK.Inventory.unequipSlot,
    sellInventoryItem: RK.Inventory.sellInventoryItem,
    getSellValue: RK.Inventory.getSellValue,
    upgradeEquipment: RK.CombatServices.upgradeEquipment,
    acceptQuest: RK.Quests.acceptQuest,
    dialogueChoice: RK.Quests.dialogueChoice,
    advanceQuest: RK.Quests.advanceQuest,
    openNpcScreen: RK.CombatServices.openNpcScreen,
    activateClassSkill: RK.Spells.activateClassSkill,
    castMageSpell: RK.Spells.castMageSpell,
    turnInQuest: RK.Quests.turnInQuest,
    turnInQuestAny: RK.Quests.turnInQuestAny,
    tavernRest: RK.CombatServices.tavernRest,
    tavernRumors: RK.CombatServices.tavernRumors,
    tavernBuyFood: RK.CombatServices.tavernBuyFood,
    storeInWarehouse: RK.CombatServices.storeInWarehouse,
    templeBlessing: RK.CombatServices.templeBlessing,
    templeHeal: RK.CombatServices.templeHeal,
    campRest: RK.CombatServices.campRest,
    teleportToCity: RK.CombatServices.teleportToCity,
    setPlayerStats: RK.CombatRun.setPlayerStats,

    getEnemyAt: RK.CombatRun.getEnemyAt,
    triggerChampionPhase: RK.CombatHit.triggerChampionPhase,
    placePartyAtEntry: RK.CombatRun.placePartyAtEntry,
    getZoneAt: RK.CombatRun.getZoneAt,
    getZoneMods: RK.CombatRun.getZoneMods,
    recomputePlayerStats: RK.CombatRun.recomputePlayerStats,

    busy: RK.CombatMove.busy,
    tickWalk: RK.CombatMove.tickWalk,
    getDrawPos: RK.CombatMove.getDrawPos,
    stepsDone: RK.CombatMove.stepsDone,
    walk: RK.CombatMove.walk,
    party: RK.CombatRun.party,
    startStep: RK.CombatMove.startStep,
    isAutoWalking: function () { return RK.CombatMove.walk.auto; },

    addNetworkPlayer: RK.CombatRun.addNetworkPlayer,
    removeNetworkPlayer: RK.CombatRun.removeNetworkPlayer,
    setActivePlayer: RK.CombatRun.setActivePlayer,
    createSnapshot: createSnapshot,
    applySnapshot: applySnapshot,
    performAction: performAction,
    // Таблица действий — часть контракта (её проверяет ACTION_RULES на сервере),
    // поэтому отдаё наружу: без неё расхождение таблиц нечем поймать.
    actionHandlers: actionHandlers,
  };
  RK.Combat.elementalMultiplier = RK.CombatHit.elementalMultiplier;
})();
