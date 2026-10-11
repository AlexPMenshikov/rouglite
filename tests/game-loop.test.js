const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const gameScripts = [
  'config.js',
  'rng.js',
  'map.js',
  'entities.js',
  'items.js',
  'fov.js',
  'classes.js',
  'meta.js',
  'narrator.js',
  'combat.js',
];

class Element {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.style = {};
    this.attributes = {};
    this.className = '';
    this.value = '';
    this.width = 0;
    this.height = 0;
    this.classList = {
      toggle: () => {},
      add: () => {},
      remove: () => {},
    };
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  addEventListener() {}

  getContext() {
    return {};
  }

  set textContent(value) {
    this.children = [];
    this._textContent = value;
  }

  get textContent() {
    return this._textContent || '';
  }

  set innerHTML(value) {
    this.children = [];
    this._innerHTML = value;
  }

  get innerHTML() {
    return this._innerHTML || '';
  }
}

function createContext({ withUi = false } = {}) {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element('div'));
      return elements.get(id);
    },
    createElement(tagName) {
      return new Element(tagName);
    },
  };
  const sandbox = {
    document,
    localStorage: {
      getItem() { return null; },
      setItem() {},
    },
    performance: { now: () => 0 },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  function load(file) {
    const source = fs.readFileSync(path.join(projectRoot, 'js', file), 'utf8');
    vm.runInContext(source, sandbox, { filename: file });
  }

  if (withUi) {
    load('config.js');
    load('entities.js');
    sandbox.RK.Assets = {
      draw: (_ctx, spriteName) => sandbox.drawnSprites.push(spriteName),
    };
    sandbox.drawnSprites = [];
    load('ui.js');
    return { sandbox, elements };
  }

  for (const file of gameScripts) load(file);
  sandbox.RK.UI = {
    msg() {},
    show() {},
    refresh() {},
    over() {},
    showMerchant() {},
    showBlacksmith() {},
  };
  sandbox.RK.Audio = {
    start: () => true,
    setFloor() {},
    playStep() {},
    playAttack() {},
    playAbility() {},
  };
  sandbox.RK.Effects = {
    add(...args) { sandbox.addedEffects.push(args); },
    addDamage() {},
    notePlayerHit() {},
  };
  sandbox.addedEffects = [];
  return { sandbox, elements };
}

function findOpenNeighbor(RK) {
  const { x, y } = RK.GAME.player;
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  return directions.find(([dx, dy]) => {
    const nx = x + dx;
    const ny = y + dy;
    return RK.MapGen.isWalkable(nx, ny) &&
      !RK.MapGen.getDoorAt(nx, ny) &&
      !RK.MapGen.getChestAt(nx, ny) &&
      !(RK.Map.stair.x === nx && RK.Map.stair.y === ny);
  });
}

function startRunAsClass(RK, classId) {
  RK.Meta.data.selectedClass = classId;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
}

function placeAdjacentEnemy(RK, type) {
  const [dx, dy] = findOpenNeighbor(RK);
  const enemy = RK.Entities.makeEnemy(
    type,
    RK.GAME.player.x + dx,
    RK.GAME.player.y + dy,
    RK.GAME.floor,
  );
  enemy.hp = 10000;
  enemy.maxHp = enemy.hp;
  enemy.atk = 0;
  enemy.def = 0;
  enemy.alerted = true;
  RK.GAME.enemies = [enemy];
  return { dx, dy, enemy };
}

test('newRun initializes a playable floor through the game API', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;

  RK.Combat.newRun({ size: 'compact', style: 'crypt' });

  assert.equal(RK.GAME.floor, 1);
  assert.equal(RK.GAME.mapWidth, 32);
  assert.equal(RK.GAME.mapHeight, 23);
  assert.equal(RK.GAME.mapStyle, 'crypt');
  assert.equal(RK.GAME.player.x, RK.Map.spawn.x);
  assert.equal(RK.GAME.player.y, RK.Map.spawn.y);
  assert.equal(RK.GAME.player.backpack[0].kind, 'potion');
  assert.ok(RK.GAME.enemies.length > 0);
  assert.ok(RK.Map.decorations.filter(({ asset }) => asset === 'decorLake').length >= 2);
  assert.ok(RK.Map.decorations.filter(({ asset }) => asset === 'decorStream').length >= 3);
  const occupiedTiles = new Set([
    ...RK.GAME.players,
    ...RK.GAME.enemies,
    ...RK.GAME.items,
    ...RK.Map.chests,
    ...(RK.GAME.merchant ? [RK.GAME.merchant] : []),
  ].map(({ x, y }) => `${x},${y}`));
  for (const decoration of RK.Map.decorations) {
    assert.ok(!occupiedTiles.has(`${decoration.x},${decoration.y}`));
  }
});

