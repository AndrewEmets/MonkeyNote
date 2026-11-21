// Labels and descriptions for every setting, shared by the settings page and the command palette.
// Allowed values live in settings.js (OPTIONS).
import { KEYS } from "./music.js";

const onOff = { false: "off", true: "on" };

export const DEFS = {
  // test bar
  mode: { title: "mode", icon: "note", text: "Kind of test." },
  notesCount: { title: "notes count", icon: "note", text: "Notes per test in notes mode." },
  timeLimit: { title: "time limit", icon: "clock", text: "Seconds per test in time mode.", labels: { 15: "15s", 30: "30s", 60: "60s", 120: "120s" } },
  attackSpeed: { title: "attack speed", icon: "bolt", text: "Starting speed in attack mode (notes per minute).", labels: { 20: "20 npm", 30: "30 npm", 45: "45 npm", 60: "60 npm" } },
  chords: { title: "chords", icon: "chords", text: "Play chords instead of single notes.", labels: onOff },
  memory: { title: "memory", icon: "eyeOff", text: "Notes fade once you start a line.", labels: onOff },
  ear: { title: "ear", icon: "ear", text: "Hear notes instead of reading them.", labels: onOff },

  // input
  chordWindow: { title: "chord window", icon: "timer", text: "How close together (ms) chord notes must land when they aren't held down together.", labels: { 50: "50ms", 100: "100ms", 150: "150ms", 250: "250ms" } },
  ignoreOctave: { title: "ignore octave", icon: "octave", text: "Accept the right note in any octave. Useful for the computer keyboard, which spans only about two and a half octaves.", labels: { keyboard: "keyboard only", all: "all inputs" } },
  onScreenKeyboard: { title: "on-screen keyboard", icon: "piano", text: "Show a clickable piano under the staff. Works with touch too.", labels: onOff },
  keyLabels: { title: "key labels", icon: "keyboard", text: "Show which computer key plays each note on the on-screen keyboard.", labels: onOff },

  // sound
  playOnPress: { title: "play notes you press", icon: "volume", text: "Sound for the notes you play. MIDI keyboards with their own speakers don't need it.", labels: { nomidi: "keyboard & screen", all: "all inputs" } },
  instrument: { title: "instrument", icon: "piano", text: "Tone used for your notes and for ear mode." },
  volume: { title: "volume", icon: "volume", text: "Volume of all sounds.", labels: { 0.25: "25%", 0.5: "50%", 0.75: "75%", 1: "100%" } },
  errorSound: { title: "error sound", icon: "warning", text: "A short thud when you play a wrong note.", labels: onOff },
  earReference: { title: "ear mode reference", icon: "ear", text: "Show the first note in ear mode, so you have a known pitch to hear the rest against.", labels: onOff },

  // notation
  clef: { title: "clef", icon: "clef", text: "Staff to read from. Grand staff shows treble and bass together, like piano music.", labels: { grand: "grand staff" } },
  keySignature: {
    title: "key signature",
    icon: "key",
    text: "Key of the generated notes. Random picks a new key every test.",
    labels: Object.fromEntries([["random", "random"], ...KEYS.map((k) => [k.fifths, k.name])]),
    wide: true,
  },
  accidentals: { title: "accidentals", icon: "sharp", text: "Diatonic keeps every note in the key. Chromatic adds sharps, flats and naturals outside it." },
  ledgerLines: { title: "ledger lines", icon: "lines", text: "How many ledger lines notes may use above and below the staff." },
  maxLeap: { title: "max leap", icon: "octave", text: "Largest jump between one note (or chord) and the next. Smaller leaps read more like real melodies.", labels: { 1: "2nd", 2: "3rd", 3: "4th", 4: "5th", 7: "octave" } },
  chordStyle: { title: "chord style", icon: "chords", text: "Random stacks notes freely. Triads and sevenths are the key's own chords, in root position and every inversion.", labels: { both: "triads + 7ths" } },
  maxChordNotes: { title: "max chord notes", icon: "chords", text: "Largest random chord when chords are turned on in the test bar. (Triads have 3 notes, sevenths 4.)" },
  noteNames: { title: "note names", icon: "font", text: "Write each note's name next to it. A helper while you learn to read; turn it off as you improve.", labels: onOff },

  // appearance
  noteSize: { title: "note size", icon: "size", text: "Size of the staff and notes." },
  staffLines: { title: "staff lines", icon: "lines", text: "How many lines of notes to show at once, so you can read ahead." },
  caretStyle: { title: "caret style", icon: "caret", text: "Shape of the marker on the note to play next.", labels: { line: "|", block: "▮", outline: "▯", underline: "_" } },
  smoothCaret: { title: "smooth caret", icon: "wave", text: "Animate the caret as it moves between notes.", labels: onOff },
  flipColors: { title: "flip test colors", icon: "eye", text: "Show notes still to play in the bright text color and played notes dimmed.", labels: onOff },
  fontFamily: { title: "font family", icon: "font", text: "Font used across the interface.", wide: true },

  // theme
  randomTheme: { title: "random theme", icon: "palette", text: "Pick a random theme every time a test starts.", labels: onOff },
};

/** Display label for one value of a setting. */
export const valueLabel = (key, value) => DEFS[key]?.labels?.[value] ?? String(value);
