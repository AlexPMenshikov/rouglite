// NPC локации: кто где стоит, что говорит и что предлагает.
// Положение и состояние NPC лежат в забеге (RK.GAME.npcs), а описания — здесь:
// рендер и UI читают их по виду NPC.kind. Идентификатор NPC равен его виду,
// поэтому в локации бывает не более одного NPC каждого вида.
(function () {
  var C = RK.CONFIG;

  function tradeQuest(floor) {
    if (RK.RNG.chance(0.5)) {
      var kills = 3 + floor;
      return {
        type: 'demon',
        kind: 'kill',
        enemyTypes: ['demon', 'boss_demon'],
        target: kills,
        progress: 0,
        reward: 80 + floor * 20,
        description: 'Убить ' + kills + ' демонов',
      };
    }
    var found = 2 + Math.floor(floor / 2);
    return {
      type: 'loot',
      kind: 'loot',
      target: found,
      progress: 0,
      reward: 60 + floor * 15,
      description: 'Найти ' + found + ' предмета снаряжения',
    };
  }

  function guardQuest(floor) {
    var bones = 2 + Math.floor(floor / 2);
    return {
      type: 'skeleton',
      kind: 'kill',
      enemyTypes: ['skeleton'],
      target: bones,
      progress: 0,
      reward: 50 + floor * 10,
      description: 'Очистить лес от ' + bones + ' скелетов',
    };
  }

  function priestQuest() {
    // Цель — локация графа мира: жрица просит сходить в склеп за реликвией.
    return {
      type: 'dungeon_crypt',
      kind: 'visit',
      target: 1,
      progress: 0,
      reward: 70,
      description: 'Спуститься в Склеп Тёмного и вернуться',
    };
  }

  function escortQuest(floor) {
    // Цель — провести торговца до другой локации или точки на карте.
    var distance = 5 + Math.floor(floor / 2);
    return {
      type: 'escort',
      kind: 'escort',
      target: distance,
      progress: 0,
      reward: 60 + floor * 15,
      description: 'Провести торговца на ' + distance + ' клеток',
    };
  }

  function collectQuest(floor) {
    // Цель — собрать определенное количество предметов.
    var items = 3 + Math.floor(floor / 3);
    return {
      type: 'loot',
      kind: 'collect',
      target: items,
      progress: 0,
      reward: 50 + floor * 10,
      description: 'Собрать ' + items + ' предметов',
    };
  }

  var TYPES = {
    merchant: {
      name: 'Странствующий торговец',
      building: 'market',
      service: 'merchant',
      quest: tradeQuest,
      lines: {
        hello: 'Добро пожаловать в Арген. За спиной лес и скелеты, а у меня — золото и работа.',
        done: 'Работать с тобой приятно. Загляни, когда разживёшься добычей.',
      },
    },
    blacksmith: {
      name: 'Кузнец Дорн',
      building: 'forge',
      service: 'blacksmith',
      lines: {
        hello: 'Тащи сталь — я подправлю. За плату, как положено.',
        done: 'Мельница работает, жар стоит. Что ещё притащишь?',
      },
    },
    guard: {
      name: 'Капитан стражи Рова',
      building: 'guardhouse',
      quest: guardQuest,
      lines: {
        hello: 'В лесу кости шевелятся сами по себе. Сходи туда и прибери останки.',
        done: 'Город спокоен, пока ты за него дерёшься. Спасибо.',
      },
    },
    priest: {
      name: 'Жрица Ильма',
      building: 'temple',
      quest: priestQuest,
      lines: {
        hello: 'В склепе под лесом лежит реликвия. Сходишь? Молитва хранит лучше стали.',
        done: 'Ты вернулся из склепа. Благословение с тобой.',
      },
    },
    scholar: {
      name: 'Летописец Веспер',
      building: 'tavern',
      lines: {
        hello: 'Лес Ворона отмечен на карте: поляна, роща и руины. Склеп — за руинами.',
        done: 'Запишу ещё одно имя в книгу Аргена.',
      },
    },
    ancient_guard: {
      name: 'Древний страж',
      building: 'guild',
      quest: guardQuest,
      lines: {
        hello: 'Старые камни помнят войну. Я стою здесь уже сотни лет.',
        done: 'Мой долг выполнен. Стража продолжается.',
      },
    },
  };

  // Внешность NPC различается глифом и цветами: спрайтов для всех видов нет,
  // поэтому рендер рисует запасную фигуру, если спрайт не найден.
  var VISUALS = {
    merchant: { glyph: 'M', color: '#7ae582', asset: 'merchant',
      primary: '#e0b875', secondary: '#6a3f8d', accent: '#d7b17b', trim: '#ffd166' },
    blacksmith: { glyph: 'B', color: '#ffd166', asset: 'blacksmith',
      primary: '#5a4a3a', secondary: '#8a7a6a', accent: '#4a3a2a', trim: '#3a2a1a' },
    guard: { glyph: 'G', color: '#8ab4ff', asset: 'guard',
      primary: '#3f5c9a', secondary: '#c9d4f0', accent: '#f0c14b', trim: '#2b3f70' },
    priest: { glyph: 'P', color: '#e6a7ff', asset: 'priest',
      primary: '#f2e9ff', secondary: '#7a4fa3', accent: '#ffd9f0', trim: '#c9b3e6' },
    scholar: { glyph: 'L', color: '#9bd17c', asset: 'scholar',
      primary: '#6b7a4a', secondary: '#d8cfa0', accent: '#c9a24b', trim: '#4a5636' },
  };

  // Подсказка под именем NPC на карте: «Капитан стражи Рова — E: поговорить».
  var HOVER_HINTS = {
    merchant: 'E: торговля',
    blacksmith: 'E: улучшение экипировки',
    guard: 'E: поговорить',
    priest: 'E: поговорить',
    scholar: 'E: поговорить',
  };

  function def(kind) {
    return Object.prototype.hasOwnProperty.call(TYPES, kind) ? TYPES[kind] : null;
  }

  function visual(kind) {
    return Object.prototype.hasOwnProperty.call(VISUALS, kind) ? VISUALS[kind] : VISUALS.merchant;
  }

  function hoverHint(kind) {
    return HOVER_HINTS[kind] || 'E: поговорить';
  }

  function nameOf(npc) {
    var type = npc && def(npc.kind);
    return type ? type.name : 'Житель';
  }

  function service(npc) {
    var type = npc && def(npc.kind);
    return type && type.service ? type.service : null;
  }

  // NPC забега: предложение задания создаётся один раз при появлении,
  // а принятое задание отмечается флагом — диалог после этого другой.
  function make(kind, x, y, floor) {
    var type = def(kind);
    if (!type || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      id: kind,
      kind: kind,
      x: x,
      y: y,
      offer: type.quest ? type.quest(floor || 1) : null,
      accepted: false,
    };
  }

  // Город: каждый вид NPC встаёт в своё здание. Здания без NPC (жилые дома)
  // и NPC без здания (этаж без города) пропускаются молча.
  function placeCityNpcs(map, floor) {
    var npcs = [];
    var kinds = C.NPC_KINDS || [];
    for (var i = 0; i < kinds.length; i++) {
      var type = def(kinds[i]);
      if (!type || !type.building) continue;
      var building = RK.MapGen.getBuilding(map, type.building);
      if (!building) continue;
      var npc = make(kinds[i], building.cx, building.cy, floor);
      if (npc) npcs.push(npc);
    }
    return npcs;
  }

  function getAt(npcs, x, y) {
    var list = npcs || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].x === x && list[i].y === y) return list[i];
    }
    return null;
  }

  function findByKind(npcs, kind) {
    var list = npcs || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].kind === kind) return list[i];
    }
    return null;
  }

  function isNear(npc, x, y) {
    return !!npc && Math.abs(npc.x - x) + Math.abs(npc.y - y) <= 1;
  }

  // Вид диалога для экрана: имя, реплика и предложение, если оно есть.
  function dialogue(npc) {
    var type = npc && def(npc.kind);
    if (!type) return null;
    var lines = type.lines || {};
    return {
      name: type.name,
      text: npc.accepted ? (lines.done || lines.hello) : (lines.hello || ''),
      offer: npc.offer || null,
    };
  }

  RK.Npc = {
    def: def,
    visual: visual,
    hoverHint: hoverHint,
    nameOf: nameOf,
    service: service,
    make: make,
    placeCityNpcs: placeCityNpcs,
    getAt: getAt,
    findByKind: findByKind,
    isNear: isNear,
    dialogue: dialogue,
  };
})();
