(function () {
  var C = RK.CONFIG;

  var UPGRADES = [
    { id: 'hp', name: 'ВИТАЛЬНОСТЬ', desc: '+25 к макс. здоровью', base: 100, mult: 1.7 },
    { id: 'atk', name: 'СИЛА', desc: '+2 к атаке', base: 80, mult: 1.7 },
    { id: 'pot', name: 'ЛЕКАРЬ', desc: '+15 к лечению зелий', base: 120, mult: 1.8 },
    { id: 'luck', name: 'УДАЧА', desc: '+15% к добыче золота', base: 90, mult: 1.7 },
  ];

  // Классы по умолчанию — из общего списка: новый класс обязан появиться в нём.
  var DEFAULT_CLASSES = C.PLAYER_CLASSES.reduce(function (map, classId) {
    map[classId] = true;
    return map;
  }, {});

  // Фракции и репутация: состояние лежит в Meta.data, чтобы репутация и банк
  // сохранялись между забегами тем же ключом localStorage.
  var Faction = {
    get data() {
      return Meta.data;
    },

    setFaction: function (factionId) {
      var valid = ['city', 'wilderness', 'dungeon', 'crypt'];
      if (valid.includes(factionId)) {
        Meta.data.currentFaction = factionId;
        Meta.save();
      }
    },

    changeReputation: function (amount) {
      var current = Meta.data.reputation || 0;
      var newRep = Math.max(0, Math.min(100, current + amount));
      if (newRep !== current) {
        Meta.data.reputation = newRep;
        Meta.save();
      }
    },

    getReputation: function () {
      return { id: Meta.data.currentFaction, reputation: Meta.data.reputation || 0 };
    },

    addBank: function (n) {
      Meta.addBank(n);
    },

    cost: function (id) {
      return Meta.cost(id);
    },

    buy: function (id) {
      return Meta.buy(id);
    },

    buyClass: function (classId) {
      return Meta.buyClass(classId);
    },

    save: function () {
      Meta.save();
    },
  };

  var Meta = {
    data: { bank: 0, hp: 0, atk: 0, pot: 0, luck: 0, classes: Object.assign({}, DEFAULT_CLASSES), selectedClass: 'paladin', playerName: 'Игрок', renderMode: 'graphics', resolutionScale: 1, zoom: 1, currentFaction: 'city', reputation: 50 },

    load: function () {
      this.data.classes = Object.assign({}, DEFAULT_CLASSES, this.data.classes || {});
      try {
        var raw = localStorage.getItem(C.META_KEY);
        if (raw) {
          var d = JSON.parse(raw);
          for (var k in this.data) {
            if (k === 'classes') {
              // Старый сейв знает 'tank': переносим его в 'paladin'.
              var merged = Object.assign({}, DEFAULT_CLASSES, d.classes || {});
              var normalized = {};
              Object.keys(merged).forEach(function (classId) {
                normalized[RK.Classes.normalizeClassId(classId)] = true;
              });
              this.data.classes = normalized;
            } else if (typeof d[k] === 'number') {
              this.data[k] = d[k];
            } else if (k === 'playerName' && typeof d[k] === 'string') {
              this.data.playerName = d[k].slice(0, 18);
            } else if (k === 'renderMode' && RK.CONFIG.RENDER_MODES.indexOf(d[k]) >= 0) {
              this.data.renderMode = d[k];
            } else if (k === 'selectedClass' && d[k]) {
              this.data.selectedClass = d[k];
            } else if (k === 'currentFaction' && d[k]) {
              this.data.currentFaction = d[k];
            }
          }
        }
      } catch (e) {
        this.data = { bank: 0, hp: 0, atk: 0, pot: 0, luck: 0, classes: Object.assign({}, DEFAULT_CLASSES), selectedClass: 'paladin', playerName: 'Игрок', renderMode: 'graphics', resolutionScale: 1, zoom: 1, currentFaction: 'city', reputation: 50 };
      }
      if (!this.data.classes) {
        this.data.classes = Object.assign({}, DEFAULT_CLASSES);
      }
      if (!this.data.selectedClass) {
        this.data.selectedClass = this.data.classes.berserker ? 'berserker' : 'paladin';
      } else {
        this.data.selectedClass = RK.Classes.normalizeClassId(this.data.selectedClass);
      }
    },

    save: function () {
      try {
        localStorage.setItem(C.META_KEY, JSON.stringify(this.data));
        return true;
      } catch (e) { return false; }
    },

    addBank: function (n) {
      this.data.bank += n;
      this.save();
    },

    getReputation: function () {
      return { id: this.data.currentFaction, reputation: this.data.reputation || 0 };
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
      if (!classId || !RK.Classes || !RK.Classes.CLASS_DEFS[classId]) return false;
      this.data.classes[classId] = true;
      this.data.selectedClass = classId;
      this.save();
      return true;
    },
  };

  RK.Faction = Faction;
  RK.Meta = Meta;
  RK.Meta.UPGRADES = UPGRADES;
})();