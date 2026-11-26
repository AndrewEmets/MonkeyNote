// Ranked difficulty levels: fixed notation settings everyone can compete on (locally for now).
// A test is ranked when its settings match a level, its length is a ranked length, notes are read
// normally (not memory or ear), and no hints were used. Anything else is "practice".
import { settings } from "./settings.js";

export const LEVELS = [
  {
    id: "beginner",
    text: "treble clef, C major, no ledger lines, single notes, small steps",
    settings: { clef: "treble", keySignature: 0, accidentals: "diatonic", ledgerLines: 0, maxLeap: 2, chords: false },
  },
  {
    id: "intermediate",
    text: "grand staff, keys up to 2 sharps or flats, 2 ledger lines, single notes",
    settings: { clef: "grand", keySignature: "random2", accidentals: "diatonic", ledgerLines: 2, maxLeap: 4, chords: false },
  },
  {
    id: "advanced",
    text: "grand staff, any key, chromatic, 3 ledger lines, chords",
    settings: { clef: "grand", keySignature: "random", accidentals: "chromatic", ledgerLines: 3, maxLeap: 7, chords: true, chordStyle: "random", maxChordNotes: 3, chordPower: 1 },
  },
  {
    id: "expert",
    text: "grand staff, any key, chromatic, 4 ledger lines, dense chords",
    settings: { clef: "grand", keySignature: "random", accidentals: "chromatic", ledgerLines: 4, maxLeap: "any", chords: true, chordStyle: "random", maxChordNotes: 4, chordPower: 0.5 },
  },
];

/** Test lengths that count for ranking. */
export const RANKED_LENGTHS = { notes: [16, 32], time: [30, 60] };

/** The level whose notation settings match cfg exactly, or null. */
export function matchingLevel(cfg) {
  return LEVELS.find((level) => Object.entries(level.settings).every(([key, value]) => cfg[key] === value)) ?? null;
}

/** Why a test with these settings is or isn't ranked: { level, ranked, reason }. */
export function rankStatus(cfg, { hints = false } = {}) {
  const level = matchingLevel(cfg);
  if (!level) return { level: null, ranked: false, reason: "custom settings" };
  const lengthKey = { notes: "notesCount", time: "timeLimit" }[cfg.mode];
  if (!lengthKey || !RANKED_LENGTHS[cfg.mode].includes(cfg[lengthKey])) return { level, ranked: false, reason: "ranked lengths: notes 16/32, time 30/60" };
  if (cfg.memory || cfg.ear) return { level, ranked: false, reason: "memory and ear aren't ranked" };
  if (hints) return { level, ranked: false, reason: "key-light hints are on" };
  return { level, ranked: true, reason: "" };
}

// Your own ("custom") settings are remembered when you switch to a level, so "custom" brings them back.
const CUSTOM_KEY = "monkeynote.customSettings";
// (memory and ear first: restoring them switches presentation before the rest is restored)
const LEVEL_KEYS = ["memory", "ear", ...new Set(LEVELS.flatMap((l) => Object.keys(l.settings)))];

let remembered = (() => {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY));
  } catch {
    return null;
  }
})();

function saveCustom() {
  remembered = Object.fromEntries(LEVEL_KEYS.map((k) => [k, settings.get(k)]));
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(remembered));
  } catch {
    // storage unavailable: remembered for this page view only
  }
}

/** Switch to a level's settings (the test restarts once). Leaving custom settings remembers them. */
export function applyLevel(id) {
  const level = LEVELS.find((l) => l.id === id);
  if (!level) return;
  if (!matchingLevel(settings.all())) saveCustom();
  // Presentation first: switching it brings back that presentation's own settings (profiles.js).
  settings.set("memory", false);
  settings.set("ear", false);
  for (const [key, value] of Object.entries(level.settings)) settings.set(key, value);
}

/** Back to the settings you had before picking a level (if any were remembered). */
export function restoreCustom() {
  if (!matchingLevel(settings.all()) || !remembered) return;
  for (const key of LEVEL_KEYS) if (key in remembered) settings.set(key, remembered[key]);
}
