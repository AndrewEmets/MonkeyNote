// Test page: config bar, staff lines with caret, input handling, live counter, results.
import { settings } from "../settings.js";
import { generateItems, keyName, KEYS, midiOf, pitchFromDiatonic, pitchName, staffRange } from "../music.js";
import { lineCapacity, renderStaff } from "../staff.js";
import { icon } from "../icons.js";
import { input } from "../input.js";
import { keyboardInput } from "../keyboard-input.js";
import { midiStatus, onMidiChange } from "../midi.js";
import { midiRange } from "../midi-range.js";
import { createPiano } from "../piano.js";
import { TestEngine } from "../engine.js";
import { computeResults, renderResults } from "../results.js";
import { saveResult } from "../history.js";
import { notify } from "../notify.js";

const STAFF_SPACE = { small: 10, medium: 14, large: 18, xl: 22 };
const MODE_VALUES = { notes: ["notesCount", [10, 25, 50, 100]], time: ["timeLimit", [15, 30, 60, 120]] };
const TOGGLES = [
  ["chords", "chords"],
  ["memory", "eyeOff"],
  ["ear", "ear"],
];
const MODES = [
  ["notes", "note"],
  ["time", "clock"],
  ["attack", "bolt"],
  ["zen", "mountain"],
];
const DEFAULT_OCTAVE = { treble: 4, bass: 2, grand: 3 }; // octave of the Z key per clef
// Settings that need a new test vs. ones that only change how it looks.
const RESTART_KEYS = new Set([
  "mode", "notesCount", "timeLimit", "chords", "memory", "ear",
  "clef", "keySignature", "accidentals", "ledgerLines", "maxChordNotes",
  "chordWindow", "ignoreOctave",
]);
const REDRAW_KEYS = new Set(["noteSize", "caretStyle", "smoothCaret", "fontFamily", "staffLines"]);
const PIANO_KEYS = new Set(["onScreenKeyboard", "keyLabels", "clef", "ledgerLines"]);

// Results-screen MIDI menu: white keys (any octave) act as buttons. Changes wait for C to restart.
const MENU_LOCKOUT_MS = 1000; // ignore trailing notes from the exercise
const cycle = (list, value) => list[(list.indexOf(value) + 1) % list.length];
const onOff = (v) => (v ? "on" : "off");
const MIDI_MENU = [
  { pc: 0, name: "C", label: () => "restart", run: () => restart() },
  { pc: 2, name: "D", label: (s) => `chords ${onOff(s.chords)}`, run: (s) => settings.set("chords", !s.chords) },
  { pc: 4, name: "E", label: (s) => `memory ${onOff(s.memory)}`, run: (s) => settings.set("memory", !s.memory) },
  { pc: 5, name: "F", label: (s) => `ear ${onOff(s.ear)}`, run: (s) => settings.set("ear", !s.ear) },
  { pc: 7, name: "G", label: (s) => `mode: ${s.mode}`, run: (s) => settings.set("mode", cycle(["notes", "time", "zen"], s.mode)) },
  {
    pc: 9,
    name: "A",
    label: (s) => (MODE_VALUES[s.mode] ? `length: ${s[MODE_VALUES[s.mode][0]]}` : "length: -"),
    run: (s) => {
      const [key, values] = MODE_VALUES[s.mode] ?? [];
      if (key) settings.set(key, cycle(values, s[key]));
    },
  },
  { pc: 11, name: "B", label: (s) => `clef: ${s.clef === "grand" ? "grand staff" : s.clef}`, run: (s) => settings.set("clef", cycle(["treble", "bass", "grand"], s.clef)) },
];

let root, els, test, view, piano, resizeObserver, cleanups, ticker;
let resultsShownAt = 0;
let menuChange = false; // a settings change made from the MIDI menu keeps the results screen up

