// Settings page: sections of settings rows with button groups, theme picker, danger zone.
import { CUSTOM_THEME_KEYS, OPTIONS, pickColors, settings } from "../settings.js";
import { DEFS, valueLabel } from "../setting-defs.js";
import { applyTheme, themeColors, themeLabel, themeNames } from "../theme.js";
import { icon } from "../icons.js";
import { tipAttr } from "../tooltip.js";
import { closeMenu } from "../menu.js";
import { midiOut, midiStatus, onMidiChange } from "../midi.js";
import { midiName, midiRange, PRESETS } from "../midi-range.js";
import { clearHistory } from "../history.js";
import { notify } from "../notify.js";
import { askNumber } from "../palette.js";
import { audio } from "../audio.js";

// Rows are setting keys (described in setting-defs.js) or custom renderers.
const SECTIONS = [
  { id: "input", title: "input", icon: "keyboard", rows: [midiRow, midiRangeRow, "fitRange", "keyLights", "keyLightChannel", "chordWindow", "ignoreOctave", "onScreenKeyboard", "keyLabels"] },
  { id: "sound", title: "sound", icon: "volume", rows: ["playOnPress", soundOutputRow, "instrument", volumeRow, "errorSound"] },
  // (clef, key, accidentals, leaps, ledger lines and chords are picked above the staff on the test page)
  { id: "appearance", title: "appearance", icon: "eye", rows: ["noteSize", "noteNames", "staffLines", "barLines", "caretStyle", paceCaretRow, "smoothCaret", "flipColors", "fontFamily"] },
  { id: "theme", title: "theme", icon: "palette", rows: ["randomTheme", customThemeRow, themeGrid] },
  { id: "danger", title: "danger zone", icon: "warning", rows: [dangerRows] },
];

let root, unsubscribe;

const COLOR_LABELS = {
  bg: "background",
  main: "main",
  caret: "caret",
  sub: "sub",
  subAlt: "sub alt",
  text: "text",
  error: "error",
  errorExtra: "error extra",
};

export function mount(container) {
  root = document.createElement("div");
  root.className = "settings-page";
  root.innerHTML = `
    <div class="settings-search">${icon("search")}<input type="search" placeholder="search settings" aria-label="search settings" spellcheck="false" /></div>
    <div class="settings-nav">${SECTIONS.map((s) => `<button class="button" data-jump="${s.id}">${s.title}</button>`).join("")}</div>
    <div class="settings-no-match" hidden>no settings match</div>
    ${SECTIONS.map(sectionHtml).join("")}
    <button class="to-top" data-action="to-top" aria-label="back to top"${tipAttr("back to top")}>${icon("arrowUp")}</button>`;
  container.appendChild(root);
  // Back-to-top button: shown once the page has scrolled past the first screen.
  const toTop = root.querySelector(".to-top");
  const onScroll = () => toTop.classList.toggle("shown", window.scrollY > window.innerHeight * 0.6);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  const grid = root.querySelector(".theme-grid");
  grid.addEventListener("mouseover", onThemeHover);
  grid.addEventListener("mouseleave", () => applyTheme(settings.get("theme"), { persist: false }));
  const unsubSettings = settings.subscribe(refresh);
  const unsubMidi = onMidiChange(() => {
    root.querySelector(".midi-status").textContent = midiStatusText();
    root.querySelector(".sound-output-status").textContent = soundOutputStatus();
  });
  const unsubRange = midiRange.subscribe(() => refreshMidiRange());
  unsubscribe = () => (unsubSettings(), unsubMidi(), unsubRange(), window.removeEventListener("scroll", onScroll));
}

export function unmount() {
  closeMenu();
  unsubscribe();
  midiRange.cancelDetect();
  applyTheme(settings.get("theme"), { persist: false });
  root.remove();
  root = null;
}

