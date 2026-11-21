// Stats page, modeled on MonkeyType's account page: summary, personal bests, activity heatmap,
// then filtered charts, averages, weakest notes and the full results list. All data is local.
import { settings } from "../settings.js";
import { keyName, pitchName, pitchFromMidi } from "../music.js";
import { icon } from "../icons.js";
import { createPiano } from "../piano.js";
import { barChart, heatmap, pointsChart } from "../charts.js";
import { loadPbs, loadResults, loadStats, notationKey } from "../history.js";

const MODE_VALUES = { notes: [8, 16, 32, 64], time: [15, 30, 60, 120], attack: [20, 30, 45, 60] };
const RANGES = { day: 1, week: 7, month: 30, "3 months": 90, "all time": Infinity };
const PAGE = 10;

// Filters and toggles last for the session (not saved).
const view = { scope: "all", range: "all time", mode: "all", avg10: true, avg100: true, rows: PAGE };
let root = null;

// ---- formatting ----

const pad2 = (n) => String(n).padStart(2, "0");
const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const formatDate = (t) => new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const formatTime = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const formatDuration = (ms) => {
  const s = Math.round(ms / 1000);
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
};
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (v) => Math.round(v);
const modeLabel = (r) => `${r.mode}${r.value != null ? ` ${r.value}` : ""}`;
const info = (r) =>
  [r.clef === "grand" ? "grand staff" : r.clef, r.fifths != null ? keyName(r.fifths) : null, r.chords && "chords", r.accidentals === "chromatic" && "chromatic", r.memory && "memory", r.ear && "ear"]
    .filter(Boolean)
    .join(" · ");

function movingAverage(values, n) {
  return values.map((_, i) => (i + 1 < Math.min(n, values.length) ? null : avg(values.slice(Math.max(0, i - n + 1), i + 1))));
}

// ---- page ----

export function mount(container) {
  root = document.createElement("div");
  root.className = "stats-page";
  container.appendChild(root);
  root.addEventListener("click", onClick);
  render();
}

export function unmount() {
  root.remove();
  root = null;
}

function filtered(results) {
  const since = Date.now() - RANGES[view.range] * 86400000;
  const current = notationKey(settings.all());
  return results.filter(
    (r) => r.date >= since && (view.mode === "all" || r.mode === view.mode) && (view.scope === "all" || r.notation === current),
  );
}

function render() {
  const all = loadResults();
  const stats = loadStats();
  if (!all.length && !stats.started) {
    root.innerHTML = `<div class="stats-empty">${icon("chart")}<span>no tests yet. finish a test and your stats will show up here.</span><a class="button" href="#">start a test</a></div>`;
    return;
  }
  const results = filtered(all);
  root.innerHTML = `
    ${summaryCard(stats)}
    ${["notes", "time", "attack"].map(pbCard).join("")}
    <section class="stats-card activity">
      <div class="activity-head"><span>last 12 months</span><span class="activity-count"></span>
        <span class="legend-scale">less <i class="cell l0"></i><i class="cell l1"></i><i class="cell l2"></i><i class="cell l3"></i><i class="cell l4"></i> more</span></div>
      <div class="activity-map"></div>
    </section>
    ${filtersHtml()}
    ${results.length ? filteredSections(results) : `<div class="stats-empty small">no tests match these filters</div>`}`;

  const days = new Map();
  for (const r of all) days.set(dayKey(r.date), (days.get(dayKey(r.date)) ?? 0) + 1);
  const shown = heatmap(root.querySelector(".activity-map"), days, { dayKey, formatDate });
  root.querySelector(".activity-count").textContent = `${shown} tests`;
  if (results.length) drawFiltered(results);
}

function summaryCard(stats) {
  const restarts = stats.completed ? ((stats.started - stats.completed) / stats.completed).toFixed(1) : "0";
  return `
    <section class="stats-card summary">
      <div class="summary-who">${icon("logo")}<div><div class="summary-title">your practice</div>${
        stats.firstDate ? `<div class="summary-since">since ${formatDate(stats.firstDate)}</div>` : ""
      }</div></div>
      <div class="summary-divider"></div>
      <div class="summary-stats">
        <div class="stat"><div class="stat-label">tests started</div><div class="stat-value">${stats.started}</div></div>
        <div class="stat" title="${restarts} restarts per completed test"><div class="stat-label">tests completed</div><div class="stat-value">${stats.completed}</div></div>
        <div class="stat"><div class="stat-label">time playing</div><div class="stat-value">${formatDuration(stats.timeMs)}</div></div>
      </div>
    </section>`;
}

