// SVG staff renderer. All geometry is in staff spaces (distance between two staff lines);
// the SVG viewBox maps staff spaces to pixels.
import { GLYPHS } from "./data/glyphs.js";
import { CLEFS, diatonicOf, keyAlter, keySignature } from "./music.js";

const NS = "http://www.w3.org/2000/svg";
// SMuFL engraving defaults (Bravura), in staff spaces.
const ENG = { staffLine: 0.13, ledger: 0.16, ledgerExt: 0.4, barline: 0.16 };
const HEAD = "noteheadWhole";
const HEAD_W = GLYPHS[HEAD].advance;
const ACC_ROOM = 1.6; // room left of the notehead for accidentals, inside the item's slot
const ACC_COL = 1.15; // horizontal step between accidental columns in a chord
const ACC_GLYPHS = {
  "-2": "accidentalDoubleFlat",
  "-1": "accidentalFlat",
  0: "accidentalNatural",
  1: "accidentalSharp",
  2: "accidentalDoubleSharp",
};

const r = (v) => Math.round(v * 1000) / 1000;

function el(name, attrs, parent) {
  const node = document.createElementNS(NS, name);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  parent?.appendChild(node);
  return node;
}

const glyph = (name, x, y, parent, cls) =>
  el("path", { d: GLYPHS[name].d, transform: `translate(${r(x)} ${r(y)})`, ...(cls && { class: cls }) }, parent);

const hline = (x1, x2, y, width, parent, cls) =>
  el("line", { x1: r(x1), x2: r(x2), y1: r(y), y2: r(y), "stroke-width": width, class: cls }, parent);

/** Vertical layout: top line y of each staff and total height, fixed per clef + ledger setting. */
export function staffGeometry({ clef, ledgerLines }) {
  const pad = Math.max(2.5, ledgerLines + 1.5);
  const tops = clef === "grand" ? { treble: pad, bass: pad + 4 + Math.max(6, 2 * ledgerLines + 1) } : { [clef]: pad };
  const lowest = Math.max(...Object.values(tops));
  return { tops, height: lowest + 4 + pad, grand: clef === "grand" };
}

/** Horizontal layout of everything before the first item. */
function headerLayout(geo, fifths) {
  let x = 0.5;
  let brace = null;
  if (geo.grand) {
    const span = geo.tops.bass + 4 - geo.tops.treble;
    const sy = span / 4; // brace glyph is one em (4 staff spaces) tall
    const sx = sy * 0.7;
    brace = { x, sx, sy, bottom: geo.tops.bass + 4 };
    x += GLYPHS.brace.bbox[2] * sx + 0.35;
  }
  const lineStart = x;
  const clefX = lineStart + 0.7;
  const keyX = clefX + 2.8 + 0.6;
  const accName = fifths > 0 ? "accidentalSharp" : "accidentalFlat";
  const keyStep = GLYPHS[accName].advance + 0.12;
  const n = Math.abs(fifths);
  const itemsStart = keyX + n * keyStep + (n ? 0.8 : 0.2);
  return { brace, lineStart, clefX, keyX, keyStep, accName, itemsStart };
}

export const slotWidth = (chords) => (chords ? 5.5 : 4.5);

/** How many items fit in a line of the given width (in staff spaces). */
export function lineCapacity(widthUnits, { clef, ledgerLines, fifths, chords }) {
  const head = headerLayout(staffGeometry({ clef, ledgerLines }), fifths);
  const free = widthUnits - head.itemsStart - ACC_ROOM - HEAD_W - 0.5;
  return Math.max(1, Math.floor(free / slotWidth(chords)) + 1);
}

/**
 * Render a line of items into `container`.
 * opts: { clef, fifths, ledgerLines, chords, items, width (px), staffSpace (px), caretStyle, smoothCaret }
 * Returns a handle to update item states and the caret without re-rendering.
 */
