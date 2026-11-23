// Web MIDI. Listens to every connected MIDI input and forwards notes to the input hub, and can play
// notes on the keyboard itself (its own sound, e.g. through headphones plugged into it).
import { input } from "./input.js";
import { notify } from "./notify.js";
import { midiRange } from "./midi-range.js";

let access = null;
let status = "unsupported"; // unsupported | pending | denied | ready
const listeners = new Set();
let connected = new Set();

const deviceNames = () =>
  access ? [...access.inputs.values()].filter((i) => i.state === "connected").map((i) => i.name || "unnamed device") : [];

export const midiStatus = () => ({ status, devices: deviceNames() });

/** The output to play on: the one named like a connected input (the same keyboard), else the first. */
function pickOutput() {
  if (!access) return null;
  const outs = [...access.outputs.values()].filter((o) => o.state === "connected");
  const inputs = deviceNames();
  return outs.find((o) => inputs.includes(o.name)) ?? outs[0] ?? null;
}

const FULL_VELOCITY = 110;
const ERROR_DRUM = 36; // GM bass drum (kick)
let velocity = Math.round(FULL_VELOCITY * 0.5); // follows the volume setting
let errorVelocity = 127; // the error drum, louder than notes (it's short and low)

/** Play notes on the MIDI keyboard (channel 1). Same shape as the audio engine's playback calls. */
export const midiOut = {
  name: () => pickOutput()?.name ?? null,
  available: () => !!pickOutput(),
  /** Volume 0..1 sets the note velocity (0 = silent: notes aren't sent). */
  setVolume(v) {
    velocity = Math.round(FULL_VELOCITY * v);
    errorVelocity = Math.round(127 * Math.min(1, 2 * v));
  },
  noteOn(midi) {
    if (velocity > 0) pickOutput()?.send([0x90, midi, velocity]);
  },
  noteOff(midi) {
    pickOutput()?.send([0x80, midi, 0]);
  },
  /** Wrong-note sound: a drum on the General MIDI percussion channel (10). */
  error() {
    const out = pickOutput();
    if (!out || errorVelocity === 0) return;
    out.send([0x99, ERROR_DRUM, errorVelocity]);
    out.send([0x89, ERROR_DRUM, 0], performance.now() + 150);
  },
  /** Notes together for `seconds`; note-offs are scheduled by the browser's MIDI clock. */
  play(midis, seconds) {
    const out = pickOutput();
    if (!out) return false;
    if (velocity === 0) return true;
    const off = performance.now() + seconds * 1000;
    for (const m of midis) out.send([0x90, m, velocity]);
    for (const m of midis) out.send([0x80, m, 0], off);
    return true;
  },
};

/**
 * Key lights on keyboards that light keys for notes received on a "guide" channel, e.g. Casio's
 * MIDI IN Navigate (channel 4 = right hand, 3 = left hand by default). Notes are sent at the lowest
 * velocity in case that channel also sounds.
 */
export const keyLights = {
  channel: 4,
  lit: new Set(),
  muted: null, // channel whose volume we turned down, so lit notes stay silent
  setChannel(ch) {
    if (ch === this.channel) return;
    this.clear();
    this.unmute();
    this.channel = ch;
  },
  /** Light exactly these keys (turning off any others). */
  show(midis) {
    const out = pickOutput();
    if (!out) return false;
    this.mute(out);
    const want = new Set(midis);
    for (const m of this.lit) if (!want.has(m)) out.send([0x80 | (this.channel - 1), m, 0]);
    for (const m of want) if (!this.lit.has(m)) out.send([0x90 | (this.channel - 1), m, 1]);
    this.lit = want;
    return true;
  },
  clear() {
    const out = pickOutput();
    if (out) for (const m of this.lit) out.send([0x80 | (this.channel - 1), m, 0]);
    this.lit = new Set();
  },
  // The guide channel also sounds its notes; channel volume (CC 7) and expression (CC 11) at 0
  // silence it while the lights still follow the notes. Restored when lights are turned off.
  mute(out) {
    if (this.muted === this.channel) return;
    out.send([0xb0 | (this.channel - 1), 7, 0]);
    out.send([0xb0 | (this.channel - 1), 11, 0]);
    this.muted = this.channel;
  },
  unmute() {
    const out = pickOutput();
    if (out && this.muted !== null) {
      out.send([0xb0 | (this.muted - 1), 7, 100]);
      out.send([0xb0 | (this.muted - 1), 11, 127]);
    }
    this.muted = null;
  },
};

export function onMidiChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const emit = () => listeners.forEach((fn) => fn(midiStatus()));

const SUSTAIN_CC = 64;
let pedalDown = false;

function onMessage(e) {
  const [statusByte, data1, data2] = e.data;
  const command = statusByte & 0xf0;
  if (command === 0x90 && data2 > 0) {
    input.noteOn(data1, "midi");
    midiRange.observe(data1);
  } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
    input.noteOff(data1, "midi");
  } else if (command === 0xb0 && data1 === SUSTAIN_CC) {
    // Sustain pedal: report presses only (value crossing the halfway point).
    const down = data2 >= 64;
    if (down && !pedalDown) input.control("pedal", "midi");
    pedalDown = down;
  }
}

function bindInputs() {
  for (const port of access.inputs.values()) port.onmidimessage = onMessage;
  const now = new Set(deviceNames());
  for (const name of now) if (!connected.has(name)) notify(`midi connected: ${name}`);
  for (const name of connected) if (!now.has(name)) notify(`midi disconnected: ${name}`);
  if (connected.size && !now.size) input.releaseAll("midi");
  connected = now;
  emit();
}

export async function initMidi() {
  if (!navigator.requestMIDIAccess) return emit();
  status = "pending";
  emit();
  try {
    access = await navigator.requestMIDIAccess();
    status = "ready";
    access.onstatechange = bindInputs;
    bindInputs();
  } catch {
    status = "denied";
    emit();
  }
}
