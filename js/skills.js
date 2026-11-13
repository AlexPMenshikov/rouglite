(function () {
  var C = RK.CONFIG;

  var SKILL_DEFS = RK.ContentData.SKILL_DEFS;

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
