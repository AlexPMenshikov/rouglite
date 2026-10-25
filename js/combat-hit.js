// Бой: урон, статусы, чемпионы и ход врагов.
(function () {
  var C = RK.CONFIG;

  // Контекст забега бой отдаёт один раз, как остальным модулям: статусы читают
  // из него ход и партию, а сам модуль о забеге не знает.
  var context = null;

  function setContext(ctx) {
    context = ctx || null;
  }

  function applyStatus(actor, id, opts) {
    return RK.Statuses.apply(actor, id, opts, context);
  }

  function tickActorStatuses(actor) {
    RK.Statuses.tickActor(actor, context);
  }

  function decayHunger(party) {
    var cfg = RK.CONFIG || {};
    var maxHunger = cfg.FOOD_MAX_HUNGER || 100;
    var decay = cfg.FOOD_DECAY_PER_TURN || 1;
    var starvingHpLoss = cfg.HUNGER_STARVING_HP_LOSS || 2;
    for (var i = 0; i < party.length; i++) {
      var member = party[i];
      if (!member || member.hp <= 0) continue;
      if (member.maxHunger == null) member.maxHunger = maxHunger;
      if (member.hunger == null) member.hunger = member.maxHunger;
      member.hunger = Math.max(0, member.hunger - decay);
      if (member.hunger <= 0) {
        member.hp = Math.max(0, member.hp - starvingHpLoss);
        if (member.hp <= 0) RK.CombatRun.noteDeathCause('От голода');
        if (member === RK.GAME.player) RK.GameUI.log('Голод: герой слабеет (' + starvingHpLoss + ' HP).');
      }
    }
    RK.CombatRun.recomputePlayerStats();
  }

  function tickBurning(party) {
    for (var i = 0; i < party.length; i++) {
      tickActorStatuses(party[i]);
      if (party[i] && party[i].hp <= 0) {
        // deferred death handled by finishTurn checks; call death if local hero.
        if (party[i] === RK.GAME.player || (RK.GAME.players && RK.GAME.players.indexOf(party[i]) === RK.GAME.players.indexOf(RK.GAME.player))) {
          RK.CombatRun.death();
        }
      }
    }
  }

  function elementalMultiplier(actor, type) {
    return RK.Statuses.elementalMultiplier(actor, type);
  }

  function doRangedAttack(target) {
    var p = RK.GAME && RK.GAME.player;
    if (!p || !target || target.alive === false) return false;
    var weapon = RK.Classes.rangedWeapon(p);
    var weaponName = weapon ? weapon.name : 'Лук';
    var weaponLabel = weapon && weapon.weaponType === 'crossbow' ? 'арбалета' : 'лука';
    if (RK.Audio) RK.Audio.playAttack();
    var mods = RK.Narrator.getMods(RK.GAME.turn);
    var zoneMods = RK.CombatRun.getZoneMods(p.x, p.y);
    var dmg = Math.max(1, C.hitDamage(p.atk, mods.atkBonus + zoneMods.atkBonus, target.def,
      RK.RNG.int(0, 2)));
    var precise = p.preciseShots > 0;
    if (precise) {
      p.preciseShots--;
      dmg *= C.PRECISE_SHOT_MULTIPLIER;
    }
    var piercing = p.piercingShots > 0;
    if (piercing) {
      p.piercingShots--;
    }
    RK.Effects.addShot(p.x, p.y, target.x, target.y, weapon && weapon.weaponType === 'crossbow' ? '#ffd27a' : '#c8f0a0');
    if (target.dodge && RK.RNG.chance(target.dodge)) {
      RK.Effects.addDamage(target.x, target.y, 'МИМО', '#aaaaaa');
      RK.GameUI.log('Промах: ' + target.name + ' уходит от выстрела.');
      return true;
    }
    target.hp -= dmg;
    splatBlood(target.x, target.y, precise ? 1.6 : 1.1, target.behavior === 'boss');
    triggerChampionPhase(target);
    RK.Effects.add(target.x, target.y, '#c8f0a0', { maxR: 8, hit: true, blood: true });
    RK.Effects.addDamage(target.x, target.y, dmg, '#ddff88');
    RK.GameUI.log('Выстрел из ' + weaponLabel + ' «' + weaponName + '»: ' + target.name + ' получает ' + dmg +
      (precise ? ' (прицельный)' : '') + (piercing ? ' (пронзающий)' : ''));
    if (target.hp <= 0) killEnemy(target);
    if (piercing) {
      var dx = Math.sign(target.x - p.x);
      var dy = Math.sign(target.y - p.y);
      var cx = target.x + dx;
      var cy = target.y + dy;
      while (cx >= 0 && cy >= 0 && cx < RK.GAME.mapWidth && cy < RK.GAME.mapHeight) {
        var next = RK.CombatRun.getEnemyAt(cx, cy);
        if (next) {
          var ndmg = Math.max(1, dmg - 2);
          next.hp -= ndmg;
          RK.Effects.addDamage(next.x, next.y, ndmg, '#ddff88');
          RK.GameUI.log('Пронзающий выстрел: ' + next.name + ' получает ' + ndmg + '.');
          if (next.hp <= 0) killEnemy(next);
        }
        cx += dx;
        cy += dy;
      }
    }
    return true;
  }

  function clampChance(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // Атака героя и врага разведены: флаг byPlayer давал 12 ветвлений и смешивал
  // четыре системы.
  function doAttack(attacker, target, byPlayer) {
    if (target.alive === false) return;
    if (RK.Audio) RK.Audio.playAttack();
    var dodgeLabel = target.name + ' уклонился!';
    if (target.dodge && RK.RNG.chance(target.dodge)) {
      RK.Effects.add(target.x, target.y, '#aaaaaa', { maxR: 7 });
      RK.Effects.addDamage(target.x, target.y, 'МИМО', '#aaaaaa');
      RK.GameUI.log(dodgeLabel);
      return;
    }
    var damage = byPlayer
      ? playerAttackDamage(attacker, target)
      : enemyAttackDamage(attacker, target);
    damage = Math.max(1, damage);
    if (!byPlayer) RK.GAME.stats.damageReceived += Math.min(damage, Math.max(0, target.hp));
    target.hp -= damage;
    if (!byPlayer && target.hp <= 0) {
      RK.CombatRun.noteDeathCause(attacker.behavior === 'boss' ? 'От удара босса' : 'От удара врага');
    }
    splatBlood(target.x, target.y, byPlayer ? 1.2 : 0.9, target.behavior === 'boss');
    if (byPlayer && target.alive !== false) triggerChampionPhase(target);
    if (byPlayer) finishPlayerAttack(target, damage);
    else finishEnemyAttack(attacker, damage);
  }

  function playerAttackDamage(player, target) {
    var mods = RK.Narrator.getMods(RK.GAME.turn);
    var zoneMods = RK.CombatRun.getZoneMods(player.x, player.y);
    var damage = C.hitDamage(player.atk, mods.atkBonus + zoneMods.atkBonus, target.def, RK.RNG.int(0, 2));
    if (player.classId === 'berserker' && player.rageTurns > 0) damage += C.RAGE_ATTACK_BONUS;
    if (player.blessingTurns > 0) damage += C.BLESSING_ATTACK_BONUS;
    if (player.bloodlustTurns > 0) {
      damage = C.hitDamage(player.atk, mods.atkBonus + zoneMods.atkBonus, 0, RK.RNG.int(0, 2));
    }
    if (player.unstoppableTurns > 0) {
      damage = Math.max(1, damage * 2);
    }
    return damage;
  }

  function enemyAttackDamage(enemy, target) {
    var mods = RK.Narrator.getMods(RK.GAME.turn);
    var zoneMods = RK.CombatRun.getZoneMods(RK.GAME.player.x, RK.GAME.player.y);
    var damage = enemy.atk + RK.RNG.int(0, 2) - target.def -
      mods.defBonus - zoneMods.defBonus + mods.dmgTakenBonus;
    if (target.defenseReduceTurns > 0) {
      damage = Math.max(1, damage - (target.defenseReduceAmount || 2));
    }
    if (target.unstoppableTurns > 0) {
      damage = Math.max(1, Math.floor(damage * 0.5));
    }
    if (RK.GAME.player.classId === 'paladin' && RK.GAME.player.reflectShield > 0) {
      var reflected = Math.max(1, Math.floor(damage * C.REFLECT_RATIO));
      enemy.hp = Math.max(0, (enemy.hp || 0) - reflected);
      RK.GameUI.log('Святой отклик: отражено ' + reflected + ' урона.');
      damage = Math.max(1, Math.floor(damage * C.REFLECT_RATIO));
      if (enemy.hp <= 0) killEnemy(enemy);
    }
    return damage;
  }

  function finishPlayerAttack(target, damage) {
    var p = RK.GAME.player;
    if (p && p.bloodlustTurns > 0) {
      var bloodHeal = Math.min(p.maxHp - p.hp, Math.max(1, Math.round(damage * 0.75)));
      p.hp += bloodHeal;
      RK.GameUI.log('Жажда крови: +' + bloodHeal + ' HP');
    } else if (p && p.unstoppableTurns > 0) {
      var unstopHeal = Math.min(p.maxHp - p.hp, Math.max(1, Math.round(damage * 0.5)));
      p.hp += unstopHeal;
      RK.GameUI.log('Неудержимый: +' + unstopHeal + ' HP');
    } else if (p && p.classId === 'berserker' && p.rageTurns > 0) {
      var rageHeal = Math.min(p.maxHp - p.hp, Math.max(1, Math.round(damage * C.BERSERKER_LIFESTEAL)));
      p.hp += rageHeal;
      RK.GameUI.log('Безумие: +' + rageHeal + ' HP');
    }
    RK.Effects.add(target.x, target.y, target.color, {
      maxR: target.behavior === 'boss' ? 13 : 9,
      hit: true,
      blood: true,
    });
    RK.Effects.addDamage(target.x, target.y, damage, '#ffdd55');
    RK.GameUI.log('Вы бьёте ' + target.name + ' на ' + damage);
    if (target.hp <= 0) killEnemy(target);
  }

  function finishEnemyAttack(attacker, damage) {
    RK.Effects.add(RK.GAME.player.x, RK.GAME.player.y, '#ff5252', { maxR: 12, hit: true, blood: true, shake: 2.8 });
    RK.Effects.addDamage(RK.GAME.player.x, RK.GAME.player.y, damage, '#ff5252');
    RK.Effects.notePlayerHit();
    RK.GameUI.log(attacker.ranged && !RK.CombatMove.adjacent(attacker, RK.GAME.player)
      ? attacker.name + ' стреляет в вас: ' + damage + ' урона'
      : attacker.name + ' бьёт вас на ' + damage);
    if (attacker && attacker.isChampion) {
      if (championHasAffix(attacker, 'fiery') && RK.GAME.player.hp > 0) {
        applyStatus(RK.GAME.player, 'burning', { turns: 3, damage: 2, appliedTurn: RK.GAME.turn + 1 });
        RK.GameUI.log(attacker.name + ' поджигает вас.');
      }
      if (championHasAffix(attacker, 'frenzied')) {
        var heal = Math.min(attacker.maxHp - attacker.hp, Math.max(1, Math.round(damage * 0.15)));
        attacker.hp += heal;
        if (heal > 0) RK.GameUI.log(attacker.name + ' питается болью: +' + heal + ' HP.');
      }
    }
  }

  function splatBlood(x, y, strength, heavy) {
    var n = heavy ? 4 : 2;
    for (var i = 0; i < n; i++) {
      var ox = x + (RK.RNG.chance(0.55) ? RK.RNG.int(-1, 1) : 0);
      var oy = y + (RK.RNG.chance(0.55) ? RK.RNG.int(-1, 1) : 0);
      RK.MapGen.addBlood(ox, oy, strength);
    }
    if (heavy) RK.MapGen.addBlood(x, y, strength * 1.4);
  }

  function addLocationDrop(item) {
    if (RK.GAME.locationMode) {
      item.id = item.id || 'drop-' + RK.GAME.turn + '-' + RK.GAME.items.length + '-' + Math.floor(RK.RNG.rand() * 0x100000000).toString(36);
      RK.GAME.placedLocationItems = RK.GAME.placedLocationItems || [];
      RK.GAME.placedLocationItems.push(item);
    }
    RK.GAME.items.push(item);
  }

  function championHasAffix(e, id) {
    return !!(e && e.isChampion && Array.isArray(e.affixes) && e.affixes.indexOf(id) !== -1);
  }

  function triggerChampionPhase(e) {
    if (!e || !e.isChampion || e.alive === false || e.hp <= 0 || e.phaseDone) return;
    var threshold = typeof e.phaseThreshold === 'number' ? e.phaseThreshold : 0.5;
    if (e.hp / Math.max(1, e.maxHp) > threshold) return;
    e.phaseDone = true;
    e.phase = 1;
    e.atk = Math.round(e.atk * 1.3);
    e.maxHp = Math.max(e.maxHp, e.hp);
    e.hp = Math.min(e.maxHp, e.hp + Math.round(e.maxHp * 0.25));
    RK.Effects.add(e.x, e.y, '#f2c94c', { maxR: 14 });
    RK.GameUI.log(e.name + ' впадает в ярость: урон растёт, HP восстановлены.');
  }

  function onChampionKilled(e) {
    if (!e || !e.isChampion || !championHasAffix(e, 'explosive')) return;
    var members = RK.CombatRun.party();
    for (var i = 0; i < members.length; i++) {
      var member = members[i];
      if (!member || member.hp <= 0) continue;
      var distance = RK.MapGen.manhattan(e.x, e.y, member.x, member.y);
      if (distance > 2) continue;
      var damage = Math.max(1, RK.GAME.floor * 3 + 4);
      member.hp = Math.max(0, member.hp - damage);
      RK.GAME.stats.damageReceived += damage;
      if (member.hp <= 0) RK.CombatRun.noteDeathCause('От взрыва');
      RK.Effects.add(member.x, member.y, '#ff7b32', { maxR: 12 });
      RK.Effects.addDamage(member.x, member.y, damage, '#ff7b32');
      RK.GameUI.log('Взрыв: ' + member.name + ' получает ' + damage + ' урона.');
    }
  }

  function killEnemy(e) {
    onChampionKilled(e);
    e.alive = false;
    RK.GAME.stats.enemiesKilled++;
    if (e.behavior === 'boss') {
      RK.GAME.stats.bossKillsByName[e.name] = (RK.GAME.stats.bossKillsByName[e.name] || 0) + 1;
    } else {
      RK.GAME.stats.killsByName[e.name] = (RK.GAME.stats.killsByName[e.name] || 0) + 1;
    }
    splatBlood(e.x, e.y, e.behavior === 'boss' ? 1.8 : 1.3, true);
    RK.CombatRun.addXp(e.xp);
    RK.Narrator.onEvent('kill', { boss: e.behavior === 'boss' });
    RK.Quests.advanceQuest('kill', e.type, 1);
    var killRoll = RK.RNG.int(C.GOLD_ROLL.kill[0], C.GOLD_ROLL.kill[1]);
    var gold = C.goldFromKill(killRoll, RK.GAME.floor);
    if (e.isChampion) gold = Math.max(gold, Math.max(2, RK.GAME.floor * 4 + RK.RNG.int(4, 10)));
    var goldDrop = RK.Items.makeGold(gold, e.x, e.y);
    addLocationDrop(goldDrop);
    RK.GameUI.log('С ' + e.name + ' выпало золото: ' + gold + '.');
    if (e.isChampion || e.enhanced || e.behavior === 'boss' || RK.RNG.chance(0.5)) {
      var drop = RK.Items.generateLootItem(RK.GAME.floor, e.x, e.y, e.behavior === 'boss', e.enhanced || e.isChampion);
      drop.source = 'kill';
      addLocationDrop(drop);
      RK.GameUI.log('С трупа выпал лут: ' + (drop.name || 'Лут'));
    }
  }

  function wakeNearbyEnemies(x, y) {
    for (var i = 0; i < RK.GAME.enemies.length; i++) {
      var enemy = RK.GAME.enemies[i];
      if (enemy.alive && RK.MapGen.manhattan(x, y, enemy.x, enemy.y) <= C.WAKE_NOISE_RADIUS) {
        enemy.alerted = true;
      }
    }
  }

  function triggerTrapOnTile(x, y, actor) {
    var trap = RK.MapGen.getTrapAt(x, y);
    if (!trap || trap.state === 'disarmed' || trap.state === 'triggered') return false;
    var damage = Math.max(1, trap.damage || C.trapDamage(RK.GAME.floor));
    if (actor && actor.id === RK.GAME.player.id) {
      var before = RK.GAME.player.hp;
      RK.GAME.player.hp = Math.max(0, RK.GAME.player.hp - damage);
      RK.GAME.stats.damageReceived += Math.min(damage, before);
      trap.state = 'triggered';
      if (trap.type === 'flame' && RK.GAME.player.hp > 0) {
        applyStatus(RK.GAME.player, 'burning', { turns: 3, damage: 2, appliedTurn: RK.GAME.turn + 1 });
      }
      RK.Effects.add(RK.GAME.player.x, RK.GAME.player.y, trap.type === 'flame' ? '#ff7b32' : '#dedede', { maxR: 12 });
      RK.Effects.addDamage(RK.GAME.player.x, RK.GAME.player.y, damage, trap.type === 'flame' ? '#ff7b32' : '#ffdd55');
      RK.GameUI.log(trap.type === 'flame'
        ? 'Огненная ловушка срабатывает: -' + (before - RK.GAME.player.hp) + ' HP. Горение на 3 хода.'
        : 'Ловушка срабатывает: -' + (before - RK.GAME.player.hp) + ' HP.');
      if (RK.GAME.player.hp <= 0) { RK.CombatRun.noteDeathCause('От ловушки'); RK.CombatRun.death(); }
      return true;
    }
    if (actor) {
      var enemyBefore = (actor.hp || 0);
      actor.hp = Math.max(0, (actor.hp || 0) - damage);
      trap.state = 'triggered';
      triggerChampionPhase(actor);
      RK.GameUI.log((actor.name || 'Враг') + ' попал в ловушку: -' + (enemyBefore - actor.hp) + ' HP.');
      if (actor.hp <= 0) killEnemy(actor);
      return true;
    }
    return false;
  }

  function enemiesAct() {
    if (RK.Narrator.getMods(RK.GAME.turn).freezeEnemies) return;
    if (RK.GAME.sceneKind === 'debug') return; // В комнате отладки враги не действуют.
    for (var i = 0; i < RK.GAME.enemies.length; i++) {
      var e = RK.GAME.enemies[i];
      if (!e.alive) continue;
      enemyAct(e);
    }
  }

  function enemyAct(e) {
    var targets = RK.CombatRun.party().filter(function (member) { return member.hp > 0; });
    if (!targets.length) return;
    targets.sort(function (a, b) {
      return RK.MapGen.manhattan(e.x, e.y, a.x, a.y) - RK.MapGen.manhattan(e.x, e.y, b.x, b.y);
    });
    var p = targets[0];
    if (e.stunned || (e.statuses && e.statuses.stun)) {
      e.stunned = false;
      if (e.statuses) delete e.statuses.stun;
      RK.GameUI.log(e.name + ' оглушён и пропускает ход.');
      return;
    }
    if (e.isChampion && e.regenPercent && e.hp > 0 && e.hp < e.maxHp) {
      var regenHeal = Math.max(1, Math.round(e.maxHp * e.regenPercent));
      e.hp = Math.min(e.maxHp, e.hp + regenHeal);
    }
    if (!e.alerted) {
      var dx = p.x - e.x;
      var dy = p.y - e.y;
      var radius = C.ENEMY_VISION_RADIUS;
      if (dx * dx + dy * dy > radius * radius || !RK.Fov.lineOk(e.x, e.y, p.x, p.y)) return;
      e.alerted = true;
    }
    if (e.behavior === 'slow' && RK.GAME.turn % 2 === 0) return;
    if (e.behavior === 'shaman' && resurrectNearby(e)) return;
    var d = RK.MapGen.manhattan(e.x, e.y, p.x, p.y);
    var near = RK.CombatMove.adjacent(e, p);
    if (e.ranged) {
      if (near) {
        doAttack(e, p, false);
      } else if (d <= (e.range || 4) && RK.Fov.lineOk(e.x, e.y, p.x, p.y)) {
        enemyRangedAttack(e, p);
      } else {
        chase(e, p);
      }
    } else if (near) {
      doAttack(e, p, false);
    } else {
      chase(e, p);
    }
  }

  // Дальний удар врага: летит выстрел, урон считает обычная формула.
  function enemyRangedAttack(e, target) {
    RK.Effects.addShot(e.x, e.y, target.x, target.y, e.behavior === 'boss' ? '#ffd27a' : '#c8f0a0');
    if (RK.Audio) RK.Audio.playAttack();
    doAttack(e, target, false);
  }

  // Шаман возвращает в бой павшего врага рядом: тратит на это ход.
  function resurrectNearby(shaman) {
    var corpses = RK.GAME.enemies.filter(function (other) {
      return other !== shaman && !other.alive;
    });
    for (var i = 0; i < corpses.length; i++) {
      var corpse = corpses[i];
      if (RK.MapGen.manhattan(shaman.x, shaman.y, corpse.x, corpse.y) > C.ENEMY_VISION_RADIUS) continue;
      corpse.alive = true;
      corpse.hp = Math.max(1, Math.round(corpse.maxHp * 0.5));
      corpse.alerted = true;
      RK.Effects.addLightning(shaman.x, shaman.y, corpse.x, corpse.y, { life: 320 });
      RK.Effects.add(corpse.x, corpse.y, '#b060e0', { maxR: 12, life: 420 });
      RK.GameUI.log(shaman.name + ' воскрешает: ' + corpse.name + ' восстаёт из мёртвых.');
      return true;
    }
    return false;
  }

  function chase(e, p) {
    var path = RK.MapGen.findPath(e.x, e.y, p.x, p.y, null);
    if (!path || !path.length) return;
    var s = path[0];
    if (RK.CombatRun.getEnemyAt(s.x, s.y) || RK.CombatRun.getPartyPlayerAt(s.x, s.y)) return;
    e.x = s.x;
    e.y = s.y;
    triggerTrapOnTile(e.x, e.y, e);
    if (!e.alive) return;
    if (e.behavior === 'bat') {
      var path2 = RK.MapGen.findPath(e.x, e.y, p.x, p.y, null);
      if (path2 && path2.length) {
        var s2 = path2[0];
        if (!RK.CombatRun.getEnemyAt(s2.x, s2.y) && !(s2.x === p.x && s2.y === p.y)) {
          e.x = s2.x;
          e.y = s2.y;
          triggerTrapOnTile(e.x, e.y, e);
        }
      }
    }
  }

  RK.CombatHit = {
    setContext: setContext,
    applyStatus: applyStatus,
    killEnemy: killEnemy,
    triggerChampionPhase: triggerChampionPhase,
    elementalMultiplier: elementalMultiplier,
    doAttack: doAttack,
    doRangedAttack: doRangedAttack,
    triggerTrapOnTile: triggerTrapOnTile,
    tickActorStatuses: tickActorStatuses,
    decayHunger: decayHunger,
    tickBurning: tickBurning,
    enemiesAct: enemiesAct,
    enemyAct: enemyAct,
    enemyRangedAttack: enemyRangedAttack,
    resurrectNearby: resurrectNearby,
    chase: chase,
    clampChance: clampChance,
    splatBlood: splatBlood,
    addLocationDrop: addLocationDrop,
    championHasAffix: championHasAffix,
    onChampionKilled: onChampionKilled,
    wakeNearbyEnemies: wakeNearbyEnemies,
    playerAttackDamage: playerAttackDamage,
    enemyAttackDamage: enemyAttackDamage,
    finishPlayerAttack: finishPlayerAttack,
    finishEnemyAttack: finishEnemyAttack,
  };
})();
