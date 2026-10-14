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

  var TYPES = {
    merchant: {
      name: 'Странствующий торговец',
      building: 'market',
      service: 'merchant',
      quest: tradeQuest,
      questChain: [tradeQuest, function (floor) {
        return {
          type: 'demon',
          kind: 'kill',
          enemyTypes: ['demon', 'boss_demon'],
          target: 5 + floor,
          progress: 0,
          reward: 120 + floor * 25,
          description: 'Убить ' + (5 + floor) + ' демонов (вторая работа)',
        };
      }],
      lines: {
        hello: 'Добро пожаловать в Арген. За спиной лес и скелеты, а у меня — золото и работа.',
        done: 'Работать с тобой приятно. Загляни, когда разживёшься добычей.',
      },
      dialogue: {
        nodes: {
          greeting: {
            text: 'Добро пожаловать в Арген. За спиной лес и скелеты, а у меня — золото и работа.',
            choices: [
              { text: 'Расскажи о городе', next: 'about_city' },
              { text: 'Есть работа?', next: 'quest_offer' },
              { text: 'Прощай', next: null },
            ],
          },
          about_city: {
            text: 'Арген — столица долины. Склеп на севере, лес на юге. Берегись демонов.',
            choices: [{ text: 'Назад', next: 'greeting' }],
          },
          quest_offer: {
            text: 'Есть дело: за городом твари плодятся. Принесёшь добычу — заплачу.',
            choices: [
              { text: 'Взять задание', action: 'acceptQuest', next: 'quest_accepted' },
              { text: 'Не сейчас', next: 'greeting' },
            ],
          },
          quest_accepted: {
            text: 'Хорошо, жду результата.',
            choices: [{ text: 'Прощай', next: null }],
          },
          done: {
            text: 'Работать с тобой приятно. Загляни, когда разживёшься добычей.',
            choices: [{ text: 'Прощай', next: null }],
          },
        },
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
      dialogue: {
        nodes: {
          greeting: {
            text: 'Тащи сталь — я подправлю. За плату, как положено.',
            choices: [
              { text: 'Покажи услуги', next: 'services' },
              { text: 'Прощай', next: null },
            ],
          },
          services: {
            text: 'Улучшаю экипировку до +5. Цена растёт с уровнем.',
            choices: [{ text: 'Назад', next: 'greeting' }],
          },
        },
      },
    },
    guard: {
      name: 'Капитан стражи Рова',
      building: 'guardhouse',
      quest: guardQuest,
      questChain: [guardQuest, function (floor) {
        return {
          type: 'skeleton',
          kind: 'kill',
          enemyTypes: ['skeleton'],
          target: 3 + Math.floor(floor / 2),
          progress: 0,
          reward: 70 + floor * 15,
          description: 'Очистить склеп от ' + (3 + Math.floor(floor / 2)) + ' скелетов',
        };
      }],
      lines: {
        hello: 'В лесу кости шевелятся сами по себе. Сходи туда и прибери останки.',
        done: 'Город спокоен, пока ты за него дерёшься. Спасибо.',
      },
      dialogue: {
        nodes: {
          greeting: {
            text: 'В лесу кости шевелятся сами по себе. Сходи туда и прибери останки.',
            choices: [
              { text: 'Я помогу', next: 'quest_offer' },
              { text: 'Прощай', next: null },
            ],
          },
          quest_offer: {
            text: 'Очисти лес от скелетов, и я отблагодарю.',
            choices: [
              { text: 'Взять задание', action: 'acceptQuest', next: 'quest_accepted' },
              { text: 'Позже', next: 'greeting' },
            ],
          },
          quest_accepted: {
            text: 'Спасибо, стражник.',
            choices: [{ text: 'Прощай', next: null }],
          },
          done: {
            text: 'Город спокоен, пока ты за него дерёшься. Спасибо.',
            choices: [{ text: 'Прощай', next: null }],
          },
        },
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
      dialogue: {
        nodes: {
          greeting: {
            text: 'В склепе под лесом лежит реликвия. Сходишь? Молитва хранит лучше стали.',
            choices: [
              { text: 'Я схожу', next: 'quest_offer' },
              { text: 'Прощай', next: null },
            ],
          },
          quest_offer: {
            text: 'Спустишься в склеп и вернёшься — благословение твоё.',
            choices: [
              { text: 'Взять задание', action: 'acceptQuest', next: 'quest_accepted' },
              { text: 'Позже', next: 'greeting' },
            ],
          },
          quest_accepted: {
            text: 'Благословляю тебя.',
            choices: [{ text: 'Прощай', next: null }],
          },
          done: {
            text: 'Ты вернулся из склепа. Благословение с тобой.',
            choices: [{ text: 'Прощай', next: null }],
          },
        },
      },
    },
    innkeeper: {
      name: 'Трактирщик Гроган',
      building: 'tavern',
      service: 'tavern',
      lines: {
        hello: 'Добро пожаловать в «Чёрном вороне». Кровать, слухи и эль — всё за золото.',
        done: 'Заходи ещё, путник.',
      },
      dialogue: {
        nodes: {
          greeting: {
            text: 'Добро пожаловать в «Чёрном вороне». Кровать, слухи и эль — всё за золото.',
            choices: [
              { text: 'Отдохнуть (10 золота)', action: 'tavernRest', next: null },
              { text: 'Слухи (5 золота)', action: 'tavernRumors', next: null },
              { text: 'Прощай', next: null },
            ],
          },
        },
      },
    },
    scholar: {
      name: 'Летописец Веспер',
      building: 'tavern',
      lines: {
        hello: 'Лес Ворона отмечен на карте: поляна, роща и руины. Склеп — за руинами.',
        done: 'Запишу ещё одно имя в книгу Аргена.',
      },
      dialogue: {
        nodes: {
          greeting: {
            text: 'Лес Ворона отмечен на карте: поляна, роща и руины. Склеп — за руинами.',
            choices: [
              { text: 'Расскажи подробнее', next: 'info' },
              { text: 'Прощай', next: null },
            ],
          },
          info: {
            text: 'В лесу водятся скелеты и демоны. В склепе — босс. Берегись.',
            choices: [{ text: 'Назад', next: 'greeting' }],
          },
        },
      },
    },
    ancient_guard: {
      name: 'Древний страж',
      building: 'guild',
      service: 'guild',
      quest: guardQuest,
      questChain: [guardQuest, function (floor) {
        return {
          type: 'skeleton',
          kind: 'kill',
          enemyTypes: ['skeleton'],
          target: 4 + Math.floor(floor / 2),
          progress: 0,
          reward: 80 + floor * 15,
          description: 'Очистить руины от ' + (4 + Math.floor(floor / 2)) + ' скелетов',
        };
      }],
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
    innkeeper: { glyph: 'T', color: '#e0b875', asset: 'innkeeper',
      primary: '#8a6a4a', secondary: '#d4c09a', accent: '#b8860b', trim: '#5a4a3a' },
    ancient_guard: { glyph: 'Д', color: '#c9a24b', asset: 'guard',
      primary: '#4a4432', secondary: '#b9ac8c', accent: '#8a7a4a', trim: '#2f2b1f' },
  };

  // Подсказка под именем NPC на карте: «Капитан стражи Рова — E: поговорить».
  var HOVER_HINTS = {
    merchant: 'E: торговля',
    blacksmith: 'E: улучшение экипировки',
    guard: 'E: поговорить',
    priest: 'E: поговорить',
    scholar: 'E: поговорить',
    innkeeper: 'E: таверна',
    ancient_guard: 'E: гильдия',
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

  // NPC забега: цепочка заданий создаётся один раз при появлении,
  // текущее предложение — элемент цепочки по индексу.
  function make(kind, x, y, floor) {
    var type = def(kind);
    if (!type || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    var questChain = null;
    var offer = null;
    if (type.questChain) {
      questChain = type.questChain.map(function (makeQuest) { return makeQuest(floor || 1); });
      offer = questChain[0];
    } else if (type.quest) {
      offer = type.quest(floor || 1);
    }
    return {
      id: kind,
      kind: kind,
      x: x,
      y: y,
      offer: offer,
      questChain: questChain,
      questChainIndex: 0,
      accepted: false,
    };
  }

  // Город: каждый вид NPC встаёт в своё здание. Несколько NPC в одном здании
  // (таверня: трактирщик и летописец) разводятся по клеткам вокруг центра.
  function placeCityNpcs(map, floor) {
    var npcs = [];
    var kinds = C.NPC_KINDS || [];
    var usedByBuilding = {};
    for (var i = 0; i < kinds.length; i++) {
      var type = def(kinds[i]);
      if (!type || !type.building) continue;
      var building = RK.MapGen.getBuilding(map, type.building);
      if (!building) continue;
      var used = usedByBuilding[type.building] || 0;
      usedByBuilding[type.building] = used + 1;
      var dx = used === 0 ? 0 : (used % 2 === 1 ? 1 : -1) * Math.ceil(used / 2);
      var dy = used === 0 ? 0 : (used % 2 === 1 ? 0 : 1) * Math.floor(used / 2);
      var npc = make(kinds[i], building.cx + dx, building.cy + dy, floor);
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

  // Вид диалога для экрана: имя, текст текущего узла, выборы и предложение.
  function dialogue(npc) {
    var type = npc && def(npc.kind);
    if (!type) return null;
    var node = dialogueNode(npc);
    if (node) {
      return {
        name: type.name,
        text: node.text,
        choices: node.choices || null,
        offer: npc.offer || null,
      };
    }
    var lines = type.lines || {};
    return {
      name: type.name,
      text: npc.accepted ? (lines.done || lines.hello) : (lines.hello || ''),
      choices: null,
      offer: npc.offer || null,
    };
  }

  // Текущий узел диалога: из состояния героя или приветствие.
  function dialogueNode(npc) {
    var type = npc && def(npc.kind);
    if (!type || !type.dialogue || !type.dialogue.nodes) return null;
    var state = getDialogueState(npc);
    var nodeId = state.node || 'greeting';
    // Задание принято — показываем завершающий узел, если он есть.
    if (!state.node && npc.accepted && type.dialogue.nodes.done) nodeId = 'done';
    var node = type.dialogue.nodes[nodeId];
    if (!node) return null;
    return {
      name: type.name,
      text: node.text,
      choices: node.choices || null,
    };
  }

  // Состояние диалога лежит на герое: сетевой снимок носит его автоматически.
  function getDialogueState(npc) {
    var player = RK.GAME && RK.GAME.player;
    if (!player || !player.dialogue || player.dialogue.npcId !== npc.id) return { node: null };
    return { node: player.dialogue.node };
  }

  // Игрок выбрал ответ: переход к следующему узлу или конец диалога.
  function chooseDialogue(npc, choiceIndex) {
    var node = dialogueNode(npc);
    if (!node || !node.choices) return null;
    var choice = node.choices[choiceIndex];
    if (!choice) return null;
    var player = RK.GAME && RK.GAME.player;
    if (!player) return null;
    if (choice.next) {
      player.dialogue = { npcId: npc.id, node: choice.next };
    } else {
      player.dialogue = null;
    }
    return { node: dialogueNode(npc), choice: choice };
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
    dialogueNode: dialogueNode,
    chooseDialogue: chooseDialogue,
  };
})();
