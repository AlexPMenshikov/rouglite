'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSandbox } = require('./helpers/sandbox');

// Набор имён модулей — контракт: остальная игра, тесты и сервер зовут
// RK.MapGen и RK.Combat по этим именам. Переезд кода между файлами не должен
// их менять, поэтому список записан здесь и сверяется буквально.

// Набор RK.MapGen: карта и её части. Список из 26 имён — как до разбиения
// js/map.js на модули.
const MAP_GEN_KEYS = [
  'generate', 'encodeMatrix', 'decodeMatrix', 'encodeMatrices', 'decodeMatrices',
  'placeDecorations', 'isInside', 'isWalkable', 'manhattan', 'findPath', 'findPathNear',
  'randomFloorNear', 'addBlood', 'getDoorAt', 'getChestAt', 'getTrapAt', 'getTavern',
  'isInTavern', 'snapExitToWalkable', 'findPathOnMap', 'isMapWalkable',
  'generateLocation', 'getBuilding',
  'MATRIX_FIELDS', 'MAP_STATE_FIELDS', 'MAP_STATIC_FIELDS',
];

// Набор RK.Combat: бой, ход, интерфейсные действия и снимок.
const COMBAT_KEYS = [
  'newRun', 'createDebugContext', 'startFloor',
  'playerAction', 'skipTurn', 'tryStep', 'interact', 'usePotion', 'useFood',
  'storeInChest', 'takeFromChest', 'nearestStorage', 'useInventoryItem', 'placeCarriedTrap',
  'dropInventoryItem', 'unequipSlot', 'sellInventoryItem', 'getSellValue', 'upgradeEquipment',
  'acceptQuest', 'dialogueChoice', 'advanceQuest', 'openNpcScreen', 'activateClassSkill',
  'castMageSpell', 'turnInQuest', 'turnInQuestAny', 'tavernRest', 'tavernRumors',
  'tavernBuyFood', 'storeInWarehouse', 'templeBlessing', 'templeHeal', 'campRest',
  'teleportToCity', 'setPlayerStats',
  'getEnemyAt', 'triggerChampionPhase', 'placePartyAtEntry', 'getZoneAt', 'getZoneMods',
  'recomputePlayerStats',
  'busy', 'tickWalk', 'getDrawPos', 'stepsDone', 'walk', 'party', 'startStep', 'isAutoWalking',
  'addNetworkPlayer', 'removeNetworkPlayer', 'setActivePlayer', 'createSnapshot',
  'applySnapshot', 'performAction', 'actionHandlers', 'elementalMultiplier',
  // Кодек снимка дописывает в бои свои имена при загрузке.
  'animateSnapshotSteps', 'restoreMap',
];

test('набор имён RK.MapGen не изменился', () => {
  const { sandbox } = createSandbox({});
  assert.deepEqual(Object.keys(sandbox.RK.MapGen).sort(), [...MAP_GEN_KEYS].sort(),
    'набор имён карты — контракт для остальной игры');
});

test('набор имён RK.Combat не изменился', () => {
  const { sandbox } = createSandbox({});
  assert.deepEqual(Object.keys(sandbox.RK.Combat).sort(), [...COMBAT_KEYS].sort(),
    'набор имён боя — контракт для интерфейса, сети и сервера');
});
