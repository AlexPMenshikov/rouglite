const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createRenderSandbox,
  createSandbox,
  startRunAsClass: baseStartRunAsClass,
} = require('./helpers/sandbox');

// После старта забега поле остаётся пустым: тесты проверяют поведение классов,
// а не расстановку врагов генератором.
function startRunAsClass(RK, classId) {
  const player = baseStartRunAsClass(RK, classId);
  RK.GAME.enemies = [];
  return player;
}

function openNeighbor(RK, from) {
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  return directions.find(([dx, dy]) => {
    const nx = from.x + dx;
    const ny = from.y + dy;
    return RK.MapGen.isWalkable(nx, ny) &&
      !RK.MapGen.getDoorAt(nx, ny) &&
      !RK.MapGen.getChestAt(nx, ny) &&
      !(RK.Map.stair && RK.Map.stair.x === nx && RK.Map.stair.y === ny) &&
      !RK.MapGen.getTrapAt(nx, ny);
  });
}

function freeShootingTile(RK, distance) {
  const player = RK.GAME.player;
  for (let y = 0; y < RK.Map.h; y++) {
    for (let x = 0; x < RK.Map.w; x++) {
      if (!RK.MapGen.isWalkable(x, y)) continue;
      if (Math.max(Math.abs(x - player.x), Math.abs(y - player.y)) !== distance) continue;
      if (!RK.Fov.lineOk(player.x, player.y, x, y)) continue;
      if (!RK.Map.vis[y] || !RK.Map.vis[y][x]) continue;
      if (RK.MapGen.getDoorAt(x, y) || RK.MapGen.getChestAt(x, y) || RK.MapGen.getTrapAt(x, y)) continue;
      return { x, y };
    }
  }
  return null;
}

function shootingTile(RK, minDistance, maxDistance) {
  for (let distance = minDistance; distance <= maxDistance; distance++) {
    const tile = freeShootingTile(RK, distance);
    if (tile) return tile;
  }
  // Small rooms can hide the whole distance band; widen the search before giving up.
  for (let distance = 2; distance <= RK.CONFIG.VIEW_RADIUS; distance++) {
    if (distance >= minDistance && distance <= maxDistance) continue;
    const tile = freeShootingTile(RK, distance);
    if (tile) return tile;
  }
  return null;
}

function blockedTile(RK, maxDistance) {
  const player = RK.GAME.player;
  for (let radius = 2; radius <= maxDistance; radius++) {
    for (let y = 0; y < RK.Map.h; y++) {
      for (let x = 0; x < RK.Map.w; x++) {
        if (!RK.MapGen.isWalkable(x, y)) continue;
        if (Math.max(Math.abs(x - player.x), Math.abs(y - player.y)) !== radius) continue;
        if (RK.Fov.lineOk(player.x, player.y, x, y)) continue;
        if (RK.MapGen.getDoorAt(x, y) || RK.MapGen.getChestAt(x, y) || RK.MapGen.getTrapAt(x, y)) continue;
        return { x, y, restore: function () {} };
      }
    }
  }
  // Narrow corridors have no hidden spot, so wall one off to build the scenario.
  const target = freeShootingTile(RK, 4) || freeShootingTile(RK, 3) || freeShootingTile(RK, 5);
  if (!target) return null;
  for (let y = 0; y < RK.Map.h; y++) {
    for (let x = 0; x < RK.Map.w; x++) {
      if (RK.Map.tiles[y][x] !== 1) continue;
      if (RK.Fov.lineOk(player.x, player.y, target.x, target.y)) continue;
      RK.Map.tiles[y][x] = 0;
      if (RK.Fov.lineOk(player.x, player.y, target.x, target.y)) {
        RK.Map.tiles[y][x] = 1;
        continue;
      }
      const wx = x;
      const wy = y;
      return {
        x: target.x,
        y: target.y,
        restore: function () { RK.Map.tiles[wy][wx] = 1; },
      };
    }
  }
  return null;
}

function giveWeapon(RK, player, weaponType, kind) {
  const item = {
    kind: 'loot',
    slot: 'weapon',
    weaponType,
    weaponKind: weaponType === 'melee' ? (kind || 'sword') : null,
    type: weaponType,
    asset: weaponType === 'bow' ? 'bow' : weaponType === 'crossbow' ? 'crossbow' : (kind || 'sword'),
    name: weaponType === 'bow' ? 'Лук Грозы' : weaponType === 'crossbow' ? 'Арбалет Пламени' : 'Меч Крови',
    rarity: 'rare',
    color: '#65aaff',
    summary: '+12 ATK',
    value: 36,
    upgradeLevel: 0,
    stats: { atk: 12, def: 0, hp: 0, heal: 0, luck: 0 },
    baseStats: { atk: 12, def: 0, hp: 0, heal: 0, luck: 0 },
  };
  player.backpack.push(item);
  const index = player.backpack.length - 1;
  RK.Combat.useInventoryItem(index);
  return index;
}