/** Best result for each length of a mode, across all notation settings. */
function pbCard(mode) {
  const pbs = loadPbs();
  const metric = mode === "attack" ? "score" : "npm";
  const cells = MODE_VALUES[mode]
    .map((value) => {
      const prefix = `${mode}|${value}|`;
      let best = null;
      for (const [key, pb] of Object.entries(pbs)) {
        if (key.startsWith(prefix) && pb[metric] != null && (!best || pb[metric] > best.pb[metric])) best = { pb, notation: key.slice(prefix.length) };
      }
      const label = mode === "attack" ? `${value} npm start` : mode === "time" ? `${value} seconds` : `${value} notes`;
      if (!best) return `<div class="pb-cell"><div class="pb-label">${label}</div><div class="pb-value">-</div><div class="pb-acc">-</div></div>`;
      const tip = `${best.pb[metric]} ${metric} · ${best.pb.acc}% acc · ${formatDate(best.pb.date)} · ${best.notation.replaceAll("|", " · ")}`;
      return `<div class="pb-cell" title="${tip}"><div class="pb-label">${label}</div><div class="pb-value">${best.pb[metric]}</div><div class="pb-acc">${best.pb.acc}%</div></div>`;
    })
    .join("");
  return `<section class="stats-card pbs"><div class="pb-mode">${mode}${mode === "attack" ? " (score)" : ""}</div><div class="pb-cells">${cells}</div></section>`;
}

function filtersHtml() {
  // options: [value, label] pairs
  const group = (key, options) =>
    `<div class="filter-group">${options
      .map(([v, label]) => `<button class="button${view[key] === v ? " active" : ""}" data-filter="${key}" data-value="${v}">${label}</button>`)
      .join("")}</div>`;
  const same = (values) => values.map((v) => [v, v]);
  return `
    <div class="stats-filters">
      <div class="filters-title">${icon("filter")}<span>filters</span></div>
      ${group("scope", [["all", "all settings"], ["current", "current settings"]])}
      ${group("range", Object.keys(RANGES).map((v) => [v, v === "day" || v === "week" || v === "month" ? `last ${v}` : v === "3 months" ? "last 3 months" : v]))}
      ${group("mode", same(["all", "notes", "time", "attack", "zen"]).map(([v, l]) => [v, v === "all" ? "all modes" : l]))}
    </div>`;
}

