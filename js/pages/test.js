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
import { audio } from "../audio.js";

const STAFF_SPACE = { small: 10, medium: 14, large: 18, xl: 22 };
const MODE_VALUES = {
  notes: ["notesCount", [10, 25, 50, 100]],
  time: ["timeLimit", [15, 30, 60, 120]],
  attack: ["attackSpeed", [20, 30, 45, 60]], // starting speed, notes per minute
};
// Attack mode: speed rises by this many notes per minute, every minute; three misses end the run.
const ATTACK_RAMP_NPM_PER_MIN = 20;
const ATTACK_LIVES = 3;
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
  "mode", "notesCount", "timeLimit", "attackSpeed", "chords", "memory", "ear",
  "clef", "keySignature", "accidentals", "ledgerLines", "maxChordNotes", "maxLeap", "chordStyle",
  "chordWindow", "ignoreOctave", "earReference",
]);
const REDRAW_KEYS = new Set(["noteSize", "caretStyle", "smoothCaret", "fontFamily", "staffLines", "noteNames"]);
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
  { pc: 7, name: "G", label: (s) => `mode: ${s.mode}`, run: (s) => settings.set("mode", cycle(["notes", "time", "attack", "zen"], s.mode)) },
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

let root, els, test, view, piano, resizeObserver, cleanups, ticker, earTimer;
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
  } else if (e.code === "Space" && !e.repeat && !showingResults() && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
    e.preventDefault();
    playCurrent();
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
  if (test?.cfg.ear) parts.push(`<button class="text-button replay-button">${icon("ear")}<span><kbd>space</kbd> or pedal to replay</span></button>`);
  if (test?.cfg.mode === "zen") parts.push(`<span><kbd>shift</kbd> + <kbd>enter</kbd> to finish</span>`);
  els.hint.innerHTML = parts.map((p) => `<span class="hint-part">${p}</span>`).join("");
  els.hint.querySelector(".replay-button")?.addEventListener("click", (e) => {
    e.currentTarget.blur();
    playCurrent();
  });
}

// ---- sound: ear mode and replay ----

/** Play the current note or chord (space, the replay button, or the sustain pedal). */
function playCurrent() {
  const engine = test?.engine;
  const item = engine?.items[engine.index];
  if (!item || engine.state === "done") return false;
  audio.unlock();
  return audio.play(item.notes.map(midiOf));
}

/** In ear mode, play the current item after a short pause (so it doesn't blur into the last note). */
function scheduleEarPlay(delay) {
  clearTimeout(earTimer);
  if (test?.cfg.ear) earTimer = setTimeout(playCurrent, delay);
}

// ---- test lifecycle ----

function stopTimers() {
  clearInterval(ticker);
  clearTimeout(earTimer);
  if (test?.attack) cancelAnimationFrame(test.attack.raf);
  ticker = earTimer = null;
}

// ---- attack mode ----

/**
 * One animation frame: advance the track at the current speed (which rises over time) and charge a
 * life for each note that reaches the hit line unplayed. Positions are in staff spaces: item k's
 * notehead is at x0 + k * slot - distance on screen.
 */
function attackFrame(now) {
  const { attack: a, engine } = test;
  if (!a || engine.state !== "running" || !view?.attack) return;
  const dt = Math.min(0.1, (now - a.last) / 1000); // cap, so a background tab doesn't skip ahead
  a.last = now;
  a.npm = a.startNpm + ATTACK_RAMP_NPM_PER_MIN * ((performance.now() - engine.startTime) / 60000);
  a.peak = Math.max(a.peak, a.npm);
  const { x0, hitX, slot } = view.attack;
  a.distance += (a.npm / 60) * slot * dt;

  while (engine.state === "running" && x0 + engine.index * slot - a.distance <= hitX) {
    const missed = engine.index;
    engine.miss(performance.now());
    a.lives--;
    if (settings.get("errorSound")) audio.error();
    els.counter.classList.remove("lost");
    void els.counter.offsetWidth;
    els.counter.classList.add("lost");
    if (a.lives <= 0) return finish(performance.now());
    view.update(missed);
    scheduleEarPlay(200);
  }
  view.scroll();
  renderCounter();
  a.raf = requestAnimationFrame(attackFrame);
}