test('level decorations are repeatable, cosmetic, and isolated from gameplay RNG', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  const firstMap = RK.MapGen.generate(1, 9127, 32, 23, 'cave');
  const firstDecorationSet = JSON.stringify(firstMap.decorations);
  const nextRandomAfterGeneration = RK.RNG.rand();
  const decorationAssets = new Set(firstMap.decorations.map((decoration) => decoration.asset));

  for (const asset of [
    'decorStone', 'decorGrass', 'decorMoss', 'decorMushroom',
    'decorPuddle', 'decorLake', 'decorStream',
  ]) {
    assert.ok(decorationAssets.has(asset), `${asset} should appear on a standard floor`);
  }
  const lakeCells = firstMap.decorations.filter(({ asset }) => asset === 'decorLake');
  const streamCells = firstMap.decorations
    .filter(({ asset }) => asset === 'decorStream')
    .sort((a, b) => a.flowIndex - b.flowIndex);
  assert.ok(lakeCells.length >= 2, 'lakes should cover multiple connected tiles');
  assert.ok(streamCells.length >= 3, 'streams should flow across multiple tiles');
  for (let index = 1; index < lakeCells.length; index++) {
    const touchesLake = lakeCells.slice(0, index).some((cell) =>
      Math.abs(cell.x - lakeCells[index].x) + Math.abs(cell.y - lakeCells[index].y) === 1);
    assert.ok(touchesLake, 'each lake tile should connect to the lake body');
  }
  for (let index = 0; index < streamCells.length; index++) {
    assert.equal(streamCells[index].flowIndex, index);
    if (index > 0) {
      const dist = Math.abs(streamCells[index - 1].x - streamCells[index].x) +
        Math.abs(streamCells[index - 1].y - streamCells[index].y);
      assert.ok(dist <= 2, 'stream tiles should form a continuous path');
    }
  }

  const occupied = new Set([
    ...firstMap.doors,
    ...firstMap.traps,
    ...firstMap.torches,
    firstMap.spawn,
    firstMap.stair,
  ].map(({ x, y }) => `${x},${y}`));
  const decorationTiles = new Set();
  for (const decoration of firstMap.decorations) {
    const key = `${decoration.x},${decoration.y}`;
    assert.equal(firstMap.tiles[decoration.y][decoration.x], 1);
    assert.ok(!occupied.has(key), `decoration must not overlap a protected tile: ${key}`);
    assert.ok(!decorationTiles.has(key), `decoration tile must be unique: ${key}`);
    decorationTiles.add(key);
  }

  const removedTile = firstMap.decorations[0];
  firstMap.decorations = RK.MapGen.placeDecorations(firstMap, [removedTile]);
  assert.ok(!firstMap.decorations.some(({ x, y }) => x === removedTile.x && y === removedTile.y));

  const secondMap = RK.MapGen.generate(1, 9127, 32, 23, 'cave');
  assert.equal(JSON.stringify(secondMap.decorations), firstDecorationSet);
  assert.equal(RK.RNG.rand(), nextRandomAfterGeneration);
});

