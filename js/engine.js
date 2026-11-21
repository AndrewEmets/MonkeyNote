// Test engine: matches played notes against the current item and records what happened.
// Pure logic (no DOM), so it can be tested in Node. Times are milliseconds (performance.now()).
//
// Every item must be played correctly before the caret moves on. A wrong note never advances:
// it counts against accuracy and the item is marked "corrected" once it is finally played.
import { midiOf } from "./music.js";

const pitchClass = (m) => ((m % 12) + 12) % 12;

export class TestEngine {
  /**
   * opts: {
   *   items, mode: "notes" | "time" | "zen" | "attack", chordWindow (ms),
   *   ignoreOctave: "off" | "keyboard" | "all", generateMore(count) -> items,
   *   isOutsideMidiRange(midi) -> bool (optional)
   * }
   */
  constructor(opts) {
    this.opts = opts;
    this.items = opts.items;
    this.states = this.items.map(() => "pending"); // pending | correct | corrected | missed (attack)
    this.state = "idle"; // idle | running | done
    this.index = 0;
    this.startTime = null;
    this.endTime = null;
    this.presses = []; // { t, midi, correct }
    this.results = []; // { index, t, clean } (clean: no wrong note on the way)
    this.pitchStats = new Map(); // midi -> { pitch, attempts, misses }
    this.attempt = null;
  }

  get current() {
    return this.items[this.index];
  }

  /**
   * Handle a note-on. isHeld(midi) reports whether a note is still held down.
   * Returns { correct: bool, resolved: bool, started: bool } or null if the test is over.
   */
  noteOn(midi, source, now, isHeld) {
    if (this.state === "done" || !this.current) return null;
    const out = { correct: false, resolved: false, started: false };
    if (this.state === "idle") {
      this.state = "running";
      this.startTime = now;
      out.started = true;
    }

    const targets = this.current.notes.map(midiOf);
    const lenient = this.opts.ignoreOctave === "all" || (this.opts.ignoreOctave === "keyboard" && source === "keyboard");
    // A note the MIDI keyboard physically lacks is accepted in any octave.
    const anyOctave = (t) => lenient || (source === "midi" && !!this.opts.isOutsideMidiRange?.(t));
    const a = (this.attempt ??= { hits: new Map(), misses: new Set() });
    const hit = targets.findIndex((t) => t === midi || (anyOctave(t) && pitchClass(t) === pitchClass(midi)));

    out.correct = hit >= 0;
    this.presses.push({ t: now, midi, correct: out.correct });
    if (out.correct) a.hits.set(hit, { time: now, midi, sticky: source === "screen" });
    else a.misses.add(this.#nearestTarget(targets, midi, a, lenient));

    if (out.correct && this.#satisfied(a, targets.length, now, isHeld)) out.resolved = this.#resolve(now);
    return out;
  }

  finish(now) {
    if (this.state === "done") return;
    this.state = "done";
    this.endTime = now;
    this.attempt = null;
  }

  // A chord is complete when every note is held, was tapped on screen, or landed within the chord window.
  #satisfied(a, count, now, isHeld) {
    for (let i = 0; i < count; i++) {
      const h = a.hits.get(i);
      if (!h || !(h.sticky || isHeld(h.midi) || now - h.time <= this.opts.chordWindow)) return false;
    }
    return true;
  }

  // A wrong note is charged to the target the player most likely misread: the closest one not yet played.
  #nearestTarget(targets, midi, a, lenient) {
    const distance = (t) => (lenient ? Math.min(pitchClass(t - midi), pitchClass(midi - t)) : Math.abs(t - midi));
    const candidates = targets.map((t, i) => i).filter((i) => !a.hits.has(i));
    const pool = candidates.length ? candidates : targets.map((t, i) => i);
    return pool.reduce((best, i) => (distance(targets[i]) < distance(targets[best]) ? i : best));
  }

  /**
   * Attack mode: the current item reached the hit line before it was played. It is marked missed
   * (every note in it goes into the miss stats) but stays current: it still has to be played.
   */
  miss(now) {
    if (this.state === "done" || !this.current) return;
    if (this.state === "idle") {
      this.state = "running";
      this.startTime = now;
    }
    this.attempt ??= { hits: new Map(), misses: new Set() };
    this.attempt.missed = true;
  }

  /** Whether the current item has been marked missed (attack mode). */
  get currentMissed() {
    return !!this.attempt?.missed;
  }

  #resolve(now) {
    const a = this.attempt;
    const missed = !!a.missed;
    const clean = !missed && a.misses.size === 0;
    this.current.notes.forEach((p, i) => {
      const m = midiOf(p);
      const stat = this.pitchStats.get(m) ?? { pitch: p, attempts: 0, misses: 0 };
      stat.attempts++;
      if (missed || a.misses.has(i)) stat.misses++;
      this.pitchStats.set(m, stat);
    });
    this.states[this.index] = missed ? "missed" : clean ? "correct" : "corrected";
    this.results.push({ index: this.index, t: now, clean, missed });
    this.index++;
    this.attempt = null;

    if (this.opts.mode === "notes" && this.index >= this.items.length) this.finish(now);
    else if (this.opts.generateMore && this.index > this.items.length - 30) {
      const more = this.opts.generateMore(100);
      this.items.push(...more);
      this.states.push(...more.map(() => "pending"));
    }
    return true;
  }
}
