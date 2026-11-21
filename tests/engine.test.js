// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { TestEngine } from "../js/engine.js";

const P = (step, octave, alter = 0) => ({ step, octave, alter });
const C4 = P(0, 4), E4 = P(2, 4), G4 = P(4, 4);
const make = (items, extra = {}) =>
  new TestEngine({ items, mode: "notes", stopOnError: false, chordWindow: 100, ignoreOctave: "off", ...extra });
const notHeld = () => false;

test("single notes: correct and wrong advance", () => {
  const e = make([{ notes: [C4] }, { notes: [E4] }]);
  assert.equal(e.noteOn(60, "midi", 0, notHeld).resolved, true);
  assert.equal(e.states[0], "correct");
  e.noteOn(65, "midi", 500, notHeld);
  assert.equal(e.states[1], "error");
  assert.equal(e.state, "done");
  assert.equal(e.pitchStats.get(64).misses, 1);
});

test("stop on error waits for the right note", () => {
  const e = make([{ notes: [C4] }], { stopOnError: true });
  const r = e.noteOn(62, "midi", 0, notHeld);
  assert.equal(r.resolved, false);
  assert.equal(r.itemError, true);
  assert.equal(e.index, 0);
  e.noteOn(60, "midi", 300, notHeld);
  assert.equal(e.states[0], "error");
  assert.equal(e.state, "done");
});

test("chord: all notes held completes it", () => {
  const held = new Set();
  const isHeld = (m) => held.has(m);
  const e = make([{ notes: [C4, E4, G4] }, { notes: [C4] }]);
  for (const [m, t] of [[60, 0], [64, 300], [67, 600]]) {
    held.add(m);
    e.noteOn(m, "midi", t, isHeld);
  }
  assert.equal(e.states[0], "correct");
});

test("chord: released notes outside the window do not count", () => {
  const e = make([{ notes: [C4, E4] }, { notes: [C4] }]);
  e.noteOn(60, "midi", 0, notHeld);
  e.noteOn(64, "midi", 500, notHeld);
  assert.equal(e.index, 0);
  e.noteOn(60, "midi", 550, notHeld);
  assert.equal(e.states[0], "correct");
});

test("chord: wrong note resolves after the window", () => {
  const e = make([{ notes: [C4, E4] }, { notes: [C4] }]);
  e.noteOn(62, "midi", 0, notHeld);
  assert.equal(e.index, 0);
  assert.equal(e.check(50, notHeld), false);
  assert.equal(e.check(100, notHeld), true);
  assert.equal(e.states[0], "error");
});

test("on-screen notes stick until the chord is complete", () => {
  const e = make([{ notes: [C4, E4] }, { notes: [C4] }]);
  e.noteOn(60, "screen", 0, notHeld);
  e.noteOn(64, "screen", 2000, notHeld);
  assert.equal(e.states[0], "correct");
});

test("ignore octave for keyboard only", () => {
  const e = make([{ notes: [C4] }, { notes: [C4] }], { ignoreOctave: "keyboard" });
  e.noteOn(72, "keyboard", 0, notHeld);
  assert.equal(e.states[0], "correct");
  e.noteOn(72, "midi", 100, notHeld);
  assert.equal(e.states[1], "error");
});

test("time mode generates more items", () => {
  let n = 0;
  const e = make([{ notes: [C4] }], { mode: "time", generateMore: (c) => Array.from({ length: c }, () => (n++, { notes: [C4] })) });
  e.noteOn(60, "midi", 0, notHeld);
  assert.equal(e.items.length, 101);
  assert.equal(e.state, "running");
});