test('network players keep separate heroes and the shared turn uses the selected hero', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  const host = RK.GAME.player;

  assert.equal(RK.Combat.addNetworkPlayer('guest-1', 'Guest', 'berserker'), true);
  const guest = RK.GAME.players.find((player) => player.id === 'guest-1');
  assert.ok(guest);
  assert.notDeepEqual([guest.x, guest.y], [host.x, host.y]);
  assert.notEqual(guest.backpack, host.backpack);
  assert.equal(guest.classId, 'berserker');

  assert.equal(RK.Combat.performNetworkAction('guest-1', 'skipTurn', []), true);
  assert.equal(RK.GAME.turn, 1);
  assert.equal(RK.GAME.player.id, 'guest-1');
  assert.equal(RK.Combat.setActivePlayer(host.id), true);
  assert.equal(RK.GAME.player, host);
});

test('network snapshot restores the selected hero and generated map', () => {
  const source = createContext().sandbox.RK;
  source.Combat.newRun({ size: 'compact', style: 'crypt' });
  source.Combat.addNetworkPlayer('guest-1', 'Guest');
  const snapshot = source.Combat.createSnapshot();

  const target = createContext().sandbox.RK;
  assert.equal(target.Combat.applySnapshot(snapshot, 'guest-1'), true);
  assert.equal(target.GAME.player.id, 'guest-1');
  assert.equal(target.GAME.players.length, 2);
  assert.equal(target.Map.style, 'crypt');
  assert.equal(target.GAME.mapWidth, 32);
});

test('a successful multiplayer ability advances the shared turn exactly once', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  RK.Combat.addNetworkPlayer('guest-1', 'Guest', 'berserker');

  assert.equal(RK.Combat.performNetworkAction('guest-1', 'activateClassSkill', []), true);
  assert.equal(RK.GAME.turn, 1);
});

test('multiplayer snapshots animate an activated skill for the remote player', () => {
  const source = createContext().sandbox.RK;
  source.Combat.newRun({ size: 'compact', style: 'stone' });
  source.Combat.addNetworkPlayer('guest-1', 'Guest', 'berserker');
  source.Combat.performNetworkAction('guest-1', 'activateClassSkill', []);
  const snapshot = source.Combat.createSnapshot();

  const targetContext = createContext();
  const target = targetContext.sandbox.RK;
  target.Combat.newRun({ size: 'compact', style: 'stone' });
  target.Combat.addNetworkPlayer('guest-1', 'Guest', 'berserker');
  target.Combat.applySnapshot(snapshot, 'guest-1');

  assert.equal(targetContext.sandbox.addedEffects.length, 1);
  assert.equal(targetContext.sandbox.addedEffects[0][2], '#ff7043');
});

test('walking onto equipment records the pickup in the run summary', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;

  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  RK.GAME.enemies = [];
  const [dx, dy] = findOpenNeighbor(RK);
  const target = { x: RK.GAME.player.x + dx, y: RK.GAME.player.y + dy };
  const loot = {
    type: 'gold',
    kind: 'loot',
    slot: 'ring',
    name: 'Кольцо испытания',
    rarity: 'epic',
    summary: '+2 HP',
    value: 10,
    stats: { hp: 2 },
  };
  RK.GAME.items = [{ ...loot, ...target }];

  RK.Combat.tryStep(dx, dy);
  RK.Combat.tickWalk(1000);

  assert.deepEqual(
    [RK.GAME.player.x, RK.GAME.player.y],
    [target.x, target.y],
  );
  assert.equal(RK.GAME.turn, 1);
  assert.equal(RK.GAME.player.backpack.at(-1).name, loot.name);
  assert.equal(RK.GAME.stats.foundItems[0].floor, 1);
});

test('attacking through the game API tracks enemy kills and drops loot', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;

  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  const [dx, dy] = findOpenNeighbor(RK);
  const enemy = RK.Entities.makeEnemy(
    'slime',
    RK.GAME.player.x + dx,
    RK.GAME.player.y + dy,
    RK.GAME.floor,
  );
  enemy.hp = 1;
  enemy.alerted = true;
  RK.GAME.enemies = [enemy];
  RK.Combat.setPlayerStats({
    hp: RK.GAME.player.hp,
    maxHp: RK.GAME.player.maxHp,
    atk: 100,
    def: RK.GAME.player.def,
  });

  RK.Combat.tryStep(dx, dy);

  assert.equal(enemy.alive, false);
  assert.equal(RK.GAME.stats.enemiesKilled, 1);
  assert.equal(RK.GAME.stats.killsByName[enemy.name], 1);
  assert.ok(RK.GAME.items.some((item) => item.kind === 'gold'));
});