export function scrollToSection(id) {
  root.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function sectionHtml(section) {
  const body = section.rows.map((row) => (typeof row === "function" ? row() : rowHtml(row))).join("");
  return `
    <section class="settings-section" data-section="${section.id}">
      <button class="section-title" data-collapse="${section.id}">${icon(section.icon)}<span>${section.title}</span>${icon("chevron")}</button>
      <div class="section-body">${body}</div>
    </section>`;
}

function midiRow() {
  return `
    <div class="setting">
      <div class="setting-title">${icon("plug")}<span>midi</span></div>
      <div class="setting-text">Any connected MIDI keyboard works automatically. Supported in Chrome, Edge and Firefox (not Safari).</div>
      <div class="setting-value midi-status">${midiStatusText()}</div>
    </div>`;
}

function midiRangeRow() {
  return `
    <div class="setting wide">
      <div class="setting-title">${icon("piano")}<span>midi keyboard range</span></div>
      <div class="setting-text">
        Notes your keyboard doesn't have are accepted in any octave. The range is learned as you play;
        set it here if your keyboard is small, and reset it when you switch keyboards.
        <div class="setting-status midi-range-status">${midiRange.describe()}</div>
      </div>
      <div class="setting-buttons midi-range-buttons">${midiRangeButtons()}</div>
    </div>`;
}

function midiRangeButtons() {
  const r = midiRange.get();
  const presets = PRESETS.map((p) => {
    const active = r?.manual && r.low === p.low && r.high === p.high;
    return `<button class="button${active ? " active" : ""}" data-range-preset="${p.keys}"${tipAttr(`${midiName(p.low)}–${midiName(p.high)}`)}>${p.keys} keys</button>`;
  }).join("");
  const detecting = midiRange.isDetecting();
  return `${presets}
    <button class="button${detecting ? " active" : ""}" data-range-action="detect">${detecting ? "cancel" : "detect"}</button>
    <button class="button" data-range-action="reset">reset</button>`;
}

function refreshMidiRange(status) {
  if (!root) return;
  root.querySelector(".midi-range-status").textContent = status ?? midiRange.describe();
  root.querySelector(".midi-range-buttons").innerHTML = midiRangeButtons();
}

function onMidiRangeAction(target) {
  if (target.dataset.rangePreset) {
    midiRange.setPreset(Number(target.dataset.rangePreset));
  } else if (target.dataset.rangeAction === "reset") {
    midiRange.reset();
    notify("midi range forgotten; it will be learned again as you play");
  } else if (midiRange.isDetecting()) {
    midiRange.cancelDetect();
    refreshMidiRange();
  } else {
    if (!midiStatus().devices.length) return notify("connect a midi keyboard first");
    midiRange.detect({
      onStep: (m) => refreshMidiRange(`lowest key: ${midiName(m)}. now press your highest key`),
      onDone: () => notify(`midi range set: ${midiRange.describe()}`),
    });
    refreshMidiRange("press your lowest key");
  }
}

function midiStatusText() {
  const { status, devices } = midiStatus();
  if (status === "unsupported") return "this browser has no MIDI support";
  if (status === "pending") return "waiting for MIDI permission…";
  if (status === "denied") return "MIDI access was blocked; allow it in the browser's site settings";
  return devices.length ? `connected: ${devices.join(", ")}` : "no MIDI device connected";
}

/** Key: one button showing the current key; it opens the random / major / minor menu. */
/** Volume as a slider in 5% steps. */
function volumeRow() {
  const v = settings.get("volume");
  return `
    <div class="setting">
      <div class="setting-title">${icon("volume")}<span>volume</span></div>
      <div class="setting-text">${DEFS.volume.text}</div>
      <div class="setting-slider">
        <input type="range" min="0" max="20" step="1" value="${Math.round(v * 20)}" data-volume aria-label="volume" style="--pct:${v * 100}%" />
        <span class="slider-value">${Math.round(v * 100)}%</span>
      </div>
    </div>`;
}

function syncVolumeSlider() {
  const v = settings.get("volume");
  const slider = root.querySelector("[data-volume]");
  slider.value = Math.round(v * 20);
  slider.style.setProperty("--pct", `${v * 100}%`);
  root.querySelector(".slider-value").textContent = `${Math.round(v * 100)}%`;
}

/** Sound output, with which MIDI output will be used (or why it can't be). */
function soundOutputRow() {
  return rowHtml("soundOutput").replace('<div class="setting-text">', `<div class="setting-text"><span class="sound-output-status setting-status">${soundOutputStatus()}</span><br>`);
}

function soundOutputStatus() {
  const name = midiOut.name();
  if (settings.get("soundOutput") !== "midi") return name ? `midi output available: ${name}` : "";
  return name ? `playing on: ${name}` : "no midi output found: using the browser";
}

/** Pace caret: the usual buttons, with "custom" showing (and asking for) its speed. */
function paceCaretRow() {
  return rowHtml("paceCaret").replace(/data-value='"custom"'>custom</, `data-value='"custom"'>custom: ${settings.get("paceCaretNpm")} npm<`);
}

async function askPaceNpm() {
  const n = await askNumber({ title: "pace caret speed (npm)", value: settings.get("paceCaretNpm"), min: 1, max: 400 });
  if (n === null) return;
  settings.set("paceCaretNpm", n);
  settings.set("paceCaret", "custom");
  const btn = root.querySelector(`[data-key="paceCaret"][data-value='"custom"']`);
  if (btn) btn.textContent = `custom: ${n} npm`;
}

function rowHtml(key) {
  const def = DEFS[key];
  const current = settings.get(key);
  const buttons = OPTIONS[key]
    .map((v) => `<button class="button${v === current ? " active" : ""}" data-key="${key}" data-value='${JSON.stringify(v)}'>${valueLabel(key, v)}</button>`)
    .join("");
  return `
    <div class="setting${def.wide ? " wide" : ""}">
      <div class="setting-title">${icon(def.icon)}<span>${def.title}</span></div>
      <div class="setting-text">${def.text}</div>
      <div class="setting-buttons">${buttons}</div>
    </div>`;
}

// ---- theme ----

function customThemeRow() {
  const isCustom = settings.get("theme") === "custom";
  const colors = settings.get("customTheme");
  return `
    <div class="setting">
      <div class="setting-title">${icon("palette")}<span>custom theme</span></div>
      <div class="setting-text">Pick your own colors. It starts from the theme you have now.</div>
      <div class="setting-buttons"><button class="button${isCustom ? " active" : ""}" data-action="custom-theme">${isCustom ? "using custom theme" : "use custom theme"}</button></div>
    </div>
    <div class="custom-colors"${isCustom ? "" : " hidden"}>
      ${CUSTOM_THEME_KEYS.map(
        (k) => `<label class="color-field"><input type="color" data-color="${k}" value="${colors[k]}" /><span>${COLOR_LABELS[k]}</span></label>`,
      ).join("")}
    </div>`;
}

function useCustomTheme() {
  const current = settings.get("theme");
  if (current === "custom") return;
  settings.set("customTheme", pickColors(themeColors(current)));
  settings.set("theme", "custom");
}

function themeGrid() {
  const current = settings.get("theme");
  const buttons = themeNames()
    .map((name) => {
      const c = themeColors(name);
      return `<button class="theme-button${name === current ? " active" : ""}" data-theme="${name}" style="background:${c.bg};color:${c.main}">
        <span class="theme-name">${themeLabel(name)}</span>
        <span class="theme-bubbles"><i style="background:${c.main}"></i><i style="background:${c.sub}"></i><i style="background:${c.text}"></i></span>
      </button>`;
    })
    .join("");
  return `
    <div class="theme-search">${icon("search")}<input type="search" placeholder="search themes" aria-label="search themes" spellcheck="false" /></div>
    <div class="theme-grid">${buttons}</div>`;
}

function dangerRows() {
  return `
    <div class="setting">
      <div class="setting-title">${icon("restart")}<span>reset settings</span></div>
      <div class="setting-text">Reset all settings to their defaults. Cannot be undone.</div>
      <div class="setting-buttons"><button class="button danger" data-action="reset">reset settings</button></div>
    </div>
    <div class="setting">
      <div class="setting-title">${icon("warning")}<span>clear history</span></div>
      <div class="setting-text">Delete all saved results and personal bests. Cannot be undone.</div>
      <div class="setting-buttons"><button class="button danger" data-action="clear-history">clear history</button></div>
    </div>`;
}

// ---- events ----

function onClick(e) {
  const target = e.target.closest("button");
  if (!target) return;
  if (target.dataset.rangePreset || target.dataset.rangeAction) onMidiRangeAction(target);
  else if (target.dataset.key === "paceCaret" && target.dataset.value === '"custom"') askPaceNpm();
  else if (target.dataset.key) settings.set(target.dataset.key, JSON.parse(target.dataset.value));
  else if (target.dataset.theme) settings.set("theme", target.dataset.theme);
  else if (target.dataset.jump) scrollToSection(target.dataset.jump);
  else if (target.dataset.action === "to-top") window.scrollTo({ top: 0, behavior: "smooth" });
  else if (target.dataset.collapse) target.closest(".settings-section").classList.toggle("collapsed");
  else if (target.dataset.action === "custom-theme") useCustomTheme();
  else if (target.dataset.action === "reset" && confirm("Reset all settings to defaults? This cannot be undone.")) settings.reset();
  else if (target.dataset.action === "clear-history" && confirm("Delete all saved results and personal bests? This cannot be undone.")) {
    clearHistory();
    notify("history cleared");
  }
}

/**
 * Settings search: show only rows whose title or description contain every word (a section title
 * match shows the whole section). In the theme section, theme names are searched too.
 */
function filterSettings(query) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = (text) => words.every((w) => text.toLowerCase().includes(w));
  for (const section of root.querySelectorAll(".settings-section")) {
    const titleHit = !words.length || matches(section.querySelector(".section-title").textContent);
    let any = false;
    for (const row of section.querySelectorAll(".setting")) {
      const show = titleHit || matches(row.textContent);
      row.classList.toggle("search-hidden", !show);
      // The custom theme colors belong to the row before them.
      if (row.nextElementSibling?.classList.contains("custom-colors")) row.nextElementSibling.classList.toggle("search-hidden", !show);
      any ||= show;
    }
    const grid = section.querySelector(".theme-grid");
    if (grid) {
      const q = words.join("_");
      let themeHit = false;
      for (const btn of grid.querySelectorAll(".theme-button")) {
        const show = titleHit || btn.dataset.theme.includes(q);
        btn.classList.toggle("search-hidden", !show);
        themeHit ||= show;
      }
      grid.classList.toggle("search-hidden", !themeHit);
      section.querySelector(".theme-search").classList.toggle("search-hidden", !titleHit);
      any ||= themeHit;
    }
    section.classList.toggle("search-hidden", !any);
  }
  root.querySelector(".settings-nav").classList.toggle("search-hidden", words.length > 0);
  root.querySelector(".settings-no-match").hidden = !words.length || !!root.querySelector(".settings-section:not(.search-hidden)");
}

