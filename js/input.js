// Input hub: every note source (MIDI, computer keyboard, on-screen piano) reports here.
// Listeners get { type: "on" | "off", midi, source, time }.

const listeners = new Set();
const held = new Map(); // midi -> Set of sources holding it

function emit(type, midi, source) {
  const event = { type, midi, source, time: performance.now() };
  for (const fn of listeners) fn(event);
}

export const input = {
  noteOn(midi, source) {
    if (!held.has(midi)) held.set(midi, new Set());
    held.get(midi).add(source);
    emit("on", midi, source);
  },
  noteOff(midi, source) {
    const sources = held.get(midi);
    if (!sources?.delete(source)) return;
    if (!sources.size) held.delete(midi);
    emit("off", midi, source);
  },
  releaseAll(source) {
    for (const [midi, sources] of [...held]) if (sources.has(source)) this.noteOff(midi, source);
  },
  isHeld: (midi) => held.has(midi),
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
