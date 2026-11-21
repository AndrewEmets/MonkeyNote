// Settings page: sections of settings rows with button groups, theme picker, danger zone.
import { OPTIONS, settings } from "../settings.js";
import { KEYS } from "../music.js";
import { applyTheme, themeColors, themeLabel, themeNames } from "../theme.js";
import { icon } from "../icons.js";

const onOff = { false: "off", true: "on" };
const keyLabels = Object.fromEntries([["random", "random"], ...KEYS.map((k) => [k.fifths, k.name])]);

const SECTIONS = [
  {
    id: "notation",
    title: "notation",
    icon: "note",
    rows: [
      { key: "clef", title: "clef", icon: "clef", text: "Staff to read from. Grand staff shows treble and bass together, like piano music.", labels: { grand: "grand staff" } },
      { key: "keySignature", title: "key signature", icon: "key", text: "Key of the generated notes. Random picks a new key every test.", labels: keyLabels, wide: true },
      { key: "accidentals", title: "accidentals", icon: "sharp", text: "Diatonic keeps every note in the key. Chromatic adds sharps, flats and naturals outside it." },
      { key: "ledgerLines", title: "ledger lines", icon: "lines", text: "How many ledger lines notes may use above and below the staff." },
      { key: "maxChordNotes", title: "max chord notes", icon: "chords", text: "Largest chord when chords are turned on in the test bar." },
    ],
  },
  {
    id: "appearance",
    title: "appearance",
    icon: "eye",
    rows: [
      { key: "noteSize", title: "note size", icon: "size", text: "Size of the staff and notes." },
      { key: "caretStyle", title: "caret style", icon: "caret", text: "Shape of the marker on the note to play next.", labels: { line: "|", block: "▮", outline: "▯", underline: "_" } },
      { key: "smoothCaret", title: "smooth caret", icon: "wave", text: "Animate the caret as it moves between notes.", labels: onOff },
      { key: "fontFamily", title: "font family", icon: "font", text: "Font used across the interface.", wide: true },
    ],
  },
  { id: "theme", title: "theme", icon: "palette", custom: themeSection },
  { id: "danger", title: "danger zone", icon: "warning", custom: dangerSection },
];

let root, unsubscribe;

export function mount(container) {
  root = document.createElement("div");
  root.className = "settings-page";
  root.innerHTML = `
    <div class="settings-nav">${SECTIONS.map((s) => `<button class="button" data-jump="${s.id}">${s.title}</button>`).join("")}</div>
    ${SECTIONS.map(sectionHtml).join("")}`;
  container.appendChild(root);
  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  const grid = root.querySelector(".theme-grid");
  grid.addEventListener("mouseover", onThemeHover);
  grid.addEventListener("mouseleave", () => applyTheme(settings.get("theme"), { persist: false }));
  unsubscribe = settings.subscribe(refresh);
}

export function unmount() {
  unsubscribe();
  applyTheme(settings.get("theme"), { persist: false });
  root.remove();
}

export function scrollToSection(id) {
  root.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function sectionHtml(section) {
  const body = section.custom ? section.custom() : section.rows.map(rowHtml).join("");
  return `
    <section class="settings-section" data-section="${section.id}">
      <button class="section-title" data-collapse="${section.id}">${icon(section.icon)}<span>${section.title}</span>${icon("chevron")}</button>
      <div class="section-body">${body}</div>
    </section>`;
}

function rowHtml(row) {
  const current = settings.get(row.key);
  const buttons = OPTIONS[row.key]
    .map((v) => {
      const label = row.labels?.[v] ?? String(v);
      return `<button class="button${v === current ? " active" : ""}" data-key="${row.key}" data-value='${JSON.stringify(v)}'>${label}</button>`;
    })
    .join("");
  return `
    <div class="setting${row.wide ? " wide" : ""}">
      <div class="setting-title">${icon(row.icon)}<span>${row.title}</span></div>
      <div class="setting-text">${row.text}</div>
      <div class="setting-buttons">${buttons}</div>
    </div>`;
}

function themeSection() {
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

function dangerSection() {
  return `
    <div class="setting">
      <div class="setting-title">${icon("restart")}<span>reset settings</span></div>
      <div class="setting-text">Reset all settings to their defaults. Cannot be undone.</div>
      <div class="setting-buttons"><button class="button danger" data-action="reset">reset settings</button></div>
    </div>`;
}

function onClick(e) {
  const target = e.target.closest("button");
  if (!target) return;
  if (target.dataset.key) settings.set(target.dataset.key, JSON.parse(target.dataset.value));
  else if (target.dataset.theme) settings.set("theme", target.dataset.theme);
  else if (target.dataset.jump) scrollToSection(target.dataset.jump);
  else if (target.dataset.collapse) target.closest(".settings-section").classList.toggle("collapsed");
  else if (target.dataset.action === "reset" && confirm("Reset all settings to defaults? This cannot be undone.")) settings.reset();
}

function onInput(e) {
  if (!e.target.matches(".theme-search input")) return;
  const q = e.target.value.trim().toLowerCase().replaceAll(" ", "_");
  for (const btn of root.querySelectorAll(".theme-button")) btn.hidden = !btn.dataset.theme.includes(q);
}

function onThemeHover(e) {
  const btn = e.target.closest(".theme-button");
  if (btn) applyTheme(btn.dataset.theme, { persist: false });
}

function refresh(key, value) {
  if (key === "theme") {
    for (const btn of root.querySelectorAll(".theme-button")) btn.classList.toggle("active", btn.dataset.theme === value);
    return;
  }
  for (const btn of root.querySelectorAll(`[data-key="${key}"]`)) btn.classList.toggle("active", JSON.parse(btn.dataset.value) === value);
}
