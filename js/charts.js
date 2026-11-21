// Small SVG charts for the stats page: a points + lines chart, a bar chart and an activity heatmap.
// Colors come from theme classes in style.css; every chart has a hover tooltip.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Smallest "nice" axis max (4 ticks of 1, 2, 2.5 or 5 x 10^k) at or above v. */
export function niceMax(v) {
  const raw = Math.max(v, 4) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) * 4;
}

function tooltipFor(el) {
  el.classList.add("chart");
  let tip = el.querySelector(".chart-tooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "chart-tooltip";
    tip.hidden = true;
    el.appendChild(tip);
  }
  return {
    show(html, x, width) {
      tip.innerHTML = html;
      tip.hidden = false;
      const left = x + 12 + tip.offsetWidth > width ? x - tip.offsetWidth - 12 : x + 12;
      tip.style.left = `${Math.max(0, left)}px`;
    },
    hide: () => (tip.hidden = true),
  };
}

const axes = (pad, width, height, h, yMax, y, unit = "") =>
  [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const v = f * yMax;
      return `<line class="grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${pad.left - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}${unit}</text>`;
    })
    .join("");

/**
 * Points per test, plus optional lines (e.g. moving averages), x = test number.
 * opts: { points: [{ y, tip }], lines: [{ values, cls }], height, yMax, unit, yMin }
 */
