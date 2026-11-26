// Command palette (Esc or Ctrl/Cmd+Shift+P): search every setting and action, MonkeyType-style.
// Settings open a submenu of their values; themes preview as you move through them.
import { OPTIONS, pickColors, settings } from "./settings.js";
import { DEFS, valueLabel } from "./setting-defs.js";
import { applyTheme, themeColors, themeLabel, themeNames } from "./theme.js";
import { icon } from "./icons.js";
import { debug } from "./debug.js";
import { hideTooltip } from "./tooltip.js";
import { SHARE_GROUPS, shareUrl } from "./share.js";

let overlay = null;
let input = null;
let list = null;
let stack = []; // menus: { title, items }
let shown = []; // items matching the query
let selected = 0;

export const isPaletteOpen = () => !!overlay;

// ---- menus ----

function rootMenu() {
  const settingItems = Object.keys(DEFS)
    .filter((key) => OPTIONS[key])
    .map((key) => ({
      label: `${DEFS[key].title}...`,
      icon: DEFS[key].icon,
      hint: valueLabel(key, settings.get(key)),
      sub: () => optionsMenu(key),
    }));
  return {
    title: "",
    items: [
      { label: "restart test", icon: "restart", run: restartTest },
      { label: "go to settings", icon: "gear", run: () => (location.hash = "#settings") },
      { label: "go to stats", icon: "chart", run: () => (location.hash = "#stats") },
      { label: "go to test", icon: "piano", run: () => (location.hash = "") },
      { label: "theme...", icon: "palette", hint: themeLabel(settings.get("theme")), sub: themeMenu },
      { label: "share settings", icon: "share", run: () => setTimeout(openShare) },
      { label: "toggle debug mode", icon: "bug", hint: debug.on ? "on" : "off", run: () => debug.toggle() },
      ...settingItems,
    ],
  };
}

function optionsMenu(key) {
  const current = settings.get(key);
  return {
    title: DEFS[key].title,
    items: OPTIONS[key].map((v) => ({ label: valueLabel(key, v), active: v === current, run: () => settings.set(key, v) })),
  };
}

function themeMenu() {
  const current = settings.get("theme");
  const preview = (name) => () => applyTheme(name, { persist: false });
  return {
    title: "theme",
    items: [
      {
        label: "custom",
        active: current === "custom",
        preview: preview("custom"),
        run: () => {
          if (current !== "custom") settings.set("customTheme", pickColors(themeColors(current)));
          settings.set("theme", "custom");
        },
      },
      ...themeNames().map((name) => ({
        label: themeLabel(name),
        active: name === current,
        swatch: themeColors(name),
        preview: preview(name),
        run: () => settings.set("theme", name),
      })),
    ],
  };
}

