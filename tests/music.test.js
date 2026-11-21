// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { diatonicOf, generateItems, staffRange } from "../js/music.js";

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
  for (const it of generateItems(300, { ...base, clef: "bass", ledgerLines: 1, chords: true, chordStyle: "triads" }, seeded(7))) {
    const ds = it.notes.map(diatonicOf);
    assert.equal(ds.length, 3);
    assert.ok(shapes.has(`${ds[1] - ds[0]},${ds[2] - ds[1]}`), `not a triad shape: ${ds}`);
    assert.ok(ds[0] >= lo && ds[2] <= hi);
  }
});

test("chord mode mixes in single notes only when asked", () => {
  const count = (singleRate) =>
    generateItems(1000, { ...base, chords: true, chordStyle: "triads", singleRate }, seeded(11)).filter((it) => it.notes.length === 1).length;
  assert.equal(count(0), 0);
  const some = count(0.25);
  assert.ok(some > 150 && some < 350, `expected ~250 singles, got ${some}`);
});

test("sevenths have four notes within an octave and follow the key", () => {
  for (const it of generateItems(300, { ...base, fifths: 2, accidentals: "chromatic", chords: true, chordStyle: "sevenths" }, seeded(3))) {
    const ds = it.notes.map(diatonicOf);
    assert.equal(ds.length, 4);
    assert.ok(ds[3] - ds[0] <= 7, `wider than an octave: ${ds}`);
    for (const p of it.notes) {
      const expected = p.step === 3 || p.step === 0 ? 1 : 0; // D major: F# and C#
      assert.equal(p.alter, expected);
    }
  }
});
