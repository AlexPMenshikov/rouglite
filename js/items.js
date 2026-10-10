(function () {
  var C = RK.CONFIG;

  var DEFS = {
    potion: { name: 'Зелье лечения', symbol: '!', color: '#ff6b81' },
    gold: { name: 'Золото', symbol: '$', color: '#ffd166' },
    sword: { name: 'Меч (+4 к атаке)', symbol: 't', color: '#c3c8e8' },
    shield: { name: 'Щит (+3 к защите)', symbol: ']', color: '#7eb8ff' },
    boots: { name: 'Сапоги (замедление врагов)', symbol: 'b', color: '#c9a86a' },
  };

  function spawnItems(floor, spawn) {
    var items = [];
    var n = RK.RNG.int(3, 5);
    var guard = 0;
    while (items.length < n && guard < 120) {
      guard++;
      var t = RK.MapGen.randomFloorNear(spawn.x, spawn.y, C.COLS, 2);
      if (!t) continue;
      var r = RK.RNG.rand();
      var type;
      if (r < 0.45) type = 'gold';
      else if (r < 0.62) type = 'potion';
      else if (r < 0.75) type = 'sword';
      else if (r < 0.88) type = 'shield';
      else type = 'boots';
      var amt = 0;
      if (type === 'gold') amt = RK.RNG.int(5, 12) * Math.max(1, Math.floor(floor * 0.7));
      var item = { type: type, x: t.x, y: t.y, amt: amt };
      if (type === 'sword' || type === 'shield' || type === 'boots') {
        item.durability = RK.CONFIG.EQUIPMENT[type].durability;
      }
      items.push(item);
    }
    return items;
  }

  RK.Items = {
    DEFS: DEFS,
    spawnItems: spawnItems,
  };
})();