test('equipped items cannot be sold through gameplay actions', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  const player = RK.GAME.player;
  const equippedItem = {
    kind: 'loot',
    slot: 'weapon',
    name: 'Надетый меч',
    value: 30,
    equipped: false,
    stats: { atk: 2 },
  };
  const flaggedItem = {
    kind: 'loot',
    slot: 'head',
    name: 'Надетый шлем',
    value: 20,
    equipped: true,
  };
  player.equipment.weapon = equippedItem;
  player.backpack.push(equippedItem, flaggedItem);
  const initialGold = player.gold;

  assert.equal(RK.Combat.sellInventoryItem(player.backpack.indexOf(equippedItem)), false);
  assert.equal(RK.Combat.sellInventoryItem(player.backpack.indexOf(flaggedItem)), false);
  assert.equal(RK.Combat.sellEquipmentItem('weapon'), false);
  assert.equal(player.gold, initialGold);
  assert.equal(player.equipment.weapon, equippedItem);
  assert.ok(player.backpack.includes(equippedItem));
  assert.ok(player.backpack.includes(flaggedItem));

  const unequippedItem = {
    kind: 'loot',
    slot: 'ring',
    name: 'Снятое кольцо',
    value: 12,
  };
  player.backpack.push(unequippedItem);
  assert.equal(RK.Combat.sellInventoryItem(player.backpack.length - 1), true);
  assert.equal(player.gold, initialGold + unequippedItem.value);
  assert.ok(!player.backpack.includes(unequippedItem));
});

test('merchant lists only unequipped backpack items for sale', () => {
  const { sandbox, elements } = createContext({ withUi: true });
  const RK = sandbox.RK;
  const equippedItem = {
    kind: 'loot',
    slot: 'weapon',
    name: 'Надетый меч',
    value: 30,
  };
  const flaggedItem = {
    kind: 'loot',
    slot: 'head',
    name: 'Помеченный как надетый шлем',
    value: 20,
    equipped: true,
  };
  const sellableItem = {
    kind: 'loot',
    slot: 'ring',
    name: 'Кольцо для продажи',
    value: 12,
  };
  RK.GAME = {
    player: {
      gold: 0,
      equipment: { weapon: equippedItem },
      backpack: [equippedItem, flaggedItem, sellableItem],
    },
  };
  RK.Combat = { getSellValue: (item) => item.value };

  RK.UI.showMerchant();

  const rows = elements.get('merchant-inventory').children;
  assert.equal(rows.length, 1);
  assert.match(rows[0].children[0].textContent, /Кольцо для продажи/);
});

test('enhanced monsters have larger models, stronger stats, and improved guaranteed loot', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  RK.Meta.data.playerName = 'Путник';
  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  assert.equal(RK.GAME.player.name, 'Путник');

  const regular = RK.Entities.makeEnemy('rat', 1, 1, 2);
  const enhanced = RK.Entities.makeEnemy('rat', 1, 1, 2, true);
  assert.equal(enhanced.maxHp, Math.round(regular.maxHp * 1.5));
  assert.equal(enhanced.atk, Math.round(regular.atk * 1.5));
  assert.equal(enhanced.enhanced, true);
  assert.equal(enhanced.sizeScale, RK.Entities.DEFS.rat.enhancedScale);
  assert.equal(enhanced.asset, RK.Entities.DEFS.rat.enhancedAsset);
  assert.match(enhanced.name, /^(Сильная|Древняя|Хитрая|Мощная|Страшная) крыса$/);
  assert.equal(RK.Entities.makeEnemy('boss', 1, 1, 1, true).enhanced, false);

  const loot = RK.Items.generateLootItem(1, 1, 1, false, true);
  assert.ok(['rare', 'epic', 'legendary'].includes(loot.rarity));

  RK.GAME.enemies = [];
  const [dx, dy] = findOpenNeighbor(RK);
  const strongEnemy = RK.Entities.makeEnemy(
    'rat',
    RK.GAME.player.x + dx,
    RK.GAME.player.y + dy,
    RK.GAME.floor,
    true,
  );
  strongEnemy.hp = 1;
  strongEnemy.maxHp = 1;
  strongEnemy.atk = 0;
  strongEnemy.alerted = true;
  RK.GAME.enemies = [strongEnemy];
  RK.Combat.setPlayerStats({
    hp: RK.GAME.player.hp,
    maxHp: RK.GAME.player.maxHp,
    atk: 100,
    def: RK.GAME.player.def,
  });
  RK.Combat.tryStep(dx, dy);

  const killDrop = RK.GAME.items.find((item) => item.source === 'kill' && item.kind === 'loot');
  assert.ok(killDrop, 'an enhanced enemy always drops equipment');
  assert.ok(['rare', 'epic', 'legendary'].includes(killDrop.rarity));
});

