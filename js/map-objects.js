// Объекты на карте: двери, сундуки, ловушки, таверна, кровь и границы.
(function () {
  var C = RK.CONFIG;

  function isInside(x, y) {
    var mm = RK.Map;
    return mm && x >= 0 && y >= 0 && x < mm.w && y < mm.h;
  }

  function getDoorAt(x, y) {
    var doors = RK.Map && RK.Map.doors ? RK.Map.doors : [];
    for (var i = 0; i < doors.length; i++) {
      if (doors[i].x === x && doors[i].y === y) return doors[i];
    }
    return null;
  }

  function getChestAt(x, y) {
    var chests = RK.Map && RK.Map.chests ? RK.Map.chests : [];
    for (var i = 0; i < chests.length; i++) {
      if (chests[i].x === x && chests[i].y === y) return chests[i];
    }
    return null;
  }

  function getTrapAt(x, y) {
    var traps = RK.Map && RK.Map.traps ? RK.Map.traps : [];
    for (var i = 0; i < traps.length; i++) {
      if (traps[i].x === x && traps[i].y === y) return traps[i];
    }
    return null;
  }

  function getTavern(g) {
    return g && g.tavern ? g.tavern : null;
  }

  function isInTavern(g, x, y) {
    var t = getTavern(g);
    if (!t) return false;
    return x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h;
  }

  function addBlood(x, y, strength) {
    var mm = RK.Map;
    if (!mm || !mm.blood) return;
    if (!isInside(x, y) || mm.tiles[y][x] !== 1) return;
    var amt = strength == null ? 1 : strength;
    var max = C.BLOOD_MAX || 180;
    mm.blood.push({
      x: x,
      y: y,
      ox: (RK.RNG.rand() - 0.5) * 0.55,
      oy: (RK.RNG.rand() - 0.5) * 0.55,
      r: 0.18 + RK.RNG.rand() * 0.28 * amt,
      a: 0.35 + RK.RNG.rand() * 0.4,
      kind: RK.RNG.int(0, 2),
    });
    while (mm.blood.length > max) mm.blood.shift();
  }

  RK.MapObjects = {
    isInside: isInside,
    getDoorAt: getDoorAt,
    getChestAt: getChestAt,
    getTrapAt: getTrapAt,
    getTavern: getTavern,
    isInTavern: isInTavern,
    addBlood: addBlood,
  };
})();
