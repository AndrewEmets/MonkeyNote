// The connected MIDI keyboard's key range. Browsers can't ask a keyboard for its size, so the
// range is learned from the keys you play, or set explicitly (preset or detect) in settings.
// Notes outside the range are accepted in any octave (see engine.js).
// Stored apart from settings: it describes your hardware, so "reset settings" leaves it alone.

const STORAGE_KEY = "monkeynote.midiRange";
const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
// A learned range is only trusted once it spans two octaves (the smallest common keyboard, 25 keys),
// so the first few notes you play don't make everything else "out of range".
const MIN_LEARNED_SPAN = 24;

export const PRESETS = [
  { keys: 25, low: 48, high: 72 }, // C3–C5
  { keys: 37, low: 48, high: 84 }, // C3–C6
  { keys: 49, low: 36, high: 84 }, // C2–C6
  { keys: 61, low: 36, high: 96 }, // C2–C7
  { keys: 76, low: 28, high: 103 }, // E1–G7
  { keys: 88, low: 21, high: 108 }, // A0–C8
];

export const midiName = (m) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

function load() {
  try {
    const r = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (r && Number.isInteger(r.low) && Number.isInteger(r.high) && r.low <= r.high) return { low: r.low, high: r.high, manual: !!r.manual };
  } catch {
    // unreadable storage: start unknown
  }
  return null;
}

let range = load(); // { low, high, manual } or null
let detecting = null; // { first: midi | null, onStep, onDone }
const listeners = new Set();

function store(next) {
  range = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable: the range lasts for this page view
  }
  listeners.forEach((fn) => fn(range));
}

export const midiRange = {
  get: () => range,
  /** True when the range is known well enough to act on. */
  isKnown: () => !!range && (range.manual || range.high - range.low >= MIN_LEARNED_SPAN),
  /** True if a note can't be played on this keyboard (only when the range is known). */
  isOutside(midi) {
    return this.isKnown() && (midi < range.low || midi > range.high);
  },
  /** Called for every MIDI note-on: feeds detection, or widens a learned range. */
  observe(midi) {
    if (detecting) {
      if (detecting.first === null) {
        detecting.first = midi;
        detecting.onStep?.(midi);
      } else {
        const { first, onDone } = detecting;
        detecting = null;
        store({ low: Math.min(first, midi), high: Math.max(first, midi), manual: true });
        onDone?.(range);
      }
      return;
    }
    if (range?.manual) return;
    if (!range) store({ low: midi, high: midi, manual: false });
    else if (midi < range.low || midi > range.high) store({ low: Math.min(range.low, midi), high: Math.max(range.high, midi), manual: false });
  },
  setPreset(keys) {
    const p = PRESETS.find((x) => x.keys === keys);
    if (p) store({ low: p.low, high: p.high, manual: true });
  },
  /** Forget the range (e.g. after switching keyboards) and learn it again from playing. */
  reset() {
    detecting = null;
    store(null);
  },
  /** Next two notes played become the lowest and highest keys. */
  detect({ onStep, onDone }) {
    detecting = { first: null, onStep, onDone };
  },
  cancelDetect() {
    detecting = null;
  },
  isDetecting: () => !!detecting,
  describe() {
    if (!range) return "not known yet: play your lowest and highest keys, or set it here";
    const span = `${midiName(range.low)}–${midiName(range.high)} (${range.high - range.low + 1} keys)`;
    if (range.manual) return `${span}, set manually`;
    return this.isKnown() ? `${span}, learned while playing` : `learning… seen ${span} so far`;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
