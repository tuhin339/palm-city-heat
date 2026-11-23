// Every sound in the 3D city is synthesized, like the 2D game's: oscillators and
// filtered noise, no audio files. One-shot voices for shots, hits, crashes, cash,
// pickups, phone buzzes and Marisol's paydays, a two-tone siren chirp when the
// heat rises, and a soft siren loop that swells as the nearest patrol car closes
// in. The context only starts on a player's first gesture, as browsers require;
// outside a browser (the headless checks) the module quietly does nothing.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let siren = null;
  let muted = false;

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
    startSiren();
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
    } else if (name === 'hit') {
      noiseBurst(0.05, 'bandpass', 2200, 0.09);
      tone('square', 320, 140, 0.05, 0.05);
    } else if (name === 'crash') {
      noiseBurst(0.24, 'lowpass', 320, 0.2);
      tone('sine', 90, 34, 0.22, 0.14);
    } else if (name === 'cash') {
      tone('sine', 990, 990, 0.07, 0.09);
      tone('sine', 1320, 1320, 0.1, 0.09, 0.07);
    } else if (name === 'pickup') {
      tone('sine', 840, 840, 0.07, 0.08);
      tone('sine', 1260, 1260, 0.09, 0.08, 0.07);
    } else if (name === 'complete') {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      for (let i = 0; i < notes.length; i += 1) tone('triangle', notes[i], notes[i], 0.16, 0.09, i * 0.09);
    } else if (name === 'phone') {
      tone('square', 190, 190, 0.09, 0.045);
      tone('square', 190, 190, 0.09, 0.045, 0.16);
    } else if (name === 'siren') {
      // A single two-tone chirp: the radio just said Danny's name.
      tone('triangle', 700, 700, 0.14, 0.07);
      tone('triangle', 950, 950, 0.14, 0.07, 0.15);
      tone('triangle', 700, 700, 0.14, 0.07, 0.3);
    } else if (name === 'busted') {
      tone('sawtooth', 220, 52, 0.55, 0.11);
    } else if (name === 'wasted') {
      tone('sawtooth', 160, 38, 0.75, 0.11);
    }
  }

  /** Per-frame: the siren loop follows the nearest patrol car while wanted. */
  function update(nearestCopDistance, stars) {
    if (!ctx || !siren) return;
    const level = stars > 0 && nearestCopDistance < 80
      ? 0.03 * (1 - nearestCopDistance / 80)
      : 0;
    siren.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.12);
  }

  function setMuted(value) {
    muted = value;
    if (master) master.gain.value = value ? 0 : 0.9;
  }

  return {
    unlock,
    play,
    update,
    setMuted,
    get muted() { return muted; },
  };
}
