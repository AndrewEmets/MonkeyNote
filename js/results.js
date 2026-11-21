// Result statistics and the results screen (big stats, speed chart, missed-notes map).
import { keyName, pitchName } from "./music.js";
import { createPiano } from "./piano.js";
import { icon } from "./icons.js";

// MonkeyType-style consistency: maps the coefficient of variation to 0..100.
const kogasa = (cv) => 100 * (1 - Math.tanh(cv + cv ** 3 / 3 + cv ** 5 / 5));

/**
 * Compute results from a finished engine.
 * Every item is eventually played correctly, so speed counts all completed items: wrong notes
 * cost time (and accuracy) rather than being skipped. The first item starts the clock, so it is
 * excluded from speed (it took no measurable time).
 */
export function computeResults(engine, cfg, { peakNpm = 0 } = {}) {
  const start = engine.startTime;
  const end = cfg.mode === "time" ? start + cfg.timeLimit * 1000 : engine.endTime;
  const durationMs = Math.max(1, end - start);
  const minutes = durationMs / 60000;
  const resolved = engine.results.filter((r) => r.t <= end);
  const timed = resolved.slice(1).filter((r) => !r.missed); // attack: missed notes aren't speed
  const presses = engine.presses.filter((p) => p.t <= end);
  const correctPresses = presses.filter((p) => p.correct).length;

  const gaps = [];
  for (let i = 1; i < resolved.length; i++) gaps.push(resolved[i].t - resolved[i - 1].t);
  const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const sd = gaps.length ? Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length) : 0;

  const series = [];
  const seconds = Math.max(1, Math.ceil(durationMs / 1000));
  for (let s = 1; s <= seconds; s++) {
    const tEnd = start + Math.min(s * 1000, durationMs);
    const elapsed = (tEnd - start) / 60000;
    const upTo = timed.filter((r) => r.t <= tEnd);
    series.push({
      second: s,
      npm: upTo.length / elapsed,
      errors: presses.filter((p) => !p.correct && p.t > tEnd - 1000 && p.t <= tEnd).length,
    });
  }

  const pitches = [...engine.pitchStats.entries()].map(([midi, s]) => ({ midi, ...s }));

  return {
    npm: Math.round(timed.length / minutes),
    acc: presses.length ? Math.round((correctPresses / presses.length) * 100) : 0,
    consistency: gaps.length > 1 && mean > 0 ? Math.round(kogasa(sd / mean)) : 0,
    reactionMs: Math.round(mean),
    seconds: Math.round(durationMs / 100) / 10,
    cleanItems: resolved.filter((r) => r.clean).length,
    correctedItems: resolved.filter((r) => !r.clean && !r.missed).length,
    // attack mode
    score: resolved.filter((r) => !r.missed).length,
    missedItems: resolved.filter((r) => r.missed).length,
    peakNpm: Math.round(peakNpm),
    series,
    pitches,
  };
}

const testType = (cfg, fifths) => {
  const value = { notes: cfg.notesCount, time: cfg.timeLimit, attack: cfg.attackSpeed }[cfg.mode];
  const mode = value ? `${cfg.mode} ${value}` : cfg.mode;
  const extras = [cfg.chords && "chords", cfg.accidentals === "chromatic" && "chromatic", cfg.memory && cfg.mode !== "attack" && "memory", cfg.ear && "ear"].filter(Boolean);
  return [mode, `${cfg.clef === "grand" ? "grand staff" : cfg.clef} · ${keyName(fifths)}`, extras.join(" · ")].filter(Boolean).join("<br>");
};

