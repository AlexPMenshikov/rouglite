(function () {
  var C = RK.CONFIG;

  var CLASS_DEFS = {
    paladin: {
      id: 'paladin',
      name: 'Паладин',
      cost: 120,
      skillColor: '#8ee3ef',
      weapon: 'меч, копьё, щит',
      passive: 'Пассивно растёт защита и здоровье.',
      skillName: 'Святой отклик',
      skillText: 'На 3 хода отражает 50% входящего урона обратно врагу.',
    },
    berserker: {
      id: 'berserker',
      name: 'Берсерк',
      cost: 120,
      dualWield: true,
      skillColor: '#ff7043',
      weapon: 'меч, копьё, топор в каждой руке',
      passive: 'Пассивно растёт атака. Каждая сильная атака возвращает часть урона как здоровье. Держит топор в каждой руке.',
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
      weapon: 'лук, арбалет (двуручные)',
      passive: 'Стреляет на расстоянии видимости кликом мыши. Видит чужие ловушки за 2 клетки, ' +
        'обезвреживает их чаще и забирает в рюкзак, чтобы поставить свою.',
      skillName: 'Прицельный выстрел',
      skillText: 'На 3 хода каждый выстрел наносит двойной урон.',
    },
    mage: {
      id: 'mage',
      name: 'Маг',
      cost: 150,
      ranged: true,
      skillColor: '#c8a6ff',
      weapon: 'посох, волшебная палочка, фетиш',
      passive: 'Магия огня и молний: файрбол обжигает, массовый файрбол взрывает область, молния находит ближайших врагов.',
      skillName: 'Файрбол',
      skillText: 'Наводит файрбол в выбранную цель; после подготовки клик мышью запускает огненный снаряд.',
    },
  };

  var RANGED_WEAPON_TYPES = ['bow', 'crossbow'];
  var MELEE_WEAPON_TYPES = ['melee'];
  var MELEE_KINDS = ['sword', 'axe', 'spear', 'staff', 'magicStaff', 'druidStaff', 'wand', 'fetish', 'magicOrb'];

  // Старое имя танка: сейвы и старые клиенты шлют 'tank', игра знает 'paladin'.
  var CLASS_ALIASES = { tank: 'paladin' };

  function normalizeClassId(classId) {
    return CLASS_ALIASES[classId] || classId;
  }

  function classAsset(classId) {
    var id = normalizeClassId(classId) || 'paladin';
    return 'player' + id.charAt(0).toUpperCase() + id.slice(1);
  }

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
    return CLASS_DEFS[normalizeClassId(classId)] || CLASS_DEFS.paladin;
  }

  function isRangedWeapon(item) {
    return !!item && !!item.weaponType && RANGED_WEAPON_TYPES.indexOf(item.weaponType) >= 0;
  }

  function isTwoHanded(item) {
    return !!item && !!item.twoHanded;
  }

  // Вид клинка у ближнего оружия; старые предметы хранят его в type.
  function weaponKindOf(item) {
    if (!item || item.weaponType !== 'melee') return null;
    var kind = item.weaponKind || item.type;
    return MELEE_KINDS.indexOf(kind) >= 0 ? kind : null;
  }

  function canDualWield(player) {
    return !!getClassDef(player && player.classId).dualWield;
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
  // targetSlot — куда предмет встанет (см. targetSlotFor): правила зависят и от руки.
  // Список магического оружия лежит в CONFIG — тот же, из которого его генерирует лут.
  var MAGE_WEAPON_KINDS = C.MAGE_WEAPON_KINDS || [];

  function equipRestriction(player, item, targetSlot) {
    if (!item || !item.slot) return '';
    var def = getClassDef(player && player.classId);
    if (item.slot === 'offhand') {
      if (item.weaponKind === C.MAGE_ORB_KIND) {
        return def.id === 'mage' ? '' : def.name + ' не может держать Магический Шар.';
      }
      return def.id === 'paladin' ? '' : def.name + ' не может держать щит.';
    }
    if (item.slot === 'weapon') {
      if (isRangedWeapon(item)) {
        return def.ranged && def.id !== 'mage' ? '' : def.name + ' не может пользоваться луком и арбалетом.';
      }
      var kind = weaponKindOf(item);
      if (kind === 'axe') {
        return def.id === 'berserker' ? '' : def.name + ' не может держать топор.';
      }
      if (MAGE_WEAPON_KINDS.indexOf(kind) >= 0) {
        return def.id === 'mage' ? '' : def.name + ' не может держать магическое оружие.';
      }
      return def.id === 'paladin' ? '' : def.name + ' не может держать мечи и копья.';
    }
    if (item.slot === 'armor') {
      if (def.id === 'mage') {
        var armorKind = item.weaponKind || item.type;
        var mageArmorKinds = C.MAGE_ARMOR_KINDS ? Object.keys(C.MAGE_ARMOR_KINDS) : [];
        if (mageArmorKinds.indexOf(armorKind) >= 0) return '';
        return def.name + ' не может носить броню — только Плащ, Мантия или Бурка.';
      }
      return '';
    }
    return '';
  }

  function canEquip(player, item) {
    return !equipRestriction(player, item);
  }

  // Куда предмет встанет в руки: щит — во вторую руку, двуручное — в обе,
  // второе оружие берсерка — во вторую руку.
  function targetSlotFor(player, item) {
    if (!item || !item.slot) return null;
    if (item.slot === 'offhand') return 'offhand';
    if (item.twoHanded) return 'weapon';
    if (item.slot === 'weapon' && canDualWield(player) && player.equipment.weapon) {
      return 'offhand';
    }
    return item.slot;
  }

  // Слоты, которые предмет занимает: двуручное — обе руки, второе оружие берсерка —
  // вторая рука, остальное — один слот.
  function handsFor(player, item) {
    if (!item) return [];
    if (item.twoHanded) return ['weapon', 'offhand'];
    var slot = targetSlotFor(player, item);
    return slot ? [slot] : [item.slot];
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
    player.skillCooldowns = {};
    player.reflectShield = 0;
    player.rageTurns = 0;
    player.preciseShots = 0;
    player.pendingSpell = null;
    player.armedSpell = null;
    player.fireballReady = false;
    player.massFireballReady = false;
    player.homingLightningReady = false;
    player.fireballCharges = 0;
    player.massFireballCharges = 0;
    player.lightningCharges = 0;
    if (RK.Classes && RK.Classes.classAsset) player.asset = RK.Classes.classAsset(def.id);
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
      } else if (def.id === 'fireball' || def.id === 'mass_fireball') {
        // Подготовка цели и расчёт урона происходят по клику в combat.js.
      } else if (def.id === 'homing_lightning') {
        p.lightningCharges = 3;
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
    classAsset: classAsset,
    RANGED_WEAPON_TYPES: RANGED_WEAPON_TYPES,
    MELEE_WEAPON_TYPES: MELEE_WEAPON_TYPES,
    getClassDef: getClassDef,
    normalizeClassId: normalizeClassId,
    isRangedWeapon: isRangedWeapon,
    isTwoHanded: isTwoHanded,
    weaponKindOf: weaponKindOf,
    canDualWield: canDualWield,
    rangedWeapon: rangedWeapon,
    canShoot: canShoot,
    attackRange: attackRange,
    canReachTarget: canReachTarget,
    equipRestriction: equipRestriction,
    canEquip: canEquip,
    targetSlotFor: targetSlotFor,
    handsFor: handsFor,
    trapSenseRadius: trapSenseRadius,
    disarmBonus: disarmBonus,
    canSetTraps: canSetTraps,
    skillColor: skillColor,
    applyToPlayer: applyToPlayer,
    useSkill: useSkill,
    tickSkillCooldowns: tickSkillCooldowns,
  };
})();