/** Attack mode view: one staff line whose notes scroll toward the hit line. */
function drawAttack() {
  const s = settings.all();
  const { engine, genOpts, attack: a } = test;
  const staffSpace = STAFF_SPACE[s.noteSize];
  const width = els.staff.clientWidth;
  const W = width / staffSpace;
  const layout = { ...genOpts, noteNames: s.noteNames, track: true };

  // Render the items visible at the current distance (plus a little either side).
  let handle, base, end;
  const render = () => {
    const probe = handle ?? renderStaff(els.staff, { ...layout, items: [], width, staffSpace, caretStyle: s.caretStyle, smoothCaret: false });
    const { hitX, slot } = probe;
    const x0 = probe.noteX(0);
    if (a.distance === null) a.distance = x0 - (hitX + 0.35 * (W - hitX)); // first note starts a third of the way in
    base = Math.max(0, Math.floor((a.distance - (x0 - hitX)) / slot) - 1);
    end = Math.min(engine.items.length, base + Math.ceil((W - hitX) / slot) + 8);
    handle = renderStaff(els.staff, { ...layout, items: engine.items.slice(base, end), width, staffSpace, caretStyle: s.caretStyle, smoothCaret: false });
    for (let k = base; k < end; k++) handle.setState(k - base, engine.states[k]);
    handle.setCaret(engine.index - base);
    view.attack = { x0, hitX, slot };
    applyHiding();
    view.scroll();
  };
  const applyHiding = () => {
    const { ear, earReference } = test.cfg;
    if (!ear) return;
    for (let k = base; k < end; k++) {
      if (engine.states[k] === "pending") handle.setHidden(k - base, !(earReference && k === 0) && !test.revealed.has(k));
    }
  };

  view = {
    attack: null,
    scroll() {
      const { x0, hitX, slot } = view.attack;
      // Re-render once the window has drifted: new notes coming in, or old ones long gone.
      const neededEnd = Math.floor((a.distance + W - x0) / slot) + 2;
      const neededBase = Math.floor((a.distance - (x0 - hitX)) / slot) - 1;
      if (neededEnd >= end && end < engine.items.length) return render();
      if (neededBase > base + 8) return render();
      handle.setTrackOffset(base * slot - a.distance);
    },
    update(prevIndex) {
      if (engine.index >= end - 1) return render();
      if (prevIndex >= base && prevIndex < end) handle.setState(prevIndex - base, engine.states[prevIndex]);
      handle.setCaret(engine.index - base);
      applyHiding();
    },
    shakeItem(index) {
      if (index >= base && index < end) handle.shakeItem(index - base);
    },
    reveal(index) {
      test.revealed.add(index);
      if (index >= base && index < end) handle.setHidden(index - base, false);
    },
    setBlink(on) {
      handle?.setCaretBlink(on);
    },
  };
  render();
  view.setBlink(engine.state === "idle");
}

function restart() {
  stopTimers();
  exitFocusMode();
  const cfg = settings.all();
  const fifths = cfg.keySignature === "random" ? KEYS[Math.floor(Math.random() * KEYS.length)].fifths : cfg.keySignature;
  const genOpts = {
    clef: cfg.clef,
    fifths,
    accidentals: cfg.accidentals,
    ledgerLines: cfg.ledgerLines,
    maxLeap: cfg.maxLeap === "any" ? Infinity : cfg.maxLeap,
    chords: cfg.chords,
    chordStyle: cfg.chordStyle,
    maxChordNotes: cfg.maxChordNotes,
  };
  const engine = new TestEngine({
    items: generateItems(cfg.mode === "notes" ? cfg.notesCount : 100, genOpts),
    mode: cfg.mode,
    chordWindow: cfg.chordWindow,
    ignoreOctave: cfg.ignoreOctave,
    isOutsideMidiRange: (midi) => midiRange.isOutside(midi),
    generateMore: cfg.mode === "notes" ? null : (count) => generateItems(count, genOpts),
  });
  const attack =
    cfg.mode === "attack" ? { lives: ATTACK_LIVES, startNpm: cfg.attackSpeed, npm: cfg.attackSpeed, peak: cfg.attackSpeed, distance: null, last: 0, raf: 0 } : null;
  test = { cfg, fifths, genOpts, engine, attack, revealed: new Set(), wrongs: new Map() };
  view = null;

  els.results.hidden = true;
  els.menu.hidden = true;
  els.area.hidden = false;
  els.piano.hidden = !cfg.onScreenKeyboard;
  const meta = `${cfg.clef === "grand" ? "grand staff" : cfg.clef} · ${keyName(fifths)}`;
  const task = cfg.ear ? "listen, then play what you hear" : attack ? "play each note before it reaches the line" : "";
  els.meta.textContent = task ? `${meta} · ${task}` : meta;
  root.classList.remove("running");
  renderCounter();
  renderHint();
  draw();
  scheduleEarPlay(500);
}

const EAR_REVEAL_AFTER = 3; // wrong notes before ear mode shows the note

function onInput(ev) {
  if (ev.type === "control") {
    if (ev.name === "pedal" && !showingResults()) playCurrent();
    return;
  }
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
  if (!out.correct) onWrong(before);
  if (out.resolved) {
    view?.update(before);
    scheduleEarPlay(350);
  }
  renderCounter();
  if (engine.state === "done") showResults();
}