export function mount(container) {
  root = document.createElement("div");
  root.className = "test-page";
  root.innerHTML = `
    <div class="config-bar" role="toolbar" aria-label="test configuration"></div>
    <div class="test-area">
      <div class="test-top"><div class="test-counter"></div><div class="test-meta"></div></div>
      <div class="staff-wrap"></div>
      <div class="input-hint"></div>
    </div>
    <div class="results" hidden></div>
    <div class="midi-menu" hidden></div>
    <div class="piano-wrap"></div>
    <button class="restart-button" aria-label="restart test" title="restart test">${icon("restart")}</button>`;
  container.appendChild(root);
  els = {
    config: root.querySelector(".config-bar"),
    area: root.querySelector(".test-area"),
    counter: root.querySelector(".test-counter"),
    meta: root.querySelector(".test-meta"),
    staff: root.querySelector(".staff-wrap"),
    hint: root.querySelector(".input-hint"),
    results: root.querySelector(".results"),
    menu: root.querySelector(".midi-menu"),
    piano: root.querySelector(".piano-wrap"),
  };

  els.config.addEventListener("click", onConfigClick);
  root.querySelector(".restart-button").addEventListener("click", (e) => {
    e.currentTarget.blur();
    restart();
  });
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("mousemove", exitFocusMode);
  resizeObserver = new ResizeObserver(() => draw());
  resizeObserver.observe(els.staff);

  keyboardInput.setOctave(DEFAULT_OCTAVE[settings.get("clef")]);
  keyboardInput.attach();
  cleanups = [
    () => keyboardInput.detach(),
    input.subscribe(onInput),
    onMidiChange(() => {
      renderHint();
      renderMidiMenu();
    }),
    keyboardInput.onOctaveChange((octave) => {
      notify(`keyboard: z = C${octave}`, { duration: 1500 });
      renderHint();
      piano?.setLabels(pianoLabels());
    }),
    settings.subscribe(onSetting),
  ];

  renderConfig();
  renderPiano();
  restart();
}

export function unmount() {
  stopTimers();
  exitFocusMode();
  document.removeEventListener("keydown", onKeyDown);
  document.removeEventListener("mousemove", exitFocusMode);
  resizeObserver.disconnect();
  cleanups.forEach((fn) => fn());
  piano?.destroy();
  piano = null;
  root.remove();
}

function onSetting(key) {
  if (key === "clef") keyboardInput.setOctave(DEFAULT_OCTAVE[settings.get("clef")]);
  if (PIANO_KEYS.has(key)) renderPiano();
  if (RESTART_KEYS.has(key)) {
    renderConfig();
    if (menuChange) renderMidiMenu();
    else restart();
  } else if (REDRAW_KEYS.has(key)) draw();
}

const showingResults = () => !els.results.hidden;

function onKeyDown(e) {
  if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    restart();
  } else if (e.key === "Enter" && e.shiftKey && test?.engine?.state === "running" && test.cfg.mode === "zen") {
    e.preventDefault();
    finish(performance.now());
  }
}

// ---- config bar ----

function renderConfig() {
  const s = settings.all();
  const button = (key, value, label, iconName, active) =>
    `<button class="text-button${active ? " active" : ""}" data-key="${key}" data-value='${JSON.stringify(value)}'>${iconName ? icon(iconName) : ""}<span>${label}</span></button>`;
  const [valueKey, values] = MODE_VALUES[s.mode] ?? [];
  els.config.innerHTML = `
    <div class="group">${TOGGLES.map(([key, ic]) => button(key, !s[key], key, ic, s[key])).join("")}</div>
    <div class="divider"></div>
    <div class="group">${MODES.map(([mode, ic]) => button("mode", mode, mode, ic, s.mode === mode)).join("")}</div>
    ${valueKey ? `<div class="divider"></div><div class="group">${values.map((v) => button(valueKey, v, v, null, s[valueKey] === v)).join("")}</div>` : ""}`;
}

function onConfigClick(e) {
  const btn = e.target.closest("button[data-key]");
  if (!btn) return;
  btn.blur();
  settings.set(btn.dataset.key, JSON.parse(btn.dataset.value));
}

// ---- on-screen piano and input hint ----

function pianoRange(clef, ledgerLines) {
  const staves = clef === "grand" ? ["treble", "bass"] : [clef];
  const ds = staves.flatMap((s) => staffRange(s, ledgerLines));
  return [midiOf(pitchFromDiatonic(Math.min(...ds))) - 1, midiOf(pitchFromDiatonic(Math.max(...ds))) + 1];
}

const pianoLabels = () => (settings.get("keyLabels") ? keyboardInput.labels() : null);

