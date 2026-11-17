// Конечности: четыре зоны, отдельные HP и травмы. Модуль загружается до
// entities.js и о забеге не знает — смерть и урон приходят контекстом.
(function () {
  var C = RK.CONFIG;
  var L = C.LIMBS;

  // Названия зон по анатомии: id общие, подписи разные.
  var ANATOMY = Object.freeze({
    humanoid: Object.freeze({ head: 'Голова', chest: 'Грудь', arms: 'Руки', legs: 'Ноги' }),
    beast: Object.freeze({ head: 'Голова', chest: 'Корпус', arms: 'Передние лапы', legs: 'Задние лапы' }),
  });

  var context = null;

  function contextOf(ctx) {
    return ctx || context;
  }

  // Анатомия ищется на актёре, затем в определении врага. Старые снимки без
  // поля получают гуманоида по признакам героя, иначе — конечности не нужны.
  function anatomyOf(actor) {
    if (!actor || typeof actor !== 'object') return 'none';
    if (actor.anatomy && ANATOMY[actor.anatomy]) return actor.anatomy;
    var defs = RK.Entities && RK.Entities.DEFS;
    var def = defs && actor.type ? defs[actor.type] : null;
    if (def && ANATOMY[def.anatomy]) return def.anatomy;
    if (actor.classId || actor.backpack || actor.equipment) return 'humanoid';
    return 'none';
  }

  function zoneName(anatomy, zoneId) {
    var names = ANATOMY[anatomy];
    return names && names[zoneId] ? names[zoneId] : zoneId;
  }

  function zoneMaxHp(actor, zoneId) {
    var share = L.HP_SHARE[zoneId] || 0.25;
    return Math.max(1, Math.ceil((actor.maxHp || 1) * share));
  }

  function makeZone(actor, zoneId) {
    var maxHp = zoneMaxHp(actor, zoneId);
    return { id: zoneId, hp: maxHp, maxHp: maxHp, bleeding: 0, fracture: false };
  }

  function createZones(actor, anatomy) {
    var anatomyNames = ANATOMY[anatomy] || ANATOMY.humanoid;
    var zones = {};
    for (var i = 0; i < L.ZONES.length; i++) {
      var zoneId = L.ZONES[i];
      if (!anatomyNames[zoneId]) continue;
      zones[zoneId] = makeZone(actor, zoneId);
    }
    return zones;
  }

  function init(actor) {
    if (!actor || typeof actor !== 'object') return null;
    var anatomy = anatomyOf(actor);
    actor.anatomy = anatomy;
    if (!ANATOMY[anatomy]) {
      actor.limbs = null;
      return null;
    }
    actor.limbs = { anatomy: anatomy, zones: createZones(actor, anatomy), regenTurns: 0 };
    return actor.limbs;
  }

  // Идемпотентно: недостающие зоны создаются, максимум HP следует за общим
  // максимумом актёра с сохранением доли здоровья.
  function ensure(actor) {
    if (!actor || typeof actor !== 'object') return null;
    var anatomy = anatomyOf(actor);
    actor.anatomy = anatomy;
    if (!ANATOMY[anatomy]) {
      actor.limbs = null;
      return null;
    }
    var limbs = actor.limbs;
    if (!limbs || typeof limbs !== 'object' || !limbs.zones || typeof limbs.zones !== 'object' ||
        limbs.anatomy !== anatomy) {
      return init(actor);
    }
    for (var i = 0; i < L.ZONES.length; i++) {
      var zoneId = L.ZONES[i];
      var zone = limbs.zones[zoneId];
      var maxHp = zoneMaxHp(actor, zoneId);
      if (!zone || typeof zone !== 'object') {
        limbs.zones[zoneId] = makeZone(actor, zoneId);
        continue;
      }
      var oldMax = Number.isFinite(zone.maxHp) && zone.maxHp > 0 ? zone.maxHp : maxHp;
      var hp = Number.isFinite(zone.hp) ? zone.hp : oldMax;
      if (oldMax !== maxHp) hp = Math.round(hp * maxHp / oldMax);
      zone.id = zoneId;
      zone.maxHp = maxHp;
      zone.hp = Math.max(0, Math.min(maxHp, hp));
      zone.bleeding = zone.bleeding >= 2 ? 2 : (zone.bleeding ? 1 : 0);
      zone.fracture = !!zone.fracture;
    }
    if (!Number.isInteger(limbs.regenTurns) || limbs.regenTurns < 0) limbs.regenTurns = 0;
    return limbs;
  }

  function zoneOf(actor, zoneId) {
    var limbs = ensure(actor);
    if (!limbs || !L.ZONES.some(function (id) { return id === zoneId; })) return null;
    return limbs.zones[zoneId] || null;
  }

  function log(text) {
    if (RK.GameUI && RK.GameUI.log) RK.GameUI.log(text);
  }

  // Физический удар бьёт отдельно по общей формуле и по одной зоне.
  // Травмы выдаются по порогам, повторно перелом не ставится.
  function takeHit(actor, damage) {
    if (!actor || !(damage > 0)) return null;
    var limbs = ensure(actor);
    if (!limbs) return null;
    var zoneId = RK.RNG.pick(L.ZONES);
    var zone = limbs.zones[zoneId];
    var limbDamage = Math.max(1, Math.round(damage * L.DAMAGE_SHARE));
    var hitShare = limbDamage / Math.max(1, zone.maxHp);
    var gainedBleeding = 0;
    var gainedFracture = false;
    zone.hp = Math.max(0, zone.hp - limbDamage);
    if (zone.hp <= 0) {
      if ((zone.bleeding || 0) < 2) gainedBleeding = 2;
      zone.bleeding = 2;
      if (!zone.fracture) gainedFracture = true;
      zone.fracture = true;
    } else {
      var bleeding = 0;
      if (zone.hp <= zone.maxHp * L.BLEED_SMALL_HP) bleeding = 1;
      if (hitShare >= L.BLEED_BIG_HIT) bleeding = 2;
      if (bleeding > (zone.bleeding || 0)) {
        gainedBleeding = bleeding;
        zone.bleeding = bleeding;
      }
      var fractured = zone.hp <= zone.maxHp * L.FRACTURE_HP || hitShare >= L.FRACTURE_HIT;
      if (fractured && !zone.fracture) {
        zone.fracture = true;
        gainedFracture = true;
      }
    }
    var marks = [];
    if (gainedBleeding === 1) marks.push('кровотечение');
    if (gainedBleeding === 2) marks.push('сильное кровотечение');
    if (gainedFracture) marks.push('перелом');
    if (marks.length) {
      log((actor.name || 'Цель') + ': ' + zoneName(limbs.anatomy, zoneId) + ' — ' + marks.join(', ') + '.');
    }
    return { zone: zoneId, damage: limbDamage, bleeding: gainedBleeding, fracture: gainedFracture };
  }

  function hasFracture(actor, zoneId) {
    var limbs = actor && actor.limbs;
    var zone = limbs && limbs.zones ? limbs.zones[zoneId] : null;
    return !!(zone && zone.fracture);
  }

  function attackMultiplier(actor) {
    var multiplier = 1;
    if (hasFracture(actor, 'head')) multiplier *= L.HEAD_FRACTURE_ATK;
    if (hasFracture(actor, 'arms')) multiplier *= L.ARMS_FRACTURE_ATK;
    return multiplier;
  }

  function damageTakenMultiplier(actor) {
    return hasFracture(actor, 'chest') ? L.CHEST_FRACTURE_TAKEN : 1;
  }

  function dodgePenalty(actor) {
    return hasFracture(actor, 'legs') ? L.LEGS_FRACTURE_DODGE : 0;
  }

  // Тик: кровотечение снимает общее HP и может убить, затем естественная
  // регенерация возвращает по 1 HP целым конечностям раз в несколько ходов.
  function tick(actor, ctx) {
    var limbs = ensure(actor);
    if (!limbs || actor.hp <= 0) return 0;
    ctx = contextOf(ctx);
    var bleeding = 0;
    for (var i = 0; i < L.ZONES.length; i++) {
      var zone = limbs.zones[L.ZONES[i]];
      if (zone && zone.bleeding > 0) bleeding += zone.bleeding;
    }
    var damage = 0;
    if (bleeding > 0) {
      damage = Math.min(actor.hp, bleeding);
      actor.hp -= damage;
      if (ctx && ctx.isParty && ctx.isParty(actor)) {
        if (ctx.onDamage) ctx.onDamage(actor, damage, 'От кровотечения');
        log('Кровотечение: -' + damage + ' HP.');
      } else if (actor.hp <= 0) {
        if (ctx && ctx.killEnemy) ctx.killEnemy(actor);
        return damage;
      }
    }
    limbs.regenTurns++;
    if (limbs.regenTurns % L.REGEN_TURNS === 0) {
      for (var j = 0; j < L.ZONES.length; j++) {
        var healed = limbs.zones[L.ZONES[j]];
        if (!healed || healed.bleeding > 0 || healed.fracture) continue;
        if (healed.hp < healed.maxHp) healed.hp = Math.min(healed.maxHp, healed.hp + L.REGEN_AMOUNT);
      }
    }
    return damage;
  }

  function healZone(zone, share) {
    var heal = Math.max(1, Math.round(zone.maxHp * share));
    var before = zone.hp;
    zone.hp = Math.min(zone.maxHp, zone.hp + heal);
    return zone.hp - before;
  }

  // Бинт останавливает кровотечение, шина лечит перелом; обе возвращают часть HP.
  function treat(actor, zoneId, kind) {
    var limbs = ensure(actor);
    if (!limbs) return null;
    var zone = limbs.zones[zoneId];
    if (!zone) return null;
    if (kind === 'bandage') {
      if (!(zone.bleeding > 0)) return null;
      zone.bleeding = 0;
      return { zone: zoneId, kind: kind, healed: healZone(zone, L.BANDAGE_HEAL_SHARE) };
    }
    if (kind === 'splint') {
      if (!zone.fracture) return null;
      zone.fracture = false;
      return { zone: zoneId, kind: kind, healed: healZone(zone, L.SPLINT_HEAL_SHARE) };
    }
    return null;
  }

  function worstBleeding(actor) {
    var limbs = ensure(actor);
    if (!limbs) return null;
    var best = null;
    var level = 0;
    for (var i = 0; i < L.ZONES.length; i++) {
      var zone = limbs.zones[L.ZONES[i]];
      if (zone && zone.bleeding > level) {
        best = L.ZONES[i];
        level = zone.bleeding;
      }
    }
    return best;
  }

  function worstFracture(actor) {
    var limbs = ensure(actor);
    if (!limbs) return null;
    var best = null;
    var ratio = Infinity;
    for (var i = 0; i < L.ZONES.length; i++) {
      var zone = limbs.zones[L.ZONES[i]];
      if (!zone || !zone.fracture) continue;
      var current = zone.hp / Math.max(1, zone.maxHp);
      if (current < ratio) {
        best = L.ZONES[i];
        ratio = current;
      }
    }
    return best;
  }

  // Полное лечение служб; amount ограничивает прибавку (привал лечит по 1 HP).
  function restoreAll(actor, amount) {
    var limbs = ensure(actor);
    if (!limbs) return;
    for (var i = 0; i < L.ZONES.length; i++) {
      var zone = limbs.zones[L.ZONES[i]];
      if (!zone) continue;
      var heal = amount == null ? zone.maxHp : amount;
      zone.hp = Math.min(zone.maxHp, zone.hp + heal);
    }
  }

  function penaltyText(zoneId, zone) {
    if (!zone || !zone.fracture) return '';
    if (zoneId === 'head') return '−20% атаки';
    if (zoneId === 'chest') return '+20% получаемого урона';
    if (zoneId === 'arms') return '−25% атаки';
    if (zoneId === 'legs') return '−25 п.п. уклонения';
    return '';
  }

  function describe(actor) {
    var limbs = ensure(actor);
    if (!limbs) return { anatomy: 'none', zones: [], attack: 1, taken: 1, dodge: 0 };
    var zones = [];
    for (var i = 0; i < L.ZONES.length; i++) {
      var zoneId = L.ZONES[i];
      var zone = limbs.zones[zoneId];
      if (!zone) continue;
      zones.push({
        id: zoneId,
        name: zoneName(limbs.anatomy, zoneId),
        hp: zone.hp,
        maxHp: zone.maxHp,
        bleeding: zone.bleeding,
        fracture: !!zone.fracture,
        penalty: penaltyText(zoneId, zone),
      });
    }
    return {
      anatomy: limbs.anatomy,
      zones: zones,
      attack: attackMultiplier(actor),
      taken: damageTakenMultiplier(actor),
      dodge: dodgePenalty(actor),
    };
  }

  RK.Limbs = {
    ANATOMY: ANATOMY,
    setContext: function (value) { context = value || null; },
    anatomyOf: anatomyOf,
    zoneName: zoneName,
    init: init,
    ensure: ensure,
    zoneOf: zoneOf,
    takeHit: takeHit,
    attackMultiplier: attackMultiplier,
    damageTakenMultiplier: damageTakenMultiplier,
    dodgePenalty: dodgePenalty,
    tick: tick,
    treat: treat,
    worstBleeding: worstBleeding,
    worstFracture: worstFracture,
    restoreAll: restoreAll,
    describe: describe,
  };
})();
