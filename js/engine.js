// Test engine: matches played notes against the current item and records what happened.
// Pure logic (no DOM), so it can be tested in Node. Times are milliseconds (performance.now()).
import { midiOf } from "./music.js";

const pitchClass = (m) => ((m % 12) + 12) % 12;

export class TestEngine {
  /**
   * opts: {
   *   items, mode: "notes" | "time" | "zen", stopOnError, chordWindow (ms),
   *   ignoreOctave: "off" | "keyboard" | "all", generateMore(count) -> items
   * }
   */
  constructor(opts) {
    this.opts = opts;
    this.items = opts.items;
    this.states = this.items.map(() => "pending");
    this.state = "idle"; // idle | running | done
    this.index = 0;
    this.startTime = null;
    this.endTime = null;
    this.presses = []; // { t, midi, correct }
    this.results = []; // { index, t, correct }
    this.pitchStats = new Map(); // midi -> { pitch, attempts, misses }
    this.attempt = null;
  }

  get current() {
    return this.items[this.index];
  }

  /**
   * Handle a note-on. isHeld(midi) reports whether a note is still held down.
   * Returns { flash: "correct" | "error", itemError: bool, resolved: bool, started: bool } or null.
   */
  noteOn(midi, source, now, isHeld) {
    if (this.state === "done" || !this.current) return null;
    const out = { flash: null, itemError: false, resolved: false, started: false };
    if (this.state === "idle") {
      this.state = "running";
      this.startTime = now;
      out.started = true;
    }

    const targets = this.current.notes.map(midiOf);
    const lenient = this.opts.ignoreOctave === "all" || (this.opts.ignoreOctave === "keyboard" && source === "keyboard");
    const key = lenient ? pitchClass : (m) => m;
    const a = (this.attempt ??= { start: now, hits: new Map(), misses: new Set(), hadError: false, deadline: null });
    const hit = targets.findIndex((t) => key(t) === key(midi));

    if (hit >= 0) {
      a.hits.set(hit, { time: now, midi, sticky: source === "screen" });
      this.presses.push({ t: now, midi, correct: true });
      out.flash = "correct";
    } else {
      this.presses.push({ t: now, midi, correct: false });
      a.hadError = true;
      a.misses.add(this.#nearestTarget(targets, midi, a, lenient));
      out.flash = "error";
      out.itemError = true;
      if (!this.opts.stopOnError) {
        if (targets.length === 1) return { ...out, resolved: this.#resolve(now) };
        // Chords: give the rest of the gesture time to land before moving on.
        a.deadline ??= a.start + this.opts.chordWindow;
      }
    }

    if (this.#satisfied(a, targets.length, now, isHeld)) out.resolved = this.#resolve(now);
    return out;
  }

  /** Resolve a chord attempt whose window has passed. Returns true if the item resolved. */
  check(now, isHeld) {
    const a = this.attempt;
    if (this.state !== "running" || !a?.deadline || now < a.deadline) return false;
    this.#satisfied(a, this.current.notes.length, now, isHeld);
    return this.#resolve(now);
  }

  finish(now) {
    if (this.state === "done") return;
    this.state = "done";
    this.endTime = now;
    this.attempt = null;
  }

  #satisfied(a, count, now, isHeld) {
    for (let i = 0; i < count; i++) {
      const h = a.hits.get(i);
      if (!h || !(h.sticky || isHeld(h.midi) || now - h.time <= this.opts.chordWindow)) return false;
    }
    return true;
  }

  #nearestTarget(targets, midi, a, lenient) {
    const distance = (t) => (lenient ? Math.min(pitchClass(t - midi), pitchClass(midi - t)) : Math.abs(t - midi));
    const candidates = targets.map((t, i) => i).filter((i) => !a.hits.has(i));
    const pool = candidates.length ? candidates : targets.map((t, i) => i);
    return pool.reduce((best, i) => (distance(targets[i]) < distance(targets[best]) ? i : best));
  }

  #resolve(now) {
    const a = this.attempt;
    const item = this.current;
    const correct = !a.hadError;
    if (!correct) item.notes.forEach((p, i) => !a.hits.has(i) && a.misses.add(i));
    item.notes.forEach((p, i) => {
      const m = midiOf(p);
      const stat = this.pitchStats.get(m) ?? { pitch: p, attempts: 0, misses: 0 };
      stat.attempts++;
      if (a.misses.has(i)) stat.misses++;
      this.pitchStats.set(m, stat);
    });
    this.states[this.index] = correct ? "correct" : "error";
    this.results.push({ index: this.index, t: now, correct });
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
