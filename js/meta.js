(function () {
  var C = RK.CONFIG;

  var UPGRADES = [
    { id: 'hp', name: 'ВИТАЛЬНОСТЬ', desc: '+25 к макс. здоровью', base: 100, mult: 1.7 },
    { id: 'atk', name: 'СИЛА', desc: '+2 к атаке', base: 80, mult: 1.7 },
    { id: 'pot', name: 'ЛЕКАРЬ', desc: '+15 к лечению зелий', base: 120, mult: 1.8 },
    { id: 'luck', name: 'УДАЧА', desc: '+15% к добыче золота', base: 90, mult: 1.7 },
  ];

  var DEFAULT_CLASSES = { tank: true, berserker: false, archer: false };

  var Meta = {
    data: { bank: 0, hp: 0, atk: 0, pot: 0, luck: 0, classes: Object.assign({}, DEFAULT_CLASSES), selectedClass: 'tank', playerName: 'Игрок', renderMode: 'graphics' },

    load: function () {
      try {
        var raw = localStorage.getItem(C.META_KEY);
        if (raw) {
          var d = JSON.parse(raw);
          for (var k in this.data) {
            if (k === 'classes') {
              this.data.classes = Object.assign({}, DEFAULT_CLASSES, d.classes || {});
            } else if (typeof d[k] === 'number') {
              this.data[k] = d[k];
            } else if (k === 'playerName' && typeof d[k] === 'string') {
              this.data.playerName = d[k].slice(0, 18);
            } else if (k === 'renderMode' && (d[k] === 'graphics' || d[k] === 'ascii')) {
              this.data.renderMode = d[k];
            } else if (k === 'selectedClass' && d[k]) {
              this.data.selectedClass = d[k];
            }
          }
        }
      } catch (e) {
        this.data = { bank: 0, hp: 0, atk: 0, pot: 0, luck: 0, classes: Object.assign({}, DEFAULT_CLASSES), selectedClass: 'tank', playerName: 'Игрок', renderMode: 'graphics' };
      }
      if (!this.data.classes) {
        this.data.classes = Object.assign({}, DEFAULT_CLASSES);
      }
      if (!this.data.selectedClass) {
        this.data.selectedClass = this.data.classes.berserker ? 'berserker' : 'tank';
      }
    },

    save: function () {
      try {
        localStorage.setItem(C.META_KEY, JSON.stringify(this.data));
        return true;
      } catch (e) {}
      return false;
    },

    addBank: function (n) {
      this.data.bank += n;
      this.save();
    },

    cost: function (id) {
      var u = UPGRADES.find(function (x) { return x.id === id; });
      return Math.round(u.base * Math.pow(u.mult, this.data[u.id]));
    },

    buy: function (id) {
      var cost = this.cost(id);
      if (this.data.bank < cost) return false;
      this.data.bank -= cost;
      this.data[id] += 1;
      this.save();
      return true;
    },

    buyClass: function (classId) {
      if (!classId) return false;
      if (!RK.Classes || !RK.Classes.CLASS_DEFS[classId]) return false;
      var def = RK.Classes.CLASS_DEFS[classId];
      if (this.data.classes[classId]) {
        this.data.selectedClass = classId;
        this.save();
        return true;
      }
      if (this.data.bank < def.cost) return false;
      this.data.bank -= def.cost;
      this.data.classes[classId] = true;
      this.data.selectedClass = classId;
      this.save();
      return true;
    },
  };

  RK.Meta = Meta;
  RK.Meta.UPGRADES = UPGRADES;
})();