function restartTest() {
  if (/^#?(settings|stats)/.test(location.hash)) location.hash = "";
  else window.dispatchEvent(new Event("monkeyscore:restart"));
}

// ---- open / close ----

/** Open the palette; `start` ("theme" or a setting key) jumps straight into that submenu. */
export function openPalette(start) {
  if (overlay) return;
  hideTooltip();
  overlay = document.createElement("div");
  overlay.className = "palette-backdrop";
  overlay.innerHTML = `
    <div class="palette" role="dialog" aria-label="command line">
      <div class="palette-input">${icon("search")}<span class="palette-crumb"></span><input type="text" spellcheck="false" autocomplete="off" aria-label="search commands" /></div>
      <div class="palette-list" role="listbox"></div>
    </div>`;
  document.body.appendChild(overlay);
  input = overlay.querySelector("input");
  list = overlay.querySelector(".palette-list");

  overlay.addEventListener("mousedown", (e) => e.target === overlay && closePalette());
  overlay.addEventListener("keydown", onKey);
  input.addEventListener("input", () => filter());
  list.addEventListener("mousemove", (e) => {
    const row = e.target.closest("[data-i]");
    if (row && Number(row.dataset.i) !== selected) select(Number(row.dataset.i), false);
  });
  list.addEventListener("click", (e) => {
    const row = e.target.closest("[data-i]");
    if (row) choose(Number(row.dataset.i));
  });

  stack = [rootMenu()];
  if (start === "theme") stack.push(themeMenu());
  else if (DEFS[start] && OPTIONS[start]) stack.push(optionsMenu(start));
  show();
  input.focus();
}

export function closePalette() {
  if (!overlay) return;
  overlay.remove();
  overlay = input = list = null;
  stack = [];
  applyTheme(settings.get("theme"), { persist: false }); // undo any theme preview
}

const stepper = () =>
  `<span class="stepper"><button type="button" class="step" data-step="-1" aria-label="decrease">${icon("minus")}</button><button type="button" class="step" data-step="1" aria-label="increase">${icon("plus")}</button></span>`;

/**
 * Number prompt in the palette's style (used for "custom" values); counts as an open palette while shown.
 * Ask for a whole number in [min, max]; resolves to it, or null if cancelled.
 * With `presets` (the test bar's quick-pick values), they can be edited too, and the result is
 * { value, presets } (presets sorted).
 */
export function askNumber({ title, value, min, max, presets = null }) {
  if (overlay) closePalette();
  return new Promise((resolve) => {
    overlay = document.createElement("div");
    overlay.className = "palette-backdrop";
    const presetRow = presets
      ? `<div class="palette-presets"><span class="palette-presets-label">quick picks</span>${presets
          .map((p, i) => `<input type="number" min="${min}" max="${max}" step="1" value="${p}" data-preset="${i}" aria-label="quick pick ${i + 1}" />`)
          .join('<span class="palette-presets-comma">,</span>')}</div>`
      : "";
    overlay.innerHTML = `
      <form class="palette palette-number" role="dialog" aria-label="${title}">
        <div class="palette-input number-field"><span class="palette-crumb">${title}:</span><input type="number" min="${min}" max="${max}" step="1" value="${value}" aria-label="${title}" />
          ${stepper()}</div>
        ${presetRow}
        <div class="palette-empty">${min}–${max} · enter to apply · esc to cancel</div>
      </form>`;
    document.body.appendChild(overlay);
    const field = overlay.querySelector("input");
    const read = (input) => {
      const n = Math.round(Number(input.value));
      return Number.isFinite(n) && n >= min && n <= max ? n : null;
    };
    const done = (result) => {
      overlay?.remove();
      overlay = null;
      resolve(result);
    };
    overlay.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const n = read(field);
      if (n === null) return field.select();
      if (!presets) return done(n);
      const inputs = [...overlay.querySelectorAll("[data-preset]")];
      const bad = inputs.find((input) => read(input) === null);
      if (bad) return bad.select();
      done({ value: n, presets: inputs.map(read).sort((a, b) => a - b) });
    });
    overlay.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") done(null);
      // Enter applies from any field (with several fields the browser won't submit the form by itself).
      else if (e.key === "Enter") {
        e.preventDefault();
        overlay.querySelector("form").requestSubmit();
      }
    });
    overlay.querySelector("form").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-step]");
      if (!btn) return;
      const input = btn.closest(".number-field").querySelector("input");
      const n = Math.round(Number(input.value) || 0) + Number(btn.dataset.step);
      input.value = Math.max(min, Math.min(max, n));
      input.focus();
    });
    overlay.addEventListener("mousedown", (e) => e.target === overlay && done(null));
    field.focus();
    field.select();
  });
}

/**
 * Share dialog: pick which groups of settings go into the link (all by default), then copy it.
 * Counts as an open palette while shown.
 */
