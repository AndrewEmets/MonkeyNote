// Settings store: defaults, validation, localStorage persistence, change subscriptions.
import { THEMES } from "./data/themes.js";

const STORAGE_KEY = "monkeynote.settings";

// Allowed values per setting. The first-listed default lives in DEFAULTS.
export const OPTIONS = {
  // test config bar
  mode: ["notes", "time", "attack", "zen"],
  notesCount: [10, 25, 50, 100],
  timeLimit: [15, 30, 60, 120],
  chords: [false, true],
  memory: [false, true],
  ear: [false, true],
  // input
  chordWindow: [50, 100, 150, 250],
  ignoreOctave: ["off", "keyboard", "all"],
  onScreenKeyboard: [false, true],
  keyLabels: [false, true],
  // sound
  playOnPress: ["off", "nomidi", "all"],
  instrument: ["piano", "soft"],
  volume: [0.25, 0.5, 0.75, 1],
  errorSound: [false, true],
  earReference: [false, true],
  // notation
  clef: ["treble", "bass", "grand"],
  keySignature: ["random", 0, 1, 2, 3, 4, 5, 6, 7, -1, -2, -3, -4, -5, -6, -7],
  accidentals: ["diatonic", "chromatic"],
  ledgerLines: [0, 1, 2, 3, 4],
  maxLeap: [1, 2, 3, 4, 7, "any"],
  chordStyle: ["random", "triads", "sevenths", "both"],
  maxChordNotes: [2, 3, 4, 5],
  noteNames: [false, true],
  // appearance
  noteSize: ["small", "medium", "large", "xl"],
  staffLines: [1, 2, 3],
  caretStyle: ["off", "line", "block", "outline", "underline"],
  smoothCaret: [false, true],
  fontFamily: ["Roboto Mono", "Lexend Deca", "Fira Code", "Source Code Pro", "Nunito"],
};

export const DEFAULTS = {
  mode: "notes",
  notesCount: 25,
  timeLimit: 30,
  chords: false,
  memory: false,
  ear: false,
  chordWindow: 100,
  ignoreOctave: "keyboard",
  onScreenKeyboard: false,
  keyLabels: true,
  playOnPress: "nomidi",
  instrument: "piano",
  volume: 0.5,
  errorSound: false,
  earReference: true,
  clef: "treble",
  keySignature: 0,
  accidentals: "diatonic",
  ledgerLines: 2,
  maxLeap: 7,
  chordStyle: "random",
  maxChordNotes: 3,
  noteNames: false,
  noteSize: "medium",
  staffLines: 2,
  caretStyle: "line",
  smoothCaret: true,
  fontFamily: "Roboto Mono",
  theme: "serika_dark",
};

const isValid = (key, value) => (key === "theme" ? Object.hasOwn(THEMES, value) : OPTIONS[key]?.includes(value) ?? false);

function load() {
  const values = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    for (const key in DEFAULTS) if (key in saved && isValid(key, saved[key])) values[key] = saved[key];
  } catch {
    // unreadable or blocked storage: fall back to defaults
  }
  return values;
}

function save(values) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // storage unavailable: settings last for this page view only
  }
}

let values = load();
const listeners = new Set();

export const settings = {
  get: (key) => values[key],
  all: () => ({ ...values }),
  set(key, value) {
    if (!isValid(key, value) || values[key] === value) return;
    values = { ...values, [key]: value };
    save(values);
    for (const fn of listeners) fn(key, value);
  },
  reset() {
    const changed = Object.keys(DEFAULTS).filter((k) => values[k] !== DEFAULTS[k]);
    values = { ...DEFAULTS };
    save(values);
    for (const key of changed) for (const fn of listeners) fn(key, values[key]);
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