function createRenderContext(classId, trapX, trapY) {
  const { sandbox, glyphs } = createRenderSandbox({ classId });
  const RK = sandbox.RK;
  RK.Meta.data.renderMode = 'ascii';
  const vis = [
    [true, true, false, false],
    [true, true, false, false],
    [false, false, false, false],
    [false, false, false, false],
  ];
  RK.Map = {
    w: 4,
    h: 4,
    tiles: [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]],
    vis,
    explored: [[true, true, true, true], [true, true, true, true], [true, true, true, true], [true, true, true, true]],
    doors: [],
    chests: [],
    torches: [],
    traps: [{ x: trapX, y: trapY, asset: 'trap', type: 'spike', state: 'armed', damage: 5 }],
    stair: { x: 3, y: 3 },
  };
  RK.GAME = {
    floor: 1,
    turn: 0,
    player: { id: 'local', x: 0, y: 0, classId, hp: 10, className: '' },
    players: [{ id: 'local', x: 0, y: 0, classId, hp: 10 }],
    enemies: [],
    items: [],
    npcs: [],
  };
  RK.MapGen = { getTrapAt: (x, y) => RK.Map.traps.find((trap) => trap.x === x && trap.y === y) || null };
  RK.Combat = { getDrawPos: () => ({ x: 0, y: 0 }) };
  RK.Render.draw();
  return { RK, glyphs };
}

test('the archer sees traps two tiles away, other classes only see the ones under their nose', () => {
  const hidden = createRenderContext('archer', 2, 0);
  assert.ok(hidden.glyphs.includes('^'), 'the archer senses the trap outside the line of sight');
  assert.equal(
    hidden.RK.Render.getHoverInfo({ x: 2, y: 0 }),
    'Шипованная ловушка\nНажмите L, чтобы обезвредить\nЧувствуете ловушку (радиус 2)',
  );

  const tank = createRenderContext('paladin', 2, 0);
  assert.equal(tank.glyphs.includes('^'), false, 'other classes keep the old one-tile trap spotting');
  assert.equal(tank.RK.Render.getHoverInfo({ x: 2, y: 0 }), '');

  const adjacent = createRenderContext('paladin', 1, 0);
  assert.ok(adjacent.glyphs.includes('^'), 'a trap next to the hero is visible for every class');
});

test('the archer is a registered and immediately available class', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const definition = RK.Classes.CLASS_DEFS.archer;

  assert.ok(definition, 'archer must be registered in CLASS_DEFS');
  assert.equal(definition.name, 'Лучник');
  assert.equal(definition.ranged, true);
  assert.ok(definition.cost > 0);
  assert.equal(RK.Meta.data.classes.archer, true, 'archer is immediately unlocked');
  assert.equal(RK.Meta.buyClass('archer'), true, 'archer selection does not depend on gold');

  const player = startRunAsClass(RK, 'archer');
  assert.equal(player.classId, 'archer');
  assert.equal(player.className, 'Лучник');
});

test('weapon loot rolls 50/50 ranged and melee regardless of class', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;

  startRunAsClass(RK, 'archer');
  let melee = 0;
  let ranged = 0;
  const kinds = { sword: 0, axe: 0, spear: 0, bow: 0, crossbow: 0 };
  for (let i = 0; i < 900; i++) {
    const item = RK.Items.generateLootItem(3, 0, 0, false, false);
    if (item.slot !== 'weapon') continue;
    if (item.weaponType === 'melee') melee++;
    else ranged++;
    kinds[item.type]++;
    assert.equal(item.asset, item.type, 'каждому виду оружия — свой спрайт');
  }
  assert.ok(melee > 20 && ranged > 20, 'both melee and ranged must drop');
  assert.ok(Math.abs(melee - ranged) <= 60, 'melee/ranged split should be close to 50/50');
  assert.ok(kinds.sword > 0 && kinds.axe > 0 && kinds.spear > 0,
    'ближний бой делится на мечи, секиры и копья');
  assert.ok(kinds.bow > 0 && kinds.crossbow > 0);
});

