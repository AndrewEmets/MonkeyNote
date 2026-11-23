// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { chordSize, diatonicOf, generateItems, midiOf, resolveKey, staffRange } from "../js/music.js";

// Deterministic PRNG so failures reproduce.
function seeded(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
const base = { clef: "treble", fifths: 0, accidentals: "diatonic", ledgerLines: 2, chords: false, maxChordNotes: 3 };

test("max leap is respected and notes stay in range", () => {
  for (const maxLeap of [1, 2, 4, 7]) {
    const items = generateItems(500, { ...base, maxLeap }, seeded(maxLeap));
    const [lo, hi] = staffRange("treble", 2);
    let prev;
    for (const it of items) {
      const d = diatonicOf(it.notes[0]);
      assert.ok(d >= lo && d <= hi, `out of range: ${d}`);
      if (prev !== undefined) assert.ok(Math.abs(d - prev) <= maxLeap, `leap ${Math.abs(d - prev)} > ${maxLeap}`);
      prev = d;
    }
  }
});

test("triads are stacked thirds or their inversions, in range", () => {
  const shapes = new Set(["2,2", "2,3", "3,2"]); // root position, 1st inversion, 2nd inversion
  const [lo, hi] = staffRange("bass", 1);
  for (const it of generateItems(300, { ...base, clef: "bass", ledgerLines: 1, chords: true, chordStyle: "triads", chordPower: 0 }, seeded(7))) {
    const ds = it.notes.map(diatonicOf);
    assert.equal(ds.length, 3);
    assert.ok(shapes.has(`${ds[1] - ds[0]},${ds[2] - ds[1]}`), `not a triad shape: ${ds}`);
    assert.ok(ds[0] >= lo && ds[2] <= hi);
  }
});

test("chordSize: 1 + floor(r^power * max), skewed by power", () => {
  const sizes = (power) => {
    const rng = seeded(5);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 6000; i++) counts[chordSize(rng, 3, power)]++;
    return counts.slice(1).map((c) => c / 6000);
  };
  const even = sizes(1);
  even.forEach((share) => assert.ok(Math.abs(share - 1 / 3) < 0.03, `even: ${even}`));
  const sparse = sizes(3); // r^3 < 1/3 for r < 0.693: ~69% single notes
  assert.ok(Math.abs(sparse[0] - 0.693) < 0.03, `sparse: ${sparse}`);
  const dense = sizes(0.33); // r^0.33 >= 2/3 for r >= 0.29: ~71% full chords
  assert.ok(dense[2] > 0.65, `dense: ${dense}`);
});

test("triads at lower densities use the lowest notes of the shape", () => {
  const items = generateItems(500, { ...base, chords: true, chordStyle: "triads", chordPower: 2 }, seeded(13));
  const bySize = [1, 2, 3].map((n) => items.filter((it) => it.notes.length === n).length);
  assert.ok(bySize.every((c) => c > 0), `sizes: ${bySize}`);
  for (const it of items.filter((x) => x.notes.length === 2)) {
    const [a, b] = it.notes.map(diatonicOf);
    assert.ok([2, 3].includes(b - a), `dyad from a triad shape should be a 3rd or 4th: ${b - a}`);
  }
});

test("sevenths have four notes within an octave and follow the key", () => {
  for (const it of generateItems(300, { ...base, fifths: 2, accidentals: "chromatic", chords: true, chordStyle: "sevenths", chordPower: 0, maxChordNotes: 4 }, seeded(3))) {
    const ds = it.notes.map(diatonicOf);
    assert.equal(ds.length, 4);
    assert.ok(ds[3] - ds[0] <= 7, `wider than an octave: ${ds}`);
    for (const p of it.notes) {
      const expected = p.step === 3 || p.step === 0 ? 1 : 0; // D major: F# and C#
      assert.equal(p.alter, expected);
    }
  }
});

test("harmonic minor raises the leading tone", () => {
  // C harmonic minor (3 flats): B is natural instead of B flat; everything else follows the key.
  for (const it of generateItems(400, { ...base, fifths: -3, harmonic: true }, seeded(21))) {
    const p = it.notes[0];
    const expected = p.step === 6 ? 0 : [2, 5].includes(p.step) ? -1 : 0; // B natural; E and A flat
    assert.equal(p.alter, expected, `step ${p.step}`);
  }
});

test("triads and sevenths respect max chord notes", () => {
  for (const style of ["triads", "sevenths", "both"]) {
    for (const it of generateItems(300, { ...base, chords: true, chordStyle: style, chordPower: 0.33, maxChordNotes: 2 }, seeded(5))) {
      assert.ok(it.notes.length <= 2, `${style}: ${it.notes.length} notes`);
    }
  }
});

test("notes stay within the keyboard's range", () => {
  // 61 keys (C2–C7) with 4 ledger lines on a grand staff: low bass notes would fall below C2.
  const opts = { ...base, clef: "grand", ledgerLines: 4, accidentals: "chromatic", chords: true, maxChordNotes: 4, midiRange: [36, 96] };
  let lowest = Infinity;
  for (const it of generateItems(2000, opts, seeded(9))) {
    for (const p of it.notes) {
      const m = midiOf(p);
      assert.ok(m >= 36 && m <= 96, `out of range: ${m}`);
      lowest = Math.min(lowest, m);
    }
  }
  assert.ok(lowest <= 38, `range not used: lowest ${lowest}`);
});

test("random keys pick major, minor and harmonic minor", () => {
  const rng = seeded(13);
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const k = resolveKey("random2", rng);
    seen.add(k.harmonic ? "hmin" : k.minor ? "min" : "maj");
    assert.ok(Math.abs(k.fifths) <= 2);
  }
  assert.deepEqual([...seen].sort(), ["hmin", "maj", "min"]);
});