function filteredSections(results) {
  const npms = results.map((r) => r.npm);
  const accs = results.map((r) => r.acc);
  const cons = results.map((r) => r.consistency ?? 0);
  const last = (xs) => xs.slice(-10);
  const timeMs = results.reduce((a, r) => a + (r.seconds ?? 0) * 1000, 0);
  const notes = results.reduce((a, r) => a + (r.notes ?? 0), 0);
  const slope = speedPerHour(results);
  const stat = (label, value, title = "") => `<div class="stat"${title ? ` title="${title}"` : ""}><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;
  return `
    <section class="stats-section">
      <div class="chart-toolbar">
        <div class="chart-legend"><span><i class="swatch dot-swatch"></i>npm per test</span>${view.avg10 ? `<span><i class="swatch line main"></i>avg of 10</span>` : ""}${view.avg100 ? `<span><i class="swatch line sub"></i>avg of 100</span>` : ""}</div>
        <div class="filter-group small">
          <button class="button${view.avg10 ? " active" : ""}" data-toggle="avg10">avg of 10</button>
          <button class="button${view.avg100 ? " active" : ""}" data-toggle="avg100">avg of 100</button>
        </div>
      </div>
      <div class="speed-chart"></div>
      <div class="chart-caption">accuracy</div>
      <div class="acc-chart"></div>
      ${slope !== null ? `<div class="chart-note">speed change per hour of practice: ${slope >= 0 ? "+" : ""}${slope.toFixed(1)} npm</div>` : ""}
    </section>
    <section class="stats-section">
      <div class="chart-caption">tests by speed (npm)</div>
      <div class="histogram"></div>
    </section>
    <section class="stats-section">
      <div class="chart-caption">practice time per day (minutes)</div>
      <div class="daily-chart"></div>
    </section>
    <div class="big-number"><span class="stat-label">estimated notes played</span><span class="stat-value">${notes}</span></div>
    <div class="stats-grid">
      ${stat("tests completed", results.length)}
      ${stat("time playing", formatDuration(timeMs))}
      ${stat("tests per day", (results.length / Math.max(1, new Set(results.map((r) => dayKey(r.date))).size)).toFixed(1), "average on days you practised")}
      ${stat("highest npm", round(Math.max(...npms)))}
      ${stat("average npm", round(avg(npms)))}
      ${stat("average npm (last 10)", round(avg(last(npms))))}
      ${stat("highest acc", `${round(Math.max(...accs))}%`)}
      ${stat("average acc", `${round(avg(accs))}%`)}
      ${stat("average acc (last 10)", `${round(avg(last(accs)))}%`)}
      ${stat("highest consistency", `${round(Math.max(...cons))}%`)}
      ${stat("average consistency", `${round(avg(cons))}%`)}
      ${stat("average consistency (last 10)", `${round(avg(last(cons)))}%`)}
    </div>
    <section class="stats-section">
      <div class="chart-caption">weakest notes</div>
      <div class="weak-piano miss-piano"></div>
      <div class="miss-list weak-list"></div>
    </section>
    <section class="stats-section">
      <div class="table-head"><div class="chart-caption">results</div><button class="button" data-action="csv">${icon("download")}<span>export csv</span></button></div>
      <div class="results-table-wrap"><table class="results-table">
        <thead><tr><th>npm</th><th>acc</th><th>consistency</th><th>mode</th><th>info</th><th>date</th></tr></thead>
        <tbody>${results
          .slice()
          .reverse()
          .slice(0, view.rows)
          .map(
            (r) => `<tr><td>${r.npm}</td><td>${r.acc}%</td><td>${r.consistency ?? 0}%</td><td>${modeLabel(r)}${r.score != null ? ` · score ${r.score}` : ""}</td><td>${info(r)}</td><td>${formatDate(r.date)}<br><span class="sub">${formatTime(r.date)}</span></td></tr>`,
          )
          .join("")}</tbody>
      </table></div>
      ${results.length > view.rows ? `<button class="button load-more" data-action="more">load more</button>` : ""}
    </section>`;
}

/** Least-squares slope of npm against cumulative practice hours. */
function speedPerHour(results) {
  if (results.length < 5) return null;
  let hours = 0;
  const pts = results.map((r) => ({ x: (hours += (r.seconds ?? 0) / 3600), y: r.npm }));
  const mx = avg(pts.map((p) => p.x));
  const my = avg(pts.map((p) => p.y));
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  return sxx > 0 ? pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx : null;
}

function drawFiltered(results) {
  const tip = (r, extra) => `<b>${formatDate(r.date)} ${formatTime(r.date)}</b><span>${extra}</span><span>${modeLabel(r)} · ${info(r)}</span>`;
  const npms = results.map((r) => r.npm);
  const lines = [];
  if (view.avg100) lines.push({ values: movingAverage(npms, 100), cls: "sub" });
  if (view.avg10) lines.push({ values: movingAverage(npms, 10), cls: "main" });
  pointsChart(root.querySelector(".speed-chart"), { points: results.map((r) => ({ y: r.npm, tip: tip(r, `${r.npm} npm · ${r.acc}% acc`) })), lines });

  const accMin = Math.max(0, Math.floor(Math.min(...results.map((r) => r.acc)) / 10) * 10 - 10);
  pointsChart(root.querySelector(".acc-chart"), {
    points: results.map((r) => ({ y: r.acc, tip: tip(r, `${r.acc}% accuracy`) })),
    lines: [{ values: movingAverage(results.map((r) => r.acc), 10), cls: "main" }],
    height: 140,
    yMin: Math.min(accMin, 80),
    yMax: 100,
    unit: "%",
  });

  // Histogram in 10-npm buckets.
  const maxBucket = Math.floor(Math.max(...npms) / 10);
  const buckets = Array.from({ length: maxBucket + 1 }, (_, i) => ({ from: i * 10, count: 0 }));
  for (const v of npms) buckets[Math.floor(v / 10)].count++;
  barChart(root.querySelector(".histogram"), {
    bars: buckets.map((b) => ({ label: `${b.from}`, value: b.count, tip: `<b>${b.from}–${b.from + 9} npm</b><span>${b.count} test${b.count === 1 ? "" : "s"}</span>` })),
    labelEvery: Math.ceil(buckets.length / 12),
  });

  // Practice time per day, over the last 30 days (or the filtered range if shorter).
  const daysBack = Math.min(30, RANGES[view.range]);
  const perDay = new Map();
  for (const r of results) {
    const k = dayKey(r.date);
    const d = perDay.get(k) ?? { ms: 0, tests: 0 };
    d.ms += (r.seconds ?? 0) * 1000;
    d.tests++;
    perDay.set(k, d);
  }
  const bars = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const t = Date.now() - i * 86400000;
    const d = perDay.get(dayKey(t)) ?? { ms: 0, tests: 0 };
    const minutes = Math.round((d.ms / 60000) * 10) / 10;
    bars.push({
      label: new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toLowerCase(),
      value: minutes,
      tip: `<b>${formatDate(t)}</b><span>${minutes} min · ${d.tests} test${d.tests === 1 ? "" : "s"}</span>`,
    });
  }
  barChart(root.querySelector(".daily-chart"), { bars, height: 160, labelEvery: Math.ceil(bars.length / 8) });

  drawWeakNotes(results);
}

/** Miss rate per pitch across the filtered results, as a tinted piano plus a list. */
function drawWeakNotes(results) {
  const agg = new Map();
  for (const r of results) {
    for (const [midi, attempts, misses] of r.pitches ?? []) {
      const a = agg.get(midi) ?? { attempts: 0, misses: 0 };
      a.attempts += attempts;
      a.misses += misses;
      agg.set(midi, a);
    }
  }
  const list = root.querySelector(".weak-list");
  if (!agg.size) {
    list.innerHTML = "<span>no note data yet</span>";
    return;
  }
  const midis = [...agg.keys()];
  const piano = createPiano(root.querySelector(".weak-piano"), { low: Math.min(...midis) - 1, high: Math.max(...midis) + 1, interactive: false });
  for (const [midi, a] of agg) {
    const key = piano.keys.get(midi);
    if (!key) continue;
    key.classList.add("tested");
    key.style.setProperty("--miss", a.misses ? 0.25 + 0.75 * (a.misses / a.attempts) : 0);
    key.title = `${pitchName(pitchFromMidi(midi))}: ${a.misses}/${a.attempts} missed (${round((a.misses / a.attempts) * 100)}%)`;
  }
  const weakest = [...agg.entries()]
    .filter(([, a]) => a.misses && a.attempts >= 3)
    .sort(([, a], [, b]) => b.misses / b.attempts - a.misses / a.attempts)
    .slice(0, 10);
  list.innerHTML = weakest.length
    ? weakest.map(([midi, a]) => `<span><b>${pitchName(pitchFromMidi(midi))}</b> ${round((a.misses / a.attempts) * 100)}% (${a.misses}/${a.attempts})</span>`).join("")
    : "<span>no weak notes yet (a note needs at least 3 attempts to be listed)</span>";
}

// ---- events ----

function onClick(e) {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (btn.dataset.filter) {
    view[btn.dataset.filter] = btn.dataset.value;
    view.rows = PAGE;
    render();
  } else if (btn.dataset.toggle) {
    view[btn.dataset.toggle] = !view[btn.dataset.toggle];
    render();
  } else if (btn.dataset.action === "more") {
    view.rows += PAGE;
    render();
  } else if (btn.dataset.action === "csv") exportCsv();
}

function exportCsv() {
  const rows = filtered(loadResults());
  const header = ["date", "mode", "length", "npm", "acc", "consistency", "seconds", "notes", "score", "clef", "key", "accidentals", "chords", "memory", "ear"];
  const csv = [header.join(",")]
    .concat(
      rows.map((r) =>
        [new Date(r.date).toISOString(), r.mode, r.value ?? "", r.npm, r.acc, r.consistency ?? "", r.seconds ?? "", r.notes ?? "", r.score ?? "", r.clef ?? "", r.fifths != null ? keyName(r.fifths) : "", r.accidentals ?? "", !!r.chords, !!r.memory, !!r.ear]
          .map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : v))
          .join(","),
      ),
    )
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "monkeynote-results.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
