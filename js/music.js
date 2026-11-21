// Pitch model, key signatures and note generation.
//
// A pitch is { step: 0..6 (C..B), alter: -2..2, octave } with scientific octave numbers (C4 = middle C).
// The "diatonic index" d = octave * 7 + step gives a pitch's vertical staff position.

export const STEP_NAMES = ["C", "D", "E", "F", "G", "A", "B"];
const STEP_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F

// bottom: diatonic index of the bottom staff line. glyphAt: line the clef glyph's origin sits on.
export const CLEFS = {
  treble: { bottom: 30, glyph: "gClef", glyphAt: 32 }, // E4 bottom line, G4 clef line
  bass: { bottom: 18, glyph: "fClef", glyphAt: 24 }, // G2 bottom line, F3 clef line
};

export const KEYS = [
  { fifths: 0, name: "C" },
  { fifths: 1, name: "G" },
  { fifths: 2, name: "D" },
  { fifths: 3, name: "A" },
  { fifths: 4, name: "E" },
  { fifths: 5, name: "B" },
  { fifths: 6, name: "F♯" },
  { fifths: 7, name: "C♯" },
  { fifths: -1, name: "F" },
  { fifths: -2, name: "B♭" },
  { fifths: -3, name: "E♭" },
  { fifths: -4, name: "A♭" },
  { fifths: -5, name: "D♭" },
  { fifths: -6, name: "G♭" },
  { fifths: -7, name: "C♭" },
];

export const keyName = (fifths) => `${KEYS.find((k) => k.fifths === fifths).name} major`;

export const pitchFromDiatonic = (d, alter = 0) => ({ step: ((d % 7) + 7) % 7, octave: Math.floor(d / 7), alter });
export const diatonicOf = (p) => p.octave * 7 + p.step;
export const midiOf = (p) => 12 * (p.octave + 1) + STEP_SEMITONES[p.step] + p.alter;

const ALTER_SIGNS = { "-2": "𝄫", "-1": "♭", 0: "", 1: "♯", 2: "𝄪" };
export const pitchName = (p) => `${STEP_NAMES[p.step]}${ALTER_SIGNS[p.alter]}${p.octave}`;

/** Alteration the key signature applies to a step. */
export function keyAlter(fifths, step) {
  if (fifths > 0) return SHARP_ORDER.indexOf(step) < fifths ? 1 : 0;
  if (fifths < 0) return FLAT_ORDER.indexOf(step) < -fifths ? -1 : 0;
  return 0;
}

// Staff positions (diatonic index, treble clef) of key signature accidentals, in order.
const SHARP_POSITIONS = [38, 35, 39, 36, 33, 37, 34]; // F5 C5 G5 D5 A4 E5 B4
const FLAT_POSITIONS = [34, 37, 33, 36, 32, 35, 31]; // B4 E5 A4 D5 G4 C5 F4

/** Key signature accidentals for a staff: [{ d, alter }]. */
export function keySignature(fifths, staff) {
  const shift = staff === "bass" ? -14 : 0;
  const positions = fifths > 0 ? SHARP_POSITIONS : FLAT_POSITIONS;
  return positions.slice(0, Math.abs(fifths)).map((d) => ({ d: d + shift, alter: Math.sign(fifths) }));
}

/** Lowest and highest diatonic index a staff allows with the given number of ledger lines. */
export function staffRange(staff, ledgerLines) {
  const bottom = CLEFS[staff].bottom;
  return [bottom - 2 * ledgerLines - 1, bottom + 8 + 2 * ledgerLines + 1];
}

const MAX_LEAP = 7; // max diatonic distance between consecutive items on the same staff

const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/**
 * Generate test items. Each item is { staff, notes: [pitch] } (one note, or a chord).
 * opts: { clef, fifths, accidentals: "diatonic" | "chromatic", ledgerLines, chords, maxChordNotes }
 */
export function generateItems(count, opts, rng = Math.random) {
  const staves = opts.clef === "grand" ? ["treble", "bass"] : [opts.clef];
  const items = [];
  const lastRoot = {};
  for (let i = 0; i < count; i++) {
    const staff = pick(rng, staves);
    const [lo, hi] = staffRange(staff, opts.ledgerLines);
    const prev = lastRoot[staff];
    const maxRoot = opts.chords ? hi - 2 : hi;
    let root;
    for (let tries = 0; tries < 50; tries++) {
      root = randInt(rng, lo, maxRoot);
      if (prev === undefined) break;
      if (Math.abs(root - prev) <= MAX_LEAP && root !== prev) break;
    }

    const ds = [root];
    if (opts.chords) {
      const size = randInt(rng, 2, opts.maxChordNotes);
      const ceiling = Math.min(hi, root + 7); // keep chords within an octave
      let top = root;
      while (ds.length < size) {
        const needed = size - ds.length;
        const limit = ceiling - top - (needed - 1);
        if (limit < 1) break;
        top += Math.min(pick(rng, [1, 2, 2, 2, 3, 3]), limit);
        ds.push(top);
      }
    }

    const notes = ds.map((d) => {
      const p = pitchFromDiatonic(d);
      let alter = keyAlter(opts.fifths, p.step);
      if (opts.accidentals === "chromatic" && rng() < 0.2) alter = alter !== 0 ? 0 : rng() < 0.5 ? 1 : -1;
      p.alter = alter;
      return p;
    });
    items.push({ staff, notes });
    lastRoot[staff] = root;
  }
  return items;
}
