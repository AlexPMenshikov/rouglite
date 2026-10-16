(function () {
  // Единый реестр статусов вынесен из combat.js, чтобы определения жили в одном
  // месте и были доступны отдельно от логики применения/тиков.
  var STATUS_DEFS = Object.freeze({
    burning: Object.freeze({ id: 'burning', name: 'Горение', color: '#ff7b32', kind: 'damage', defaultTurns: 3, defaultDamage: 2, element: 'fire' }),
    poison: Object.freeze({ id: 'poison', name: 'Яд', color: '#7ae582', kind: 'damage', defaultTurns: 4, defaultDamage: 1, element: 'poison' }),
    bleed: Object.freeze({ id: 'bleed', name: 'Кровотечение', color: '#ff5252', kind: 'damage', defaultTurns: 3, defaultDamage: 1, element: 'physical' }),
    chill: Object.freeze({ id: 'chill', name: 'Холод', color: '#9ddcff', kind: 'timer', defaultTurns: 2, element: 'ice' }),
    stun: Object.freeze({ id: 'stun', name: 'Оглушение', color: '#ffd166', kind: 'control', defaultTurns: 1, element: 'physical' }),
  });

  RK.Statuses = RK.Statuses || {};
  RK.Statuses.DEFS = STATUS_DEFS;

  if (typeof module === 'object' && module.exports) {
    module.exports = STATUS_DEFS;
  }
})();