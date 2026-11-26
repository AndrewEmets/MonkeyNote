// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, settings } from "../js/settings.js";
import { initProfiles } from "../js/profiles.js";
import { applyLevel } from "../js/levels.js";
import { decodeSettings, encodeSettings, SHARE_GROUPS, applySettings } from "../js/share.js";

initProfiles();

const presentation = (p) => {
  if (p !== "default") settings.set(p, true);
  settings.set("memory", p === "memory");
  settings.set("ear", p === "ear");
};

test("each presentation keeps its own test settings", () => {
  settings.reset();
  settings.set("clef", "bass");
  settings.set("notesCount", 32);
  presentation("ear"); // first visit: starts from the current settings
  assert.equal(settings.get("clef"), "bass");
  settings.set("clef", "treble");
  settings.set("notesCount", 8);
  presentation("memory");
  assert.equal(settings.get("clef"), "treble");
  settings.set("ledgerLines", 4);
  presentation("default");
  assert.deepEqual([settings.get("clef"), settings.get("notesCount"), settings.get("ledgerLines")], ["bass", 32, DEFAULTS.ledgerLines]);
  presentation("ear");
  assert.deepEqual([settings.get("clef"), settings.get("notesCount")], ["treble", 8]);
  presentation("memory");
  assert.equal(settings.get("ledgerLines"), 4);
});

test("a level picked in memory mode switches to default and keeps the level's settings", () => {
  settings.reset();
  presentation("memory");
  applyLevel("expert");
  assert.equal(settings.get("memory"), false);
  assert.equal(settings.get("ledgerLines"), 4);
  assert.equal(settings.get("clef"), "grand");
});

test("reset starts every presentation over", () => {
  settings.set("clef", "bass");
  presentation("ear");
  settings.set("clef", "grand");
  settings.reset();
  presentation("ear");
  assert.equal(settings.get("clef"), DEFAULTS.clef);
  presentation("default");
});

test("share groups cover every setting exactly once", () => {
  const keys = SHARE_GROUPS.flatMap((g) => g.keys);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual([...keys].sort(), Object.keys(DEFAULTS).sort());
});

test("shared settings round-trip, presentation first", () => {
  settings.reset();
  const code = encodeSettings(["test", "notation"], { ...DEFAULTS, ear: true, earBatch: 3, clef: "grand", keySignature: "random#3" });
  const data = decodeSettings(code);
  assert.deepEqual(Object.keys(data).sort(), [...SHARE_GROUPS[0].keys, ...SHARE_GROUPS[1].keys].sort());
  applySettings(data);
  assert.deepEqual([settings.get("ear"), settings.get("earBatch"), settings.get("clef"), settings.get("keySignature")], [true, 3, "grand", "random#3"]);
  assert.equal(decodeSettings("not base64!!"), null);
  settings.reset();
});