test('a successful class skill creates a visual effect at the player position', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  startRunAsClass(RK, 'berserker');
  const player = RK.GAME.player;

  assert.equal(RK.Combat.activateClassSkill(), true);
  assert.equal(sandbox.addedEffects.length, 1);
  assert.deepEqual(sandbox.addedEffects[0].slice(0, 2), [player.x, player.y]);
  assert.equal(sandbox.addedEffects[0][2], '#ff7043');
});

test('ground item hover information includes stats and rarity', () => {
  const { sandbox } = createContext({ withUi: true });
  const RK = sandbox.RK;
  const source = fs.readFileSync(path.join(projectRoot, 'js', 'render.js'), 'utf8');
  vm.runInContext(source, sandbox, { filename: 'render.js' });
  RK.Map = { vis: [[true]], doors: [], chests: [] };
  RK.GAME = {
    enemies: [],
    items: [{
      x: 0,
      y: 0,
      name: 'Кольцо грома',
      kind: 'loot',
      rarity: 'epic',
      stats: { atk: 3, hp: 5 },
    }],
  };

  const info = RK.Render.getHoverInfo({ x: 0, y: 0 });
  assert.equal(info.rarity, 'epic');
  assert.match(info.text, /Кольцо грома/);
  assert.match(info.text, /Редкость: Эпическая/);
  assert.match(info.text, /\+3 Урон, \+5 Здоровье/);
});

test('ground item tooltip uses the item rarity color', () => {
  const { sandbox, elements } = createContext({ withUi: true });
  const RK = sandbox.RK;
  const tooltip = sandbox.document.getElementById('game-tooltip');
  const canvasWrap = sandbox.document.getElementById('canvas-wrap');
  canvasWrap.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 200 });
  tooltip.offsetWidth = 100;
  tooltip.offsetHeight = 60;
  RK.Items = { RARITY_COLORS: { epic: '#d29cff' } };

  RK.UI.gameTooltip('Эпический предмет', 20, 20, 'epic');

  assert.equal(tooltip.style.borderColor, '#d29cff');
  assert.equal(tooltip.style.color, '#d29cff');
});

test('inventory equipment shows the body part a piece is worn on', () => {
  const { sandbox, elements } = createContext({ withUi: true });
  const RK = sandbox.RK;
  RK.GAME = {
    player: {
      equipment: {},
      backpack: [{
        kind: 'loot',
        slot: 'head',
        name: 'Шлем дозора',
        rarity: 'rare',
      }],
    },
  };

  RK.UI.showInventory();

  const label = elements.get('inventory-backpack-list').children[0].children[0];
  assert.equal(label.children[0].textContent, 'Надевается на голову');
  assert.equal(label.attributes.title, 'Надевается на голову');
});

