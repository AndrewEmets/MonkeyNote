// Inline SVG icons (24x24, stroked with currentColor) plus icons built from music glyphs.
import { GLYPHS } from "./data/glyphs.js";

const stroked = (body) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

function glyphIcon(name) {
  const [x0, y0, x1, y1] = GLYPHS[name].bbox;
  const size = Math.max(x1 - x0, y1 - y0) + 0.4;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return `<svg class="icon" viewBox="${cx - size / 2} ${cy - size / 2} ${size} ${size}" fill="currentColor" aria-hidden="true"><path d="${GLYPHS[name].d}"/></svg>`;
}

const ICONS = {
  logo: () =>
    // Stems and beam are one polygon (no seams); stem bottoms end inside the noteheads.
    `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.95 3.6 20.45 1.6 20.45 15.6 18.75 15.6 18.75 4.67 9.65 6.13 9.65 17.6 7.95 17.6Z"/><ellipse cx="6.6" cy="18" rx="3.4" ry="2.5" transform="rotate(-20 6.6 18)"/><ellipse cx="17.4" cy="16" rx="3.4" ry="2.5" transform="rotate(-20 17.4 16)"/></svg>`,
  piano: () =>
    stroked(
      `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 19v-5M15 19v-5"/><rect x="7.6" y="5" width="2.8" height="8.5" rx=".5" fill="currentColor" stroke="none"/><rect x="13.6" y="5" width="2.8" height="8.5" rx=".5" fill="currentColor" stroke="none"/>`,
    ),
  gear: () =>
    stroked(
      `<circle cx="12" cy="12" r="8.4" stroke-width="3.2" stroke-dasharray="3.2 3.4" stroke-linecap="butt"/><circle cx="12" cy="12" r="6.2"/><circle cx="12" cy="12" r="2.2"/>`,
    ),
  restart: () => stroked(`<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>`),
  note: () => stroked(`<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>`),
  clock: () => stroked(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`),
  bolt: () => stroked(`<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>`),
  mountain: () => stroked(`<path d="m3 20 6-10 4 6 3-4 5 8z"/>`),
  chords: () =>
    `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><ellipse cx="12" cy="5.5" rx="4.2" ry="2.8" transform="rotate(-20 12 5.5)"/><ellipse cx="12" cy="12" rx="4.2" ry="2.8" transform="rotate(-20 12 12)"/><ellipse cx="12" cy="18.5" rx="4.2" ry="2.8" transform="rotate(-20 12 18.5)"/></svg>`,
  eye: () => stroked(`<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`),
  eyeOff: () => stroked(`<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="m4 4 16 16"/>`),
  ear: () =>
    stroked(`<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>`),
  key: () => stroked(`<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14.5 8.5l2 2"/>`),
  lines: () => stroked(`<path d="M3 5h18M3 9.5h18M3 14h18M3 18.5h18"/>`),
  size: () => stroked(`<path d="m3 20 5-14 5 14M5 15h6M15 20l3-8 3 8M16 17.5h4"/>`),
  caret: () => stroked(`<path d="M12 4v16M9 4h6M9 20h6"/>`),
  wave: () => stroked(`<path d="M2 14c2.5-5 5-5 7 0s4.5 5 7 0 4-4 6-2"/>`),
  font: () => stroked(`<path d="M4 7V4h16v3M9 20h6M12 4v16"/>`),
  palette: () =>
    stroked(
      `<path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11" r="1" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1" fill="currentColor"/><circle cx="15" cy="7.5" r="1" fill="currentColor"/>`,
    ),
  warning: () => stroked(`<path d="M12 3 22 20H2z"/><path d="M12 10v4M12 17v.01"/>`),
  search: () => stroked(`<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>`),
  chevron: () => stroked(`<path d="m6 9 6 6 6-6"/>`),
  code: () => stroked(`<path d="m8 6-6 6 6 6M16 6l6 6-6 6"/>`),
  check: () => stroked(`<path d="m5 12 5 5 9-10"/>`),
  clef: () => glyphIcon("gClef"),
  sharp: () => glyphIcon("accidentalSharp"),
};

export const icon = (name) => ICONS[name]?.() ?? "";