/**
 * Wrong note: shake the note. A hidden note (memory or ear mode) can't be skipped, so it is
 * revealed: right away in memory mode, after a few tries in ear mode (which replays it each time).
 */
function onWrong(index) {
  const { cfg } = test;
  if (settings.get("errorSound")) audio.error();
  view?.shakeItem(index);
  if (cfg.ear) {
    const wrongs = (test.wrongs.get(index) ?? 0) + 1;
    test.wrongs.set(index, wrongs);
    if (wrongs >= EAR_REVEAL_AFTER) view?.reveal(index);
    scheduleEarPlay(450);
  } else if (cfg.memory) view?.reveal(index);
}

function onStart() {
  root.classList.add("running");
  document.body.classList.add("focus-mode");
  view?.setBlink(false);
  if (test.attack) {
    test.attack.last = performance.now();
    test.attack.raf = requestAnimationFrame(attackFrame);
  }
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
  const r = computeResults(engine, cfg, { peakNpm: test.attack?.peak });
  const { isPb } = saveResult(
    {
      npm: r.npm,
      acc: r.acc,
      consistency: r.consistency,
      seconds: r.seconds,
      fifths,
      ...(test.attack && { score: r.score, peakNpm: r.peakNpm }),
      misses: r.pitches.filter((p) => p.misses).map((p) => [pitchName(p.pitch), p.misses, p.attempts]),
    },
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
  if (test?.attack && engine.state !== "done") {
    // Lives, notes cleared, current speed. Rebuilt only when it changes (this runs every frame).
    const a = test.attack;
    const cleared = engine.results.filter((r) => !r.missed).length;
    const hearts = Array.from({ length: ATTACK_LIVES }, (_, i) => `<span class="life${i < a.lives ? "" : " lost"}">${icon("heart")}</span>`).join("");
    const html = `<span class="lives">${hearts}</span><span>${cleared}</span><span class="speed">${Math.round(a.npm)} npm</span>`;
    if (els.counter.dataset.html !== html) {
      els.counter.innerHTML = html;
      els.counter.dataset.html = html;
    }
    return;
  }
  els.counter.dataset.html = "";
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
  if (test.attack) return drawAttack();
  const s = settings.all();
  const { engine, genOpts } = test;
  const staffSpace = STAFF_SPACE[s.noteSize];
  const width = els.staff.clientWidth;
  const layout = { ...genOpts, noteNames: s.noteNames };
  const capacity = lineCapacity(width / staffSpace, layout);
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
    const handle = renderStaff(holder, { ...layout, items, width, staffSpace, caretStyle: s.caretStyle, smoothCaret: s.smoothCaret });
    items.forEach((_, k) => handle.setState(k, engine.states[startIndex + k]));
    handle.setCaret(l === 0 ? engine.index - startIndex : -1);
    lines.push({ handle, startIndex, count: items.length });
  }
  const locate = (index) => {
    const line = lines.find((ln) => index >= ln.startIndex && index < ln.startIndex + capacity);
    return line ? { line, k: index - line.startIndex } : null;
  };

  // Hidden notes. Ear mode: every unplayed note is hidden (except the first, as a pitch reference,
  // if enabled). Memory mode: once the first note of the current line is played, the rest of that
  // line fades out. Notes revealed after wrong tries (see onWrong) stay visible.
  const applyHiding = () => {
    const { memory, ear, earReference } = test.cfg;
    if (!memory && !ear) return;
    lines.forEach(({ handle, startIndex, count }, l) => {
      for (let k = 0; k < count; k++) {
        const index = startIndex + k;
        if (engine.states[index] !== "pending") continue;
        const hide = ear ? !(earReference && index === 0) : l === 0 && engine.index > startIndex;
        handle.setHidden(k, hide && !test.revealed.has(index));
      }
    });
  };
  applyHiding();

  view = {
    update(prevIndex) {
      // Moving to a new line re-renders, so the current line is always on top.
      if (Math.floor(Math.min(engine.index, engine.items.length - 1) / capacity) !== firstLine) return draw();
      const prev = locate(prevIndex);
      prev?.line.handle.setState(prev.k, engine.states[prevIndex]);
      const cur = locate(engine.index);
      lines[0].handle.setCaret(cur ? cur.k : -1);
      applyHiding();
    },
    shakeItem(index) {
      const loc = locate(index);
      loc?.line.handle.shakeItem(loc.k);
    },
    reveal(index) {
      test.revealed.add(index);
      const loc = locate(index);
      loc?.line.handle.setHidden(loc.k, false);
    },
    setBlink(on) {
      lines[0]?.handle.setCaretBlink(on);
    },
  };
  view.setBlink(engine.state === "idle");
}