test('every registered class can start a run and activate its skill', async (t) => {
  const { sandbox } = createContext();
  const classIds = Object.keys(sandbox.RK.Classes.CLASS_DEFS);

  assert.ok(classIds.length > 0, 'at least one playable class must be registered');
  for (const classId of classIds) {
    await t.test(classId, () => {
      const { sandbox: classSandbox } = createContext();
      const RK = classSandbox.RK;
      const definition = RK.Classes.CLASS_DEFS[classId];
      startRunAsClass(RK, classId);

      assert.equal(RK.GAME.player.classId, classId);
      assert.equal(RK.GAME.player.className, definition.name);
      assert.equal(typeof definition.skillName, 'string');
      assert.ok(definition.skillName.length > 0);
      assert.equal(RK.Combat.activateClassSkill(), true);
      const cooldown = RK.GAME.player.classSkillCooldown;
      assert.ok(cooldown > 0);
      assert.equal(RK.Combat.activateClassSkill(), false);
      assert.equal(RK.GAME.player.classSkillCooldown, cooldown);
    });
  }
});

test('Tank skill reflects some damage from an adjacent attacker', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  startRunAsClass(RK, 'tank');
  RK.GAME.enemies = [];
  const { enemy } = placeAdjacentEnemy(RK, 'rat');
  enemy.atk = 30;
  const playerHp = RK.GAME.player.hp;
  const enemyHp = enemy.hp;

  assert.equal(RK.Combat.activateClassSkill(), true);
  RK.Combat.skipTurn();

  assert.ok(enemy.hp < enemyHp, 'the active shield should return damage to the attacker');
  assert.ok(RK.GAME.player.hp < playerHp, 'the active shield should not prevent all damage');
});

test('Berserker skill heals after an adjacent attack', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;
  startRunAsClass(RK, 'berserker');
  const { dx, dy } = placeAdjacentEnemy(RK, 'rat');
  RK.Combat.setPlayerStats({
    hp: 50,
    maxHp: RK.GAME.player.maxHp,
    atk: RK.GAME.player.atk,
    def: RK.GAME.player.def,
  });

  assert.equal(RK.Combat.activateClassSkill(), true);
  RK.Combat.tryStep(dx, dy);

  assert.ok(RK.GAME.player.hp > 50, 'the active rage should heal after dealing damage');
});

test('the result screen draws icons for every enemy, boss, and equipment slot', () => {
  const { sandbox, elements } = createContext({ withUi: true });
  const RK = sandbox.RK;
  const enemyTypes = Object.keys(RK.Entities.DEFS);
  const regularKills = Object.fromEntries(enemyTypes
    .filter((type) => RK.Entities.DEFS[type].behavior !== 'boss')
    .map((type) => [RK.Entities.DEFS[type].name, 1]));
  regularKills['Сильный слизень'] = 1;
  const bossKills = Object.fromEntries(enemyTypes
    .filter((type) => RK.Entities.DEFS[type].behavior === 'boss')
    .map((type) => [RK.Entities.DEFS[type].name, 1]));
  const slots = ['weapon', 'head', 'armor', 'ring', 'amulet', 'boots'];

  RK.UI.over(false, 3, 4, 25, {
    enemiesKilled: enemyTypes.length,
    damageReceived: 10,
    killsByName: regularKills,
    bossKillsByName: bossKills,
    foundItems: slots.map((slot) => ({
      name: slot,
      slot,
      asset: ({
        weapon: 'sword',
        head: 'head',
        armor: 'armor',
        ring: 'ring',
        amulet: 'amulet',
        boots: 'boots',
      })[slot],
      type: 'gold',
      rarity: 'common',
      floor: 1,
      value: 1,
    })),
  }, { name: 'Искатель', className: 'Берсерк' });

  const expectedSprites = enemyTypes.concat('slime',
    slots.slice(0, 5).map((slot) => ({
      weapon: 'sword',
      head: 'head',
      armor: 'armor',
      ring: 'ring',
      amulet: 'amulet',
      boots: 'boots',
    })[slot]),
  );
  assert.deepEqual(sandbox.drawnSprites.slice().sort(), expectedSprites.sort());
  assert.equal(elements.get('over-title').textContent, 'ВЫ ПОГИБЛИ');
  assert.ok(elements.get('over-stats').children.length > 0);
  assert.equal(elements.get('over-stats').children[0].textContent, 'Искатель — Берсерк');

  sandbox.drawnSprites.length = 0;
  RK.UI.over(false, 3, 4, 25, {
    enemiesKilled: 0,
    damageReceived: 0,
    killsByName: {},
    bossKillsByName: {},
    foundItems: [{
      name: 'Сапоги',
      slot: 'boots',
      rarity: 'common',
      floor: 1,
      value: 1,
    }],
  });
  assert.deepEqual(sandbox.drawnSprites, ['boots']);
});

