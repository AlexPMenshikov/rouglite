(function () {
  var CLASS_DEFS = {
    tank: {
      id: 'tank',
      name: 'Танк',
      cost: 120,
      passive: 'Пассивно растёт защита и здоровье.',
      skillName: 'Щитовой ответ',
      skillText: 'На 3 хода отражает 50% входящего урона обратно врагу.',
    },
    berserker: {
      id: 'berserker',
      name: 'Берсерк',
      cost: 120,
      passive: 'Пассивно растёт атака. Каждая сильная атака возвращает часть урона как здоровье.',
      skillName: 'Безумие',
      skillText: 'На 3 хода повышает урон и восстанавливает здоровье от нанесённого урона.',
    },
  };

  function getClassDef(classId) {
    return CLASS_DEFS[classId] || CLASS_DEFS.tank;
  }

  function applyToPlayer(player, classId) {
    var def = getClassDef(classId);
    if (!player) return def;
    player.classId = def.id;
    player.className = def.name;
    player.classSkillCooldown = 0;
    player.reflectShield = 0;
    player.rageTurns = 0;
    if (player.classBonuses) {
      player.classBonuses.atk = 0;
      player.classBonuses.def = 0;
      player.classBonuses.hp = 0;
    }
    return def;
  }

  function useSkill(player) {
    if (!player || !player.classId) return false;
    if (player.classSkillCooldown > 0) {
      return false;
    }
    var def = getClassDef(player.classId);
    if (def.id === 'tank') {
      player.classSkillCooldown = 4;
      player.reflectShield = 3;
      RK.UI && RK.UI.msg && RK.UI.msg('Танк активирует Щитовой ответ!');
      return true;
    }
    if (def.id === 'berserker') {
      player.classSkillCooldown = 4;
      player.rageTurns = 3;
      RK.UI && RK.UI.msg && RK.UI.msg('Берсерк входит в Безумие!');
      return true;
    }
    return false;
  }

  RK.Classes = {
    CLASS_DEFS: CLASS_DEFS,
    getClassDef: getClassDef,
    applyToPlayer: applyToPlayer,
    useSkill: useSkill,
  };
})();
