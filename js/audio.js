// Small Web Audio instrument: an additive "piano", a soft sine voice, and an error thud.
// No samples are loaded; every note is synthesized.
//
// Browsers only start audio after a user gesture, so main.js calls audio.unlock() on clicks
// and key presses. Until then, playback calls are silently skipped.

let ctx = null;
let master = null;
let volume = 0.5;
let instrument = "piano";
const held = new Map(); // midi -> voice, for notes played from an input (released on note-off)
// Optional output that replaces the synth for notes (e.g. the MIDI keyboard's own sound). The error thud stays here.
let router = null;

const freq = (m) => 440 * 2 ** ((m - 69) / 12);
const MAX_PARTIAL_HZ = 16000;

function context(create = true) {
  if (!ctx && create) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    const limiter = ctx.createDynamicsCompressor(); // keeps big chords from clipping
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(limiter);
    limiter.connect(ctx.destination);
  }
  if (ctx?.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// Piano-like tone: decaying harmonics (slightly stretched, as on real strings); lower notes ring longer.
function pianoVoice(c, m, t, velocity) {
  const f = freq(m);
  const out = c.createGain();
  out.gain.value = 0.2 * velocity;
  const tone = c.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = Math.min(MAX_PARTIAL_HZ, f * (5 + 9 * velocity));
  tone.connect(out);
  const lowness = Math.max(0, Math.min(1, (88 - m) / 52));
  const oscs = [];
  [1, 0.55, 0.3, 0.18, 0.1, 0.06].forEach((amp, i) => {
    const n = i + 1;
    const hz = f * n * Math.sqrt(1 + 0.0004 * n * n);
    if (hz > MAX_PARTIAL_HZ) return;
    const osc = c.createOscillator();
    osc.frequency.value = hz;
    const g = c.createGain();
    const decay = (0.7 + 2.6 * lowness) / n ** 0.7;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.004, decay / 3);
    osc.connect(g).connect(tone);
    osc.start(t);
    oscs.push(osc);
  });
  return { out, oscs };
}

// Soft tone: sine with a touch of second harmonic and a gentle attack.
function softVoice(c, m, t, velocity) {
  const f = freq(m);
  const out = c.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(0.25 * velocity, t + 0.02);
  out.gain.setTargetAtTime(0, t + 0.02, 1.2);
  const oscs = [1, 0.15].map((amp, i) => {
    const osc = c.createOscillator();
    osc.frequency.value = f * (i + 1);
    const g = c.createGain();
    g.gain.value = amp;
    osc.connect(g).connect(out);
    osc.start(t);
    return osc;
  });
  return { out, oscs };
}

function startVoice(m, t, velocity) {
  const voice = (instrument === "soft" ? softVoice : pianoVoice)(ctx, m, t, velocity);
  voice.out.connect(master);
  return voice;
}

function releaseVoice(voice, t) {
  voice.out.gain.cancelScheduledValues(t);
  voice.out.gain.setTargetAtTime(0, t, 0.07);
  voice.oscs.forEach((o) => o.stop(t + 0.6));
}

const ready = () => !!ctx && ctx.state === "running";

export const audio = {
  /** Send notes elsewhere (an object with noteOn, noteOff, play), or null for the built-in synth. */
  setRouter(r) {
    router = r;
  },
  isRouted: () => !!router,
  /** Create or resume the audio context; call from a user gesture. */
  unlock: () => void context(),
  isRunning: ready,
  setVolume(v) {
    volume = v;
    if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
  },
  setInstrument(name) {
    instrument = name;
  },
  /** Start a note from an input; it sounds until noteOff (or decays). */
  noteOn(midi, velocity = 0.8) {
    if (router) return router.noteOn(midi);
    if (!context(false) || !ready()) return;
    const t = ctx.currentTime;
    if (held.has(midi)) releaseVoice(held.get(midi), t);
    held.set(midi, startVoice(midi, t, velocity));
  },
  noteOff(midi) {
    if (router) return router.noteOff(midi);
    const voice = held.get(midi);
    if (!voice) return;
    held.delete(midi);
    releaseVoice(voice, ctx.currentTime);
  },
  /** Play notes together (a note or a chord) for `duration` seconds. */
  play(midis, duration = 1.4, velocity = 0.75) {
    if (router) return router.play(midis, duration);
    if (!context(false) || !ready()) return false;
    const t = ctx.currentTime + 0.01;
    for (const m of midis) releaseVoice(startVoice(m, t, velocity), t + duration);
    return true;
  },
  /** Short low thud for wrong notes. */
  error() {
    if (!context(false) || !ready()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.16);
  },
};
