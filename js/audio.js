(function () {
  var context = null;
  var master = null;
  var ambientNodes = [];
  var enabled = true;

  function ensureContext() {
    if (context) return true;
    var AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType) return false;
    context = new AudioContextType();
    master = context.createGain();
    master.gain.value = enabled ? 0.65 : 0;
    master.connect(context.destination);
    return true;
  }

  function playTone(frequency, duration, type, volume, delay) {
    if (!enabled || !ensureContext()) return;
    var start = context.currentTime + (delay || 0);
    var oscillator = context.createOscillator();
    var gain = context.createGain();
    oscillator.type = type || 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume || 0.12, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function stopAmbient() {
    for (var i = 0; i < ambientNodes.length; i++) {
      ambientNodes[i].stop();
    }
    ambientNodes = [];
  }

  function setFloor(floor) {
    if (!ensureContext()) return;
    stopAmbient();
    var themes = [
      { notes: [130.81, 164.81, 196, 261.63] },
      { notes: [174.61, 220, 261.63, 349.23] },
      { notes: [146.83, 196, 220, 293.66] },
    ];
    var theme = themes[floor <= 3 ? 0 : (floor <= 6 ? 1 : 2)];
    for (var i = 0; i < theme.notes.length; i++) {
      var oscillator = context.createOscillator();
      var gain = context.createGain();
      var start = context.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.value = theme.notes[i];
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.018 / (i + 1), start + 2.5);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start();
      ambientNodes.push(oscillator);
    }
  }

  function start() {
    if (!ensureContext()) return false;
    setFloor(1);
    return true;
  }

  function setEnabled(value) {
    enabled = !!value;
    if (!ensureContext()) return;
    master.gain.setTargetAtTime(enabled ? 0.65 : 0, context.currentTime, 0.03);
    if (enabled && !ambientNodes.length) setFloor(1);
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
})();
