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
    };
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

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
  };
  sandbox.RK.Audio = {
    start: () => true,
    setFloor() {},
    playStep() {},
    playAttack() {},
    playAbility() {},
  };
  sandbox.RK.Effects = {
    add() {},
    addDamage() {},
    notePlayerHit() {},
  };
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
  });

  const expectedSprites = enemyTypes.concat(
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
