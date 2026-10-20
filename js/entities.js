(function () {
  var C = RK.CONFIG;

  var DEFS = {
    slime: { name: 'Слизень', symbol: 's', color: '#7ae582', asset: 'slime', enhancedAsset: 'slime_enhanced', enhancedScale: 1.25, hp: 15, atk: 3, def: 0, xp: 5, dodge: 0, behavior: 'slow' },
    rat: { name: 'Крыса', symbol: 'r', color: '#c9a86a', asset: 'rat', enhancedAsset: 'rat_enhanced', enhancedScale: 1.35, hp: 12, atk: 4, def: 0, xp: 6, dodge: 0, behavior: 'normal' },
    skeleton: { name: 'Скелет', symbol: 'S', color: '#ececec', asset: 'skeleton', enhancedAsset: 'skeleton_enhanced', enhancedScale: 1.2, hp: 22, atk: 6, def: 1, xp: 11, dodge: 0, behavior: 'normal' },
    archer: { name: 'Лучник', symbol: 'a', color: '#ffd166', asset: 'archer', enhancedAsset: 'archer_enhanced', enhancedScale: 1.2, hp: 18, atk: 5, def: 0, xp: 13, dodge: 0, behavior: 'archer' },
    bat: { name: 'Нетопырь', symbol: 'b', color: '#b18cff', asset: 'bat', enhancedAsset: 'bat_enhanced', enhancedScale: 1.35, hp: 16, atk: 4, def: 0, xp: 14, dodge: 0.3, behavior: 'bat' },
    demon: { name: 'Демон', symbol: 'D', color: '#ff7043', asset: 'demon', enhancedAsset: 'demon_enhanced', enhancedScale: 1.2, hp: 35, atk: 9, def: 2, xp: 24, dodge: 0, behavior: 'normal' },
    // Дикая природа: волк — быстрый охотник, паук — уклоняется.
    wolf: { name: 'Волк', symbol: 'w', color: '#9a9a8a', asset: 'wolf', enhancedAsset: 'wolf_enhanced', enhancedScale: 1.25, hp: 14, atk: 5, def: 0, xp: 8, dodge: 0, behavior: 'normal' },
    spider: { name: 'Паук', symbol: 'x', color: '#8a5a9a', asset: 'spider', enhancedAsset: 'spider_enhanced', enhancedScale: 1.2, hp: 12, atk: 4, def: 0, xp: 7, dodge: 0.25, behavior: 'normal' },
    // Горы: орёл парит и бьёт сверху, козёл — живучий блеящий бугай.
    eagle: { name: 'Орёл', symbol: 'e', color: '#b08050', asset: 'eagle', enhancedAsset: 'eagle_enhanced', enhancedScale: 1.25, hp: 13, atk: 5, def: 0, xp: 9, dodge: 0.2, behavior: 'normal' },
    goat: { name: 'Козёл', symbol: 'g', color: '#a09080', asset: 'goat', enhancedAsset: 'goat_enhanced', enhancedScale: 1.25, hp: 18, atk: 5, def: 1, xp: 9, dodge: 0, behavior: 'normal' },
    // Пустыня: скорпион держит броню, мумия — медленная, но тяжёлая.
    scorpion: { name: 'Скорпион', symbol: 'c', color: '#d8b060', asset: 'scorpion', enhancedAsset: 'scorpion_enhanced', enhancedScale: 1.25, hp: 16, atk: 6, def: 2, xp: 10, dodge: 0, behavior: 'normal' },
    mummy: { name: 'Мумия', symbol: 'm', color: '#d8c8a0', asset: 'mummy', enhancedAsset: 'mummy_enhanced', enhancedScale: 1.25, hp: 26, atk: 7, def: 1, xp: 14, dodge: 0, behavior: 'slow' },
    // Подземелье: культист питается магией, зомби — неспешная стена плоти.
    cultist: { name: 'Культист', symbol: 'p', color: '#a04050', asset: 'cultist', enhancedAsset: 'cultist_enhanced', enhancedScale: 1.2, hp: 17, atk: 6, def: 0, xp: 11, dodge: 0, behavior: 'normal' },
    zombie: { name: 'Зомби', symbol: 'z', color: '#7a9a6a', asset: 'zombie', enhancedAsset: 'zombie_enhanced', enhancedScale: 1.25, hp: 24, atk: 5, def: 1, xp: 10, dodge: 0, behavior: 'slow' },
    // Склеп: призрак почти не ловится, упырь цепкими руками тянет в могилу.
    ghost: { name: 'Призрак', symbol: 'h', color: '#a0d8ff', asset: 'ghost', enhancedAsset: 'ghost_enhanced', enhancedScale: 1.2, hp: 15, atk: 6, def: 0, xp: 12, dodge: 0.35, behavior: 'normal' },
    ghoul: { name: 'Упырь', symbol: 'o', color: '#6a8a7a', asset: 'ghoul', enhancedAsset: 'ghoul_enhanced', enhancedScale: 1.25, hp: 20, atk: 7, def: 1, xp: 13, dodge: 0, behavior: 'normal' },
    // Руины: голем — медленный каменный исполин.
    golem: { name: 'Голем', symbol: 'G', color: '#909090', asset: 'golem', enhancedAsset: 'golem_enhanced', enhancedScale: 1.3, hp: 34, atk: 8, def: 3, xp: 18, dodge: 0, behavior: 'slow' },
    // Канализация: крокодил сторожит тёплые стоки.
    croc: { name: 'Крокодил', symbol: 'k', color: '#4a7a4a', asset: 'croc', enhancedAsset: 'croc_enhanced', enhancedScale: 1.3, hp: 22, atk: 7, def: 2, xp: 13, dodge: 0, behavior: 'normal' },
    boss: { name: 'Босс этажа', symbol: 'B', color: '#ff5252', asset: 'boss', hp: 80, atk: 11, def: 2, xp: 80, dodge: 0, behavior: 'boss' },
  };
  var ENHANCED_PREFIXES = {
    masculine: ['Сильный', 'Древний', 'Хитрый', 'Мощный', 'Страшный'],
    feminine: ['Сильная', 'Древняя', 'Хитрая', 'Мощная', 'Страшная'],
  };

  // Аффиксы чемпионов: id хранится в enemy.affixes, имя и статы применяются
  // один раз в makeEnemy, а боевые эффекты проверяются в combat.js по id.
  var CHAMPION_AFFIXES = [
    { id: 'swift', name: 'Быстрый', apply: function (enemy) {
      enemy.dodge = Math.min(0.75, (enemy.dodge || 0) + 0.2);
      enemy.atk = Math.round(enemy.atk * 1.15);
    } },
    { id: 'tough', name: 'Крепкий', apply: function (enemy) {
      enemy.maxHp = Math.round(enemy.maxHp * 1.5);
      enemy.hp = enemy.maxHp;
    } },
    { id: 'armored', name: 'Бронированный', apply: function (enemy) {
      enemy.def = (enemy.def || 0) + 3;
      enemy.resistances = enemy.resistances || {};
      if (typeof enemy.resistances.physical !== 'number') enemy.resistances.physical = 1;
      enemy.resistances.physical = Math.min(enemy.resistances.physical, 0.75);
    } },
    { id: 'frenzied', name: 'Яростный', apply: function (enemy) {
      enemy.atk = Math.round(enemy.atk * 1.4);
      enemy.bloodlust = true;
    } },
    { id: 'fiery', name: 'Огненный', apply: function (enemy) {
      enemy.burnOnHit = Math.max(enemy.burnOnHit || 0, 2);
    } },
    { id: 'regenerating', name: 'Регенерирующий', apply: function (enemy) {
      enemy.regenPercent = Math.max(enemy.regenPercent || 0, 0.08);
    } },
    { id: 'explosive', name: 'Взрывной', apply: function (enemy) {
      enemy.explosive = true;
    } },
  ];

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

  function makeEnemy(type, x, y, floor, enhanced, champion) {
    var d = DEFS[type];
    if (!d) d = DEFS.slime;
    var isBoss = d.behavior === 'boss';
    champion = !!champion && !isBoss;
    enhanced = !!enhanced && !isBoss && !champion;
    var hpMul = 1 + (floor - 1) * (isBoss ? 0.22 : 0.4);
    var atkMul = 1 + (floor - 1) * (isBoss ? 0.18 : 0.3);
    var maxHp = Math.round(d.hp * hpMul);
    if (isBoss) {
      maxHp = Math.round(maxHp * (1 + (floor - 1) * 0.08));
    }
    if (enhanced) maxHp = Math.round(maxHp * 1.5);
    if (champion) maxHp = Math.round(maxHp * 2);
    var name = d.name;
    var affixes = [];
    if (enhanced) {
      var gender = type === 'rat' ? 'feminine' : 'masculine';
      name = RK.RNG.pick(ENHANCED_PREFIXES[gender]) + ' ' + name.toLowerCase();
    }
    if (champion) {
      var pool = CHAMPION_AFFIXES.slice();
      var affixCount = floor >= 5 ? 2 : 1;
      var pickedNames = [];
      for (var ai = 0; ai < affixCount && pool.length; ai++) {
        var seedValue = 0;
        for (var si = 0; si < type.length; si++) seedValue += type.charCodeAt(si) * (si + 1);
        var pickIndex = Math.abs(seedValue + x * 97 + y * 31 + floor * 13 + ai * 7) % pool.length;
        var affix = pool.splice(pickIndex, 1)[0];
        if (!affix) continue;
        affixes.push(affix.id);
        pickedNames.push(affix.name);
      }
      // Имена аффиксов впереди: «Яростный крепкий скелет». Всегда чемпион,
      // даже если аффиксы не применились (например, пустой каталог).
      name = (pickedNames.length ? pickedNames.join(' ') + ' ' : 'Чемпион ') + d.name.toLowerCase();
    }
    var resistances = {};
    if (type === 'demon' || type === 'mummy') resistances.fire = 0.7;
    if (type === 'ghost') resistances.physical = 0.65;
    if (type === 'golem' || type === 'scorpion') resistances.physical = 0.8;

    var enemy = {
      type: type,
      name: name,
      symbol: d.symbol,
      color: champion ? '#f2c94c' : (enhanced ? d.color : d.color),
      asset: champion ? (d.enhancedAsset || (type + '_champion')) : (enhanced ? (d.enhancedAsset || (type + '_enhanced')) : (d.asset || type)),
      baseAsset: d.asset || type,
      enhanced: enhanced,
      isChampion: champion,
      affixes: affixes,
      phase: 0,
      phaseDone: false,
      phaseThreshold: 0.5,
      sizeScale: champion ? Math.max(d.enhancedScale || 1.25, 1.4) : (enhanced ? (d.enhancedScale || 1.25) : 1),
      behavior: d.behavior,
      x: x,
      y: y,
      alive: true,
      alerted: false,
      maxHp: maxHp,
      hp: maxHp,
      atk: Math.round((d.atk * atkMul + (isBoss ? (floor - 1) * 0.6 : 0)) *
        (enhanced ? 1.5 : 1) * (champion ? 1.7 : 1)),
      def: Math.max(0, Math.round(d.def + (floor - 1) * (isBoss ? 0.35 : 0.4)) + (champion ? 2 : 0)),
      xp: Math.round(d.xp * (1 + (floor - 1) * (isBoss ? 0.28 : 0.35)) *
        (enhanced ? 1.5 : 1) * (champion ? 2.5 : 1)),
      dodge: d.dodge,
      resistances: resistances,
      baseColor: d.color,
    };
    // Применяем аффиксы уже после базовых множителей, чтобы их проценты
    // считались от итоговых статов чемпиона, а не от обычного врага.
    if (champion) {
      for (var fi = 0; fi < affixes.length; fi++) {
        var selected = null;
        for (var ci = 0; ci < CHAMPION_AFFIXES.length; ci++) {
          if (CHAMPION_AFFIXES[ci].id === affixes[fi]) { selected = CHAMPION_AFFIXES[ci]; break; }
        }
        if (selected) selected.apply(enemy);
      }
    }
    return enemy;
  }

  function makeBoss(x, y, floor, bossType) {
    return makeEnemy(bossType || bossTypeForFloor(floor), x, y, floor);
  }

  function emptyEquipment() {
    var equipment = {};
    for (var i = 0; i < C.SLOTS.length; i++) equipment[C.SLOTS[i]] = null;
    return equipment;
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
      equipment: emptyEquipment(),
      backpack: [],
      gearBonuses: { atk: 0, def: 0, hp: 0, luck: 0 },
      maxHunger: C ? C.FOOD_MAX_HUNGER : 100,
      hunger: C ? C.FOOD_MAX_HUNGER : 100,
      classBonuses: { atk: 0, def: 0, hp: 0 },
      classId: (RK.Classes && RK.Classes.normalizeClassId ? RK.Classes.normalizeClassId(m.selectedClass || 'paladin') : 'paladin'),
      className: 'Паладин',
      reflectShield: 0,
      rageTurns: 0,
      burningTurns: 0,
      burningDamage: 0,
      burningAppliedTurn: 0,
      pendingSpell: null,
      armedSpell: null,
      fireballReady: false,
      massFireballReady: false,
      homingLightningReady: false,
      fireballCharges: 0,
      massFireballCharges: 0,
      lightningCharges: 0,
      symbol: '@',
      color: C.COLORS.player,
      asset: RK.Classes && RK.Classes.classAsset ? RK.Classes.classAsset(m.selectedClass || 'paladin') : 'player',
    };
    var def = RK.Classes && RK.Classes.applyToPlayer ? RK.Classes.applyToPlayer(player, player.classId) : null;
    player.className = def ? def.name : player.className;
    return player;
  }

  RK.Entities = {
    DEFS: DEFS,
    BOSS_TYPES: BOSS_FLOORS.map(function (entry) { return entry.type; }),
    CHAMPION_AFFIXES: CHAMPION_AFFIXES,
    makeEnemy: makeEnemy,
    makeBoss: makeBoss,
    bossTypeForFloor: bossTypeForFloor,
    createPlayer: createPlayer,
  };
})();