export function openShare() {
  if (overlay) closePalette();
  hideTooltip();
  const chosen = new Set(SHARE_GROUPS.map((g) => g.id));
  overlay = document.createElement("div");
  overlay.className = "palette-backdrop";
  overlay.innerHTML = `
    <div class="palette share-dialog" role="dialog" aria-label="share settings">
      <div class="palette-input">${icon("share")}<span class="palette-crumb">share settings</span></div>
      <div class="share-groups">${SHARE_GROUPS.map(
        (g) => `<button type="button" class="share-group" data-group="${g.id}" aria-pressed="true"><span class="share-box">${icon("check")}</span><span class="share-title">${g.title}</span><span class="share-text">${g.text}</span></button>`,
      ).join("")}</div>
      <div class="share-link"><input type="text" readonly spellcheck="false" aria-label="link to these settings" /><button type="button" class="button share-copy">${icon("copy")}<span>copy link</span></button></div>
      <div class="palette-empty">opening the link applies these settings · esc to close</div>
    </div>`;
  document.body.appendChild(overlay);
  const field = overlay.querySelector(".share-link input");
  const copy = overlay.querySelector(".share-copy");
  const update = () => {
    for (const btn of overlay.querySelectorAll("[data-group]")) btn.setAttribute("aria-pressed", String(chosen.has(btn.dataset.group)));
    field.value = shareUrl([...chosen]);
    copy.disabled = chosen.size === 0;
  };
  overlay.querySelector(".share-groups").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-group]");
    if (!btn) return;
    if (chosen.has(btn.dataset.group)) chosen.delete(btn.dataset.group);
    else chosen.add(btn.dataset.group);
    update();
  });
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(field.value);
    } catch {
      field.select(); // clipboard blocked: leave the link selected to copy by hand
      document.execCommand?.("copy");
    }
    copy.querySelector("span").textContent = "copied";
    setTimeout(() => copy.isConnected && (copy.querySelector("span").textContent = "copy link"), 1500);
  });
  field.addEventListener("focus", () => field.select());
  overlay.addEventListener("mousedown", (e) => e.target === overlay && closePalette());
  overlay.addEventListener("keydown", (e) => {
    e.stopPropagation(); // keys don't reach the test (or open the palette) while sharing
    if (e.key === "Escape") closePalette();
  });
  update();
  copy.focus();
}

// ---- rendering ----

function show() {
  const menu = stack[stack.length - 1];
  overlay.querySelector(".palette-crumb").textContent = menu.title ? `${menu.title}:` : "";
  input.placeholder = menu.title ? "search…" : "search settings and actions…";
  input.value = "";
  filter();
  // In a submenu, start on the current value.
  const active = shown.findIndex((item) => item.active);
  if (active >= 0) select(active);
}

function filter() {
  const words = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  shown = stack[stack.length - 1].items.filter((item) => words.every((w) => item.label.toLowerCase().includes(w)));
  list.innerHTML = shown.length
    ? shown
        .map(
          (item, i) => `
      <div class="palette-item" role="option" data-i="${i}">
        <span class="palette-check">${item.active ? icon("check") : ""}</span>
        ${item.icon ? icon(item.icon) : ""}
        <span class="palette-label">${item.label}</span>
        ${item.hint !== undefined ? `<span class="palette-hint">${item.hint}</span>` : ""}
        ${item.swatch ? `<span class="theme-bubbles" style="background:${item.swatch.bg}"><i style="background:${item.swatch.main}"></i><i style="background:${item.swatch.sub}"></i><i style="background:${item.swatch.text}"></i></span>` : ""}
      </div>`,
        )
        .join("")
    : `<div class="palette-empty">nothing found</div>`;
  select(0);
}

function select(i, scroll = true) {
  if (!shown.length) return;
  selected = (i + shown.length) % shown.length;
  list.querySelectorAll(".palette-item").forEach((row, j) => row.classList.toggle("selected", j === selected));
  if (scroll) list.children[selected]?.scrollIntoView({ block: "nearest" });
  shown[selected].preview?.();
}

function choose(i) {
  const item = shown[i];
  if (!item) return;
  if (item.sub) {
    stack.push(item.sub());
    show();
    return;
  }
  item.run();
  closePalette();
}

function onKey(e) {
  e.stopPropagation(); // keep Tab, space and note keys away from the test page
  if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
    e.preventDefault();
    select(selected + 1);
  } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
    e.preventDefault();
    select(selected - 1);
  } else if (e.key === "Enter") {
    e.preventDefault();
    choose(selected);
  } else if (e.key === "Escape" || (e.key === "Backspace" && !input.value && stack.length > 1)) {
    e.preventDefault();
    if (stack.length > 1) {
      stack.pop();
      applyTheme(settings.get("theme"), { persist: false });
      show();
    } else closePalette();
  }
}