function renderPiano() {
  piano?.destroy();
  piano = null;
  const s = settings.all();
  els.piano.hidden = !s.onScreenKeyboard || showingResults();
  if (!s.onScreenKeyboard) return;
  const [low, high] = pianoRange(s.clef, s.ledgerLines);
  piano = createPiano(els.piano, {
    low,
    high,
    interactive: true,
    onDown: (midi) => input.noteOn(midi, "screen"),
    onUp: (midi) => input.noteOff(midi, "screen"),
  });
  piano.setLabels(pianoLabels());
}

function renderHint() {
  const { status, devices } = midiStatus();
  const parts = [];
  if (status === "ready" && devices.length) parts.push(`${icon("plug")}<span>midi: ${devices.join(", ")}</span>`);
  parts.push(`${icon("keyboard")}<span><kbd>z</kbd> = C${keyboardInput.octave} · <kbd>↑</kbd> <kbd>↓</kbd> octave</span>`);
  if (test?.cfg.mode === "zen") parts.push(`<span><kbd>shift</kbd> + <kbd>enter</kbd> to finish</span>`);
  els.hint.innerHTML = parts.map((p) => `<span class="hint-part">${p}</span>`).join("");
}

// ---- test lifecycle ----

function stopTimers() {
  clearInterval(ticker);
  ticker = null;
}

function restart() {
  stopTimers();
  exitFocusMode();
  const cfg = settings.all();
  const fifths = cfg.keySignature === "random" ? KEYS[Math.floor(Math.random() * KEYS.length)].fifths : cfg.keySignature;
  const genOpts = { clef: cfg.clef, fifths, accidentals: cfg.accidentals, ledgerLines: cfg.ledgerLines, chords: cfg.chords, maxChordNotes: cfg.maxChordNotes };
  const supported = cfg.mode !== "attack";
  const engine = supported
    ? new TestEngine({
        items: generateItems(cfg.mode === "notes" ? cfg.notesCount : 100, genOpts),
        mode: cfg.mode,
        chordWindow: cfg.chordWindow,
        ignoreOctave: cfg.ignoreOctave,
        isOutsideMidiRange: (midi) => midiRange.isOutside(midi),
        generateMore: cfg.mode === "notes" ? null : (count) => generateItems(count, genOpts),
      })
    : null;
  test = { cfg, fifths, genOpts, engine };
  view = null;

  els.results.hidden = true;
  els.menu.hidden = true;
  els.area.hidden = false;
  els.piano.hidden = !cfg.onScreenKeyboard;
  els.meta.textContent = `${cfg.clef === "grand" ? "grand staff" : cfg.clef} · ${keyName(fifths)}`;
  root.classList.remove("running");
  renderCounter();
  renderHint();
  draw();
}

function onInput(ev) {
  if (ev.type === "off") {
    piano?.setPressed(ev.midi, false);
    return;
  }
  piano?.setPressed(ev.midi, true);
  if (showingResults()) return onMenuNote(ev);
  const engine = test?.engine;
  if (!engine || engine.state === "done") return;

  const before = engine.index;
  const out = engine.noteOn(ev.midi, ev.source, ev.time, input.isHeld);
  if (!out) return;
  if (out.started) onStart();
  piano?.flash(ev.midi, out.correct ? "correct" : "error");
  if (!out.correct) view?.shakeItem(before);
  if (out.resolved) view?.update(before);
  renderCounter();
  if (engine.state === "done") showResults();
}

function onStart() {
  root.classList.add("running");
  document.body.classList.add("focus-mode");
  view?.setBlink(false);
  ticker = setInterval(() => {
    if (test.cfg.mode === "time" && performance.now() - test.engine.startTime >= test.cfg.timeLimit * 1000) {
      finish(test.engine.startTime + test.cfg.timeLimit * 1000);
    } else renderCounter();
  }, 100);
}

function finish(at) {
  test.engine.finish(at);
  showResults();
}

function showResults() {
  stopTimers();
  exitFocusMode();
  root.classList.remove("running");
  const { cfg, fifths, engine } = test;
  const r = computeResults(engine, cfg);
  const { isPb } = saveResult(
    { npm: r.npm, acc: r.acc, consistency: r.consistency, seconds: r.seconds, fifths, misses: r.pitches.filter((p) => p.misses).map((p) => [pitchName(p.pitch), p.misses, p.attempts]) },
    cfg,
  );
  els.area.hidden = true;
  els.piano.hidden = true;
  els.results.hidden = false;
  renderResults(els.results, r, { cfg, fifths, isPb });
  resultsShownAt = performance.now();
  renderMidiMenu();
}

