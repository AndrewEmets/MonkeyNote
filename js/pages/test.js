// Test page: config bar, staff lines with caret, input handling, live counter, results.
import { OPTIONS, settings } from "../settings.js";
import { generateItems, keyName, midiOf, pitchFromDiatonic, resolveKey, staffRange } from "../music.js";
import { keyMenuItems } from "../key-menu.js";
import { lineCapacity, renderStaff } from "../staff.js";
import { icon } from "../icons.js";
import { input } from "../input.js";
import { keyboardInput } from "../keyboard-input.js";
import { keyLights, midiStatus, onMidiChange } from "../midi.js";
import { midiRange } from "../midi-range.js";
import { createPiano } from "../piano.js";
import { TestEngine } from "../engine.js";
import { computeResults, renderResults } from "../results.js";
import { bestKey, configKey, loadPbs, loadResults, recordPlayTime, recordTestStart, saveResult } from "../history.js";
import { applyLevel, LEVELS, matchingLevel, rankStatus, restoreCustom } from "../levels.js";
import { tipAttr } from "../tooltip.js";
import { notify } from "../notify.js";
import { audio } from "../audio.js";
import { themeNames } from "../theme.js";
import { askNumber, isPaletteOpen, openShare } from "../palette.js";
import { closeMenu, openMenu } from "../menu.js";
import { valueLabel } from "../setting-defs.js";
import { debug } from "../debug.js";

const STAFF_SPACE = { small: 10, medium: 14, large: 18, xl: 22 }; // px at the base font size (16px)
/** Staff space in px: grows with the page's font size, which grows on big screens (style.css). */
const staffSpaceOf = (size) => (STAFF_SPACE[size] * parseFloat(getComputedStyle(document.documentElement).fontSize)) / 16;
const MODE_VALUES = {
  notes: ["notesCount", [8, 16, 32, 64]],
  time: ["timeLimit", [15, 30, 60, 120]],
  attack: ["attackSpeed", [20, 30, 45, 60]], // starting speed, notes per minute
};
// Attack mode: speed rises by this many notes per minute, every minute; three misses end the run.
const ATTACK_RAMP_NPM_PER_MIN = 20;
const ATTACK_LIVES = 3;
// After a miss: notes spring back this many slots from the line, then speed recovers gradually.
const ATTACK_BACKOFF_SLOTS = 4;
const ATTACK_SPRING_MS = 700;
const ATTACK_RECOVER_MS = 2500;
const spring = (p) => 1 - Math.exp(-6 * p) * Math.cos(10 * p); // damped spring, overshoots then settles
// How notes are presented: read them (default), memorize them, or hear them. Mutually exclusive.
const PRESENTATIONS = [
  ["default", "note"],
  ["memory", "eyeOff"],
  ["ear", "ear"],
];
const presentationOf = (s) => (s.ear ? "ear" : s.memory ? "memory" : "default");
function setPresentation(p) {
  // Turn the new one on first, so there's no stop at "default" on the way (each switch loads settings, see profiles.js).
  if (p !== "default") settings.set(p, true);
  settings.set("memory", p === "memory");
  settings.set("ear", p === "ear");
}
const CUSTOM_LENGTH = { notesCount: { title: "notes per test", min: 1, max: 999 }, timeLimit: { title: "seconds per test", min: 5, max: 3600 } };
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
  "chordWindow", "ignoreOctave", "fitRange", "memoryBatch", "earBatch", "memoryPresets", "earPresets", "chordPower", "paceCaret", "paceCaretNpm", "keyLights", "keyLightChannel",
]);
const REDRAW_KEYS = new Set(["noteSize", "caretStyle", "smoothCaret", "fontFamily", "staffLines", "noteNames", "barLines"]);
const PIANO_KEYS = new Set(["onScreenKeyboard", "keyLabels", "clef", "ledgerLines"]);