test('classes refuse weapons they cannot wield', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;

  const archer = startRunAsClass(RK, 'archer');
  const swordIndex = giveWeapon(RK, archer, 'melee');
  assert.equal(RK.GAME.player.equipment.weapon, null, 'the archer cannot wear a sword');
  assert.equal(RK.GAME.player.backpack[swordIndex].equipped, undefined);
  assert.match(RK.Classes.equipRestriction(archer, RK.GAME.player.backpack[swordIndex]), /мечи и копья/);

  giveWeapon(RK, archer, 'bow');
  assert.equal(RK.GAME.player.equipment.weapon.weaponType, 'bow');

  const berserker = startRunAsClass(RK, 'berserker');
  giveWeapon(RK, berserker, 'bow');
  assert.equal(RK.GAME.player.equipment.weapon, null, 'berserkers cannot use a bow');
  assert.match(RK.Classes.equipRestriction(berserker, RK.GAME.player.backpack[1]), /луком и арбалетом/);
  giveWeapon(RK, berserker, 'melee', 'axe');
  assert.equal(RK.GAME.player.equipment.weapon.weaponType, 'melee');
});

test('the archer shoots at sight distance with a mouse click instead of walking up', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;

  const player = startRunAsClass(RK, 'archer');
  giveWeapon(RK, player, 'bow');
  assert.equal(RK.Classes.canShoot(player), true);

  const target = shootingTile(RK, 3, 5);
  assert.ok(target, 'the map should offer a visible tile at shooting distance');
  const enemy = RK.Entities.makeEnemy('rat', target.x, target.y, RK.GAME.floor);
  enemy.hp = 500;
  enemy.maxHp = 500;
  RK.GAME.enemies = [enemy];

  const start = { x: player.x, y: player.y };
  const hpBefore = enemy.hp;
  assert.equal(RK.Combat.playerAction(target.x, target.y), true);
  RK.Combat.tickWalk(1000);

  assert.deepEqual([player.x, player.y], [start.x, start.y], 'the archer shoots instead of closing the distance');
  assert.ok(enemy.hp < hpBefore, 'the shot damages the target');
  assert.equal(enemy.alive, true);
});

test('the archer shoots an enemy standing on a trap instead of asking to close in', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;

  const player = startRunAsClass(RK, 'archer');
  giveWeapon(RK, player, 'bow');

  const target = shootingTile(RK, 3, 5);
  assert.ok(target, 'the map should offer a visible tile at shooting distance');
  // Ловушка под врагом раньше перехватывала клик: игра просила подойти вплотную.
  RK.Map.traps.push({ x: target.x, y: target.y, asset: 'trap', type: 'spike', state: 'armed', damage: 5 });

  const enemy = RK.Entities.makeEnemy('rat', target.x, target.y, RK.GAME.floor);
  enemy.hp = 500;
  enemy.maxHp = 500;
  RK.GAME.enemies = [enemy];

  const hpBefore = enemy.hp;
  assert.equal(RK.Combat.playerAction(target.x, target.y), true, 'клик по врагу на ловушке принят');
  assert.ok(enemy.hp < hpBefore, 'the archer shoots instead of refusing the click');
});

test('an out-of-reach target is rejected and melee classes still walk into melee', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;

  const player = startRunAsClass(RK, 'archer');
  giveWeapon(RK, player, 'bow');
  const close = shootingTile(RK, 1, 2);
  // Стартовая локация — город: спрятанная за стеной клетка находится дальше,
  // чем в коридорах подземелья, поэтому ищем её по всей карте.
  const blocked = blockedTile(RK, 20);
  assert.ok(close && blocked, 'the map should offer a close target and one hidden behind a wall');
  const visibleEnemy = RK.Entities.makeEnemy('rat', close.x, close.y, RK.GAME.floor);
  visibleEnemy.hp = 500;
  visibleEnemy.maxHp = 500;
  const hiddenEnemy = RK.Entities.makeEnemy('rat', blocked.x, blocked.y, RK.GAME.floor);
  hiddenEnemy.hp = 500;
  hiddenEnemy.maxHp = 500;
  RK.GAME.enemies = [visibleEnemy, hiddenEnemy];

  const turnBefore = RK.GAME.turn;
  const hpBefore = hiddenEnemy.hp;
  assert.equal(RK.Combat.playerAction(blocked.x, blocked.y), false);
  assert.equal(RK.GAME.turn, turnBefore, 'an impossible shot does not waste a turn');
  assert.equal(hiddenEnemy.hp, hpBefore);
  blocked.restore();

  const tank = startRunAsClass(RK, 'paladin');
  giveWeapon(RK, tank, 'melee');
  const neighbor = openNeighbor(RK, tank);
  const enemy = RK.Entities.makeEnemy('rat', tank.x + neighbor[0], tank.y + neighbor[1], RK.GAME.floor);
  enemy.hp = 500;
  enemy.maxHp = 500;
  RK.GAME.enemies = [enemy];
  const meleeHpBefore = enemy.hp;
  RK.Combat.tryStep(neighbor[0], neighbor[1]);

  assert.ok(enemy.hp < meleeHpBefore, 'a melee class attacks in melee range');
});

