(function () {
  var TURN_INTERVAL = 20;
  var DEBUG_INTERVAL_MS = 30000;
  var WEATHER_NAMES = {
    clear: 'Ясно',
    rain: 'Дождь',
    thunderstorm: 'Гроза',
    dustStorm: 'Пыльная буря',
  };
  var DEBUG_SEQUENCE = ['clear', 'rain', 'thunderstorm', 'dustStorm'];
  var debugTimer = null;

  function hasWeatherType(type) {
    return Object.prototype.hasOwnProperty.call(WEATHER_NAMES, type);
  }

  function hasProfileType(profile, type) {
    var table = weatherTable(profile);
    for (var i = 0; i < table.length; i++) {
      if (table[i][0] === type) return true;
    }
    return false;
  }

  function profileForLocation(loc) {
    if (RK.GAME && RK.GAME.sceneKind === 'debug') return 'city';
    if (!loc) return null;

    var parentId = loc.parentId || loc.id;
    var depth = loc.depth || 0;
    if (depth > 1) return null;
    if (loc.id === 'city_start') return 'city';
    if (parentId === 'wilderness_forest' || parentId === 'wilderness_swamp') return 'rain';
    if (parentId === 'wilderness_desert' || parentId === 'dungeon_desert_ruins') return 'desert';
    return null;
  }

  function profileForCurrentLocation() {
    if (RK.GAME && RK.GAME.sceneKind === 'debug') return 'city';
    if (!RK.GAME || !RK.GAME.locationMode || !RK.World) return null;
    return profileForLocation(RK.World.current());
  }

  function weatherTable(profile) {
    if (profile === 'rain') {
      return [['clear', 20], ['rain', 60], ['thunderstorm', 20]];
    }
    if (profile === 'desert') {
      return [['clear', 60], ['dustStorm', 40]];
    }
    if (profile === 'city') {
      return [['clear', 60], ['rain', 20], ['thunderstorm', 10], ['dustStorm', 10]];
    }
    return [];
  }

  function choose(profile, roll) {
    var table = weatherTable(profile);
    if (!table.length) return null;
    var value = typeof roll === 'number' ? roll : RK.RNG.rand();
    var threshold = value * 100;
    for (var i = 0; i < table.length; i++) {
      threshold -= table[i][1];
      if (threshold < 0) return table[i][0];
    }
    return table[table.length - 1][0];
  }

  function enabledForCurrentWeather(weather) {
    if (!weather) return false;
    if (weather.debug) return !!(RK.GAME && RK.GAME.sceneKind === 'debug');
    return !!(profileForCurrentLocation() && RK.GAME &&
      weather.locationId === RK.GAME.locationId);
  }

  function current() {
    var weather = RK.GAME && RK.GAME.weather;
    if (!enabledForCurrentWeather(weather) || !hasWeatherType(weather.type)) return null;
    if (!weather.debug && !hasProfileType(profileForCurrentLocation(), weather.type)) return null;
    return weather.type;
  }

  function name(type) {
    return hasWeatherType(type) ? WEATHER_NAMES[type] : '';
  }

  function enemyHpMultiplier(enemy, type) {
    return enemy && (enemy.type === 'slime' || enemy.type === 'boss_slime') &&
      (type === 'rain' || type === 'thunderstorm') ? 1.25 : 1;
  }

  function applyEnemyModifiers(type) {
    var enemies = RK.GAME && RK.GAME.enemies;
    if (!Array.isArray(enemies)) return;
    for (var i = 0; i < enemies.length; i++) {
      var enemy = enemies[i];
      if (!enemy) continue;
      var oldMultiplier = Number.isFinite(enemy.weatherHpMultiplier)
        ? enemy.weatherHpMultiplier
        : 1;
      var nextMultiplier = enemyHpMultiplier(enemy, type);
      if (enemy.maxHp > 0 && nextMultiplier !== oldMultiplier) {
        enemy.maxHp = Math.max(1, Math.round(enemy.maxHp * nextMultiplier / oldMultiplier));
        enemy.hp = Math.min(enemy.hp, enemy.maxHp);
      }
      enemy.weatherHpMultiplier = nextMultiplier;
    }
  }

  function refreshWeather(announce) {
    var weather = RK.GAME && RK.GAME.weather;
    var type = enabledForCurrentWeather(weather) ? weather.type : 'clear';
    applyEnemyModifiers(type);
    if (RK.Fov && RK.GAME && RK.GAME.player) {
      RK.Fov.compute(RK.GAME.player.x, RK.GAME.player.y);
    }
    if (announce && weather && enabledForCurrentWeather(weather) && hasWeatherType(weather.type)) {
      RK.GameUI.log('Погода: ' + name(weather.type).toLowerCase() + '.');
    }
    if (RK.GameUI) RK.GameUI.refresh();
  }

  function setType(type, announce) {
    var weather = RK.GAME && RK.GAME.weather;
    if (!weather || !hasWeatherType(type)) return false;
    if (weather.type === type) return false;
    weather.type = type;
    refreshWeather(announce !== false);
    return true;
  }

  function enterLocation(loc) {
    if (!RK.GAME) return null;
    var profile = profileForLocation(loc);
    if (!profile) {
      RK.GAME.weather = null;
      return null;
    }

    var locationId = loc.id;
    var previous = RK.GAME.weather;
    if (previous && previous.locationId === locationId &&
        hasProfileType(profile, previous.type)) {
      if (!Number.isFinite(previous.nextChangeTurn)) {
        previous.nextChangeTurn = RK.GAME.turn + TURN_INTERVAL;
      }
      return previous;
    }
    RK.GAME.weather = {
      type: choose(profile),
      locationId: locationId,
      nextChangeTurn: RK.GAME.turn + TURN_INTERVAL,
    };
    refreshWeather(true);
    return RK.GAME.weather;
  }

  function tick() {
    var weather = RK.GAME && RK.GAME.weather;
    if (!weather || weather.debug || !enabledForCurrentWeather(weather)) return false;
    if (!Number.isFinite(weather.nextChangeTurn)) {
      weather.nextChangeTurn = RK.GAME.turn + TURN_INTERVAL;
      return false;
    }
    if (RK.GAME.turn < weather.nextChangeTurn) return false;
    weather.nextChangeTurn = RK.GAME.turn + TURN_INTERVAL;
    return setType(choose(profileForCurrentLocation()), true);
  }

  function enemyVisionRadius(baseRadius) {
    var radius = baseRadius;
    if (current() === 'dustStorm') radius = Math.floor(radius * 0.5);
    return Math.max(1, radius);
  }

  function playerVisionRadius(radius, player) {
    if (current() !== 'dustStorm' || (player && player.classId === 'archer')) return radius;
    return Math.max(1, Math.floor(radius * 0.5));
  }

  function enemyAttackMultiplier(enemy) {
    var type = current();
    if (type === 'dustStorm' && enemy && enemy.type === 'mummy') return 1.25;
    if (type === 'thunderstorm' && enemy &&
        (enemy.type === 'slime' || enemy.type === 'boss_slime')) return 1.25;
    return 1;
  }

  function startDebug() {
    stopDebug();
    if (!RK.GAME) return false;
    RK.GAME.weather = { type: 'clear', debug: true, sequenceIndex: 0 };
    refreshWeather(true);
    if (typeof setInterval !== 'function') return false;
    debugTimer = setInterval(function () {
      if (!RK.GAME || RK.GAME.sceneKind !== 'debug') {
        stopDebug();
        return;
      }
      var weather = RK.GAME.weather;
      var index = ((weather.sequenceIndex || 0) + 1) % DEBUG_SEQUENCE.length;
      weather.sequenceIndex = index;
      setType(DEBUG_SEQUENCE[index], true);
    }, DEBUG_INTERVAL_MS);
    return true;
  }

  function stopDebug() {
    if (debugTimer !== null && typeof clearInterval === 'function') clearInterval(debugTimer);
    debugTimer = null;
  }

  RK.Weather = {
    TURN_INTERVAL: TURN_INTERVAL,
    DEBUG_INTERVAL_MS: DEBUG_INTERVAL_MS,
    current: current,
    name: name,
    choose: choose,
    profileForLocation: profileForLocation,
    enterLocation: enterLocation,
    tick: tick,
    applyEnemyModifiers: applyEnemyModifiers,
    enemyVisionRadius: enemyVisionRadius,
    playerVisionRadius: playerVisionRadius,
    enemyAttackMultiplier: enemyAttackMultiplier,
    startDebug: startDebug,
    stopDebug: stopDebug,
  };
})();
