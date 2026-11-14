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
    target.alerted = true;
    splatBlood(target.x, target.y, precise ? 1.6 : 1.1, target.behavior === 'boss');
    triggerEnemyPhase(target);
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
          next.alerted = true;
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
    if (byPlayer && target.alive !== false) triggerEnemyPhase(target);
    if (byPlayer) finishPlayerAttack(target, damage);
    else finishEnemyAttack(attacker, target, damage);
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
    var zoneMods = RK.CombatRun.getZoneMods(target.x, target.y);
    var damage = enemy.atk + RK.RNG.int(0, 2) - target.def -
      mods.defBonus - zoneMods.defBonus + mods.dmgTakenBonus;
    if (target.defenseReduceTurns > 0) {
      damage = Math.max(1, damage - (target.defenseReduceAmount || 2));
    }
    if (target.unstoppableTurns > 0) {
      damage = Math.max(1, Math.floor(damage * 0.5));
    }
    if (target.classId === 'paladin' && target.reflectShield > 0) {
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

  function finishEnemyAttack(attacker, target, damage) {
    RK.Effects.add(target.x, target.y, '#ff5252', { maxR: 12, hit: true, blood: true, shake: 2.8 });
    RK.Effects.addDamage(target.x, target.y, damage, '#ff5252');
    RK.Effects.notePlayerHit();
    RK.GameUI.log(attacker.ranged && !RK.CombatMove.adjacent(attacker, target)
      ? attacker.name + ' стреляет в ' + target.name + ': ' + damage + ' урона'
      : attacker.name + ' бьёт ' + target.name + ' на ' + damage);
    if (attacker && attacker.isChampion) {
      if (championHasAffix(attacker, 'fiery') && target.hp > 0) {
        applyStatus(target, 'burning', { turns: 3, damage: 2, appliedTurn: RK.GAME.turn + 1 });
        RK.GameUI.log(attacker.name + ' поджигает ' + target.name + '.');
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

  function triggerBossPhase(e) {
    if (!e || e.behavior !== 'boss' || e.alive === false || e.hp <= 0 || e.phaseDone) return;
    var threshold = typeof e.phaseThreshold === 'number' ? e.phaseThreshold : 0.5;
    if (e.hp / Math.max(1, e.maxHp) > threshold) return;
    e.phaseDone = true;
    e.phase = 1;
    e.phaseTurns = 3;
    e.phaseZoneId = e.type + ':' + e.x + ':' + e.y;
    e.phaseStyle = e.ranged ? 'volley' : 'assault';
    e.phaseRange = e.ranged ? (e.range || 4) + 2 : 2;
    e.atk = Math.round(e.atk * 1.3);
    e.def += 1;
    if (RK.Map && Array.isArray(RK.Map.zones)) {
      RK.Map.zones.push({
        type: 'weakDefense',
        x: e.x,
        y: e.y,
        radius: 2,
        name: C.ZONES.weakDefense.name,
        bossPhaseId: e.phaseZoneId,
      });
    }
    RK.Effects.add(e.x, e.y, '#ff7043', { maxR: 16 });
    RK.GameUI.log(e.name + ' входит в фазу ' + (e.phaseStyle === 'volley' ? 'залпа' : 'натиска') +
      ': атака и защита растут, вокруг возникает зона ослабления защиты.');
  }

  function triggerEnemyPhase(e) {
    if (!e) return;
    if (e.behavior === 'boss') triggerBossPhase(e);
    else triggerChampionPhase(e);
  }

  function removeBossPhaseZone(e) {
    if (!e || !e.phaseZoneId || !RK.Map || !Array.isArray(RK.Map.zones)) return;
    RK.Map.zones = RK.Map.zones.filter(function (zone) {
      return zone.bossPhaseId !== e.phaseZoneId;
    });
    e.phaseZoneId = null;
  }

  function tickBossPhase(e) {
    if (!e || e.behavior !== 'boss' || !(e.phaseTurns > 0)) return;
    e.phaseTurns--;
    if (e.phaseTurns <= 0) removeBossPhaseZone(e);
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
    if (!e || e.alive === false) return;
    onChampionKilled(e);
    removeBossPhaseZone(e);
    e.alive = false;
    RK.GAME.stats.enemiesKilled++;
    if (e.behavior === 'boss') {
      RK.GAME.stats.bossKillsByName[e.name] = (RK.GAME.stats.bossKillsByName[e.name] || 0) + 1;
      if (RK.World && RK.World.refreshCurrentExits) RK.World.refreshCurrentExits();
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
    if (e.legendaryRewardId) {
      var reward = RK.Items.spawnLegendaryReward(e.legendaryRewardId, e.x, e.y);
      if (!reward) throw new Error('Неизвестная награда легендарного босса: ' + e.legendaryRewardId);
      addLocationDrop(reward);
      RK.GameUI.log('Получена легендарная награда: ' + reward.name + '.');
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
      triggerEnemyPhase(actor);
      RK.GameUI.log((actor.name || 'Враг') + ' попал в ловушку: -' + (enemyBefore - actor.hp) + ' HP.');
      if (actor.hp <= 0) killEnemy(actor);
      return true;
    }
    return false;
  }

  function enemyNearbyAllies(x, y, e) {
    var allies = 0;
    if (!RK.GAME || !RK.GAME.enemies) return allies;
    for (var i = 0; i < RK.GAME.enemies.length; i++) {
      var other = RK.GAME.enemies[i];
      if (!other || other === e || !other.alive) continue;
      if (RK.MapGen.manhattan(x, y, other.x, other.y) <= 2) allies++;
    }
    return allies;
  }

  function enemyTacticalRole(e) {
    if (!e) return 'attacker';
    if (e.behavior === 'boss' || e.isChampion) return 'leader';
    if (e.ranged || e.behavior === 'shaman') return 'support';
    return 'attacker';
  }

  function enemiesFocusing(target, enemy) {
    if (!target || target.id == null || !RK.GAME || !RK.GAME.enemies) return 0;
    var count = 0;
    for (var i = 0; i < RK.GAME.enemies.length; i++) {
      var ally = RK.GAME.enemies[i];
      if (ally && ally !== enemy && ally.alive && ally.alerted && ally.targetId === target.id) count++;
    }
    return count;
  }

  function enemyRetreatBias(e, target) {
    if (!e || !target) return 0;
    var distance = RK.MapGen.manhattan(e.x, e.y, target.x, target.y);
    if (distance > 2) return 0;
    var hpRatio = e.maxHp ? (e.hp / e.maxHp) : 1;
    if ((e.behavior === 'boss' || e.isChampion) && hpRatio < 0.6) return 1;
    return 0;
  }

  function chooseEnemyTarget(e, targets) {
    if (!targets || !targets.length) return null;
    var best = null;
    var bestScore = Infinity;
    var role = enemyTacticalRole(e);
    for (var i = 0; i < targets.length; i++) {
      var member = targets[i];
      if (!member || member.hp <= 0 || member.alive === false) continue;
      var distance = RK.MapGen.manhattan(e.x, e.y, member.x, member.y);
      var hpRatio = member.maxHp ? (member.hp / member.maxHp) : 1;
      var threat = member.classId === 'paladin' || member.classId === 'berserker' || member.classId === 'archer' ? 1 : 0;
      var score = distance * 2 - (1 - hpRatio) * 8 + threat * 0.5;
      score -= Math.min(3, enemiesFocusing(member, e)) * (role === 'support' ? 1.5 : 2);
      var zone = RK.CombatRun.getZoneAt(member.x, member.y);
      var zoneDef = zone && C.ZONES[zone.type];
      if (zoneDef && zoneDef.harmful) score -= 1.5;
      else if (zone) score += 0.75;
      if (e.behavior === 'boss' || e.isChampion) score -= (1 - hpRatio) * 4;
      if (score < bestScore) {
        bestScore = score;
        best = member;
      }
    }
    return best;
  }

  function pickEnemyStep(e, target) {
    if (!e || !target) return null;
    var candidates = [];
    var role = enemyTacticalRole(e);
    var desiredRange = Math.max(2, e.range || 4);
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var x = e.x + dx;
        var y = e.y + dy;
        if (!RK.MapGen.isWalkable(x, y)) continue;
        if (RK.CombatRun.getEnemyAt(x, y)) continue;
        if (RK.CombatRun.getPartyPlayerAt(x, y)) continue;
        var distance = RK.MapGen.manhattan(x, y, target.x, target.y);
        var score = role === 'support' ? Math.abs(distance - desiredRange) : distance;
        if (role === 'support' && !RK.Fov.lineOk(x, y, target.x, target.y)) score += 0.75;
        var retreat = enemyRetreatBias(e, target);
        if (retreat) score = -distance + 2;
        else if (role === 'leader') score -= 0.5;
        score -= Math.min(2, enemyNearbyAllies(x, y, e)) * 0.5;
        candidates.push({ x: x, y: y, score: score });
      }
    }
    if (!candidates.length) return null;
    candidates.sort(function (a, b) { return a.score - b.score; });
    return candidates[0];
  }

  function enemiesAct() {
    if (RK.Narrator.getMods(RK.GAME.turn).freezeEnemies) return;
    if (RK.GAME.sceneKind === 'debug') return; // В комнате отладки враги не действуют.
    for (var i = 0; i < RK.GAME.enemies.length; i++) {
      var e = RK.GAME.enemies[i];
      if (!e.alive) continue;
      enemyAct(e);
    }
    for (var j = 0; j < RK.GAME.enemies.length; j++) {
      if (RK.GAME.enemies[j].alive) tickBossPhase(RK.GAME.enemies[j]);
    }
  }

  function enemyAct(e) {
    var targets = RK.CombatRun.party().filter(function (member) { return member.hp > 0; });
    if (!targets.length) return;
    var p = chooseEnemyTarget(e, targets);
    if (!p) return;
    if (p.id == null) delete e.targetId;
    else e.targetId = p.id;
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
    if (e.behavior === 'boss' && e.phaseStyle === 'assault' &&
        Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) <= e.phaseRange) {
      doAttack(e, p, false);
      return;
    }
    if (e.ranged) {
      if (near) {
        doAttack(e, p, false);
      } else if (d <= (e.phaseStyle === 'volley' ? e.phaseRange : (e.range || 4)) &&
          RK.Fov.lineOk(e.x, e.y, p.x, p.y)) {
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
    if (e.behavior === 'boss' && e.phaseStyle === 'volley') {
      RK.Effects.add(target.x, target.y, '#ff7043', { maxR: 10, hit: true });
      var members = RK.CombatRun.party();
      for (var i = 0; i < members.length; i++) {
        var member = members[i];
        if (!member || member.hp <= 0 ||
            Math.max(Math.abs(member.x - target.x), Math.abs(member.y - target.y)) > 1 ||
            !RK.Fov.lineOk(e.x, e.y, member.x, member.y)) continue;
        doAttack(e, member, false);
      }
      return;
    }
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
    var step = pickEnemyStep(e, p);
    if (!step) {
      var path = RK.MapGen.findPath(e.x, e.y, p.x, p.y, null);
      if (!path || !path.length) return;
      var s = path[0];
      if (RK.CombatRun.getEnemyAt(s.x, s.y) || RK.CombatRun.getPartyPlayerAt(s.x, s.y)) return;
      step = { x: s.x, y: s.y };
    }
    e.x = step.x;
    e.y = step.y;
    triggerTrapOnTile(e.x, e.y, e);
    if (!e.alive) return;
    if (e.behavior === 'bat') {
      var fallbackStep = pickEnemyStep(e, p);
      if (fallbackStep && !RK.CombatRun.getEnemyAt(fallbackStep.x, fallbackStep.y) && !(fallbackStep.x === p.x && fallbackStep.y === p.y)) {
        e.x = fallbackStep.x;
        e.y = fallbackStep.y;
        triggerTrapOnTile(e.x, e.y, e);
      }
    }
  }

  RK.CombatHit = {
    setContext: setContext,
    applyStatus: applyStatus,
    killEnemy: killEnemy,
    triggerChampionPhase: triggerChampionPhase,
    triggerBossPhase: triggerBossPhase,
    triggerEnemyPhase: triggerEnemyPhase,
    tickBossPhase: tickBossPhase,
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
    chooseEnemyTarget: chooseEnemyTarget,
    pickEnemyStep: pickEnemyStep,
    enemyTacticalRole: enemyTacticalRole,
    enemyRetreatBias: enemyRetreatBias,
    enemyNearbyAllies: enemyNearbyAllies,
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