// Results-screen MIDI menu: white keys (any octave) act as buttons. Changes wait for C to restart.
const MENU_LOCKOUT_MS = 1000; // ignore trailing notes from the exercise
const cycle = (list, value) => list[(list.indexOf(value) + 1) % list.length];
const onOff = (v) => (v ? "on" : "off");
const MIDI_MENU = [
  { pc: 0, name: "C", label: () => "restart", run: () => restart() },
  { pc: 2, name: "D", label: (s) => `chords ${onOff(s.chords)}`, run: (s) => settings.set("chords", !s.chords) },
  { pc: 4, name: "E", label: (s) => `memory ${onOff(s.memory)}`, run: (s) => setPresentation(s.memory ? "default" : "memory") },
  { pc: 5, name: "F", label: (s) => `ear ${onOff(s.ear)}`, run: (s) => setPresentation(s.ear ? "default" : "ear") },
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
    <div class="config-bar" role="toolbar" aria-label="test configuration">
      <div class="config-section" data-section="presentation"></div><span class="divider section-divider"></span><div class="config-section" data-section="mode"></div>
    </div>
    <div class="test-area">
      <div class="test-top"><div class="test-counter"></div><div class="test-meta"></div></div>
      <div class="staff-wrap"></div>
      <div class="input-hint"></div>
    </div>
    <div class="results" hidden></div>
    <div class="midi-menu" hidden></div>
    <div class="piano-wrap"></div>
    <button class="restart-button" aria-label="restart test">${icon("restart")}</button>`;
  container.appendChild(root);
  els = {
    config: root.querySelector(".config-bar"),
    configPresentation: root.querySelector('[data-section="presentation"]'),
    configMode: root.querySelector('[data-section="mode"]'),
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
  els.meta.addEventListener("click", onMetaClick);
  root.querySelector(".restart-button").addEventListener("click", (e) => {
    e.currentTarget.blur();
    restart();
  });
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("monkeyscore:restart", restart);
  document.addEventListener("mousemove", exitFocusMode);
  resizeObserver = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      if (target === els.staff) draw();
      else markConfigWrap();
    }
  });
  resizeObserver.observe(els.staff);
  resizeObserver.observe(els.config);

  keyboardInput.setOctave(DEFAULT_OCTAVE[settings.get("clef")]);
  keyboardInput.attach();
  const onScreenHeight = () => draw();
  SHORT_SCREEN.addEventListener("change", onScreenHeight);
  cleanups = [
    () => SHORT_SCREEN.removeEventListener("change", onScreenHeight),
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
    debug.subscribe((on) => {
      if (!on) stopAutoplay();
      renderHint();
    }),
    () => stopAutoplay(),
  ];

  renderConfig();
  renderPiano();
  restart();
}

export function unmount() {
  keyLights.clear();
  closeMenu();
  recordAbandoned();
  stopTimers();
  exitFocusMode();
  document.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("monkeyscore:restart", restart);
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
    else scheduleRestart();
  } else if (REDRAW_KEYS.has(key)) draw();
}

// Several settings often change together (e.g. memory off + ear on): restart once, after the last.
let restartQueued = false;
function scheduleRestart() {
  if (restartQueued) return;
  restartQueued = true;
  queueMicrotask(() => {
    restartQueued = false;
    if (root?.isConnected) restart();
  });
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
  } else if (debug.on && !e.ctrlKey && !e.altKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
    // Debug cheat keys (none of these are note keys on the computer keyboard).
    const action = { Enter: () => cheat(true), Backspace: () => cheat(false), Backslash: toggleAutoplay }[e.code === "Backslash" ? "Backslash" : e.key];
    if (action && !e.repeat) {
      e.preventDefault();
      action();
    }
  }
}

// ---- debug cheats ----

const AUTOPLAY_MS = 700;
const AUTOPLAY_WRONG_RATE = 0.15;
let autoplayTimer = null;

/** Play the current note or chord (right) or a note that isn't in it (wrong), as if from MIDI. */
function cheat(right) {
  const engine = test?.engine;
  const item = engine?.items[engine.index];
  if (!item || engine.state === "done" || showingResults()) return;
  const targets = item.notes.map(midiOf);
  let wrong = targets[0] + 1;
  while (targets.includes(wrong)) wrong++;
  const midis = right ? targets : [wrong];
  for (const m of midis) input.noteOn(m, "debug");
  setTimeout(() => midis.forEach((m) => input.noteOff(m, "debug")), 120);
}

/** Autoplay: right notes every AUTOPLAY_MS, with the odd wrong one, until the test ends. */
function toggleAutoplay() {
  if (autoplayTimer) return stopAutoplay();
  autoplayTimer = setInterval(() => {
    if (showingResults() || !test?.engine || test.engine.state === "done") return stopAutoplay();
    cheat(Math.random() >= AUTOPLAY_WRONG_RATE);
  }, AUTOPLAY_MS);
  renderHint();
}

function stopAutoplay() {
  clearInterval(autoplayTimer);
  autoplayTimer = null;
  if (root) renderHint();
}

// ---- config bar ----



function renderConfig() {
  const s = settings.all();
  const button = (key, value, label, iconName, active) =>
    `<button class="text-button${active ? " active" : ""}" data-key="${key}" data-value='${JSON.stringify(value)}'>${iconName ? icon(iconName) : ""}<span>${label}</span></button>`;
  // Custom value button: the wrench, plus the value when it's the one in use.
  const custom = (action, isCustom, value, tip) =>
    `<button class="text-button custom-pick${isCustom ? " active" : ""}" data-action="${action}"${tipAttr(tip)}>${icon("wrench")}${isCustom ? `<span>: ${value}</span>` : ""}</button>`;
  const current = presentationOf(s);
  const groups = [
    {
      id: "presentation",
      html: PRESENTATIONS.map(([p, ic]) => `<button class="text-button${current === p ? " active" : ""}" data-action="presentation" data-value="${p}">${icon(ic)}<span>${p}</span></button>`).join(""),
    },
  ];
  // How many notes at a time: memorized (memory) or heard in a row (ear).
  if (s.memory) {
    groups.push({
      id: "batch-memory",
      html: `<span class="group-icon">${icon("eyeOff")}</span>${s.memoryPresets.map((v) => button("memoryBatch", v, v, null, s.memoryBatch === v)).join("")}${custom(
        "memory-custom",
        !s.memoryPresets.includes(s.memoryBatch),
        s.memoryBatch,
        "custom batch size and quick picks",
      )}`,
    });
  } else if (s.ear) {
    groups.push({
      id: "batch-ear",
      html: `<span class="group-icon">${icon("ear")}</span>${s.earPresets.map((v) => button("earBatch", v, v, null, s.earBatch === v)).join("")}${custom(
        "ear-custom",
        !s.earPresets.includes(s.earBatch),
        s.earBatch,
        "custom group size and quick picks",
      )}`,
    });
  }
  // Second section (wraps to its own row as a whole when the bar doesn't fit on one): mode and length.
  syncGroups(els.configPresentation, groups);
  groups.length = 0;
  groups.push({ id: "modes", html: MODES.map(([mode, ic]) => button("mode", mode, mode, ic, s.mode === mode)).join("") });
  const [valueKey, values] = MODE_VALUES[s.mode] ?? [];
  if (valueKey) {
    groups.push({
      id: `lengths-${s.mode}`,
      html:
        values.map((v) => button(valueKey, v, v, null, s[valueKey] === v)).join("") +
        (CUSTOM_LENGTH[valueKey] ? custom("length-custom", !values.includes(s[valueKey]), s[valueKey], `custom ${CUSTOM_LENGTH[valueKey].title}`) : ""),
    });
  }
  syncGroups(els.configMode, groups);
  markConfigWrap();
}

/** When the two sections sit on separate rows, drop the divider between them. */
function markConfigWrap() {
  const { configPresentation: a, configMode: b } = els;
  els.config.classList.toggle("wrapped", b.offsetTop > a.offsetTop + a.offsetHeight / 2);
}

const GROUP_MS = 260;
const GROUP_EASING = "cubic-bezier(0.3, 0, 0.2, 1)";

/**
 * Update the test bar group by group: changed groups update in place, new ones grow in from zero
 * width and removed ones collapse, so the rest slide to their new places instead of jumping.
 */
function syncGroups(container, groups) {
  const animate = container.querySelector(".group:not([data-leaving])") !== null;
  const live = new Map();
  const leaving = new Map();
  for (const el of container.children) (el.dataset.leaving ? leaving : live).set(el.dataset.group, el);
  const wanted = new Set(groups.map((g) => g.id));

  // Collapse groups that are no longer wanted (removed when done, or after a timeout as a fallback).
  for (const [id, el] of live) {
    if (wanted.has(id)) continue;
    el.dataset.leaving = "1";
    const remove = () => el.dataset.leaving && el.remove();
    el.collapse = el.animate([{ width: `${el.offsetWidth}px`, opacity: 1 }, { width: "0px", opacity: 0 }], { duration: GROUP_MS, easing: GROUP_EASING, fill: "forwards" });
    el.collapse.finished.then(remove).catch(() => {});
    setTimeout(remove, GROUP_MS + 100);
  }

  let prev = null;
  groups.forEach((g, i) => {
    const html = (i > 0 ? `<span class="divider"></span>` : "") + g.html;
    let el = live.get(g.id);
    let grow = false;
    if (!el && leaving.has(g.id)) {
      // Wanted again while collapsing: bring it back instead of adding a second copy.
      el = leaving.get(g.id);
      el.collapse?.cancel();
      delete el.dataset.leaving;
    }
    if (!el) {
      el = document.createElement("div");
      el.className = "group";
      el.dataset.group = g.id;
      grow = animate;
    }
    if (el.dataset.html !== html) {
      el.innerHTML = html;
      el.dataset.html = html;
    }
    // Place after the previous group, leaving collapsing groups where they are.
    let after = prev ? prev.nextElementSibling : container.firstElementChild;
    while (after && after !== el && after.dataset.leaving) after = after.nextElementSibling;
    if (after !== el) container.insertBefore(el, after);
    if (grow) el.animate([{ width: "0px", opacity: 0 }, { width: `${el.offsetWidth}px`, opacity: 1 }], { duration: GROUP_MS, easing: GROUP_EASING });
    prev = el;
  });
}

/** Custom batch size, with the test bar's quick picks editable in the same prompt. */
async function askBatch(key, presetsKey, title, min, max) {
  const r = await askNumber({ title, value: settings.get(key), min, max, presets: settings.get(presetsKey) });
  if (!r) return;
  settings.set(presetsKey, r.presets);
  settings.set(key, r.value);
}

async function onConfigClick(e) {
  const btn = e.target.closest("button");
  if (!btn) return;
  btn.blur();
  if (btn.dataset.key) settings.set(btn.dataset.key, JSON.parse(btn.dataset.value));
  else if (btn.dataset.action === "presentation") setPresentation(btn.dataset.value);
  else if (btn.dataset.action === "ear-custom") askBatch("earBatch", "earPresets", "notes heard in a row", 2, 8);
  else if (btn.dataset.action === "memory-custom") askBatch("memoryBatch", "memoryPresets", "notes to memorize", 1, 32); else if (btn.dataset.action === "length-custom") {
    const key = MODE_VALUES[settings.get("mode")][0];
    const { title, min, max } = CUSTOM_LENGTH[key];
    const n = await askNumber({ title, value: settings.get(key), min, max });
    if (n !== null) settings.set(key, n);
  }
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
  if (debug.on)
    parts.push(
      `<span class="debug-hint">${icon("bug")}<span>debug: <kbd>enter</kbd> right · <kbd>backspace</kbd> wrong · <kbd>\\</kbd> autoplay ${autoplayTimer ? "on" : "off"}</span></span>`,
    );
  els.hint.innerHTML = parts.map((p) => `<span class="hint-part">${p}</span>`).join("");
  els.hint.querySelector(".replay-button")?.addEventListener("click", (e) => {
    e.currentTarget.blur();
    playCurrent();
  });
}

// ---- sound: ear mode and replay ----

const EAR_SEQUENCE_GAP_MS = 650; // between notes heard in a row (ear batch of 2 or 3)
let earSequence = []; // timers of a sequence being played

/** Notes per group: memory batch or ear group (0 otherwise). */
const groupSize = (cfg) => (cfg.ear ? cfg.earBatch : cfg.memory ? cfg.memoryBatch : 0);
/** Divider lines (when on): between groups in memory and ear mode, else every 4 notes. */
const dividerEvery = (s, cfg) => (s.barLines ? groupSize(cfg) || s.barLines : 0);

/** Ear mode: whether unplayed item k is hidden: all but each group's first note (a known pitch to hear the rest against). */
const earHides = (k) => k % test.cfg.earBatch !== 0;

/** Items heard together in ear mode: the batch (of ear batch size) holding `index`. */
function earBatchRange(index) {
  const n = test.cfg.earBatch;
  const start = Math.floor(index / n) * n;
  return [start, Math.min(start + n, test.engine.items.length)];
}

/** Play items [a, b) one after another, each for a moment; each note pulses on the staff as it sounds. */
function playSequence(a, b) {
  earSequence.forEach(clearTimeout);
  audio.unlock();
  const { items } = test.engine;
  earSequence = [];
  for (let i = a; i < b; i++) {
    earSequence.push(
      setTimeout(() => {
        audio.play(items[i].notes.map(midiOf), 0.9);
        view?.pulse(i);
      }, (i - a) * EAR_SEQUENCE_GAP_MS),
    );
  }
}

/**
 * Space, the replay button or the sustain pedal: in ear mode, replay the whole batch being heard;
 * otherwise play the current note or chord.
 */
function playCurrent() {
  const engine = test?.engine;
  const item = engine?.items[engine.index];
  if (!item || engine.state === "done") return false;
  if (test.cfg.ear && test.cfg.earBatch > 1) {
    playSequence(...earBatchRange(engine.index));
    return true;
  }
  audio.unlock();
  view?.pulse(engine.index);
  return audio.play(item.notes.map(midiOf));
}

/**
 * Ear mode: after a short pause, play the next batch ("batch", only when the current note starts one)
 * or just the current note ("current", e.g. after a miss in attack mode).
 */
function scheduleEarPlay(delay, what = "batch") {
  clearTimeout(earTimer);
  if (!test?.cfg.ear) return;
  const engine = test.engine;
  if (what === "batch" && engine.index !== earBatchRange(engine.index)[0]) return; // mid-batch: keep going from memory
  earTimer = setTimeout(() => {
    if (what === "current") {
      if (engine.items[engine.index]) playSequence(engine.index, engine.index + 1);
    } else playCurrent();
  }, delay);
}

// ---- test lifecycle ----

function stopTimers() {
  clearInterval(ticker);
  clearTimeout(earTimer);
  earSequence.forEach(clearTimeout);
  if (test?.attack) cancelAnimationFrame(test.attack.raf);
  if (test) cancelAnimationFrame(test.paceRaf);
  ticker = earTimer = null;
}

// ---- key lights ----

/** Hints make a test practice, not ranked: lights on the current note, or any mistake light shown. */
const hintsUsed = () => test.cfg.keyLights === "current" || !!test.hinted;

/** Light the current note's keys ("current"), or only after a wrong note on it ("mistake"). */
function updateLights() {
  const engine = test?.engine;
  const mode = test?.cfg.keyLights;
  const item = engine?.items[engine.index];
  const show = item && engine.state !== "done" && !showingResults() && (mode === "current" || (mode === "mistake" && test.lightIndex === engine.index));
  if (!show) return keyLights.clear();
  if (keyLights.show(item.notes.map(midiOf))) test.hinted ||= mode === "mistake";
}

// ---- pace caret ----

/** Target speed (npm) for the pace caret, or null: custom, best, or average of the last 10 runs with these settings. */
function paceFor(cfg) {
  if (cfg.mode === "attack" || cfg.paceCaret === "off") return null;
  if (cfg.paceCaret === "custom") return cfg.paceCaretNpm;
  const key = configKey(cfg);
  if (cfg.paceCaret === "pb") return loadPbs()[bestKey(cfg, rankStatus(cfg))]?.npm ?? null;
  const recent = loadResults().filter((r) => r.config === key && r.npm > 0).slice(-10);
  return recent.length ? recent.reduce((a, r) => a + r.npm, 0) / recent.length : null;
}

/** Move the pace caret: the first note starts the clock (and is free), then `pace` notes per minute. */
function paceFrame() {
  const { engine, pace } = test;
  if (!pace || engine.state !== "running") return;
  view?.setGhost?.(1 + ((performance.now() - engine.startTime) / 60000) * pace);
  test.paceRaf = requestAnimationFrame(paceFrame);
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
  const r = a.recover;

  if (r?.phase === "spring") {
    // After a miss: the notes spring back to the right...
    const p = Math.min(1, (now - r.start) / ATTACK_SPRING_MS);
    a.distance = r.from + (r.to - r.from) * spring(p);
    if (p >= 1) a.recover = { phase: "ramp", start: now };
  } else {
    // ...then start again slowly and speed back up to the current npm.
    const factor = r ? Math.min(1, ((now - r.start) / ATTACK_RECOVER_MS) ** 2) : 1;
    if (r && factor >= 1) a.recover = null;
    a.distance += (a.npm / 60) * slot * dt * factor;
    if (x0 + engine.index * slot - a.distance <= hitX && !onAttackMiss(now)) return;
  }
  view.scroll();
  renderCounter();
  a.raf = requestAnimationFrame(attackFrame);
}

/**
 * The current note reached the line: lose a life, mark it missed (it still has to be played) and
 * spring the notes back. Returns false when that was the last life.
 */
function onAttackMiss(now) {
  const { attack: a, engine } = test;
  const { x0, hitX, slot } = view.attack;
  const index = engine.index;
  engine.miss(performance.now());
  a.lives--;
  if (settings.get("errorSound")) audio.error();
  els.counter.classList.remove("lost");
  void els.counter.offsetWidth;
  els.counter.classList.add("lost");
  if (a.lives <= 0) {
    finish(performance.now());
    return false;
  }
  view.markMissed(index);
  if (test.cfg.memory) view.reveal(index); // a missed note must be played, so it can't stay hidden
  a.recover = { phase: "spring", start: now, from: a.distance, to: x0 + index * slot - (hitX + ATTACK_BACKOFF_SLOTS * slot) };
  scheduleEarPlay(200, "current");
  return true;
}

/** Attack mode view: one staff line whose notes scroll toward the hit line. */
function drawAttack() {
  const s = settings.all();
  const { engine, genOpts, attack: a } = test;
  const staffSpace = staffSpaceOf(s.noteSize);
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
    handle = renderStaff(els.staff, { ...layout, items: engine.items.slice(base, end), indexOffset: base, barEvery: dividerEvery(s, test.cfg), width, staffSpace, caretStyle: s.caretStyle, smoothCaret: false });
    for (let k = base; k < end; k++) handle.setState(k - base, stateOf(k));
    handle.setCaret(engine.index - base);
    view.attack = { x0, hitX, slot };
    applyHiding();
    view.scroll();
  };
  // A missed note that is still current shows red until it's played.
  const stateOf = (k) => (k === engine.index && engine.currentMissed ? "pending missed" : engine.states[k]);
  // Ear: unplayed notes are hidden. Memory: notes come in groups (memory batch); once a group's first
  // note is played, the rest of it hides. Later groups stay visible until their turn.
  const applyHiding = () => {
    const { ear, memory, memoryBatch } = test.cfg;
    if (!ear && !memory) return;
    for (let k = base; k < end; k++) {
      if (engine.states[k] !== "pending") continue;
      const hide = ear ? earHides(k) : engine.index > Math.floor(k / memoryBatch) * memoryBatch;
      handle.setHidden(k - base, hide && !test.revealed.has(k));
    }
  };

  view = {
    attack: null,
    scroll() {
      const { x0, hitX, slot } = view.attack;
      // Re-render once the window has drifted: new notes coming in, or old ones long gone.
      const neededEnd = Math.floor((a.distance + W - x0) / slot) + 2;
      const neededBase = Math.max(0, Math.floor((a.distance - (x0 - hitX)) / slot) - 1);
      if (neededEnd >= end && end < engine.items.length) return render();
      if (neededBase > base + 8 || neededBase < base) return render(); // < base: sprang back after a miss
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
    markMissed(index) {
      if (index >= base && index < end) handle.setState(index - base, stateOf(index));
    },
    pulse(index) {
      if (index >= base && index < end) handle.pulse(index - base);
    },
    setBlink(on) {
      handle?.setCaretBlink(on);
    },
  };
  render();
  view.setBlink(engine.state === "idle");
}

/**
 * A test left unfinished (restart or leaving the page) still counts as started and toward time played.
 * Tests where a debug cheat was used aren't recorded at all.
 */
function recordAbandoned() {
  if (test?.engine?.state !== "running" || test.cheated) return;
  recordTestStart();
  recordPlayTime(performance.now() - test.engine.startTime);
}

function restart() {
  recordAbandoned();
  stopTimers();
  exitFocusMode();
  if (settings.get("randomTheme")) {
    const names = themeNames().filter((n) => n !== settings.get("theme"));
    settings.set("theme", names[Math.floor(Math.random() * names.length)]);
  }
  const cfg = settings.all();
  const { fifths, minor, harmonic } = resolveKey(cfg.keySignature);
  const genOpts = {
    clef: cfg.clef,
    fifths,
    harmonic,
    accidentals: cfg.accidentals,
    ledgerLines: cfg.ledgerLines,
    maxLeap: cfg.maxLeap === "any" ? Infinity : cfg.maxLeap,
    chords: cfg.chords,
    chordStyle: cfg.chordStyle,
    maxChordNotes: cfg.maxChordNotes,
    chordPower: cfg.chordPower,
    midiRange: cfg.fitRange && midiRange.isKnown() ? [midiRange.get().low, midiRange.get().high] : null,
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
  test = { cfg, fifths, minor, harmonic, genOpts, engine, attack, pace: paceFor(cfg), revealed: new Set(), wrongs: new Map() };
  view = null;

  els.results.hidden = true;
  els.menu.hidden = true;
  els.area.hidden = false;
  els.piano.hidden = !cfg.onScreenKeyboard;
  renderMeta();
  root.classList.remove("running");
  renderCounter();
  renderHint();
  draw();
  updateLights();
  scheduleEarPlay(500);
}

const ledgerLabel = (n) => (n === 0 ? "no ledger lines" : `${n} ledger line${n > 1 ? "s" : ""}`);

/** Line above the staff: level, clef, key, chords, leaps and ledger lines, each a dropdown that changes the settings. */
function renderMeta() {
  const { cfg, fifths, minor, harmonic } = test;
  const clef = cfg.clef === "grand" ? "grand staff" : cfg.clef;
  const key = `${keyName(fifths, minor, harmonic)}${String(cfg.keySignature).startsWith("random") ? " (random)" : ""}`;
  const rank = rankStatus(cfg, { hints: hintsUsed() });
  const levelLabel = rank.level ? rank.level.id : "custom";
  const picks = [
    {
      pick: "level",
      cls: rank.ranked ? "ranked" : "",
      tip: rank.ranked ? `ranked: ${rank.level.text}` : rank.level ? `practice: ${rank.reason}` : "practice: custom settings",
      html: `${rank.ranked ? icon("crown") : ""}${levelLabel}`,
    },
    { pick: "clef", html: clef },
    { pick: "keySignature", html: key },
    { pick: "accidentals", html: cfg.accidentals },
    { pick: "chords", html: cfg.chords ? `chords: ${valueLabel("chordPower", cfg.chordPower)}` : "single notes" },
    { pick: "maxLeap", html: `max leap: ${valueLabel("maxLeap", cfg.maxLeap)}` },
    { pick: "ledgerLines", html: ledgerLabel(cfg.ledgerLines) },
  ];
  // Update the buttons in place when they're already there, so an open dropdown keeps its anchor.
  const existing = [...els.meta.querySelectorAll("[data-pick]")];
  if (existing.length === picks.length && existing.every((b, i) => b.dataset.pick === picks[i].pick)) {
    picks.forEach((p, i) => {
      const b = existing[i];
      b.className = `meta-pick${p.cls ? ` ${p.cls}` : ""}`;
      if (p.tip) b.dataset.tip = p.tip;
      if (b.innerHTML !== p.html) b.innerHTML = p.html;
    });
    return;
  }
  els.meta.innerHTML =
    picks.map((p) => `<button class="meta-pick${p.cls ? ` ${p.cls}` : ""}" data-pick="${p.pick}"${tipAttr(p.tip)}>${p.html}</button>`).join(" · ") +
    `<button class="meta-pick meta-share" data-action="share" aria-label="share settings"${tipAttr("share settings")}>${icon("share")}</button>`;
}

function onMetaClick(e) {
  if (e.target.closest('[data-action="share"]')) return openShare();
  const btn = e.target.closest("[data-pick]");
  if (!btn) return;
  const key = btn.dataset.pick;
  if (key === "level") {
    return openMenu(btn, () => {
      const current = matchingLevel(settings.all())?.id;
      return [
        ...LEVELS.map((l) => ({ label: l.id, tip: l.text, active: current === l.id, run: () => applyLevel(l.id) })),
        { label: "custom", tip: "your own settings (practice)", active: !current, run: restoreCustom },
      ];
    });
  }
  if (key === "keySignature") return openMenu(btn, () => keyMenuItems(settings.get("keySignature"), (spec) => settings.set("keySignature", spec)));
  if (key === "chords") {
    // single notes, or chords ▸ with columns for density, style and size (any pick turns chords on)
    const pick = (k, v) => () => {
      settings.set(k, v);
      settings.set("chords", true);
    };
    return openMenu(btn, () => {
      const s = settings.all();
      const column = (title, k) => ({ title, items: OPTIONS[k].map((v) => ({ label: valueLabel(k, v), active: s.chords && s[k] === v, run: pick(k, v) })) });
      return [
        { label: "single notes", active: !s.chords, run: () => settings.set("chords", false) },
        { label: "chords", active: s.chords, sub: [column("density", "chordPower"), column("style", "chordStyle"), column("max notes", "maxChordNotes")] },
      ];
    });
  }
  const label = (v) => (key === "ledgerLines" ? ledgerLabel(v) : valueLabel(key, v));
  openMenu(btn, () => OPTIONS[key].map((v) => ({ label: label(v), active: settings.get(key) === v, run: () => settings.set(key, v) })));
}

const EAR_REVEAL_AFTER = 3; // wrong notes before ear mode shows the note
const EAR_NEXT_DELAY_MS = 750; // pause after a right note before the next one plays
const EAR_WRONG_DELAY_MS = 1100; // pause after a wrong note before the note plays again

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
  if (isPaletteOpen()) return; // notes don't count while the command line is open
  if (showingResults()) return onMenuNote(ev);
  const engine = test?.engine;
  if (!engine || engine.state === "done") return;
  if (ev.source === "debug") test.cheated = true;

  const before = engine.index;
  const out = engine.noteOn(ev.midi, ev.source, ev.time, input.isHeld);
  if (!out) return;
  if (out.started) onStart();
  piano?.flash(ev.midi, out.correct ? "correct" : "error");
  if (!out.correct) onWrong(before);
  if (out.resolved) {
    if (test.cfg.ear && !test.attack) test.revealed.add(before); // found by ear: stays visible after a rewind
    view?.update(before);
    updateLights();
    scheduleEarPlay(EAR_NEXT_DELAY_MS);
  }
  renderCounter();
  // Let the last note animate first (unless a restart happens meanwhile).
  if (engine.state === "done") setTimeout(() => test?.engine === engine && showResults(), LINE_END_MS);
}

/**
 * Wrong note: shake the note. Memory and ear mode then go back to the start of the group, which has
 * to be played again in full: memory shows the group again until its first note is played; ear mode
 * replays the group, keeping the notes found so far visible (and reveals a note after a few wrong tries).
 * Attack mode can't go back (the notes keep coming), so a hidden note is just revealed.
 */
function onWrong(index) {
  const { cfg, engine } = test;
  if (settings.get("errorSound")) audio.error();
  view?.shakeItem(index);
  if (test.cfg.keyLights === "mistake") {
    test.lightIndex = index;
    updateLights();
  }
  const rewindTo = (start) => {
    if (start >= engine.index) return;
    const from = engine.index;
    engine.rewind(start);
    view?.rewind(from);
  };
  if (cfg.ear) {
    const wrongs = (test.wrongs.get(index) ?? 0) + 1;
    test.wrongs.set(index, wrongs);
    if (wrongs >= EAR_REVEAL_AFTER) view?.reveal(index);
    if (test.attack) return scheduleEarPlay(EAR_WRONG_DELAY_MS, "current");
    rewindTo(earBatchRange(index)[0]);
    scheduleEarPlay(EAR_WRONG_DELAY_MS);
  } else if (cfg.memory) {
    if (test.attack) return view?.reveal(index);
    rewindTo(Math.floor(index / cfg.memoryBatch) * cfg.memoryBatch);
  }
}

function onStart() {
  root.classList.add("running");
  document.body.classList.add("focus-mode");
  view?.setBlink(false);
  if (test.attack) {
    test.attack.last = performance.now();
    test.attack.raf = requestAnimationFrame(attackFrame);
  }
  if (test.pace) test.paceRaf = requestAnimationFrame(paceFrame);
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
  keyLights.clear();
  stopAutoplay();
  stopTimers();
  exitFocusMode();
  root.classList.remove("running");
  const { cfg, fifths, minor, harmonic, engine } = test;
  const r = computeResults(engine, cfg, { peakNpm: test.attack?.peak });
  let isPb = false;
  if (!test.cheated) {
    recordTestStart();
    recordPlayTime(engine.endTime - engine.startTime);
    ({ isPb } = saveResult(
      {
        npm: r.npm,
        acc: r.acc,
        consistency: r.consistency,
        seconds: r.seconds,
        notes: r.score, // notes (or chords) played
        fifths,
        minor,
        harmonic,
        ...(test.attack && { score: r.score, peakNpm: r.peakNpm }),
        pitches: r.pitches.map((p) => [p.midi, p.attempts, p.misses]),
      },
      cfg,
      rankStatus(cfg, { hints: hintsUsed() }),
    ));
  }
  els.area.hidden = true;
  els.piano.hidden = true;
  els.results.hidden = false;
  const rank = rankStatus(cfg, { hints: hintsUsed() });
  renderResults(els.results, r, { cfg, fifths, minor, harmonic, isPb, rank, note: test.cheated ? "debug run: not saved to stats" : "" });
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
  const main =
    mode === "notes" ? `${engine.index}/${engine.items.length}` : mode === "time" ? Math.max(0, Math.ceil(timeLimit - (performance.now() - engine.startTime) / 1000)) : engine.index;
  const html = `<span>${main}</span>${test.pace ? `<span class="speed">pace ${Math.round(test.pace)} npm</span>` : ""}`;
  if (els.counter.dataset.html !== html) {
    els.counter.innerHTML = html;
    els.counter.dataset.html = html;
  }
}

function exitFocusMode() {
  document.body.classList.remove("focus-mode");
}

// ---- staff lines ----

const LINE_END_MS = 320; // line change: rows slide up / fade out
const LINE_HOLD_MS = 200; // when the line leaves (no next line visible), first show its last note played
const LINE_EASING = "cubic-bezier(0.3, 0, 0.2, 1)";
const HURRY_RATE = 4; // playing during a line change speeds the animation up instead of cutting it
let transition = null; // { anims, fast, shakes }
const SHORT_SCREEN = window.matchMedia("(max-height: 500px)"); // matches the compact layout in style.css

/**
 * Draw the visible staff lines and set `view`.
 * The current item's line, then the next ones (staff lines setting). With memory or ear groups, a line
 * holds whole groups when they fit.
 * opts.enter: after a line change, how many leading rows were already on screen (the rest fade in);
 * opts.fast: quicker fade-in.
 */
function draw({ enter = null, fast = false } = {}) {
  const shakes = transition?.shakes ?? [];
  transition?.anims.forEach((a) => a.cancel());
  transition = null;
  if (!test || !els.staff.clientWidth) return;
  if (test.attack) {
    els.staff.style.minHeight = "";
    return drawAttack();
  }
  const s = settings.all();
  const { engine, genOpts, cfg } = test;
  const staffSpace = staffSpaceOf(s.noteSize);
  const width = els.staff.clientWidth;
  const layout = { ...genOpts, noteNames: s.noteNames };
  let capacity = lineCapacity(width / staffSpace, layout);
  // Groups (memory batch, ear group) stay on one line when they fit, so a rewind to a group's start
  // doesn't go back a line.
  const group = groupSize(cfg);
  if (group > 1 && capacity >= group) capacity -= capacity % group;
  const memory = cfg.memory && !cfg.ear;
  const pageOf = (i) => Math.floor(Math.min(i, engine.items.length - 1) / capacity);
  const page = pageOf(engine.index);
  const pageStart = page * capacity;

  // Line ranges [start, end) to show.
  const ranges = [];
  const rowCount = SHORT_SCREEN.matches ? 1 : s.staffLines; // a phone held sideways has room for one
  for (let l = 0; l < rowCount; l++) {
    const a = pageStart + l * capacity;
    if (a >= engine.items.length) break;
    ranges.push([a, Math.min(a + capacity, engine.items.length)]);
  }

  // Keep the staff area's height while lines change, so fewer rows near the end of a test
  // (the last line, a short last batch) don't make the page jump. A fresh draw measures again.
  if (enter === null) {
    els.staff.style.minHeight = "";
    test.staffHeight = 0;
  }
  els.staff.replaceChildren();
  const lines = ranges.map(([a, b]) => {
    const holder = document.createElement("div");
    holder.className = "staff-row";
    els.staff.appendChild(holder);
    const items = engine.items.slice(a, b);
    const handle = renderStaff(holder, { ...layout, items, indexOffset: a, barEvery: dividerEvery(s, cfg), width, staffSpace, caretStyle: s.caretStyle, smoothCaret: s.smoothCaret });
    items.forEach((_, k) => handle.setState(k, engine.states[a + k]));
    return { handle, holder, startIndex: a, count: b - a };
  });
  test.staffHeight = Math.max(test.staffHeight ?? 0, els.staff.offsetHeight);
  els.staff.style.minHeight = `${test.staffHeight}px`;

  // After a line change: fade in the rows that weren't on screen before.
  const entering = enter === null ? [] : lines.slice(enter);
  for (const { holder } of entering) {
    holder.animate([{ opacity: 0, transform: "translateY(1rem)" }, { opacity: 1, transform: "none" }], { duration: fast ? 120 : LINE_END_MS, easing: LINE_EASING });
  }

  const locate = (index) => {
    const line = lines.find((ln) => index >= ln.startIndex && index < ln.startIndex + ln.count);
    return line ? { line, k: index - line.startIndex } : null;
  };
  const placeCaret = (index) => {
    const cur = locate(index);
    lines.forEach((ln) => ln.handle.setCaret(ln === cur?.line ? cur.k : -1));
  };
  placeCaret(engine.index);

  // Hidden notes. Ear mode: unplayed notes are hidden except each group's first (see earHides).
  // Memory mode: every batch shows until its first note is played, then the rest of it fades out
  // (and shows again after a rewind to the batch start). Notes revealed in ear mode stay visible.
  const applyHiding = () => {
    const { ear } = cfg;
    if (!memory && !ear) return;
    for (const { handle, startIndex, count } of lines) {
      for (let k = 0; k < count; k++) {
        const index = startIndex + k;
        if (engine.states[index] !== "pending") continue;
        const hide = ear ? earHides(index) : engine.index > index - (index % cfg.memoryBatch);
        handle.setHidden(k, hide && !test.revealed.has(index));
      }
    }
  };
  applyHiding();

  // During a line change: speed it up. The redraw at its end shows the engine's current state.
  const hurry = () => {
    if (!transition) return false;
    if (!transition.fast) {
      transition.fast = true;
      transition.anims.forEach((a) => a.updatePlaybackRate(HURRY_RATE));
    }
    return true;
  };

  /**
   * Line change. If the next line is on screen, the caret moves to it while the rows slide up and the
   * finished line fades out. Otherwise (one staff line) the last note shows played with
   * the caret past it for a moment, then the line fades out and the next one fades in.
   */
  const changeLine = (prev) => {
    const next = locate(engine.index);
    let anims;
    if (next) {
      placeCaret(engine.index);
      const dy = lines[0].holder.offsetTop - next.line.holder.offsetTop;
      anims = lines.map((ln, i) =>
        ln.holder.animate([{ transform: "none", opacity: 1 }, { transform: `translateY(${dy}px)`, opacity: i === 0 ? 0 : 1 }], {
          duration: LINE_END_MS,
          easing: LINE_EASING,
          fill: "forwards",
        }),
      );
    } else {
      prev?.line.handle.setCaret(prev.k + 1);
      anims = lines.map((ln) =>
        ln.holder.animate([{ transform: "none", opacity: 1 }, { transform: "translateY(-1rem)", opacity: 0 }], {
          duration: LINE_END_MS,
          delay: LINE_HOLD_MS,
          easing: LINE_EASING,
          fill: "forwards",
        }),
      );
    }
    const t = { anims, fast: false, shakes: [] };
    transition = t;
    Promise.all(anims.map((a) => a.finished))
      .then(() => {
        if (transition !== t) return;
        // Rows that slid up are already in place; only rows new to the screen fade in.
        draw({ enter: next ? lines.length - 1 : 0, fast: t.fast });
        t.shakes.forEach((i) => view?.shakeItem(i));
      })
      .catch(() => {}); // cancelled by another draw
  };

  view = {
    update(prevIndex) {
      if (hurry()) return;
      const prev = locate(prevIndex);
      prev?.line.handle.setState(prev.k, engine.states[prevIndex]);
      if (pageOf(engine.index) !== page) return changeLine(prev);
      placeCaret(engine.index);
      applyHiding();
    },
    shakeItem(index) {
      if (hurry()) return void transition.shakes.push(index);
      const loc = locate(index);
      loc?.line.handle.shakeItem(loc.k);
    },
    reveal(index) {
      test.revealed.add(index);
      if (hurry()) return;
      const loc = locate(index);
      loc?.line.handle.setHidden(loc.k, false);
    },
    /** After engine.rewind: items from the new current one up to `from` are pending again. */
    rewind(from) {
      if (hurry()) return;
      if (pageOf(engine.index) !== page) return draw();
      for (let i = engine.index; i <= from; i++) {
        const loc = locate(i);
        loc?.line.handle.setState(loc.k, engine.states[i]);
      }
      placeCaret(engine.index);
      applyHiding();
    },
    pulse(index) {
      if (transition) return;
      const loc = locate(index);
      loc?.line.handle.pulse(loc.k);
    },
    setBlink(on) {
      lines.forEach((ln) => ln.handle.setCaretBlink(on));
    },
    setGhost(pos) {
      for (const ln of lines) {
        const local = pos - ln.startIndex;
        ln.handle.setGhost(local >= 0 && local < ln.count ? local : null);
      }
    },
  };
  view.setBlink(engine.state === "idle");
  shakes.forEach((i) => view.shakeItem(i));
}
