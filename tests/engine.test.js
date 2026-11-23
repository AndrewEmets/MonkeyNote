// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { TestEngine } from "../js/engine.js";

const P = (step, octave, alter = 0) => ({ step, octave, alter });
const C4 = P(0, 4), E4 = P(2, 4), G4 = P(4, 4);
const make = (items, extra = {}) => new TestEngine({ items, mode: "notes", chordWindow: 100, ignoreOctave: "off", ...extra });
const notHeld = () => false;

test("correct note advances", () => {
  const e = make([{ notes: [C4] }, { notes: [E4] }]);
  assert.equal(e.noteOn(60, "midi", 0, notHeld).resolved, true);
  assert.equal(e.states[0], "correct");
  assert.equal(e.index, 1);
});

test("wrong note never advances; item ends up corrected", () => {
  const e = make([{ notes: [C4] }, { notes: [E4] }]);
  const r = e.noteOn(62, "midi", 0, notHeld);
  assert.deepEqual([r.correct, r.resolved], [false, false]);
  assert.equal(e.index, 0);
  assert.equal(e.states[0], "pending");
  e.noteOn(60, "midi", 300, notHeld);
  assert.equal(e.states[0], "corrected");
  assert.equal(e.results[0].clean, false);
  assert.equal(e.pitchStats.get(60).misses, 1);
});

test("test finishes only when every item is played", () => {
  const e = make([{ notes: [C4] }]);
  e.noteOn(61, "midi", 0, notHeld);
  assert.equal(e.state, "running");
  e.noteOn(60, "midi", 100, notHeld);
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

test("chord: a wrong note keeps the chord current and charges the nearest unplayed note", () => {
  const held = new Set([60]);
  const e = make([{ notes: [C4, E4] }, { notes: [C4] }]);
  e.noteOn(60, "midi", 0, (m) => held.has(m));
  e.noteOn(65, "midi", 20, (m) => held.has(m)); // F instead of E
  assert.equal(e.index, 0);
  e.noteOn(64, "midi", 40, (m) => held.has(m));
  assert.equal(e.states[0], "corrected");
  assert.equal(e.pitchStats.get(64).misses, 1);
  assert.equal(e.pitchStats.get(60).misses, 0);
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
  assert.equal(e.index, 1);
});

test("notes outside the MIDI keyboard's range are accepted in any octave", () => {
  const C6 = P(0, 6);
  const isOutsideMidiRange = (m) => m < 48 || m > 72; // 25 keys, C3–C5
  const e = make([{ notes: [C6] }, { notes: [C4] }, { notes: [C6] }], { isOutsideMidiRange });
  e.noteOn(72, "midi", 0, notHeld); // C5 for C6: out of range, accepted
  assert.equal(e.states[0], "correct");
  e.noteOn(72, "midi", 100, notHeld); // C5 for C4: in range, wrong octave
  assert.equal(e.index, 1);
  e.noteOn(60, "midi", 200, notHeld);
  e.noteOn(72, "keyboard", 300, notHeld); // range only applies to MIDI input
  assert.equal(e.index, 2);
  e.noteOn(84, "screen", 400, notHeld);
  assert.equal(e.state, "done");
});

test("attack: a missed item stays current until played, then counts as missed", () => {
  const e = make([{ notes: [C4, E4] }, { notes: [G4] }], { mode: "attack" });
  e.noteOn(60, "screen", 0, notHeld); // half the chord played
  e.miss(500);
  assert.equal(e.index, 0);
  assert.equal(e.currentMissed, true);
  e.noteOn(64, "screen", 900, notHeld); // finish the chord
  assert.equal(e.states[0], "missed");
  assert.equal(e.index, 1);
  assert.deepEqual([e.pitchStats.get(60).misses, e.pitchStats.get(64).misses], [1, 1]);
  assert.equal(e.results[0].missed, true);
  e.noteOn(67, "midi", 1000, notHeld);
  assert.equal(e.states[1], "correct");
  assert.equal(e.state, "running"); // attack never ends on its own
});

test("time mode generates more items", () => {
  const e = make([{ notes: [C4] }], { mode: "time", generateMore: (c) => Array.from({ length: c }, () => ({ notes: [C4] })) });
  e.noteOn(60, "midi", 0, notHeld);
  assert.equal(e.items.length, 101);
  assert.equal(e.state, "running");
});

test("rewind: the group is played again; first results stand, the failed note counts as corrected", () => {
  const e = make([{ notes: [C4] }, { notes: [E4] }, { notes: [G4] }]);
  e.noteOn(60, "midi", 0, notHeld);
  e.noteOn(64, "midi", 100, notHeld);
  e.noteOn(65, "midi", 200, notHeld); // wrong on G4
  e.rewind(0);
  assert.equal(e.index, 0);
  assert.deepEqual(e.states, ["pending", "pending", "pending"]);
  e.noteOn(60, "midi", 300, notHeld);
  e.noteOn(64, "midi", 400, notHeld);
  assert.deepEqual(e.states.slice(0, 2), ["correct", "correct"]);
  assert.equal(e.results.length, 2); // replays add no results
  e.noteOn(67, "midi", 500, notHeld);
  assert.equal(e.states[2], "corrected");
  assert.equal(e.state, "done");
  assert.equal(e.results.length, 3);
  assert.equal(e.pitchStats.get(60).attempts, 1);
  assert.equal(e.presses.filter((p) => p.replay).length, 2);
});
