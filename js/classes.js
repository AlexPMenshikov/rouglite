(function () {
  var C = RK.CONFIG;

  var CLASS_DEFS = {
    tank: {
      id: 'tank',
      name: 'Танк',
      cost: 120,
      skillColor: '#8ee3ef',
      passive: 'Пассивно растёт защита и здоровье.',
      skillName: 'Щитовой ответ',
      skillText: 'На 3 хода отражает 50% входящего урона обратно врагу.',
    },
    berserker: {
      id: 'berserker',
      name: 'Берсерк',
      cost: 120,
      skillColor: '#ff7043',
      passive: 'Пассивно растёт атака. Каждая сильная атака возвращает часть урона как здоровье.',
      skillName: 'Безумие',
      skillText: 'На 3 хода повышает урон и восстанавливает здоровье от нанесённого урона.',
    },
    archer: {
      id: 'archer',
      name: 'Лучник',
      cost: 150,
      ranged: true,
      trapSense: 2,
      disarmBonus: 0.22,
      trapKit: true,
      skillColor: '#9be36a',
      passive: 'Стреляет на расстоянии видимости кликом мыши. Видит чужие ловушки за 2 клетки, ' +
        'обезвреживает их чаще и забирает в рюкзак, чтобы поставить свою.',
      skillName: 'Прицельный выстрел',
      skillText: 'На 3 хода каждый выстрел наносит двойной урон.',
    },
  };

  var RANGED_WEAPON_TYPES = ['bow', 'crossbow'];
  var MELEE_WEAPON_TYPES = ['melee'];

  // PLAYER_CLASSES — список, по которому сервер принимает classId; расхождение с
  // CLASS_DEFS сделало бы класс доступным в меню, но превращающимся в «танка» по сети.
  (function assertClassListMatchesDefinitions() {
    var declared = CLASS_DEFS;
    var listed = C.PLAYER_CLASSES || [];
    var missing = listed.filter(function (id) { return !declared[id]; });
    var extra = Object.keys(declared).filter(function (id) { return listed.indexOf(id) === -1; });
    if (missing.length || extra.length) {
      throw new Error('classes: PLAYER_CLASSES и CLASS_DEFS расходятся. Лишние: ' +
        extra.join(', ') + '; отсутствующие: ' + missing.join(', '));
    }
  })();

  function getClassDef(classId) {
    return CLASS_DEFS[classId] || CLASS_DEFS.tank;
  }

  function isRangedWeapon(item) {
    return !!item && !!item.weaponType && RANGED_WEAPON_TYPES.indexOf(item.weaponType) >= 0;
  }

  function rangedWeapon(player) {
    var weapon = player && player.equipment && player.equipment.weapon;
    return isRangedWeapon(weapon) ? weapon : null;
  }

  function canShoot(player) {
    return !!(getClassDef(player && player.classId).ranged && rangedWeapon(player));
  }

  function attackRange(player) {
    return getClassDef(player && player.classId).ranged ? (C.VIEW_RADIUS || 7) : 1;
  }

  function canReachTarget(player, tx, ty) {
    var distance = Math.max(Math.abs(tx - player.x), Math.abs(ty - player.y));
    if (distance > attackRange(player)) return false;
    if (distance <= 1) return true;
    return !!(RK.Fov && RK.Fov.lineOk(player.x, player.y, tx, ty));
  }

  // '' — вещь можно надеть, иначе причина запрета.
  function equipRestriction(player, item) {
    if (!item || item.slot !== 'weapon' || !item.weaponType) return '';
    var def = getClassDef(player && player.classId);
    if (def.ranged) {
      return MELEE_WEAPON_TYPES.indexOf(item.weaponType) >= 0
        ? def.name + ' не может держать мечи и топоры — только лук или арбалет.'
        : '';
    }
    return RANGED_WEAPON_TYPES.indexOf(item.weaponType) >= 0
      ? def.name + ' не может пользоваться луком и арбалетом.'
      : '';
  }

  function canEquip(player, item) {
    return !equipRestriction(player, item);
  }

  function trapSenseRadius(player) {
    return getClassDef(player && player.classId).trapSense || 1;
  }

  function disarmBonus(player) {
    return getClassDef(player && player.classId).disarmBonus || 0;
  }

  function canSetTraps(player) {
    return !!getClassDef(player && player.classId).trapKit;
  }

  function skillColor(classId) {
    return getClassDef(classId).skillColor || '#8ee3ef';
  }

  function applyToPlayer(player, classId) {
    var def = getClassDef(classId);
    if (!player) return def;
    player.classId = def.id;
    player.className = def.name;
    player.classSkillCooldown = 0;
    player.skillCooldowns = {};
    player.reflectShield = 0;
    player.rageTurns = 0;
    player.preciseShots = 0;
    if (player.classBonuses) {
      player.classBonuses.atk = 0;
      player.classBonuses.def = 0;
      player.classBonuses.hp = 0;
    }
    return def;
  }

  function useSkill(player, skillId) {
    if (!player || !player.classId) return false;
    var skills = RK.Skills ? RK.Skills.skillsFor(player.classId) : null;
    if (!skills) return false;
    var def = null;
    for (var i = 0; i < skills.length; i++) {
      if (skills[i].id === skillId) { def = skills[i]; break; }
    }
    if (!def) return false;
    if ((player.level || 1) < def.level) return false;
    var cooldowns = player.skillCooldowns || (player.skillCooldowns = {});
    if ((cooldowns[def.id] || 0) > 0) return false;
    cooldowns[def.id] = def.cooldown;
    player.classSkillCooldown = def.cooldown;

    var p = player;
    if (def.id === 'shield_reflect') {
      p.reflectShield = 3;
    } else if (def.id === 'shield_wall') {
      p.defenseReduceTurns = 3;
      p.defenseReduceAmount = 2;
    } else if (def.id === 'shield_bash') {
      p.shieldBash = true;
    } else if (def.id === 'rage') {
      p.rageTurns = 3;
    } else if (def.id === 'bloodlust') {
      p.bloodlustTurns = 4;
    } else if (def.id === 'unstoppable') {
      p.unstoppableTurns = 3;
    } else if (def.id === 'precise_shot') {
      p.preciseShots = 3;
    } else if (def.id === 'volley') {
      p.volleyReady = true;
    } else if (def.id === 'piercing_shot') {
      p.piercingShots = 3;
    } else {
      return false;
    }
    return true;
  }

  function tickSkillCooldowns(player) {
    var cooldowns = player && player.skillCooldowns;
    if (!cooldowns) return;
    for (var id in cooldowns) {
      if (cooldowns[id] > 0) cooldowns[id]--;
    }
  }

  RK.Classes = {
    CLASS_DEFS: CLASS_DEFS,
    RANGED_WEAPON_TYPES: RANGED_WEAPON_TYPES,
    getClassDef: getClassDef,
    isRangedWeapon: isRangedWeapon,
    rangedWeapon: rangedWeapon,
    canShoot: canShoot,
    attackRange: attackRange,
    canReachTarget: canReachTarget,
    equipRestriction: equipRestriction,
    canEquip: canEquip,
    trapSenseRadius: trapSenseRadius,
    disarmBonus: disarmBonus,
    canSetTraps: canSetTraps,
    skillColor: skillColor,
    applyToPlayer: applyToPlayer,
    useSkill: useSkill,
    tickSkillCooldowns: tickSkillCooldowns,
  };
})();
