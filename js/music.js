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

const MINOR_NAMES = { 0: "A", 1: "E", 2: "B", 3: "F♯", 4: "C♯", 5: "G♯", 6: "D♯", 7: "A♯", "-1": "D", "-2": "G", "-3": "C", "-4": "F", "-5": "B♭", "-6": "E♭", "-7": "A♭" };

/** "D major", or the relative minor for the same signature ("B minor"). */
export const keyName = (fifths, minor = false, harmonic = false) =>
  minor ? `${MINOR_NAMES[fifths]} ${harmonic ? "harmonic " : ""}minor` : `${KEYS.find((k) => k.fifths === fifths).name} major`;

/** Step (0..6, C..B) of the leading tone of the minor key with this signature (raised in harmonic minor). */
export const leadingToneStep = (fifths) => (((4 * fifths) % 7) + 7 + 4) % 7;

/*
 * Key setting ("key spec"):
 *   0..7 / -1..-7   a major key by sharps (+) or flats (-)
 *   "min:<n>"       the minor key with that signature (natural minor: same notes as its relative major)
 *   "hmin:<n>"      harmonic minor: the same, with the 7th degree (leading tone) raised
 *   "random"        any key, major or minor
 *   "random2"       any key with up to 2 sharps or flats
 *   "random#<n>"    up to n sharps (incl. none);  "randomb<n>"  up to n flats (incl. none)
 */
export function isKeySpec(v) {
  if (Number.isInteger(v)) return v >= -7 && v <= 7;
  return typeof v === "string" && /^(random|random2|random[#b][1-7]|h?min:-?[0-7])$/.test(v) && !/min:-0$/.test(v);
}

/** Pick the key for a test: { fifths, minor }. Random specs pick major or minor at random. */
export function resolveKey(spec, rng = Math.random) {
  if (Number.isInteger(spec)) return { fifths: spec, minor: false, harmonic: false };
  if (spec.startsWith("min:")) return { fifths: Number(spec.slice(4)), minor: true, harmonic: false };
  if (spec.startsWith("hmin:")) return { fifths: Number(spec.slice(5)), minor: true, harmonic: true };
  const between = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  let fifths;
  if (spec === "random") fifths = between(-7, 7);
  else if (spec === "random2") fifths = between(-2, 2);
  else if (spec[6] === "#") fifths = between(0, Number(spec.slice(7)));
  else fifths = -between(0, Number(spec.slice(7))) || 0; // (no -0)
  return { fifths, minor: rng() < 0.5, harmonic: false };
}

/** Short label for a key spec, for menus and settings. */
export function keySpecLabel(spec) {
  if (Number.isInteger(spec)) return keyName(spec);
  if (spec.startsWith("min:")) return keyName(Number(spec.slice(4)), true);
  if (spec.startsWith("hmin:")) return keyName(Number(spec.slice(5)), true, true);
  if (spec === "random") return "random key";
  if (spec === "random2") return "random, up to 2♯/♭";
  return `random, up to ${spec.slice(7)}${spec[6] === "#" ? "♯" : "♭"}`;
}

export const pitchFromDiatonic = (d, alter = 0) => ({ step: ((d % 7) + 7) % 7, octave: Math.floor(d / 7), alter });
export const diatonicOf = (p) => p.octave * 7 + p.step;

// MIDI number -> pitch, spelled with sharps (used where only the key number is known).
const SHARP_SPELLING = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]];
export function pitchFromMidi(m) {
  const [step, alter] = SHARP_SPELLING[((m % 12) + 12) % 12];
  return { step, alter, octave: Math.floor(m / 12) - 1 };
}
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

const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// Chord shapes as diatonic offsets from the chord root: root position, then each inversion.
const CHORD_SHAPES = {
  triads: [
    [0, 2, 4],
    [2, 4, 7],
    [4, 7, 9],
  ],
  sevenths: [
    [0, 2, 4, 6],
    [2, 4, 6, 7],
    [4, 6, 7, 9],
    [6, 7, 9, 11],
  ],
};
CHORD_SHAPES.both = [...CHORD_SHAPES.triads, ...CHORD_SHAPES.sevenths];

