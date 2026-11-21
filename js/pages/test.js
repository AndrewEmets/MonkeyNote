// Test page: config bar and the staff. Input and scoring arrive in milestone 2.
import { settings } from "../settings.js";
import { generateItems, keyName, KEYS } from "../music.js";
import { lineCapacity, renderStaff } from "../staff.js";
import { icon } from "../icons.js";

const STAFF_SPACE = { small: 10, medium: 14, large: 18, xl: 22 };
const MODE_VALUES = { notes: "notesCount", time: "timeLimit" };
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
// Settings that change the generated notes (restart) vs. only how they're drawn (redraw).
const RESTART_KEYS = new Set(["mode", "notesCount", "timeLimit", "chords", "memory", "ear", "clef", "keySignature", "accidentals", "ledgerLines", "maxChordNotes"]);
const REDRAW_KEYS = new Set(["noteSize", "caretStyle", "smoothCaret", "fontFamily"]);

let root, staffWrap, test, staff, resizeObserver, unsubscribe;

export function mount(container) {
  root = document.createElement("div");
  root.className = "test-page";
  root.innerHTML = `
    <div class="config-bar" role="toolbar" aria-label="test configuration"></div>
    <div class="test-area">
      <div class="test-meta"></div>
      <div class="staff-wrap"></div>
    </div>
    <button class="restart-button" aria-label="restart test" title="restart test">${icon("restart")}</button>`;
  container.appendChild(root);
  staffWrap = root.querySelector(".staff-wrap");

  root.querySelector(".config-bar").addEventListener("click", onConfigClick);
  root.querySelector(".restart-button").addEventListener("click", restart);
  document.addEventListener("keydown", onKeyDown);
  resizeObserver = new ResizeObserver(() => draw());
  resizeObserver.observe(staffWrap);
  unsubscribe = settings.subscribe((key) => {
    if (RESTART_KEYS.has(key)) {
      renderConfig();
      restart();
    } else if (REDRAW_KEYS.has(key)) draw();
  });

  renderConfig();
  restart();
}

export function unmount() {
  document.removeEventListener("keydown", onKeyDown);
  resizeObserver.disconnect();
  unsubscribe();
  root.remove();
}

function onKeyDown(e) {
  if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    restart();
  }
}

function renderConfig() {
  const s = settings.all();
  const button = (key, value, label, iconName, active) =>
    `<button class="text-button${active ? " active" : ""}" data-key="${key}" data-value='${JSON.stringify(value)}'>${iconName ? icon(iconName) : ""}<span>${label}</span></button>`;
  const valueKey = MODE_VALUES[s.mode];
  const values = valueKey ? { notesCount: [10, 25, 50, 100], timeLimit: [15, 30, 60, 120] }[valueKey] : [];
  root.querySelector(".config-bar").innerHTML = `
    <div class="group">${TOGGLES.map(([key, ic]) => button(key, !s[key], key, ic, s[key])).join("")}</div>
    <div class="divider"></div>
    <div class="group">${MODES.map(([mode, ic]) => button("mode", mode, mode, ic, s.mode === mode)).join("")}</div>
    ${valueKey ? `<div class="divider"></div><div class="group">${values.map((v) => button(valueKey, v, v, null, s[valueKey] === v)).join("")}</div>` : ""}`;
}

function onConfigClick(e) {
  const btn = e.target.closest("button[data-key]");
  if (!btn) return;
  settings.set(btn.dataset.key, JSON.parse(btn.dataset.value));
  btn.blur();
}

function restart() {
  const s = settings.all();
  const fifths = s.keySignature === "random" ? KEYS[Math.floor(Math.random() * KEYS.length)].fifths : s.keySignature;
  const count = s.mode === "notes" ? s.notesCount : 100;
  const opts = { clef: s.clef, fifths, accidentals: s.accidentals, ledgerLines: s.ledgerLines, chords: s.chords, maxChordNotes: s.maxChordNotes };
  test = { opts, items: generateItems(count, opts), index: 0 };
  root.querySelector(".test-meta").textContent = `${s.clef === "grand" ? "grand staff" : s.clef} · ${keyName(fifths)}`;
  draw();
}

function draw() {
  if (!test || !staffWrap.clientWidth) return;
  const s = settings.all();
  const staffSpace = STAFF_SPACE[s.noteSize];
  const width = staffWrap.clientWidth;
  const capacity = lineCapacity(width / staffSpace, test.opts);
  staff = renderStaff(staffWrap, {
    ...test.opts,
    items: test.items.slice(0, capacity),
    width,
    staffSpace,
    caretStyle: s.caretStyle,
    smoothCaret: s.smoothCaret,
  });
  staff.setCaret(test.index);
  staff.setCaretBlink(true);
}
