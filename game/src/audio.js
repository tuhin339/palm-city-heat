// Every sound in Palm City is synthesized: no audio files, just oscillators and filtered
// noise shaped in code. An engine hum that follows the player's car, a two-tone siren that
// swells as a patrol car closes in, and one-shot voices for shots, crashes, pickups, phone
// buzzes and paydays. The context only starts on a player's first gesture, as browsers
// require; outside a browser (the headless checks) the whole module quietly does nothing.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let engine = null;
  let siren = null;
  let muted = false;
  let lastShake = 0;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    startEngine();
    startSiren();
  }

  function startEngine() {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 52;
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 26;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start();
    sub.start();
    engine = { osc, sub, gain };
  }

  function startSiren() {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 780;
    // A slow square LFO stepping the pitch between the two tones of the wail.
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 150;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    lfo.start();
    siren = { gain };
  }

  function noiseBurst(duration, filterType, frequency, gainValue, when = 0) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    const t = ctx.currentTime + when;
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
    source.stop(t + duration + 0.05);
  }

  function tone(type, from, to, duration, gainValue, when = 0) {
    const osc = ctx.createOscillator();
    osc.type = type;
    const gain = ctx.createGain();
    const t = ctx.currentTime + when;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  function play(name) {
    if (!ctx) return;
    if (name === 'shot') {
      noiseBurst(0.09, 'highpass', 900, 0.1);
      tone('square', 160, 42, 0.08, 0.07);
    } else if (name === 'crash') {
      noiseBurst(0.24, 'lowpass', 320, 0.2);
      tone('sine', 90, 34, 0.22, 0.14);
    } else if (name === 'pickup') {
      tone('sine', 840, 840, 0.07, 0.08);
      tone('sine', 1260, 1260, 0.09, 0.08, 0.07);
    } else if (name === 'complete') {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      for (let i = 0; i < notes.length; i += 1) tone('triangle', notes[i], notes[i], 0.16, 0.09, i * 0.09);
    } else if (name === 'phone') {
      tone('square', 190, 190, 0.09, 0.045);
      tone('square', 190, 190, 0.09, 0.045, 0.16);
    } else if (name === 'busted') {
      tone('sawtooth', 220, 52, 0.55, 0.11);
    } else if (name === 'wasted') {
      tone('sawtooth', 160, 38, 0.75, 0.11);
    }
  }

  /**
   * Per-frame levels: the engine follows the car the player is driving, the siren follows
   * the nearest patrol car, and a sudden jump in the game's shake counter is a crash
   * nobody announced — the renderer already shakes for exactly those moments.
   */
  function update(game) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const car = game.player.car;
    if (engine) {
      if (car) {
        const speed = Math.hypot(car.vx, car.vy);
        const load = Math.min(1, speed / 430);
        engine.osc.frequency.setTargetAtTime(52 + load * 128, t, 0.06);
        engine.sub.frequency.setTargetAtTime(26 + load * 64, t, 0.06);
        engine.gain.gain.setTargetAtTime(0.042, t, 0.09);
      } else {
        engine.gain.gain.setTargetAtTime(0, t, 0.09);
      }
    }
    if (siren) {
      let nearest = Infinity;
      for (const cop of game.cops) {
        const distance = Math.hypot(cop.x - game.player.x, cop.y - game.player.y);
        if (distance < nearest) nearest = distance;
      }
      const level = game.wanted && game.wanted.stars > 0 && nearest < 780
        ? 0.032 * (1 - nearest / 780)
        : 0;
      siren.gain.gain.setTargetAtTime(level, t, 0.12);
    }
    if (game.shake > lastShake + 1.6) play('crash');
    lastShake = game.shake;
  }

  function setMuted(value) {
    muted = value;
    if (master) master.gain.value = value ? 0 : 0.9;
  }

  return { unlock, update, play, setMuted };
}
