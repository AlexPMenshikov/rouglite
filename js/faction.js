(function () {
  var C = RK.CONFIG;

  var FACTIONS = Object.freeze({
    city: { id: 'city', name: 'Городской', reputation: { min: 0, max: 100 }, services: ['merchant', 'blacksmith', 'temple', 'guild', 'warehouse'] },
    wilderness: { id: 'wilderness', name: 'Дикая природа', reputation: { min: 0, max: 50 }, services: [] },
    dungeon: { id: 'dungeon', name: 'Подземелье', reputation: { min: 0, max: 30 }, services: [] },
    crypt: { id: 'crypt', name: 'Склеп', reputation: { min: 0, max: 30 }, services: [] },
  });

  var REPUTATION = {
    data: { currentFaction: 'city', reputation: 50 },

    setFaction: function (factionId) {
      if (FACTIONS[factionId]) {
        this.data.currentFaction = factionId;
        this.save();
      }
    },

    changeReputation: function (amount) {
      var f = FACTIONS[this.data.currentFaction];
      if (!f) return;
      var newRep = Math.max(f.reputation.min, Math.min(f.reputation.max, this.data.reputation + amount));
      if (newRep !== this.data.reputation) {
        this.data.reputation = newRep;
        this.save();
      }
    },

    getReputation: function () {
      var f = FACTIONS[this.data.currentFaction];
      return f ? { id: f.id, name: f.name, reputation: this.data.reputation } : null;
    },

    canAccessService: function (serviceKind) {
      var f = FACTIONS[this.data.currentFaction];
      if (!f) return false;
      return f.services.includes(serviceKind);
    },

    addBank: function (n) {
      this.data.bank = (this.data.bank || 0) + n;
      this.save();
    },

    save: function () {
      try {
        localStorage.setItem(C.META_KEY, JSON.stringify(this.data));
        return true;
      } catch (e) { return false; }
    },
  };

  RK.Faction = REPUTATION;
})();