// ---- results-screen MIDI menu ----

function renderMidiMenu() {
  const connected = midiStatus().devices.length > 0;
  els.menu.hidden = !showingResults() || !connected;
  if (els.menu.hidden) return;
  const s = settings.all();
  els.menu.innerHTML = `
    <div class="midi-menu-title">${icon("plug")}<span>midi controls · play any octave</span></div>
    <div class="midi-menu-keys">${MIDI_MENU.map(
      (m) => `<span class="midi-menu-key" data-pc="${m.pc}"><kbd>${m.name}</kbd><span>${m.label(s)}</span></span>`,
    ).join("")}</div>`;
}

function onMenuNote(ev) {
  if (ev.source !== "midi" || performance.now() - resultsShownAt < MENU_LOCKOUT_MS) return;
  const entry = MIDI_MENU.find((m) => m.pc === ((ev.midi % 12) + 12) % 12);
  if (!entry) return;
  if (entry.pc === 0) return entry.run();
  menuChange = true;
  try {
    entry.run(settings.all());
  } finally {
    menuChange = false;
  }
  const key = els.menu.querySelector(`[data-pc="${entry.pc}"]`);
  key?.classList.remove("hit");
  void key?.offsetWidth;
  key?.classList.add("hit");
}

function renderCounter() {
  const engine = test?.engine;
  if (!engine || engine.state !== "running") return void (els.counter.textContent = "");
  const { mode, timeLimit } = test.cfg;
  if (mode === "notes") els.counter.textContent = `${engine.index}/${engine.items.length}`;
  else if (mode === "time") els.counter.textContent = Math.max(0, Math.ceil(timeLimit - (performance.now() - engine.startTime) / 1000));
  else els.counter.textContent = engine.index;
}

function exitFocusMode() {
  document.body.classList.remove("focus-mode");
}

// ---- staff lines ----

/** Draw the visible staff lines (the current item's line, then the next ones) and set `view`. */
function draw() {
  if (!test || !els.staff.clientWidth) return;
  if (!test.engine) {
    els.staff.innerHTML = `<div class="placeholder">${icon("bolt")}<span>attack mode arrives in a later milestone</span></div>`;
    view = null;
    return;
  }
  const s = settings.all();
  const { engine, genOpts } = test;
  const staffSpace = STAFF_SPACE[s.noteSize];
  const width = els.staff.clientWidth;
  const capacity = lineCapacity(width / staffSpace, genOpts);
  const firstLine = Math.floor(Math.min(engine.index, engine.items.length - 1) / capacity);

  els.staff.replaceChildren();
  const lines = [];
  for (let l = 0; l < s.staffLines; l++) {
    const startIndex = (firstLine + l) * capacity;
    const items = engine.items.slice(startIndex, startIndex + capacity);
    if (!items.length) break;
    const holder = document.createElement("div");
    holder.className = "staff-row";
    els.staff.appendChild(holder);
    const handle = renderStaff(holder, { ...genOpts, items, width, staffSpace, caretStyle: s.caretStyle, smoothCaret: s.smoothCaret });
    items.forEach((_, k) => handle.setState(k, engine.states[startIndex + k]));
    handle.setCaret(l === 0 ? engine.index - startIndex : -1);
    lines.push({ handle, startIndex });
  }
  const locate = (index) => {
    const line = lines.find((ln) => index >= ln.startIndex && index < ln.startIndex + capacity);
    return line ? { line, k: index - line.startIndex } : null;
  };

  view = {
    update(prevIndex) {
      // Moving to a new line re-renders, so the current line is always on top.
      if (Math.floor(Math.min(engine.index, engine.items.length - 1) / capacity) !== firstLine) return draw();
      const prev = locate(prevIndex);
      prev?.line.handle.setState(prev.k, engine.states[prevIndex]);
      const cur = locate(engine.index);
      lines[0].handle.setCaret(cur ? cur.k : -1);
    },
    shakeItem(index) {
      const loc = locate(index);
      loc?.line.handle.shakeItem(loc.k);
    },
    setBlink(on) {
      lines[0]?.handle.setCaretBlink(on);
    },
  };
  view.setBlink(engine.state === "idle");
}
