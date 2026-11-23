// The key menu (row above the staff, settings page): random / major / minor, each a side panel
// with columns, so no list needs scrolling.
import { keyName, KEYS } from "./music.js";

const COUNTS = [1, 2, 3, 4, 5, 6, 7];
const count = (fifths) => (fifths === 0 ? "" : ` <span class="sub-hint">${Math.abs(fifths)}${fifths > 0 ? "♯" : "♭"}</span>`);
const tonic = (fifths, minor) => keyName(fifths, minor).replace(/ (major|minor)$/, "");

/** Menu items for picking a key spec (see music.js); `pick(spec)` applies the choice. */
export function keyMenuItems(current, pick) {
  const item = (spec, label) => ({ label, active: current === spec, run: () => pick(spec) });
  // prefix: "" major, "min:" natural minor, "hmin:" harmonic minor
  const keys = (prefix) => {
    const spec = (f) => (prefix ? `${prefix}${f}` : f);
    const col = (title, list) => ({ title, items: list.map((k) => item(spec(k.fifths), tonic(k.fifths, !!prefix) + count(k.fifths))) });
    return [col("sharps", KEYS.filter((k) => k.fifths >= 0)), col("flats", KEYS.filter((k) => k.fifths < 0))];
  };
  const spec = String(current);
  return [
    {
      label: "random",
      active: spec.startsWith("random"),
      sub: [
        { title: "any", items: [item("random", "any key"), item("random2", "up to 2♯/♭")] },
        { title: "sharps", items: COUNTS.map((n) => item(`random#${n}`, `up to ${n}♯`)) },
        { title: "flats", items: COUNTS.map((n) => item(`randomb${n}`, `up to ${n}♭`)) },
      ],
    },
    { label: "major", active: Number.isInteger(current), sub: keys("") },
    { label: "minor", active: spec.startsWith("min:"), sub: keys("min:") },
    { label: "harmonic minor", active: spec.startsWith("hmin:"), sub: keys("hmin:") },
  ];
}
