// Local result history, activity counters and personal bests (localStorage only; no backend).
const RESULTS_KEY = "monkeynote.results";
const PBS_KEY = "monkeynote.pbs";
const STATS_KEY = "monkeynote.stats";
const MAX_RESULTS = 5000;

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable: history is best-effort
  }
}

export const modeValue = (cfg) => ({ notes: cfg.notesCount, time: cfg.timeLimit, attack: cfg.attackSpeed })[cfg.mode] ?? null;

/** What's being practised, apart from the test length: used for the stats page's "current settings" filter. */
export function notationKey(cfg) {
  const chords = cfg.chords ? (cfg.chordStyle === "random" ? `chords${cfg.maxChordNotes}` : cfg.chordStyle) : "single";
  const memory = cfg.memory && cfg.mode !== "attack"; // memory has no effect in attack mode
  return [cfg.clef, cfg.accidentals, `ledger${cfg.ledgerLines}`, chords, memory && "memory", cfg.ear && "ear"].filter(Boolean).join("|");
}

/** Personal bests are tracked per test configuration: mode, length and notation. */
export const configKey = (cfg) => [cfg.mode, modeValue(cfg) ?? "", notationKey(cfg)].join("|");

// ---- activity counters ----

function readStats() {
  return { started: 0, completed: 0, timeMs: 0, firstDate: null, ...read(STATS_KEY, {}) };
}

/** A test started (first note played). */
export function recordTestStart() {
  const s = readStats();
  s.started++;
  s.firstDate ??= Date.now();
  write(STATS_KEY, s);
}

/** Time spent in a test, finished or not. */
export function recordPlayTime(ms) {
  if (!(ms > 0)) return;
  const s = readStats();
  s.timeMs += ms;
  write(STATS_KEY, s);
}

export const loadStats = readStats;
export const loadResults = () => read(RESULTS_KEY, []);
export const loadPbs = () => read(PBS_KEY, {});

// ---- results ----

/**
 * Save a finished test; returns { isPb, previousPb }. Attack mode ranks by score, the rest by npm.
 * result: { npm, acc, consistency, seconds, notes, fifths, pitches: [[midi, attempts, misses]], score?, peakNpm? }
 */
export function saveResult(result, cfg) {
  const entry = {
    date: Date.now(),
    config: configKey(cfg),
    notation: notationKey(cfg),
    mode: cfg.mode,
    value: modeValue(cfg),
    clef: cfg.clef,
    accidentals: cfg.accidentals,
    chords: cfg.chords,
    memory: cfg.memory,
    ear: cfg.ear,
    ...result,
  };
  const results = read(RESULTS_KEY, []);
  results.push(entry);
  write(RESULTS_KEY, results.slice(-MAX_RESULTS));

  const stats = readStats();
  stats.completed++;
  stats.firstDate ??= entry.date;
  write(STATS_KEY, stats);

  const metric = cfg.mode === "attack" ? "score" : "npm";
  const pbs = read(PBS_KEY, {});
  const previous = pbs[entry.config];
  const isPb = result[metric] > 0 && (!previous || result[metric] > (previous[metric] ?? 0));
  if (isPb) {
    pbs[entry.config] = { [metric]: result[metric], acc: result.acc, date: entry.date };
    write(PBS_KEY, pbs);
  }
  return { isPb, previousPb: previous?.[metric] ?? null };
}

export function clearHistory() {
  try {
    for (const key of [RESULTS_KEY, PBS_KEY, STATS_KEY]) localStorage.removeItem(key);
  } catch {
    // nothing to clear
  }
}
