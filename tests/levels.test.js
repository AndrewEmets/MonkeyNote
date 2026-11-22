// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVELS, matchingLevel, rankStatus } from "../js/levels.js";
import { DEFAULTS } from "../js/settings.js";
import { bestKey } from "../js/history.js";

const withLevel = (id, extra = {}) => ({ ...DEFAULTS, ...LEVELS.find((l) => l.id === id).settings, mode: "notes", notesCount: 16, ...extra });

test("each level's settings match only that level", () => {
  for (const level of LEVELS) assert.equal(matchingLevel(withLevel(level.id))?.id, level.id);
  assert.equal(matchingLevel(DEFAULTS), null); // defaults are custom (2 ledger lines in treble)
});

test("ranked needs a level, a ranked length, normal reading and no hints", () => {
  assert.equal(rankStatus(withLevel("beginner")).ranked, true);
  assert.equal(rankStatus(withLevel("beginner", { notesCount: 8 })).ranked, false);
  assert.equal(rankStatus(withLevel("beginner", { mode: "time", timeLimit: 60 })).ranked, true);
  assert.equal(rankStatus(withLevel("beginner", { mode: "attack" })).ranked, false);
  assert.equal(rankStatus(withLevel("beginner", { memory: true })).ranked, false);
  assert.equal(rankStatus(withLevel("beginner"), { hints: true }).ranked, false);
  assert.equal(rankStatus(withLevel("beginner", { ledgerLines: 1 })).level, null);
});

test("bests are kept per ranked level, or under practice", () => {
  const cfg = withLevel("advanced");
  assert.equal(bestKey(cfg, rankStatus(cfg)), "advanced|notes|16");
  assert.equal(bestKey({ ...cfg, notesCount: 8 }, rankStatus({ ...cfg, notesCount: 8 })), "practice|notes|8");
});
