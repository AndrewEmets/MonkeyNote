// Web MIDI input. Listens to every connected MIDI input and forwards notes to the input hub.
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

export function onMidiChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const emit = () => listeners.forEach((fn) => fn(midiStatus()));

function onMessage(e) {
  const [statusByte, note, velocity] = e.data;
  const command = statusByte & 0xf0;
  if (command === 0x90 && velocity > 0) {
    input.noteOn(note, "midi");
    midiRange.observe(note);
  }
  else if (command === 0x80 || (command === 0x90 && velocity === 0)) input.noteOff(note, "midi");
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