/**
 * Pick the lowest note of the next item: within [lo, hi] and at most `leap` steps from `prev`,
 * avoiding a repeat of `prev` when there's any other choice.
 */
function pickBottom(rng, lo, hi, prev, leap) {
  if (prev === undefined) return randInt(rng, lo, hi);
  const a = Math.max(lo, prev - leap);
  const b = Math.min(hi, prev + leap);
  if (a > b) return randInt(rng, lo, hi); // previous note is out of reach (e.g. after a range change)
  if (a === b) return a;
  const d = randInt(rng, a, b - 1);
  return d >= prev && prev >= a && prev <= b ? d + 1 : d;
}

/** Random stack of `size` notes within an octave above `bottom` (and at most `hi`). */
function randomChord(rng, bottom, hi, size) {
  const ds = [bottom];
  const ceiling = Math.min(hi, bottom + 7);
  let top = bottom;
  while (ds.length < size) {
    const limit = ceiling - top - (size - ds.length - 1);
    if (limit < 1) break;
    top += Math.min(pick(rng, [1, 2, 2, 2, 3, 3]), limit);
    ds.push(top);
  }
  return ds;
}

/**
 * Notes in the next item, 1..max: 1 + floor(r^power * max) for a random r in [0, 1).
 * power 1 makes every size equally likely; above 1 favors single notes and small chords,
 * below 1 favors full chords (0 means always full).
 */
export const chordSize = (rng, max, power = 1) => Math.min(max, 1 + Math.floor(rng() ** power * max));

/**
 * Generate test items. Each item is { staff, notes: [pitch] } (one note, or a chord).
 * opts: {
 *   clef, fifths, accidentals: "diatonic" | "chromatic", ledgerLines,
 *   maxLeap (diatonic steps between consecutive items on a staff; Infinity for any),
 *   chords, chordStyle: "random" | "triads" | "sevenths" | "both",
 *   maxChordNotes (largest random chord), chordPower (see chordSize),
 *   harmonic (harmonic minor: raise the leading tone of the minor key with this signature)
 * }
 * Triads and sevenths are built from the key (so they're the key's own chords); a smaller size takes
 * the lowest notes of the shape (e.g. a third or a fifth). They are never chromatically altered;
 * single notes and random chords may be when accidentals are chromatic.
 */
export function generateItems(count, opts, rng = Math.random) {
  const staves = opts.clef === "grand" ? ["treble", "bass"] : [opts.clef];
  const leap = opts.maxLeap ?? 7;
  const style = opts.chordStyle ?? "random";
  const items = [];
  const lastBottom = {};
  for (let i = 0; i < count; i++) {
    const staff = pick(rng, staves);
    const [lo, hi] = staffRange(staff, opts.ledgerLines);
    const prev = lastBottom[staff];
    const shape = opts.chords && style !== "random" ? pick(rng, CHORD_SHAPES[style]) : null;
    const size = opts.chords ? chordSize(rng, shape ? shape.length : opts.maxChordNotes, opts.chordPower) : 1;
    const single = size === 1;
    let ds;
    if (single) {
      ds = [pickBottom(rng, lo, hi, prev, leap)];
    } else if (!shape) {
      ds = randomChord(rng, pickBottom(rng, lo, hi - 2, prev, leap), hi, size);
    } else {
      const part = shape.slice(0, size);
      const span = part[part.length - 1] - part[0];
      const bottom = pickBottom(rng, lo, hi - span, prev, leap);
      ds = part.map((o) => bottom - part[0] + o);
    }

    const alterable = single || style === "random";
    const notes = ds.map((d) => {
      const p = pitchFromDiatonic(d);
      let alter = keyAlter(opts.fifths, p.step) + (opts.harmonic && p.step === leadingToneStep(opts.fifths) ? 1 : 0);
      if (alterable && opts.accidentals === "chromatic" && rng() < 0.2) alter = alter !== 0 ? 0 : rng() < 0.5 ? 1 : -1;
      p.alter = alter;
      return p;
    });
    items.push({ staff, notes });
    lastBottom[staff] = ds[0];
  }
  return items;
}