test('the archer skill doubles the next shots', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startRunAsClass(RK, 'archer');
  giveWeapon(RK, player, 'crossbow');

  assert.equal(RK.Combat.activateClassSkill(), true);
  assert.equal(player.preciseShots, 3);

  const target = shootingTile(RK, 3, 5);
  const enemy = RK.Entities.makeEnemy('rat', target.x, target.y, RK.GAME.floor);
  enemy.hp = 5000;
  enemy.maxHp = 5000;
  RK.GAME.enemies = [enemy];
  const hpBefore = enemy.hp;
  RK.Combat.playerAction(target.x, target.y);
  const preciseDamage = hpBefore - enemy.hp;
  const plainDamage = player.atk + RK.RNG.int(0, 0);

  assert.ok(preciseDamage >= plainDamage * 2, 'a precise shot hits at least twice as hard');
  assert.equal(player.preciseShots, 1);
  RK.Combat.skipTurn();
  assert.equal(player.preciseShots, 0);
});

test('the archer senses traps two tiles away and disarms them into the backpack', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;

  const tank = startRunAsClass(RK, 'paladin');
  assert.equal(RK.Classes.trapSenseRadius(tank), 1);
  assert.equal(RK.Classes.canSetTraps(tank), false);

  const archer = startRunAsClass(RK, 'archer');
  assert.equal(RK.Classes.trapSenseRadius(archer), 2);
  assert.ok(RK.Classes.disarmBonus(archer) > RK.Classes.disarmBonus(tank));
  assert.equal(RK.Classes.canSetTraps(archer), true);

  const trap = {
    x: archer.x + 1,
    y: archer.y,
    asset: 'trap',
    type: 'spike',
    state: 'armed',
    damage: 7,
  };
  RK.Map.traps = [trap];
  archer.facingX = 1;
  archer.facingY = 0;

  const originalChance = RK.RNG.chance;
  RK.RNG.chance = () => true;
  RK.Combat.interact('pick');
  RK.RNG.chance = originalChance;

  assert.ok(!RK.Map.traps.includes(trap), 'the disarmed trap leaves the map');
  const carried = archer.backpack.find((item) => item.kind === 'trap');
  assert.ok(carried, 'the trap moves into the archer backpack');
  assert.equal(carried.trapType, 'spike');
  assert.equal(carried.trapDamage, 7);
});

test('other classes disarm traps in place and cannot carry them', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startRunAsClass(RK, 'paladin');
  const trap = { x: player.x + 1, y: player.y, asset: 'trap', type: 'needle', state: 'armed', damage: 5 };
  RK.Map.traps = [trap];
  player.facingX = 1;
  player.facingY = 0;

  const originalChance = RK.RNG.chance;
  RK.RNG.chance = () => true;
  RK.Combat.interact('pick');
  RK.RNG.chance = originalChance;

  assert.equal(trap.state, 'disarmed');
  assert.ok(RK.Map.traps.includes(trap));
  assert.equal(player.backpack.some((item) => item.kind === 'trap'), false);
});

test('a carried trap is armed on the tile the archer faces', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startRunAsClass(RK, 'archer');
  const neighbor = openNeighbor(RK, player);
  player.facingX = neighbor[0];
  player.facingY = neighbor[1];
  player.backpack.push(RK.Items.spawnTrapItem(
    { type: 'flame', damage: 6 },
    player.x,
    player.y,
  ));

  const turnBefore = RK.GAME.turn;
  const index = player.backpack.length - 1;
  assert.equal(RK.Combat.useInventoryItem(index), true);

  const placed = RK.MapGen.getTrapAt(player.x + neighbor[0], player.y + neighbor[1]);
  assert.ok(placed, 'the trap appears on the faced tile');
  assert.equal(placed.state, 'armed');
  assert.equal(placed.type, 'flame');
  assert.equal(placed.owner, player.id);
  assert.equal(player.backpack.length, 1, 'the trap is consumed from the backpack');
  assert.ok(RK.GAME.turn > turnBefore, 'setting a trap costs a turn');
});