test('traps trigger on step and can be disarmed with a failed hack', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;

  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  RK.GAME.enemies = [];
  const player = RK.GAME.player;
  const trapA = { x: player.x + 1, y: player.y, asset: 'trap', type: 'spike', state: 'armed', damage: 6 };
  const trapB = { x: player.x + 2, y: player.y, asset: 'trap', type: 'needle', state: 'armed', damage: 4 };
  RK.Map.traps = [trapA, trapB];

  const originalChance = RK.RNG.chance;
  const startHp = player.hp;
  RK.Combat.tryStep(1, 0);
  RK.Combat.tickWalk(1000);

  assert.equal(player.x, trapA.x);
  assert.ok(player.hp < startHp, 'the trigger should deal damage when stepping on a trap');
  assert.equal(trapA.state, 'triggered');

  player.x = trapB.x - 1;
  player.y = trapB.y;
  player.facingX = 1;
  player.facingY = 0;
  RK.RNG.chance = () => true;
  RK.Combat.interact('pick');
  RK.RNG.chance = originalChance;

  assert.equal(trapB.state, 'disarmed');
});

test('a flame trap applies a three-turn burning status to the player', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;

  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  RK.GAME.enemies = [];
  const player = RK.GAME.player;
  const [dx, dy] = findOpenNeighbor(RK);
  const trap = {
    x: player.x + dx,
    y: player.y + dy,
    asset: 'trap',
    type: 'flame',
    state: 'armed',
    damage: 6,
  };
  RK.Map.traps = [trap];
  const startHp = player.hp;

  RK.Combat.tryStep(dx, dy);
  RK.Combat.tickWalk(1000);

  assert.equal(trap.state, 'triggered');
  assert.equal(player.burningTurns, 3);
  assert.equal(player.hp, startHp - trap.damage);
  RK.Combat.skipTurn();
  assert.equal(player.burningTurns, 2);
  assert.equal(player.hp, startHp - trap.damage - 2);
  RK.Combat.skipTurn();
  RK.Combat.skipTurn();
  assert.equal(player.burningTurns, 0);
  assert.equal(player.burningDamage, 0);
  assert.equal(player.hp, startHp - trap.damage - 6);
});

test('monsters can trigger traps while moving without destroying them', () => {
  const { sandbox } = createContext();
  const RK = sandbox.RK;

  RK.Combat.newRun({ size: 'compact', style: 'stone' });
  const player = RK.GAME.player;
  RK.GAME.enemies = [];
  let candidate = null;
  for (let y = 0; y < RK.Map.h && !candidate; y++) {
    for (let x = 0; x < RK.Map.w; x++) {
      if (!RK.MapGen.isWalkable(x, y) ||
          Math.max(Math.abs(player.x - x), Math.abs(player.y - y)) <= 1) continue;
      const path = RK.MapGen.findPath(x, y, player.x, player.y, null);
      if (path && path.length > 1) {
        candidate = { x, y, step: path[0] };
        break;
      }
    }
  }
  assert.ok(candidate, 'a reachable enemy position should be available');

  const enemy = RK.Entities.makeEnemy('rat', candidate.x, candidate.y, RK.GAME.floor);
  enemy.hp = 20;
  enemy.maxHp = 20;
  enemy.alerted = true;
  RK.GAME.enemies = [enemy];
  const trap = {
    ...candidate.step,
    asset: 'trap',
    type: 'spike',
    state: 'armed',
    damage: 7,
  };
  RK.Map.traps = [trap];

  RK.Combat.skipTurn();

  assert.deepEqual([enemy.x, enemy.y], [trap.x, trap.y]);
  assert.equal(enemy.hp, 13);
  assert.equal(trap.state, 'triggered');
  assert.ok(RK.Map.traps.includes(trap), 'the triggered trap remains on the map');
});