export function renderStaff(container, opts) {
  const s = opts.staffSpace;
  const W = opts.width / s;
  const geo = staffGeometry(opts);
  const head = headerLayout(geo, opts.fifths);
  const slot = slotWidth(opts.chords);
  const yOf = (staff, d) => geo.tops[staff] + 4 - (d - CLEFS[staff].bottom) / 2;

  const svg = el("svg", {
    class: "staff",
    viewBox: `0 0 ${r(W)} ${r(geo.height)}`,
    width: opts.width,
    height: Math.round(geo.height * s),
    "aria-hidden": "true",
  });

  // Staff furniture: lines, brace, barline, clefs, key signatures.
  const furniture = el("g", { class: "furniture" }, svg);
  const lineEnd = W - 0.3;
  for (const [staff, top] of Object.entries(geo.tops)) {
    for (let i = 0; i < 5; i++) hline(head.lineStart, lineEnd, top + i, ENG.staffLine, furniture, "staff-line");
    const clef = CLEFS[staff];
    glyph(clef.glyph, head.clefX, yOf(staff, clef.glyphAt), furniture, "clef");
    keySignature(opts.fifths, staff).forEach((acc, i) =>
      glyph(head.accName, head.keyX + i * head.keyStep, yOf(staff, acc.d), furniture, "key-signature"),
    );
  }
  if (head.brace) {
    const b = head.brace;
    el("path", { d: GLYPHS.brace.d, transform: `translate(${r(b.x)} ${r(b.bottom)}) scale(${r(b.sx)} ${r(b.sy)})`, class: "brace" }, furniture);
    el("line", {
      x1: r(head.lineStart), x2: r(head.lineStart),
      y1: r(geo.tops.treble), y2: r(b.bottom),
      "stroke-width": ENG.barline, class: "barline",
    }, furniture);
  }

  // Items.
  const slotLeft = (k) => head.itemsStart + k * slot;
  const itemNodes = opts.items.map((item, k) => {
    const g = el("g", { class: "item pending", "data-index": k }, svg);
    drawItem(g, item, slotLeft(k) + ACC_ROOM, (d) => yOf(item.staff, d), opts.fifths);
    return g;
  });

  // Caret, positioned by a CSS transform so it can animate between items.
  const caret = el("g", { class: `caret caret-${opts.caretStyle}${opts.smoothCaret ? " smooth" : ""}` }, svg);
  drawCaret(caret, opts.caretStyle, slot, opts.ledgerLines);

  container.replaceChildren(svg);

  return {
    svg,
    count: opts.items.length,
    setState(k, state) {
      itemNodes[k]?.setAttribute("class", `item ${state}`);
    },
    setCaret(k) {
      const item = opts.items[Math.min(k, opts.items.length - 1)];
      if (!item) return;
      caret.style.transform = `translate(${r(slotLeft(k))}px, ${r(geo.tops[item.staff])}px)`;
    },
    setCaretBlink(on) {
      caret.classList.toggle("blink", on);
    },
  };
}

// Caret shapes, drawn relative to (slot left, staff top line).
function drawCaret(g, style, slot, ledgerLines) {
  if (style === "line") el("rect", { x: -0.1, y: -1, width: 0.2, height: 6, rx: 0.1 }, g);
  else if (style === "block") el("rect", { x: 0.2, y: -1.5, width: slot - 0.4, height: 7, rx: 0.4 }, g);
  else if (style === "outline")
    el("rect", { x: 0.25, y: -1.45, width: slot - 0.5, height: 6.9, rx: 0.4, "stroke-width": 0.14 }, g);
  else if (style === "underline")
    el("rect", { x: ACC_ROOM - 0.2, y: 4 + ledgerLines + 1.1, width: HEAD_W + 0.4, height: 0.25, rx: 0.1 }, g);
}

function drawItem(g, item, nx, yOf, fifths) {
  const bottom = CLEFS[item.staff].bottom;
  const top = bottom + 8;
  const notes = item.notes.map((p) => ({ p, d: diatonicOf(p) })).sort((a, b) => a.d - b.d);

  // Seconds in a chord: every other note of a run of seconds moves to the right of the stem side.
  let prevD = -Infinity;
  let prevShift = false;
  for (const n of notes) {
    n.shift = n.d - prevD === 1 && !prevShift;
    prevShift = n.shift;
    prevD = n.d;
  }
  const anyShift = notes.some((n) => n.shift);

  // Ledger lines.
  const lo = notes[0].d;
  const hi = notes[notes.length - 1].d;
  const lx1 = nx - ENG.ledgerExt;
  const lx2 = nx + HEAD_W * (anyShift ? 2 : 1) + ENG.ledgerExt;
  for (let d = top + 2; d <= hi; d += 2) hline(lx1, lx2, yOf(d), ENG.ledger, g, "ledger");
  for (let d = bottom - 2; d >= lo; d -= 2) hline(lx1, lx2, yOf(d), ENG.ledger, g, "ledger");

  // Accidentals: placed top to bottom, each in the first column clear of others within 3 spaces.
  const withAcc = notes.filter((n) => n.p.alter !== keyAlter(fifths, n.p.step));
  const columns = [];
  for (const n of [...withAcc].reverse()) {
    let c = 0;
    while (columns[c]?.some((d) => Math.abs(d - n.d) < 6)) c++;
    (columns[c] ||= []).push(n.d);
    const name = ACC_GLYPHS[n.p.alter];
    glyph(name, nx - 0.2 - GLYPHS[name].advance - c * ACC_COL, yOf(n.d), g, "accidental");
  }

  for (const n of notes) glyph(HEAD, nx + (n.shift ? HEAD_W - 0.05 : 0), yOf(n.d), g, "notehead");
}