export function pointsChart(el, { points, lines = [], height = 220, yMax, yMin = 0, unit = "" }) {
  const width = el.clientWidth || 600;
  const pad = { left: 44, right: 10, top: 10, bottom: 22 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const n = points.length;
  const top = yMax ?? niceMax(Math.max(...points.map((p) => p.y), ...lines.flatMap((l) => l.values.filter((v) => v != null))));
  const x = (i) => pad.left + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v) => pad.top + h - ((v - yMin) / (top - yMin)) * h;
  const path = (values) => {
    let d = "";
    values.forEach((v, i) => v != null && (d += `${d ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`));
    return d;
  };
  const step = Math.max(1, Math.ceil(n / 8));
  const xTicks = points.map((_, i) => i).filter((i) => i % step === 0 || i === n - 1);
  el.innerHTML = `
    <svg width="${width}" height="${height}">
      ${[0, 0.25, 0.5, 0.75, 1]
        .map((f) => {
          const v = yMin + f * (top - yMin);
          return `<line class="grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${pad.left - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}${unit}</text>`;
        })
        .join("")}
      ${xTicks.map((i) => `<text class="axis" x="${x(i)}" y="${height - 4}" text-anchor="middle">${i + 1}</text>`).join("")}
      ${points.map((p, i) => `<circle class="point" cx="${x(i).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="${n > 300 ? 2 : 3}"/>`).join("")}
      ${lines.map((l) => `<path class="series ${l.cls}" d="${path(l.values)}"/>`).join("")}
      <g class="hover" style="display:none"><line class="crosshair" y1="${pad.top}" y2="${pad.top + h}"/><circle class="dot main" r="5"/></g>
      <rect class="hit" x="${pad.left}" y="0" width="${w}" height="${height}" fill="transparent"/>
    </svg>`;
  const svg = el.querySelector("svg");
  const hover = svg.querySelector(".hover");
  const tip = tooltipFor(el);
  svg.querySelector(".hit").addEventListener("mousemove", (e) => {
    const box = svg.getBoundingClientRect();
    const i = n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((e.clientX - box.left - pad.left) / w) * (n - 1))));
    hover.style.display = "";
    hover.querySelector(".crosshair").setAttribute("x1", x(i));
    hover.querySelector(".crosshair").setAttribute("x2", x(i));
    hover.querySelector(".dot").setAttribute("cx", x(i));
    hover.querySelector(".dot").setAttribute("cy", y(points[i].y));
    tip.show(points[i].tip, x(i), width);
  });
  svg.querySelector(".hit").addEventListener("mouseleave", () => {
    hover.style.display = "none";
    tip.hide();
  });
}

/** Vertical bars. opts: { bars: [{ label, value, tip }], height, labelEvery } */
export function barChart(el, { bars, height = 200, labelEvery = 1 }) {
  const width = el.clientWidth || 600;
  const pad = { left: 44, right: 10, top: 10, bottom: 24 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const top = niceMax(Math.max(...bars.map((b) => b.value)));
  const slot = w / Math.max(1, bars.length);
  const gap = Math.min(4, slot * 0.2);
  const y = (v) => pad.top + h - (v / top) * h;
  el.innerHTML = `
    <svg width="${width}" height="${height}">
      ${axes(pad, width, height, h, top, y)}
      ${bars
        .map((b, i) => {
          const bx = pad.left + i * slot + gap / 2;
          const bh = Math.max(0, pad.top + h - y(b.value));
          const label = i % labelEvery === 0 ? `<text class="axis" x="${bx + (slot - gap) / 2}" y="${height - 6}" text-anchor="middle">${esc(b.label)}</text>` : "";
          return `<rect class="bar" data-i="${i}" x="${bx.toFixed(1)}" y="${(pad.top + h - bh).toFixed(1)}" width="${Math.max(1, slot - gap).toFixed(1)}" height="${bh.toFixed(1)}" rx="${Math.min(3, (slot - gap) / 2)}"/>${label}`;
        })
        .join("")}
      ${bars.map((b, i) => `<rect class="bar-hit" data-i="${i}" x="${pad.left + i * slot}" y="${pad.top}" width="${slot}" height="${h}" fill="transparent"/>`).join("")}
    </svg>`;
  const svg = el.querySelector("svg");
  const tip = tooltipFor(el);
  svg.addEventListener("mousemove", (e) => {
    const hit = e.target.closest(".bar-hit");
    svg.querySelectorAll(".bar.hovered").forEach((r) => r.classList.remove("hovered"));
    if (!hit) return tip.hide();
    const i = Number(hit.dataset.i);
    svg.querySelector(`.bar[data-i="${i}"]`).classList.add("hovered");
    tip.show(bars[i].tip, pad.left + (i + 0.5) * slot, width);
  });
  svg.addEventListener("mouseleave", () => {
    svg.querySelectorAll(".bar.hovered").forEach((r) => r.classList.remove("hovered"));
    tip.hide();
  });
}

/**
 * Activity heatmap: one column per week (Monday first), the last `weeks` weeks up to today.
 * counts: Map("YYYY-MM-DD" -> number). Returns the number of tests shown.
 */
export function heatmap(el, counts, { weeks = 53, dayKey, formatDate }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7); // Monday, `weeks` weeks ago
  const values = [...counts.values()].filter((v) => v > 0).sort((a, b) => a - b);
  const q = (f) => values[Math.floor(f * (values.length - 1))] ?? 1;
  const thresholds = [q(0.25), q(0.5), q(0.75)];
  const level = (c) => (c <= 0 ? 0 : c <= thresholds[0] ? 1 : c <= thresholds[1] ? 2 : c <= thresholds[2] ? 3 : 4);

  let cells = "";
  const monthStarts = []; // { w, label }
  let total = 0;
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      if (day > today) continue;
      const key = dayKey(day.getTime());
      const c = counts.get(key) ?? 0;
      total += c;
      cells += `<span class="cell l${level(c)}" style="grid-column:${w + 1};grid-row:${d + 1}" data-tip="${c} test${c === 1 ? "" : "s"} on ${formatDate(day.getTime())}"></span>`;
      if (d === 0 && day.getMonth() !== lastMonth) {
        lastMonth = day.getMonth();
        monthStarts.push({ w, label: day.toLocaleDateString("en-GB", { month: "short" }).toLowerCase() });
      }
    }
  }
  // Label each month at its first week; drop a label that would crowd the next one (a partial first month).
  const months = monthStarts
    .filter((m, i) => (monthStarts[i + 1]?.w ?? weeks) - m.w >= 3)
    .map((m) => `<span style="grid-row:1;grid-column:${m.w + 1} / span 3">${m.label}</span>`)
    .join("");
  el.innerHTML = `
    <div class="heatmap" style="--weeks:${weeks}">${cells}</div>
    <div class="heatmap-months" style="--weeks:${weeks}">${months}</div>`;
  const tip = tooltipFor(el);
  el.querySelector(".heatmap").addEventListener("mousemove", (e) => {
    const cell = e.target.closest(".cell");
    if (!cell) return tip.hide();
    const box = el.getBoundingClientRect();
    tip.show(esc(cell.dataset.tip), cell.getBoundingClientRect().left - box.left, el.clientWidth);
  });
  el.querySelector(".heatmap").addEventListener("mouseleave", tip.hide);
  return total;
}