function onInput(e) {
  if (e.target.matches(".settings-search input")) filterSettings(e.target.value);
  else if (e.target.dataset.volume !== undefined) settings.set("volume", Number(e.target.value) / 20);
  else if (e.target.matches(".theme-search input")) {
    const q = e.target.value.trim().toLowerCase().replaceAll(" ", "_");
    for (const btn of root.querySelectorAll(".theme-button")) btn.hidden = !btn.dataset.theme.includes(q);
  } else if (e.target.dataset.color) {
    settings.set("customTheme", { ...settings.get("customTheme"), [e.target.dataset.color]: e.target.value });
  }
}

function onThemeHover(e) {
  const btn = e.target.closest(".theme-button");
  if (btn) applyTheme(btn.dataset.theme, { persist: false });
}

let previewTimer = 0;

function refresh(key, value) {
  if (key === "theme" || key === "customTheme") {
    const theme = settings.get("theme");
    for (const btn of root.querySelectorAll(".theme-button")) btn.classList.toggle("active", btn.dataset.theme === theme);
    const customBtn = root.querySelector('[data-action="custom-theme"]');
    customBtn.classList.toggle("active", theme === "custom");
    customBtn.textContent = theme === "custom" ? "using custom theme" : "use custom theme";
    root.querySelector(".custom-colors").hidden = theme !== "custom";
    const colors = settings.get("customTheme");
    for (const input of root.querySelectorAll("[data-color]")) if (input.value !== colors[input.dataset.color]) input.value = colors[input.dataset.color];
    return;
  }
  for (const btn of root.querySelectorAll(`[data-key="${key}"]`)) btn.classList.toggle("active", JSON.parse(btn.dataset.value) === value);
  if (key === "soundOutput") root.querySelector(".sound-output-status").textContent = soundOutputStatus();
  if (key === "volume") syncVolumeSlider();
  // Preview the new tone or volume with a C major chord (once the volume slider stops moving).
  if (key === "instrument" || key === "soundOutput") audio.play([60, 64, 67], 1);
  if (key === "volume") {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => audio.play([60, 64, 67], 1), 150);
  }
  if (key === "errorSound" && value) audio.error();
}
