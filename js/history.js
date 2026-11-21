// Local result history and personal bests (localStorage). A backend may sync these later.
const RESULTS_KEY = "monkeynote.results";
const PBS_KEY = "monkeynote.pbs";
const MAX_RESULTS = 1000;

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

/** Personal bests are tracked per test configuration. */
export function configKey(cfg) {
  const value = { notes: cfg.notesCount, time: cfg.timeLimit, attack: cfg.attackSpeed }[cfg.mode] ?? "";
  const chords = cfg.chords ? (cfg.chordStyle === "random" ? `chords${cfg.maxChordNotes}` : cfg.chordStyle) : "single";
  const memory = cfg.memory && cfg.mode !== "attack"; // memory has no effect in attack mode
  return [cfg.mode, value, cfg.clef, cfg.accidentals, `ledger${cfg.ledgerLines}`, chords, memory && "memory", cfg.ear && "ear"].filter(Boolean).join("|");
}

/** Save a result; returns { isPb, previousPb }. Attack mode ranks by score, the rest by npm. */
export function saveResult(result, cfg) {
  const entry = { date: Date.now(), config: configKey(cfg), ...result };
  const results = read(RESULTS_KEY, []);
  results.push(entry);
  write(RESULTS_KEY, results.slice(-MAX_RESULTS));

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
    localStorage.removeItem(RESULTS_KEY);
    localStorage.removeItem(PBS_KEY);
  } catch {
    // nothing to clear
  }
}
