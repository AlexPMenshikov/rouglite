(function () {
  'use strict';

  var context = null;
  var master = null;
  var sfxBus = null;
  var ambientBus = null;

  var enabled = true;
  var currentTheme = null;
  var ambientActive = false;
  var activeAmbientGain = null;
  var activeNodes = [];
  var activeTimers = [];
  var noiseBuffer = null;
  var ambientSession = 0;

  var STATIC_BUSES = true;

  function ensureContext() {
    if (context) return true;
    var AudioContextType = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
    if (!AudioContextType) return false;
    context = new AudioContextType();

    master = context.createGain();
    master.gain.value = enabled ? 0.65 : 0;

    var compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 8;
    compressor.ratio.value = 2.5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    sfxBus = context.createGain();
    sfxBus.gain.value = 1;
    ambientBus = context.createGain();
    ambientBus.gain.value = 0.85;

    ambientBus.connect(compressor);
    sfxBus.connect(compressor);
    compressor.connect(master);
    master.connect(context.destination);
    return true;
  }

  function now() {
    return context ? context.currentTime : 0;
  }

  function clearNodeList(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      try { nodes[i].disconnect(); } catch (_err) { /* noop */ }
    }
  }

  function clearTimers() {
    for (var i = 0; i < activeTimers.length; i++) {
      clearTimeout(activeTimers[i]);
    }
    activeTimers = [];
  }

  function rampGain(gain, target, startAt, duration) {
    gain.cancelScheduledValues(startAt);
    gain.setValueAtTime(Math.max(gain.value, 0.0001), startAt);
    if (target <= 0.0001) {
      gain.exponentialRampToValueAtTime(0.0001, startAt + Math.max(0.01, duration));
    } else {
      gain.exponentialRampToValueAtTime(target, startAt + Math.max(0.01, duration));
    }
  }

  function scheduleStop(nodes, at) {
    for (var i = 0; i < nodes.length; i++) {
      if (typeof nodes[i].stop === 'function') {
        try { nodes[i].stop(at); } catch (_err) { /* noop */ }
      }
    }
  }

  function normalizeSemitone(interval) {
    return Math.pow(2, interval / 12);
  }

  function createNoiseBuffer(color) {
    if (!context || !dynamicNoiseBuffer) {}
    var length = context.sampleRate * 4;
    var buffer = context.createBuffer(1, length, context.sampleRate);
    var output = buffer.getChannelData(0);
    var last = 0;
    for (var i = 0; i < length; i++) {
      var white = Math.random() * 2 - 1;
      if (color === 'brown') {
        last = (last + 0.02 * white) * 0.995;
        output[i] = last * 0.8;
      } else {
        var prev = i > 0 ? output[i - 1] : 0;
        output[i] = (output[i - 1] || 0) * 0.97 + (white * 0.03);
      }
    }
    return buffer;
  }

  var dynamicNoiseBuffer = true;

  function createNoiseLayer(theme, gainNode, nodeBag) {
    if (!ensureContext()) return null;
    var buffer = createNoiseBuffer(theme.noiseColor || 'brown');
    var source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = theme.noiseRate || 1;

    var filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = theme.noiseFilter || 380;
    filter.Q.value = 0.7;

    var gain = context.createGain();
    gain.gain.value = 0.0001;
    var startAt = now();
    rampGain(gain.gain, theme.noiseLevel || 0.008, startAt, 2.2);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ambientBus);
    source.start(startAt);

    nodeBag.push(source, filter, gain);
    return gain;
  }

  function createLfo(lowerBound, upperBound, rate) {
    var oscillator = context.createOscillator();
    var gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = rate || 0.045;
    gain.gain.value = upperBound - lowerBound;
    // LFO стартует вместе с владельцем (createDroneNote), а не при создании.
    return { node: oscillator, gain: gain, offset: lowerBound };
  }

  function createDroneNote(theme, frequency, gainNode, nodeBag) {
    var oscillator = context.createOscillator();
    oscillator.type = theme.droneWave || 'sine';

    var vibrato = createLfo(0.98, 1.02, theme.vibratoRate || 0.03);
    vibrato.gain.connect(oscillator.detune);
    vibrato.gain.gain.value = theme.vibratoAmount || 6;

    var filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = theme.droneFilter || 520;
    filter.Q.value = 0.65;

    var noteGain = context.createGain();
    var startAt = now();
    noteGain.gain.value = 0.0001;
    var mix = (theme.droneGain || 0.022) / (theme.droneVoices || 3);

    rampGain(noteGain.gain, mix, startAt, 2.4);

    oscillator.frequency.setValueAtTime(frequency, startAt);
    oscillator.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(gainNode);
    oscillator.start(startAt);
    vibrato.node.start(startAt);

    nodeBag.push(oscillator, filter, noteGain, vibrato.node, vibrato.gain);
  }

  function pushNodes(activeNodesBag, layerGain) {
    activeNodes.push(layerGain);
  }

  function buildTheme(floor) {
    var index = Math.min(3, Math.floor((floor - 1) / 3));
    var roots = [130.81, 174.61, 146.83, 110.0];
    var themes = [
      {
        root: roots[index],
        intervals: [0, 3, 7, 10],
        droneIntervals: [-24, -12, 0],
        density: 2.1,
        droneGain: 0.028,
        noiseLevel: 0.0075,
        reverbFeel: 0.28,
        droneWave: 'sine',
        noiseColor: 'brown',
        noiseFilter: 340,
        motifLen: 3,
      },
      {
        root: roots[index],
        intervals: [0, 2, 5, 7],
        droneIntervals: [-12, 0, 7],
        density: 1.8,
        droneGain: 0.023,
        noiseLevel: 0.006,
        reverbFeel: 0.34,
        droneWave: 'triangle',
        noiseColor: 'brown',
        noiseFilter: 420,
        motifLen: 4,
      },
      {
        root: roots[index],
        intervals: [0, 2, 4, 7, 9],
        droneIntervals: [-12, 0, 4, 7],
        density: 2.4,
        droneGain: 0.02,
        noiseLevel: 0.005,
        reverbFeel: 0.42,
        droneWave: 'sine',
        noiseColor: 'brown',
        noiseFilter: 500,
        motifLen: 2,
      },
      {
        root: roots[index] * 0.5,
        intervals: [0, 1, 6, 10],
        droneIntervals: [-12, 0, 1],
        density: 0.9,
        droneGain: 0.034,
        noiseLevel: 0.012,
        reverbFeel: 0.48,
        droneWave: 'triangle',
        noiseColor: 'brown',
        noiseFilter: 300,
        motifLen: 2,
      },
    ];
    return themes[Math.max(0, index)];
  }

  function scheduleMotif(theme, layerGain) {
    if (!context || !ambientActive) return;
    var session = ambientSession;
    var motif = [];
    for (var i = 0; i < theme.motifLen; i++) {
      var degree = theme.intervals[Math.floor(Math.random() * theme.intervals.length)];
      if (i === 0) degree = 0;
      if (i === theme.motifLen - 1) degree = theme.intervals[0];
      motif.push(degree + (Math.random() < 0.22 ? 12 : 0));
    }

    var root = theme.root;
    var spacing = 0.55 + Math.random() * 0.95;
    var phraseLength = theme.motifLen;
    var startAt = now() + 0.45 + Math.random() * 0.65;
    var total = motif.length;

    for (var i = 0; i < total; i++) {
      var degree = motif[i];
      var frequency = root * Math.pow(2, degree / 12);
      var duration = 2.8 + Math.random() * (phraseLength + 1) * 0.7;
      var when = startAt + i * spacing;
      playAmbientTone(frequency, when, duration, theme, 0.012 + theme.density * 0.002, layerGain, activeNodes);
      if (Math.random() < 0.28) {
        var accentDegree = theme.intervals[theme.intervals.length - 1];
        var accentFrequency = root * 2 * Math.pow(2, accentDegree / 12);
        playAmbientTone(accentFrequency, when + spacing * 0.65, 1.8 + Math.random() * 2, theme, 0.003, layerGain, activeNodes);
      }
    }

    var delay = (startAt + (total * spacing) + (3 + Math.random() * 5)) - now();
    var timer = setTimeout(function () {
      if (session !== ambientSession || !ambientActive) return;
      scheduleMotif(theme, layerGain);
    }, Math.max(1500, delay * 1000));
    activeTimers.push(timer);
  }

  function playAmbientTone(frequency, when, duration, theme, volume, gainNode, nodeBag) {
    if (!ensureContext()) return;
    var oscillator = context.createOscillator();
    oscillator.type = theme.reverbFeel > 0.4 ? 'sine' : 'triangle';

    var filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400 + theme.reverbFeel * 300;
    filter.Q.value = 0.4;

    var toneGain = context.createGain();
    var startVolume = 0.0001;
    var peak = volume;
    var attack = duration * 0.35;
    var release = duration * 0.65;
    toneGain.gain.setValueAtTime(startVolume, when);
    rampGain(toneGain.gain, peak, when, attack);
    toneGain.gain.setTargetAtTime(peak, when + attack, 0.01);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, when + attack + release);

    oscillator.frequency.setValueAtTime(frequency, when);
    oscillator.connect(filter);
    filter.connect(toneGain);
    toneGain.connect(gainNode);
    oscillator.start(when);
    oscillator.stop(when + attack + release + 0.05);

    if (nodeBag) nodeBag.push(oscillator, filter, toneGain);
  }

  function scheduleAmbient(floor) {
    if (!ensureContext()) return;
    ambientActive = true;
    clearTimers();
    var theme = buildTheme(floor);
    currentTheme = theme;

    activeAmbientGain = context.createGain();
    activeAmbientGain.gain.value = 0.0001;
    var session = ++ambientSession;
    activeGainPrefetch(session);

    var startAt = now();
    rampGain(activeAmbientGain.gain, enabled ? 1 : 0, startAt, 1.0);

    activeNodes = [];
    // Drone layer.
    var droneGain = context.createGain();
    droneGain.gain.value = 1;
    droneGain.connect(activeAmbientGain);
    var droneNodes = [];
    for (var i = 0; i < theme.droneIntervals.length; i++) {
      createDroneNote(theme, theme.root * normalizeSemitone(theme.droneIntervals[i]), droneGain, droneNodes);
    }
    activeNodes.push(droneGain);
    activeNodes = activeNodes.concat(droneNodes);

    // Noise bed.
    var noiseGain = createNoiseLayer(theme, activeAmbientGain, activeNodes);

    // Motif loop.
    activeTimers.push(setTimeout(function () {
      if (session !== ambientSession || !ambientActive) return;
      scheduleMotif(theme, activeAmbientGain);
    }, 2200));

    activeAmbientGain.connect(ambientBus);
    activeNodes.push(activeAmbientGain);
  }

  function activeGainPrefetch(_session) {
    // Utility hook placeholder for bus preflight.
  }

  function stopAmbient() {
    if (!context) return;
    ambientActive = false;
    currentTheme = null;
    clearTimers();
    ambientSession++;
    if (activeAmbientGain) {
      var gain = activeAmbientGain;
      var nodesSnapshot = activeNodes.slice();
      var at = now();
      rampGain(gain.gain, 0.0001, at, 1.0);
      setTimeout(function () {
        scheduleStop(nodesSnapshot, at + 1.1);
        clearNodeList(nodesSnapshot);
      }, 1150);
      activeAmbientGain = null;
    } else {
      clearNodeList(activeNodes);
    }
    activeNodes = [];
  }

  function setFloor(floor) {
    if (!ensureContext()) return;
    if (context && context.state === 'suspended') {
      context.resume().catch(function () {});
    }
    if (!ambientActive) {
      scheduleAmbient(floor);
      return;
    }
    // Настоящий crossfade: старая тема продолжает затухать, а новая уже начинает звучать.
    var oldNodes = activeNodes.slice();
    var oldGain = activeAmbientGain;
    clearTimers();
    activeNodes = [];
    activeAmbientGain = null;
    ambientActive = false;
    if (oldGain) {
      var fadeAt = now();
      rampGain(oldGain.gain, 0.0001, fadeAt, 1.2);
      setTimeout(function () {
        scheduleStop(oldNodes, fadeAt + 1.35);
        clearNodeList(oldNodes);
      }, 1400);
    }
    scheduleAmbient(floor);
  }

  function start() {
    if (!ensureContext()) return false;
    setFloor(1);
    return true;
  }

  function setEnabled(value) {
    enabled = !!value;
    if (!ensureContext()) return;
    master.gain.setTargetAtTime(enabled ? 0.65 : 0, now(), 0.03);
    if (enabled && !ambientActive) setFloor(currentTheme ? 1 : 1);
  }

  function playTone(frequency, duration, type, volume, delay) {
    if (!enabled || !ensureContext()) return;
    var startAt = now() + (delay || 0);
    var oscillator = context.createOscillator();
    var gain = context.createGain();
    oscillator.type = type || 'sine';
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume || 0.12, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(sfxBus);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  }

  function playStep() {
    playTone(105 + Math.random() * 30, 0.055, 'triangle', 0.025);
  }

  function playAttack() {
    playTone(165, 0.12, 'square', 0.07);
    playTone(95, 0.16, 'triangle', 0.06, 0.035);
  }

  function playAbility() {
    playTone(420, 0.15, 'sine', 0.07);
    playTone(630, 0.22, 'sine', 0.045, 0.08);
  }

  RK.Audio = {
    start: start,
    setFloor: setFloor,
    setEnabled: setEnabled,
    isEnabled: function () { return enabled; },
    playStep: playStep,
    playAttack: playAttack,
    playAbility: playAbility,
  };

  function isActiveNodeActive() {
    return activeAmbientGain !== null;
  }

  STATIC_BUSES = STATIC_BUSES;
})();
