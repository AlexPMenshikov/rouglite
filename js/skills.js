(function () {
  var C = RK.CONFIG;

  // Дерево навыков классов. У каждого класса три способности: базовая (1 уровень)
  // и две улучшанные (5 и 10 уровней). Каждая имеет свой кулдаун и клавишу.
  var SKILL_DEFS = {
    paladin: [
      {
        id: 'shield_reflect',
        level: 1,
        key: '1',
        name: 'Святой отклик',
        text: 'На 3 хода отражает 50% входящего урона обратно врагу.',
        cooldown: 4,
      },
      {
        id: 'shield_wall',
        level: 5,
        key: '2',
        name: 'Стена веры',
        text: 'На 3 хода получает на 2 единицы меньше урона от каждой атаки.',
        cooldown: 5,
      },
      {
        id: 'shield_bash',
        level: 10,
        key: '3',
        name: 'Удар щитом',
        text: 'Наносит урон всем врагам вокруг и оглушает их на 1 ход.',
        cooldown: 6,
      },
    ],
    berserker: [
      {
        id: 'rage',
        level: 1,
        key: '1',
        name: 'Безумие',
        text: 'На 3 хода повышает урон и восстанавливает здоровье от нанесённого урона.',
        cooldown: 4,
      },
      {
        id: 'bloodlust',
        level: 5,
        key: '2',
        name: 'Жажда крови',
        text: 'На 4 хода атака игнорирует защиту цели и лечит на 75% урона.',
        cooldown: 5,
      },
      {
        id: 'unstoppable',
        level: 10,
        key: '3',
        name: 'Неудержимый',
        text: 'На 3 хода атака удваивается, а входящий урон уменьшается вдвое.',
        cooldown: 6,
      },
    ],
    archer: [
      {
        id: 'precise_shot',
        level: 1,
        key: '1',
        name: 'Прицельный выстрел',
        text: 'На 3 хода каждый выстрел наносит двойной урон.',
        cooldown: 4,
      },
      {
        id: 'volley',
        level: 5,
        key: '2',
        name: 'Град стрел',
        text: 'Стреляет по всем видимым врагам одновременно.',
        cooldown: 5,
      },
      {
        id: 'piercing_shot',
        level: 10,
        key: '3',
        name: 'Пронзающий выстрел',
        text: 'Следующие 3 выстрела проходят сквозь врагов и бьют всех на линии.',
        cooldown: 6,
      },
    ],
  };

  // Проверка: каждый класс из CONFIG.PLAYER_CLASSES обязан иметь дерево навыков.
  (function assertSkillsCoverClasses() {
    var classes = C.PLAYER_CLASSES || [];
    for (var i = 0; i < classes.length; i++) {
      if (!SKILL_DEFS[classes[i]] || SKILL_DEFS[classes[i]].length < 3) {
        throw new Error('skills: класс ' + classes[i] + ' без дерева навыков (нужно 3 способности)');
      }
    }
  })();

  function skillsFor(classId) {
    return SKILL_DEFS[RK.Classes.normalizeClassId(classId)] || SKILL_DEFS.paladin;
  }

  function skillDef(classId, skillId) {
    var skills = skillsFor(classId);
    for (var i = 0; i < skills.length; i++) {
      if (skills[i].id === skillId) return skills[i];
    }
    return null;
  }

  function isUnlocked(classId, skillId, level) {
    var def = skillDef(classId, skillId);
    if (!def) return false;
    return (level || 1) >= def.level;
  }

  function defaultSkill(classId) {
    return skillsFor(classId)[0];
  }

  RK.Skills = {
    SKILL_DEFS: SKILL_DEFS,
    skillsFor: skillsFor,
    skillDef: skillDef,
    isUnlocked: isUnlocked,
    defaultSkill: defaultSkill,
  };
})();