test('the archer cannot arm a trap on an occupied tile', () => {
  const { sandbox } = createSandbox();
  const RK = sandbox.RK;
  const player = startRunAsClass(RK, 'archer');
  const neighbor = openNeighbor(RK, player);
  player.facingX = neighbor[0];
  player.facingY = neighbor[1];
  RK.MapGen.getTrapAt(player.x + neighbor[0], player.y + neighbor[1]);
  RK.Map.traps.push({ x: player.x + neighbor[0], y: player.y + neighbor[1], asset: 'trap', type: 'spike', state: 'armed', damage: 5 });
  player.backpack.push(RK.Items.spawnTrapItem({ type: 'spike', damage: 5 }, player.x, player.y));

  const trapsBefore = RK.Map.traps.length;
  assert.equal(RK.Combat.useInventoryItem(player.backpack.length - 1), false);
  assert.equal(RK.Map.traps.length, trapsBefore);
  assert.equal(player.backpack.some((item) => item.kind === 'trap'), true, 'the trap stays in the pack');

  player.facingX = 0;
  player.facingY = 0;
  assert.equal(RK.Combat.useInventoryItem(player.backpack.length - 1), false,
    'a trap cannot be armed under the hero own feet');
});

test('inventory sorts the most valuable items first and keeps action indices intact', () => {
  const { sandbox, elements } = createSandbox({ ui: true });
  const RK = sandbox.RK;
  RK.GAME = {
    player: {
      classId: 'paladin',
      equipment: {},
      backpack: [
        { kind: 'loot', slot: 'boots', name: 'Сапоги ветра', rarity: 'common', value: 10 },
        { kind: 'loot', slot: 'weapon', name: 'Меч грозы', rarity: 'legendary', value: 300 },
        { kind: 'potion', name: 'Зелье лечения', rarity: 'common', value: 15, count: 2 },
        { kind: 'loot', slot: 'ring', name: 'Кольцо света', rarity: 'rare', value: 90 },
      ],
    },
  };

  RK.UI.showInventory();

  assert.equal(RK.UI.inventorySort(), 'value', 'valuable-first sorting is the default');
  const rows = elements.get('inventory-backpack-list').children;
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((row) => row.children[0].textContent.replace(/ ×\d+/, '').split(' — ')[0]),
    ['Меч грозы', 'Кольцо света', 'Зелье лечения', 'Сапоги ветра'],
  );

  RK.UI.setInventorySort('none');
  const unsorted = elements.get('inventory-backpack-list').children;
  assert.equal(unsorted[0].children[0].textContent.split(' — ')[0], 'Сапоги ветра');

  RK.UI.setInventorySort('type');
  const byType = elements.get('inventory-backpack-list').children;
  assert.equal(byType[0].children[0].textContent.split(' — ')[0], 'Меч грозы');

  RK.UI.setInventorySort('rarity');
  const byRarity = elements.get('inventory-backpack-list').children;
  assert.equal(byRarity[0].children[0].textContent.split(' — ')[0], 'Меч грозы');

  RK.UI.setInventoryFilter('weapon');
  const weaponsOnly = elements.get('inventory-backpack-list').children;
  assert.equal(weaponsOnly.length, 1);
  assert.match(weaponsOnly[0].children[0].textContent, /Меч грозы/);
});

test('inventory blocks weapons the class cannot use', () => {
  const { sandbox, elements } = createSandbox({ ui: true });
  const RK = sandbox.RK;
  RK.GAME = {
    player: {
      classId: 'archer',
      equipment: {},
      backpack: [{ kind: 'loot', slot: 'weapon', weaponType: 'melee', name: 'Топор ярости', rarity: 'rare', value: 50 }],
    },
  };

  RK.UI.showInventory();

  const row = elements.get('inventory-backpack-list').children[0];
  const useButton = row.children[1].children[0];
  assert.equal(useButton.disabled, true);
  const hints = row.children[0].children.filter((child) => child.className === 'equip-hint blocked');
  assert.equal(hints.length, 1);
  assert.match(hints[0].textContent, /не может держать мечи и копья/);
});
