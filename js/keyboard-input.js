// Computer keyboard as a piano, tracker-style. Keys are matched by physical position
// (KeyboardEvent.code), so the layout works on QWERTY, AZERTY, Dvorak and others.
//   lower row: Z S X D C V G B H N J M , L . ; /  = C .. E (one octave + 4)
//   upper row: Q 2 W 3 E R 5 T 6 Y 7 U I 9 O 0 P [ = ]  = next octave C .. G
// Arrow up / down shift the octave.
import { input } from "./input.js";

const LOWER = ["KeyZ", "KeyS", "KeyX", "KeyD", "KeyC", "KeyV", "KeyG", "KeyB", "KeyH", "KeyN", "KeyJ", "KeyM", "Comma", "KeyL", "Period", "Semicolon", "Slash"];
const UPPER = ["KeyQ", "Digit2", "KeyW", "Digit3", "KeyE", "KeyR", "Digit5", "KeyT", "Digit6", "KeyY", "Digit7", "KeyU", "KeyI", "Digit9", "KeyO", "Digit0", "KeyP", "BracketLeft", "Equal", "BracketRight"];
const OFFSETS = new Map([...LOWER.map((code, i) => [code, i]), ...UPPER.map((code, i) => [code, i + 12])]);
const PUNCTUATION = { Comma: ",", Period: ".", Semicolon: ";", Slash: "/", BracketLeft: "[", BracketRight: "]", Equal: "=" };
const keyLabel = (code) => PUNCTUATION[code] ?? code.replace(/^(Key|Digit)/, "").toLowerCase();

const MIN_OCTAVE = 0;
const MAX_OCTAVE = 7;
let octave = 4; // octave of the Z key
const pressed = new Map(); // code -> midi it started, so an octave shift mid-press releases the right note
const octaveListeners = new Set();
let attached = false;

const midiFor = (code) => 12 * (octave + 1) + OFFSETS.get(code);

function isTyping(target) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

function onKeyDown(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
  if (e.code === "ArrowUp" || e.code === "ArrowDown") {
    e.preventDefault();
    keyboardInput.setOctave(octave + (e.code === "ArrowUp" ? 1 : -1));
    return;
  }
  if (!OFFSETS.has(e.code)) return;
  e.preventDefault();
  if (e.repeat || pressed.has(e.code)) return;
  const midi = midiFor(e.code);
  pressed.set(e.code, midi);
  input.noteOn(midi, "keyboard");
}

function onKeyUp(e) {
  const midi = pressed.get(e.code);
  if (midi === undefined) return;
  pressed.delete(e.code);
  input.noteOff(midi, "keyboard");
}

function releaseAll() {
  pressed.clear();
  input.releaseAll("keyboard");
}

export const keyboardInput = {
  get octave() {
    return octave;
  },
  setOctave(value) {
    const next = Math.max(MIN_OCTAVE, Math.min(MAX_OCTAVE, value));
    if (next === octave) return;
    octave = next;
    octaveListeners.forEach((fn) => fn(octave));
  },
  onOctaveChange(fn) {
    octaveListeners.add(fn);
    return () => octaveListeners.delete(fn);
  },
  /** midi -> key label for the current octave; upper-row labels win where rows overlap. */
  labels() {
    const map = new Map();
    for (const code of [...LOWER, ...UPPER]) map.set(midiFor(code), keyLabel(code));
    return map;
  },
  attach() {
    if (attached) return;
    attached = true;
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseAll);
  },
  detach() {
    if (!attached) return;
    attached = false;
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", releaseAll);
    releaseAll();
  },
};
