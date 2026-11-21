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
  const value = cfg.mode === "notes" ? cfg.notesCount : cfg.mode === "time" ? cfg.timeLimit : "";
  return [cfg.mode, value, cfg.clef, cfg.accidentals, `ledger${cfg.ledgerLines}`, cfg.chords ? `chords${cfg.maxChordNotes}` : "single"].join("|");
}

/** Save a result; returns { isPb, previousPb }. */
export function saveResult(result, cfg) {
  const entry = { date: Date.now(), config: configKey(cfg), ...result };
  const results = read(RESULTS_KEY, []);
  results.push(entry);
  write(RESULTS_KEY, results.slice(-MAX_RESULTS));

  const pbs = read(PBS_KEY, {});
  const previous = pbs[entry.config];
  const isPb = result.npm > 0 && (!previous || result.npm > previous.npm);
  if (isPb) {
    pbs[entry.config] = { npm: result.npm, acc: result.acc, date: entry.date };
    write(PBS_KEY, pbs);
  }
  return { isPb, previousPb: previous?.npm ?? null };
}

export function clearHistory() {
  try {
    localStorage.removeItem(RESULTS_KEY);
    localStorage.removeItem(PBS_KEY);
  } catch {
    // nothing to clear
  }
}
