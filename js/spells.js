// Спеллы и умения класса: файрболы, молния, удар щитом, град стрел.
// Логика живёт рядом с навыками (js/skills.js), а забег не знает — нужное
// приходит контекстом.
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

  function visibleEnemies() {
    return context && context.visibleEnemies ? context.visibleEnemies() : [];
  }

  function killEnemy(enemy) {
    if (context && context.killEnemy) context.killEnemy(enemy);
  }

  function applyStatus(actor, id, opts) {
    return context && context.applyStatus ? context.applyStatus(actor, id, opts) : null;
  }

  function zoneMods(x, y) {
    return context && context.zoneMods ? context.zoneMods(x, y) : { atkBonus: 0, defBonus: 0 };
  }

  function finishTurn() {
    if (context && context.finishTurn) context.finishTurn();
  }

  // Бонус к урону заклинаний от Магического Шара (offhand).
  function spellPowerBonus(p) {
    var orb = p && p.equipment && p.equipment.offhand;
    if (!orb || orb.weaponKind !== C.MAGE_ORB_KIND) return { power: 0, element: null };
    var power = (orb.stats && orb.stats.spellPower) || 0;
    var element = (orb.stats && orb.stats.element) || null;
    return { power: power, element: element };
  }

  function performFireball(p, tx, ty) {
    var run = game();
    if (!run || !p) return;
    tx = Number(tx); ty = Number(ty);
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) return;
    if (!RK.Map || !RK.Map.vis || !RK.Map.vis[ty] || !RK.Map.vis[ty][tx]) {
      RK.GameUI.log('Цель вне поля зрения.');
      return;
    }
    var target = enemyAt(tx, ty);
    if (!target) {
      RK.GameUI.log('Файрбол: выберите врага.');
      return;
    }
    if (Math.max(Math.abs(tx - p.x), Math.abs(ty - p.y)) > (C.VIEW_RADIUS || 7) || !RK.Fov.lineOk(p.x, p.y, tx, ty)) {
      RK.GameUI.log('Файрбол: цель вне дальности.');
      return;
    }
    var spell = spellPowerBonus(p);
    var elementBonus = spell.element === 'fire' ? spell.power : Math.floor(spell.power / 2);
    var dmg = Math.max(1, (p.atk || 10) + 10 + RK.RNG.int(0, 4) + elementBonus - (target.def || 0));
    var finalDmg = dmg;
    if (RK.Statuses && RK.Statuses.applyDamage) finalDmg = RK.Statuses.applyDamage(target, dmg, 'fire');
    else target.hp -= dmg;
    if (RK.Statuses && RK.Statuses.apply) RK.Statuses.apply(target, 'burning', { turns: 3, damage: 2, appliedTurn: run.turn + 1 });
    if (RK.Effects) {
      RK.Effects.addFireball(p.x, p.y, tx, ty, { life: 280 });
      RK.Effects.add(tx, ty, '#ff5a1f', { maxR: 26, life: 520 });
      RK.Effects.addDamage(tx, ty, finalDmg, '#ffcc66');
    }
    try { RK.Audio && RK.Audio.playSpellFireball && RK.Audio.playSpellFireball(); } catch (e) {}
    RK.GameUI.log('Файрбол: ' + target.name + ' получает ' + finalDmg + ' урона и загорается.');
    if (target.hp <= 0) killEnemy(target);
    return true;
  }

  function performMassFireball(p, tx, ty) {
    var run = game();
    if (!run || !p) return;
    tx = Number(tx); ty = Number(ty);
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) return;
    if (!RK.Map || !RK.Map.vis || !RK.Map.vis[ty] || !RK.Map.vis[ty][tx]) {
      RK.GameUI.log('Центр взрыва вне поля зрения.');
      return;
    }
    if (Math.max(Math.abs(tx - p.x), Math.abs(ty - p.y)) > (C.VIEW_RADIUS || 7) || !RK.Fov.lineOk(p.x, p.y, tx, ty)) {
      RK.GameUI.log('Массовый файрбол: цель вне дальности.');
      return;
    }
    var targets = [];
    for (var i = 0; i < run.enemies.length; i++) {
      var e = run.enemies[i];
      if (!e || !e.alive) continue;
      if (Math.max(Math.abs(e.x - tx), Math.abs(e.y - ty)) <= 2) targets.push(e);
    }
    if (!targets.length) {
      RK.GameUI.log('Массовый файрбол: нет врагов в радиусе взрыва.');
      return;
    }
    if (RK.Effects) {
      RK.Effects.addFireball(p.x, p.y, tx, ty, { life: 320 });
      RK.Effects.add(tx, ty, '#ff3b00', { maxR: 42, life: 640 });
    }
    var spell = spellPowerBonus(p);
    var elementBonus = spell.element === 'fire' ? spell.power : Math.floor(spell.power / 2);
    for (var j = 0; j < targets.length; j++) {
      var enemy = targets[j];
      var dmg = Math.max(1, (p.atk || 10) + 7 + RK.RNG.int(0, 3) + elementBonus - (enemy.def || 0));
      var finalDmg = dmg;
      if (RK.Statuses && RK.Statuses.applyDamage) finalDmg = RK.Statuses.applyDamage(enemy, dmg, 'fire');
      else enemy.hp -= dmg;
      if (RK.Statuses && RK.Statuses.apply) RK.Statuses.apply(enemy, 'burning', { turns: 2, damage: 2, appliedTurn: run.turn + 1 });
      if (RK.Effects) {
        RK.Effects.add(enemy.x, enemy.y, '#ff8a3d', { maxR: 16, life: 360 });
        RK.Effects.addDamage(enemy.x, enemy.y, finalDmg, '#ffcc66');
      }
      RK.GameUI.log('Массовый файрбол: ' + enemy.name + ' получает ' + finalDmg + ' урона.');
      if (enemy.hp <= 0) killEnemy(enemy);
    }
    try { RK.Audio && RK.Audio.playSpellMassFireball && RK.Audio.playSpellMassFireball(); } catch (e) {}
    return true;
  }

  function performHomingLightning(p) {
    var run = game();
    if (!run || !p) return;
    var candidates = visibleEnemies().slice();
    candidates.sort(function (a, b) {
      var da = Math.abs(a.x - p.x) + Math.abs(a.y - p.y);
      var db = Math.abs(b.x - p.x) + Math.abs(b.y - p.y);
      return da - db;
    });
    if (!candidates.length) {
      RK.GameUI.log('Самонаводящаяся молния: нет видимых целей.');
      return;
    }
    var targets = candidates.slice(0, 3);
    var spell = spellPowerBonus(p);
    var elementBonus = spell.element === 'lightning' ? spell.power : Math.floor(spell.power / 2);
    var prevX = p.x, prevY = p.y;
    for (var i = 0; i < targets.length; i++) {
      var enemy = targets[i];
      var dmg = Math.max(1, (p.atk || 10) + 14 + RK.RNG.int(0, 5) + elementBonus - (enemy.def || 0));
      var finalDmg = dmg;
      if (RK.Statuses && RK.Statuses.applyDamage) finalDmg = RK.Statuses.applyDamage(enemy, dmg, 'lightning');
      else enemy.hp -= dmg;
      if (RK.Effects) {
        RK.Effects.addLightning(prevX, prevY, enemy.x, enemy.y, { life: 260 });
        RK.Effects.add(enemy.x, enemy.y, '#fff2a8', { maxR: 20, life: 420 });
        RK.Effects.addDamage(enemy.x, enemy.y, finalDmg, '#fff2a8');
      }
      RK.GameUI.log('Самонаводящаяся молния: ' + enemy.name + ' получает ' + finalDmg + ' урона.');
      if (enemy.hp <= 0) killEnemy(enemy);
      prevX = enemy.x; prevY = enemy.y;
    }
    try { RK.Audio && RK.Audio.playSpellLightning && RK.Audio.playSpellLightning(); } catch (e) {}
    return true;
  }

  function activateClassSkill(skillId) {
    var run = game();
    var p = run && run.player;
    if (!run || run.over || !p) return false;
    var skills = RK.Skills ? RK.Skills.skillsFor(p.classId) : null;
    if (!skills || !skills.length) return false;
    var def = null;
    for (var i = 0; i < skills.length; i++) {
      if (skills[i].id === skillId) { def = skills[i]; break; }
    }
    if (!def) {
      var aliasIndex = { basic: 0, advanced: 1, master: 2 }[skillId];
      if (aliasIndex != null && skills[aliasIndex]) {
        def = skills[aliasIndex];
      } else {
        def = skills[0];
      }
    }
    if ((p.level || 1) < def.level) {
      RK.GameUI.log('Навык «' + def.name + '» откроется на ' + def.level + ' уровне.');
      return false;
    }
    var ok = RK.Classes.useSkill(p, def.id);
    if (ok) {
      if (RK.Effects) {
        RK.Effects.add(p.x, p.y, RK.Classes.skillColor(p.classId), { maxR: 24, life: 480 });
        if (def.id === 'fireball' || def.id === 'mass_fireball') {
          RK.Effects.add(p.x, p.y, '#ff8a3d', { maxR: 16, life: 700 });
        }
      }
      if (RK.Audio) {
        if (def.id === 'fireball') RK.Audio.playSpellFireball && RK.Audio.playSpellFireball();
        else if (def.id === 'mass_fireball') RK.Audio.playSpellMassFireball && RK.Audio.playSpellMassFireball();
        else if (def.id === 'homing_lightning') RK.Audio.playSpellLightning && RK.Audio.playSpellLightning();
        else RK.Audio.playAbility();
      }
      if (def.id === 'shield_bash') {
        performShieldBash(p);
      } else if (def.id === 'volley') {
        performVolley(p);
      } else if (def.id === 'fireball') {
        p.pendingSpell = 'fireball';
        p.armedSpell = 'fireball';
        p.fireballReady = true;
        p.fireballCharges = 1;
      } else if (def.id === 'mass_fireball') {
        p.pendingSpell = 'mass_fireball';
        p.armedSpell = 'mass_fireball';
        p.massFireballReady = true;
        p.massFireballCharges = 1;
      } else if (def.id === 'homing_lightning') {
        p.homingLightningReady = true;
        p.lightningCharges = 3;
        performHomingLightning(p);
        p.homingLightningReady = false;
        p.lightningCharges = 0;
      }
      RK.GameUI.refresh();
      return true;
    }
    var cooldowns = p.skillCooldowns || {};
    var remaining = cooldowns[def.id] || 0;
    RK.GameUI.log(remaining > 0
      ? 'Навык «' + def.name + '» перезаряжается: ' + remaining + ' ход(а).'
      : 'Навык класса перезаряжается.');
    return false;
  }

  // Защита щита из второй руки добавляется к удару щитом.
  function offhandShieldDef(p) {
    var off = p && p.equipment && p.equipment.offhand;
    return off && off.slot === 'offhand' && off.stats ? (off.stats.def || 0) : 0;
  }

  function performShieldBash(p) {
    var dx = [1, -1, 0, 0, 1, 1, -1, -1];
    var dy = [0, 0, 1, -1, 1, -1, 1, -1];
    var hit = 0;
    for (var i = 0; i < dx.length; i++) {
      var e = enemyAt(p.x + dx[i], p.y + dy[i]);
      if (!e) continue;
      var damage = Math.max(1, Math.floor((p.atk || 10) * 0.8) + offhandShieldDef(p));
      e.hp -= damage;
      applyStatus(e, 'stun', { turns: 1, appliedTurn: game().turn + 1 });
      hit++;
      RK.Effects.addDamage(e.x, e.y, damage, '#8ee3ef');
      RK.Effects.add(e.x, e.y, '#8ee3ef', { maxR: 10 });
      if (e.hp <= 0) killEnemy(e);
    }
    if (hit > 0) {
      RK.GameUI.log('Удар щитом: поражено врагов — ' + hit + ', оглушение на 1 ход.');
    } else {
      RK.GameUI.log('Удар щитом: рядом никого нет.');
    }
  }

  function performVolley(p) {
    var run = game();
    var weapon = RK.Classes.rangedWeapon(p);
    if (!weapon) {
      RK.GameUI.log('Для града стрел нужен лук или арбалет.');
      return;
    }
    var targets = visibleEnemies();
    if (!targets.length) {
      RK.GameUI.log('Град стрел: нет целей в поле зрения.');
      return;
    }
    for (var i = 0; i < targets.length; i++) {
      var target = targets[i];
      var mods = RK.Narrator.getMods(run.turn);
      var zone = zoneMods(p.x, p.y);
      var dmg = Math.max(1, C.hitDamage(p.atk, mods.atkBonus + zone.atkBonus, target.def,
        RK.RNG.int(0, 2)));
      RK.Effects.addShot(p.x, p.y, target.x, target.y, '#c8f0a0');
      target.hp -= dmg;
      RK.Effects.addDamage(target.x, target.y, dmg, '#ddff88');
      RK.GameUI.log('Град стрел: ' + target.name + ' получает ' + dmg + '.');
      if (target.hp <= 0) killEnemy(target);
    }
  }

  function castMageSpell(skillId, tx, ty) {
    var run = game();
    var p = run && run.player;
    if (!run || run.over || !p) return false;
    skillId = String(skillId || '');
    tx = Number(tx); ty = Number(ty);
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) return false;
    if (p.pendingSpell !== skillId) return false;
    if (skillId === 'fireball') {
      performFireball(p, tx, ty);
    } else if (skillId === 'mass_fireball') {
      performMassFireball(p, tx, ty);
    } else {
      return false;
    }
    p.pendingSpell = null;
    p.armedSpell = null;
    p.fireballReady = false;
    p.massFireballReady = false;
    p.fireballCharges = 0;
    p.massFireballCharges = 0;
    finishTurn();
    RK.GameUI.refresh();
    return true;
  }

  RK.Spells = RK.Spells || {};
  RK.Spells.setContext = function (value) { context = value || null; };
  RK.Spells.spellPowerBonus = spellPowerBonus;
  RK.Spells.performFireball = performFireball;
  RK.Spells.performMassFireball = performMassFireball;
  RK.Spells.performHomingLightning = performHomingLightning;
  RK.Spells.activateClassSkill = activateClassSkill;
  RK.Spells.offhandShieldDef = offhandShieldDef;
  RK.Spells.performShieldBash = performShieldBash;
  RK.Spells.performVolley = performVolley;
  RK.Spells.castMageSpell = castMageSpell;
})();
