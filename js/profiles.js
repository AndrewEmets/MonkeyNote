// Separate test settings per presentation (default / memory / ear), since each is a different kind of
// difficulty: switching presentation saves the current settings to the one you leave and brings back
// the ones you last used in the other. A presentation used for the first time starts from the current ones.
import { settings } from "./settings.js";

const STORAGE_KEY = "monkeynote.profiles";

/** Settings kept per presentation: what you play (mode, length) and how hard it reads (notation). */
export const PROFILE_KEYS = [
  "mode", "notesCount", "timeLimit", "attackSpeed",
  "clef", "keySignature", "accidentals", "ledgerLines", "maxLeap",
  "chords", "chordStyle", "maxChordNotes", "chordPower",
];

export const presentationOf = (s) => (s.ear ? "ear" : s.memory ? "memory" : "default");

let profiles = {};
let current = null;

const snapshot = () => Object.fromEntries(PROFILE_KEYS.map((k) => [k, settings.get(k)]));

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    // storage unavailable: profiles last for this page view
  }
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

/** The settings saved for a presentation, or null if it hasn't been used yet. */
export const profileOf = (presentation) => profiles[presentation] ?? null;

let started = false;

/** Start keeping profiles (once, at startup). */
export function initProfiles() {
  if (started) return;
  started = true;
  profiles = load();
  current = presentationOf(settings.all());
  profiles[current] = snapshot();
  save();
  settings.subscribe(onChange);
}

function onChange(key, value) {
  if (settings.isResetting()) {
    // "reset settings": every presentation starts over from the defaults
    current = presentationOf(settings.all());
    profiles = { [current]: snapshot() };
    return save();
  }
  if (key === "memory" || key === "ear") {
    const next = presentationOf(settings.all());
    if (next === current) return;
    current = next;
    const saved = profiles[next];
    if (saved) for (const k of PROFILE_KEYS) if (k in saved) settings.set(k, saved[k]); // (invalid values are ignored)
    profiles[next] = snapshot();
    return save();
  }
  if (PROFILE_KEYS.includes(key)) {
    profiles[current] = { ...profiles[current], [key]: value };
    save();
  }
}
