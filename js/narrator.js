(function () {
  var NAME = 'Рассказчик';
  var MIN_TURNS_BETWEEN_LINES = 6;
  var MIN_TURNS_BETWEEN_TWISTS = 14;

  var state = null;

  var LINES = {
    runStart: [
      'Ещё один герой спускается вниз. Я уже ставлю на третий этаж.',
      'Добро пожаловать в моё подземелье. Правила... гибкие.',
      'Начинается новая история. Надеюсь, в этот раз будет интереснее.',
    ],
    floorStart: [
      'Этаж {floor}. Запах сырости и амбиции.',
      'Уровень {floor}. Стены помнят всех, кто здесь не справился.',
      'Этаж {floor}. Я бы на вашем месте не торопился.',
      'Спуск на {floor}-й этаж. Подземелье одобряет вашу самоуверенность.',
    ],
    idle: [
      'Тишина. Подозрительная тишина.',
      'Вы слышите, как где-то капает вода. Или это пот?',
      'Интересно, сколько золота вы уже оставили в коридорах?',
      'Я бы сказал «осторожнее», но вы всё равно не послушаете.',
      'Кто-то в темноте следит за вами. Спойлер: это я.',
      'Помните: каждый клик — это решение. Часто плохое.',
      'Босс на этом этаже уже знает, что вы идёте.',
    ],
    lowHp: [
      'HP на исходе. Даже подземелье делает вид, что переживает.',
      'Вы на грани. Мне нравится это напряжение.',
      'Ещё один удар — и история закончится главой «Ой».',
    ],
    kill: [
      'Ещё один враг меньше. Статистика радуется.',
      'Чисто и аккуратно. Неожиданно.',
      'Победа! Пока маленькая, но всё же победа.',
    ],
    bossKill: [
      'Босс повержен! Я теряю ставку, но выигрываете уважение.',
      'Этажный страж пал. Лестница вниз открыта для смельчака.',
      'Босс мёртв. Подземелье на секунду замолчало.',
    ],
    levelUp: [
      'Новый уровень! Вы становитесь опаснее — для всех.',
      'Уровень повышен. Подземелье слегка нервничает.',
      'Сильнее, выше, громче. Продолжайте.',
    ],
    rest: [
      'Отдых... Я тоже бы поспал, но у меня сюжет.',
      'Пропуск хода. Враги не дремлют, знайте.',
    ],
    death: [
      'История оборвалась. Но банк золота остался — маленькая победа.',
      'Конец. Подземелье снова победило. Классика жанра.',
      'Вы пали. Я запишу это в следующую главу.',
    ],
    victory: [
      'Десять этажей! Вы доказали, что правила можно ломать.',
      'Победа! Подземелье аплодирует... шумно и пусто.',
      'Финал. Редкий герой, дошедший до конца моего рассказа.',
    ],
  };

  var TWISTS = [
    {
      id: 'fury',
      label: 'Ярость (+3 атк)',
      line: 'Сегодня у вас ярость! Атака +3 на {dur} ходов.',
      duration: 5,
      weight: 3,
      apply: function (rule) { rule.atkBonus = 3; },
    },
    {
      id: 'heal',
      label: 'Исцеление',
      line: 'Внезапное исцеление. Подземелье бывает щедрым. Иногда.',
      duration: 0,
      weight: 2,
      instant: function (g) {
        var p = g.player;
        var heal = Math.min(p.maxHp - p.hp, 20);
        if (heal > 0) {
          p.hp += heal;
          RK.UI.msg('Исцеление: +' + heal + ' HP');
        }
      },
    },
    {
      id: 'mist',
      label: 'Туман (−3 обзор)',
      line: 'Туман сгущается. Обзор −3 на {dur} ходов.',
      duration: 8,
      weight: 2,
      apply: function (rule) { rule.viewDelta = -3; },
    },
    {
      id: 'freeze',
      label: 'Заморозка врагов',
      line: 'Враги застыли. У вас {dur} хода без их ответа.',
      duration: 3,
      weight: 2,
      apply: function (rule) { rule.freezeEnemies = true; },
    },
    {
      id: 'greed',
      label: 'Жадность (×2 золото)',
      line: 'Этаж пропитан жадностью. Золото ×2 до спуска ниже.',
      duration: 999,
      floorScoped: true,
      weight: 2,
      apply: function (rule) { rule.goldMul = 2; },
    },
    {
      id: 'wisdom',
      label: 'Мудрость (×1.5 опыт)',
      line: 'Опыт течёт быстрее. ×1.5 на {dur} ходов.',
      duration: 10,
      weight: 2,
      apply: function (rule) { rule.xpMul = 1.5; },
    },
    {
      id: 'rest',
      label: 'Ценный отдых',
      line: 'Отдых лечит. Пропуск хода: +8 HP на {dur} ходов.',
      duration: 8,
      weight: 2,
      apply: function (rule) { rule.restHeal = 8; },
    },
    {
      id: 'curse',
      label: 'Проклятие (−2 атк)',
      line: 'Проклятие! Атака −2 на {dur} ходов. Извините, так вышло.',
      duration: 5,
      weight: 1,
      apply: function (rule) { rule.atkBonus = -2; },
    },
    {
      id: 'fragile',
      label: 'Хрупкость (+2 урона)',
      line: 'Вы стали хрупким. +2 урона от врагов на {dur} ходов.',
      duration: 5,
      weight: 1,
      apply: function (rule) { rule.dmgTakenBonus = 2; },
    },
    {
      id: 'shield',
      label: 'Щит (+2 защ)',
      line: 'Невидимый щит. Защита +2 на {dur} ходов.',
      duration: 6,
      weight: 2,
      apply: function (rule) { rule.defBonus = 2; },
    },
  ];

  function pick(arr) {
    return arr[Math.floor(RK.RNG.rand() * arr.length)];
  }

  function fmt(text, data) {
    var s = text;
    if (data) {
      for (var k in data) {
        s = s.split('{' + k + '}').join(String(data[k]));
      }
    }
    return s;
  }

  function speak(text) {
    if (RK.UI && RK.UI.narratorMsg) RK.UI.narratorMsg(text);
    if (state) state.lastSpeakTurn = state.lastTurn;
  }

  function initRun(game) {
    state = {
      game: game,
      rules: [],
      lastSpeakTurn: -999,
      lastTwistTurn: -999,
      lastTurn: 0,
      lowHpWarnedFloor: 0,
      floorScoped: null,
    };
    game.narratorRules = state.rules;
  }

  function clearFloorRules() {
    if (!state) return;
    var kept = [];
    for (var i = 0; i < state.rules.length; i++) {
      if (!state.rules[i].floorScoped) kept.push(state.rules[i]);
    }
    state.rules = kept;
    state.floorScoped = state.game.floor;
  }

  function getMods(turn) {
    var mods = {
      atkBonus: 0,
      defBonus: 0,
      dmgTakenBonus: 0,
      viewDelta: 0,
      goldMul: 1,
      xpMul: 1,
      restHeal: 0,
      freezeEnemies: false,
    };
    if (!state) return mods;
    for (var i = 0; i < state.rules.length; i++) {
      var r = state.rules[i];
      if (turn >= r.untilTurn) continue;
      mods.atkBonus += r.atkBonus || 0;
      mods.defBonus += r.defBonus || 0;
      mods.dmgTakenBonus += r.dmgTakenBonus || 0;
      mods.viewDelta += r.viewDelta || 0;
      if (r.goldMul) mods.goldMul *= r.goldMul;
      if (r.xpMul) mods.xpMul *= r.xpMul;
      if (r.restHeal) mods.restHeal = Math.max(mods.restHeal, r.restHeal);
      if (r.freezeEnemies) mods.freezeEnemies = true;
    }
    return mods;
  }

  function activeRulesSummary() {
    if (!state || !state.game) return '';
    var turn = state.game.turn;
    var parts = [];
    for (var i = 0; i < state.rules.length; i++) {
      var r = state.rules[i];
      if (turn >= r.untilTurn) continue;
      var left = r.untilTurn - turn;
      if (r.floorScoped) parts.push(r.label);
      else parts.push(r.label + ' (' + left + ' х.)');
    }
    return parts.join(', ');
  }

  function applyTwist(twist) {
    var g = state.game;
    var turn = g.turn;
    if (twist.instant) {
      twist.instant(g);
      speak(fmt(twist.line, { dur: 0 }));
      state.lastTwistTurn = turn;
      return;
    }
    var rule = {
      id: twist.id,
      label: twist.label,
      untilTurn: turn + twist.duration,
      floorScoped: !!twist.floorScoped,
      atkBonus: 0,
      defBonus: 0,
      dmgTakenBonus: 0,
      viewDelta: 0,
      goldMul: 1,
      xpMul: 1,
      restHeal: 0,
      freezeEnemies: false,
    };
    twist.apply(rule);
    state.rules.push(rule);
    speak(fmt(twist.line, { dur: twist.duration }));
    state.lastTwistTurn = turn;
  }

  function pickTwist() {
    var total = 0;
    for (var i = 0; i < TWISTS.length; i++) total += TWISTS[i].weight;
    var r = RK.RNG.rand() * total;
    var acc = 0;
    for (var j = 0; j < TWISTS.length; j++) {
      acc += TWISTS[j].weight;
      if (r < acc) return TWISTS[j];
    }
    return TWISTS[0];
  }

  function maybeRandomEvent(turn) {
    if (!state) return;
    state.lastTurn = turn;

    if (turn - state.lastTwistTurn >= MIN_TURNS_BETWEEN_TWISTS && RK.RNG.chance(0.028)) {
      applyTwist(pickTwist());
      return;
    }

    if (turn - state.lastSpeakTurn >= MIN_TURNS_BETWEEN_LINES && RK.RNG.chance(0.045)) {
      speak(pick(LINES.idle));
    }
  }

  function onEvent(type, data) {
    if (!state) return;
    var g = state.game;
    var turn = g ? g.turn : 0;
    state.lastTurn = turn;

    if (type === 'runStart') {
      speak(pick(LINES.runStart));
      return;
    }

    if (type === 'floorStart') {
      clearFloorRules();
      if (RK.RNG.chance(0.38)) {
        speak(fmt(pick(LINES.floorStart), { floor: data.floor }));
      }
      return;
    }

    if (type === 'turnEnd') {
      var p = g.player;
      if (p && p.hp > 0 && p.hp / p.maxHp < 0.3 && state.lowHpWarnedFloor !== g.floor) {
        state.lowHpWarnedFloor = g.floor;
        if (RK.RNG.chance(0.55)) speak(pick(LINES.lowHp));
      }
      maybeRandomEvent(turn);
      return;
    }

    if (type === 'kill') {
      if (data.boss) speak(pick(LINES.bossKill));
      else if (RK.RNG.chance(0.22)) speak(pick(LINES.kill));
      return;
    }

    if (type === 'levelUp') {
      if (RK.RNG.chance(0.45)) speak(pick(LINES.levelUp));
      return;
    }

    if (type === 'rest') {
      if (RK.RNG.chance(0.18)) speak(pick(LINES.rest));
      return;
    }

    if (type === 'death') {
      speak(pick(LINES.death));
      return;
    }

    if (type === 'victory') {
      speak(pick(LINES.victory));
      return;
    }
  }

  function tick(turn) {
    if (!state) return;
    state.lastTurn = turn;
    var kept = [];
    for (var i = 0; i < state.rules.length; i++) {
      if (state.rules[i].untilTurn > turn) kept.push(state.rules[i]);
    }
    state.rules = kept;
  }

  RK.Narrator = {
    NAME: NAME,
    initRun: initRun,
    onEvent: onEvent,
    getMods: getMods,
    tick: tick,
    activeRulesSummary: activeRulesSummary,
  };
})();