const stat = (label, value, title = "") =>
  `<div class="stat"${title ? ` title="${title}"` : ""}><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;

/** Render the results screen into `container`. */
export function renderResults(container, r, { cfg, fifths, isPb }) {
  const misses = r.pitches.filter((p) => p.misses).sort((a, b) => b.misses / b.attempts - a.misses / a.attempts || b.misses - a.misses);
  const crown = isPb ? ` <span class="pb" title="new personal best">${icon("crown")}</span>` : "";
  const attack = cfg.mode === "attack";
  const headline = attack
    ? stat(`score${crown}`, r.score, "notes (or chords) played before running out of lives")
    : stat(`npm${crown}`, r.npm, "notes (or chords) played per minute");
  const modeStats = attack
    ? `${stat("speed reached", `${r.peakNpm} npm`, "how fast the notes were moving at the end")}
       ${stat("missed", r.missedItems, "notes that reached the line unplayed")}`
    : "";
  container.innerHTML = `
    <div class="results-main">
      <div class="big-stats">
        ${headline}
        ${stat("acc", `${r.acc}%`, "correct key presses out of all key presses")}
      </div>
      <div class="chart-box">
        <div class="chart-legend">
          <span><i class="swatch line main"></i>npm</span>
          <span><i class="swatch cross"></i>wrong notes</span>
        </div>
        <div class="chart"></div>
      </div>
    </div>
    <div class="more-stats">
      ${stat("test type", testType(cfg, fifths))}
      ${modeStats}
      ${stat("notes", `${r.cleanItems}/${r.correctedItems}`, "first try / needed correction")}
      ${stat("consistency", `${r.consistency}%`, "how even your pace was")}
      ${stat("reaction", r.reactionMs ? `${(r.reactionMs / 1000).toFixed(2)}s` : "-", "average time per note (or chord)")}
      ${stat("time", `${r.seconds}s`)}
    </div>
    <div class="miss-map">
      <div class="stat-label">missed notes</div>
      <div class="miss-piano"></div>
      <div class="miss-list">${
        misses.length
          ? misses.slice(0, 8).map((p) => `<span><b>${pitchName(p.pitch)}</b> ${p.misses}/${p.attempts}</span>`).join("")
          : "<span>no missed notes</span>"
      }</div>
    </div>`;
  renderChart(container.querySelector(".chart"), r.series);
  renderMissMap(container.querySelector(".miss-piano"), r.pitches);
}

function renderMissMap(el, pitches) {
  if (!pitches.length) return;
  const midis = pitches.map((p) => p.midi);
  const piano = createPiano(el, { low: Math.min(...midis) - 2, high: Math.max(...midis) + 2, interactive: false });
  for (const p of pitches) {
    const key = piano.keys.get(p.midi);
    if (!key) continue;
    key.classList.add("tested");
    key.style.setProperty("--miss", p.misses ? 0.3 + 0.7 * (p.misses / p.attempts) : 0);
    key.title = `${pitchName(p.pitch)}: ${p.misses}/${p.attempts} missed`;
  }
}

/** Smallest "nice" axis max (4 ticks of 1, 2, 2.5 or 5 x 10^k) at or above v. */
const niceMax = (v) => {
  const raw = Math.max(v, 4) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  return step * 4;
};

function renderChart(el, series) {
  const width = el.clientWidth || 600;
  const height = 180;
  const pad = { left: 36, right: 8, top: 8, bottom: 22 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const yMax = niceMax(Math.max(...series.map((d) => d.npm)));
  const n = series.length;
  const x = (i) => pad.left + (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v) => pad.top + h - (v / yMax) * h;
  const path = (key) => series.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`).join("");

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const xStep = Math.max(1, Math.ceil(n / 10));
  const xTicks = series.map((d, i) => i).filter((i) => i % xStep === xStep - 1 || i === n - 1);

  el.innerHTML = `
    <svg width="${width}" height="${height}" role="img" aria-label="notes per minute over time">
      ${yTicks.map((v) => `<line class="grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${pad.left - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`).join("")}
      ${xTicks.map((i) => `<text class="axis" x="${x(i)}" y="${height - 4}" text-anchor="middle">${series[i].second}</text>`).join("")}
      <path class="series main" d="${path("npm")}"/>
      ${n === 1 ? `<circle class="dot main" cx="${x(0)}" cy="${y(series[0].npm)}" r="4"/>` : ""}
      ${series
        .map((d, i) => (d.errors ? `<path class="error-mark" d="M${x(i) - 4} ${y(d.npm) - 4}l8 8m0-8l-8 8"/>` : ""))
        .join("")}
      <g class="hover" style="display:none">
        <line class="crosshair" y1="${pad.top}" y2="${pad.top + h}"/>
        <circle class="dot main" r="4"/>
      </g>
      <rect class="hit" x="${pad.left}" y="0" width="${w}" height="${height}" fill="transparent"/>
    </svg>
    <div class="chart-tooltip" hidden></div>`;

  const svg = el.querySelector("svg");
  const hover = svg.querySelector(".hover");
  const tooltip = el.querySelector(".chart-tooltip");
  svg.querySelector(".hit").addEventListener("mousemove", (e) => {
    const box = svg.getBoundingClientRect();
    const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((e.clientX - box.left - pad.left) / w) * (n - 1))));
    const d = series[i];
    hover.style.display = "";
    hover.querySelector(".crosshair").setAttribute("x1", x(i));
    hover.querySelector(".crosshair").setAttribute("x2", x(i));
    const dot = hover.querySelector(".dot");
    dot.setAttribute("cx", x(i));
    dot.setAttribute("cy", y(d.npm));
    tooltip.hidden = false;
    tooltip.innerHTML = `<b>${d.second}s</b><span><i class="swatch line main"></i>npm ${Math.round(d.npm)}</span><span><i class="swatch cross"></i>wrong notes ${d.errors}</span>`;
    const left = Math.min(x(i) + 12, width - tooltip.offsetWidth - 4);
    tooltip.style.left = `${left < x(i) ? x(i) - tooltip.offsetWidth - 12 : left}px`;
  });
  svg.querySelector(".hit").addEventListener("mouseleave", () => {
    hover.style.display = "none";
    tooltip.hidden = true;
  });
}
