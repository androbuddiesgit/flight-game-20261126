// Sound, synthesized live with WebAudio — no audio files, no network. The engine is
// two detuned oscillators through a low-pass filter, its pitch following throttle and
// speed; wind is looped filtered noise; rings, drops, landings and crashes are short
// one-shot phrases. Everything is created on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc1 = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) {
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);

      engineOsc1 = ctx.createOscillator();
      engineOsc1.type = 'sawtooth';
      engineOsc1.frequency.value = 52;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 104;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc1.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc1.start();
      engineOsc2.start();

      const length = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      windSource = ctx.createBufferSource();
      windSource.buffer = buffer;
      windSource.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSource.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  // Called every frame while flying: engine note and wind follow the plane.
  function update(throttle, speed, airborne) {
    if (!started || !ctx) return;
    const t = ctx.currentTime;
    const base = 46 + throttle * 42 + speed * 0.35;
    engineOsc1.frequency.setTargetAtTime(base, t, 0.08);
    engineOsc2.frequency.setTargetAtTime(base * 2.02, t, 0.08);
    engineFilter.frequency.setTargetAtTime(240 + throttle * 700, t, 0.1);
    engineGain.gain.setTargetAtTime(airborne ? 0.05 + throttle * 0.075 : 0.02 + throttle * 0.05, t, 0.1);
    windGain.gain.setTargetAtTime(airborne ? Math.min(0.14, speed * 0.0016) : 0, t, 0.15);
  }

  function tone(freq, at, dur, type, vol) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime + at);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(ctx.currentTime + at);
    osc.stop(ctx.currentTime + at + dur + 0.05);
  }

  function chime(notes) {
    if (!ensure()) return;
    notes.forEach(([freq, at, dur], i) => tone(freq, at, dur, i === 0 ? 'sine' : 'triangle', 0.22));
  }

  function ring() {
    chime([[880, 0, 0.18], [1174, 0.09, 0.2], [1568, 0.18, 0.34]]);
  }
  function drop() {
    chime([[392, 0, 0.16], [523, 0.1, 0.3]]);
  }
  function land() {
    chime([[523, 0, 0.2], [659, 0.1, 0.2], [784, 0.2, 0.4]]);
  }
  function crash() {
    if (!ensure()) return;
    const length = ctx.sampleRate * 0.7;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
    tone(70, 0, 0.6, 'sine', 0.3);
  }
  function stallWarn() {
    chime([[220, 0, 0.12], [220, 0.18, 0.12]]);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  return { ensure, update, ring, drop, land, crash, stallWarn, toggleMute };
}
