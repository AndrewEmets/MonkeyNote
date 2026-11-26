// Share settings as a link: chosen groups of settings go into the URL (?s=...), and opening such a
// link applies them (then removes them from the address bar).
import { DEFAULTS, settings } from "./settings.js";

/** Groups offered in the share dialog: the settings that make a test easier or harder (not input, sound or looks). */
export const SHARE_GROUPS = [
  { id: "test", title: "test", text: "mode, length, memory / ear and their group sizes", keys: ["mode", "notesCount", "timeLimit", "attackSpeed", "memory", "ear", "memoryBatch", "earBatch", "memoryPresets", "earPresets"] },
  { id: "notation", title: "notation", text: "clef, key, accidentals, leaps, ledger lines, chords", keys: ["clef", "keySignature", "accidentals", "ledgerLines", "maxLeap", "chords", "chordStyle", "maxChordNotes", "chordPower"] },
];

const PARAM = "s";
// Applied first: switching memory / ear loads that presentation's own settings (profiles.js),
// which the rest of the link then overrides.
const FIRST = ["memory", "ear"];

const toBase64Url = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (code) => new TextDecoder().decode(Uint8Array.from(atob(code.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Encode the current values of the settings in the chosen groups: { g: group ids, v: values that differ
 * from the defaults } (the rest of those groups means "default", which keeps links short).
 */
export function encodeSettings(groupIds, values = settings.all()) {
  const groups = SHARE_GROUPS.filter((g) => groupIds.includes(g.id));
  const changed = groups.flatMap((g) => g.keys).filter((k) => !same(values[k], DEFAULTS[k]));
  return toBase64Url(JSON.stringify({ g: groups.map((g) => g.id), v: Object.fromEntries(changed.map((k) => [k, values[k]])) }));
}

/** Decode a shared code into { key: value } for every setting in its groups, or null if it's unreadable. */
export function decodeSettings(code) {
  try {
    const { g, v = {} } = JSON.parse(fromBase64Url(code));
    if (!Array.isArray(g) || typeof v !== "object") return null;
    const keys = SHARE_GROUPS.filter((group) => g.includes(group.id)).flatMap((group) => group.keys);
    return Object.fromEntries(keys.map((k) => [k, Object.hasOwn(v, k) ? v[k] : DEFAULTS[k]]));
  } catch {
    return null;
  }
}

/** Link to this app with the chosen groups of settings. */
export function shareUrl(groupIds) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set(PARAM, encodeSettings(groupIds));
  return url.toString();
}

/** Apply decoded settings (invalid values are skipped). Returns how many were applied. */
export function applySettings(data) {
  const keys = [...FIRST.filter((k) => k in data), ...Object.keys(data).filter((k) => !FIRST.includes(k))];
  let applied = 0;
  for (const key of keys) {
    settings.set(key, data[key]);
    if (JSON.stringify(settings.get(key)) === JSON.stringify(data[key])) applied++;
  }
  return applied;
}

/**
 * At startup: apply settings from a shared link, then take them out of the address bar (so a reload
 * doesn't apply them again). Returns { applied } or null when the page wasn't opened from a link.
 */
export function applySharedLink() {
  const url = new URL(location.href);
  const code = url.searchParams.get(PARAM);
  if (code === null) return null;
  url.searchParams.delete(PARAM);
  history.replaceState(history.state, "", url.toString());
  const data = decodeSettings(code);
  return { applied: data ? applySettings(data) : 0, ok: !!data };
}
