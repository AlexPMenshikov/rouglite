(function () {
  var C = RK.CONFIG;

  var DEFS = {
    slime: { name: 'Слизень', symbol: 's', color: '#7ae582', asset: 'slime', enhancedAsset: 'slime_enhanced', enhancedScale: 1.25, hp: 15, atk: 3, def: 0, xp: 5, dodge: 0, behavior: 'slow' },
    rat: { name: 'Крыса', symbol: 'r', color: '#c9a86a', asset: 'rat', enhancedAsset: 'rat_enhanced', enhancedScale: 1.35, hp: 12, atk: 4, def: 0, xp: 6, dodge: 0, behavior: 'normal' },
    skeleton: { name: 'Скелет', symbol: 'S', color: '#ececec', asset: 'skeleton', enhancedAsset: 'skeleton_enhanced', enhancedScale: 1.2, hp: 22, atk: 6, def: 1, xp: 11, dodge: 0, behavior: 'normal' },
    archer: { name: 'Лучник', symbol: 'a', color: '#ffd166', asset: 'archer', enhancedAsset: 'archer_enhanced', enhancedScale: 1.2, hp: 18, atk: 5, def: 0, xp: 13, dodge: 0, behavior: 'archer' },
    bat: { name: 'Нетопырь', symbol: 'b', color: '#b18cff', asset: 'bat', enhancedAsset: 'bat_enhanced', enhancedScale: 1.35, hp: 16, atk: 4, def: 0, xp: 14, dodge: 0.3, behavior: 'bat' },
    demon: { name: 'Демон', symbol: 'D', color: '#ff7043', asset: 'demon', enhancedAsset: 'demon_enhanced', enhancedScale: 1.2, hp: 35, atk: 9, def: 2, xp: 24, dodge: 0, behavior: 'normal' },
    boss: { name: 'Босс этажа', symbol: 'B', color: '#ff5252', asset: 'boss', hp: 80, atk: 11, def: 2, xp: 80, dodge: 0, behavior: 'boss' },
  };
  var ENHANCED_PREFIXES = {
    masculine: ['Сильный', 'Древний', 'Хитрый', 'Мощный', 'Страшный'],
    feminine: ['Сильная', 'Древняя', 'Хитрая', 'Мощная', 'Страшная'],
  };

  var BOSS_FLOORS = [
    { type: 'boss_slime', name: 'Король слизи', symbol: 'B', color: '#5adf7a', hp: 70, atk: 9, def: 1, xp: 60 },
    { type: 'boss_rat', name: 'Крысиный вожак', symbol: 'B', color: '#c9a86a', hp: 78, atk: 10, def: 1, xp: 70 },
    { type: 'boss_bone', name: 'Костяной страж', symbol: 'B', color: '#e8e8e8', hp: 88, atk: 11, def: 2, xp: 85 },
    { type: 'boss_archer', name: 'Стрелок бездны', symbol: 'B', color: '#ffd166', hp: 82, atk: 12, def: 1, xp: 95 },
    { type: 'boss_bat', name: 'Владыка стаи', symbol: 'B', color: '#b18cff', hp: 90, atk: 11, def: 2, xp: 105 },
    { type: 'boss_brute', name: 'Каменный крушитель', symbol: 'B', color: '#a09080', hp: 110, atk: 13, def: 3, xp: 120 },
    { type: 'boss_witch', name: 'Ведьма катакомб', symbol: 'B', color: '#c060e0', hp: 100, atk: 14, def: 2, xp: 135 },
    { type: 'boss_knight', name: 'Проклятый рыцарь', symbol: 'B', color: '#7080a0', hp: 120, atk: 15, def: 4, xp: 150 },
    { type: 'boss_demon', name: 'Инфернальный лорд', symbol: 'B', color: '#ff5020', hp: 135, atk: 16, def: 3, xp: 170 },
    { type: 'boss_lich', name: 'Лич глубин', symbol: 'B', color: '#90e0ff', hp: 155, atk: 18, def: 4, xp: 200 },
  ];

  for (var bi = 0; bi < BOSS_FLOORS.length; bi++) {
    var bd = BOSS_FLOORS[bi];
    DEFS[bd.type] = {
      name: bd.name,
      symbol: bd.symbol,
      color: bd.color,
      asset: bd.type,
      hp: bd.hp,
      atk: bd.atk,
      def: bd.def,
      xp: bd.xp,
      dodge: 0,
      behavior: 'boss',
    };
  }

  function bossTypeForFloor(floor) {
    var idx = Math.max(0, Math.min(BOSS_FLOORS.length - 1, (floor || 1) - 1));
    return BOSS_FLOORS[idx].type;
  }

  function makeEnemy(type, x, y, floor, enhanced) {
    var d = DEFS[type];
    if (!d) d = DEFS.slime;
    var isBoss = d.behavior === 'boss';
    enhanced = !!enhanced && !isBoss;
    var hpMul = 1 + (floor - 1) * (isBoss ? 0.22 : 0.4);
    var atkMul = 1 + (floor - 1) * (isBoss ? 0.18 : 0.3);
    var maxHp = Math.round(d.hp * hpMul);
    if (isBoss) {
      maxHp = Math.round(maxHp * (1 + (floor - 1) * 0.08));
    }
    if (enhanced) maxHp = Math.round(maxHp * 1.5);
    var name = d.name;
    if (enhanced) {
      var gender = type === 'rat' ? 'feminine' : 'masculine';
      name = RK.RNG.pick(ENHANCED_PREFIXES[gender]) + ' ' + name.toLowerCase();
    }
    return {
      type: type,
      name: name,
      symbol: d.symbol,
      color: d.color,
      asset: enhanced ? (d.enhancedAsset || (type + '_enhanced')) : (d.asset || type),
      baseAsset: d.asset || type,
      enhanced: enhanced,
      sizeScale: enhanced ? (d.enhancedScale || 1.25) : 1,
      behavior: d.behavior,
      x: x,
      y: y,
      alive: true,
      alerted: false,
      maxHp: maxHp,
      hp: maxHp,
      atk: Math.round((d.atk * atkMul + (isBoss ? (floor - 1) * 0.6 : 0)) * (enhanced ? 1.5 : 1)),
      def: Math.max(0, Math.round(d.def + (floor - 1) * (isBoss ? 0.35 : 0.4))),
      xp: Math.round(d.xp * (1 + (floor - 1) * (isBoss ? 0.28 : 0.35)) * (enhanced ? 1.5 : 1)),
      dodge: d.dodge,
    };
  }

  function makeBoss(x, y, floor) {
    return makeEnemy(bossTypeForFloor(floor), x, y, floor);
  }

  function createPlayer(x, y) {
    var m = RK.Meta ? RK.Meta.data : { hp: 0, atk: 0, pot: 0, luck: 0 };
    var maxHp = C.PLAYER.hp + (m.hp || 0) * 25;
    var player = {
      x: x,
      y: y,
      facingX: 0,
      facingY: 1,
      alive: true,
      hp: maxHp,
      maxHp: maxHp,
      baseAtk: C.PLAYER.atk + (m.atk || 0) * 2,
      baseDef: C.PLAYER.def,
      baseMaxHp: maxHp,
      atk: C.PLAYER.atk + (m.atk || 0) * 2,
      def: C.PLAYER.def,
      level: 1,
      xp: 0,
      gold: 0,
      potionHeal: C.POTION_HEAL + (m.pot || 0) * 15,
      equipment: { weapon: null, head: null, armor: null, ring: null, amulet: null, boots: null },
      backpack: [],
      gearBonuses: { atk: 0, def: 0, hp: 0, luck: 0 },
      classBonuses: { atk: 0, def: 0, hp: 0 },
      classId: (m.selectedClass || 'tank'),
      className: 'Танк',
      reflectShield: 0,
      rageTurns: 0,
      burningTurns: 0,
      burningDamage: 0,
      burningAppliedTurn: 0,
      classSkillCooldown: 0,
      symbol: '@',
      color: C.COLORS.player,
      asset: 'player',
    };
    var def = RK.Classes && RK.Classes.applyToPlayer ? RK.Classes.applyToPlayer(player, player.classId) : null;
    player.className = def ? def.name : player.className;
    return player;
  }

  RK.Entities = {
    DEFS: DEFS,
    BOSS_FLOORS: BOSS_FLOORS,
    makeEnemy: makeEnemy,
    makeBoss: makeBoss,
    bossTypeForFloor: bossTypeForFloor,
    createPlayer: createPlayer,
  };
})();