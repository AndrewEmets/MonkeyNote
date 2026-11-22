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

const VELOCITY = 80;

/** Play notes on the MIDI keyboard (channel 1). Same shape as the audio engine's playback calls. */
export const midiOut = {
  name: () => pickOutput()?.name ?? null,
  available: () => !!pickOutput(),
  noteOn(midi) {
    pickOutput()?.send([0x90, midi, VELOCITY]);
  },
  noteOff(midi) {
    pickOutput()?.send([0x80, midi, 0]);
  },
  /** Notes together for `seconds`; note-offs are scheduled by the browser's MIDI clock. */
  play(midis, seconds) {
    const out = pickOutput();
    if (!out) return false;
    const off = performance.now() + seconds * 1000;
    for (const m of midis) out.send([0x90, m, VELOCITY]);
    for (const m of midis) out.send([0x80, m, 0], off);
    return true;
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
