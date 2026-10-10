(function () {
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var RNG = {
    _r: mulberry32(0x9e3779b9),
    seed: 0,
    reset: function (seed) {
      this.seed = seed >>> 0;
      this._r = mulberry32(this.seed);
    },
    rand: function () {
      return this._r();
    },
    int: function (min, max) {
      if (max <= min) return min;
      return min + Math.floor(this._r() * (max - min + 1));
    },
    pick: function (arr) {
      return arr[Math.floor(this._r() * arr.length)];
    },
    chance: function (p) {
      return this._r() < p;
    },
    randomSeed: function () {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        var buf = new Uint32Array(1);
        crypto.getRandomValues(buf);
        return buf[0];
      }
      return (Math.random() * 4294967296) >>> 0;
    },
  };

  RK.RNG = RNG;
})();