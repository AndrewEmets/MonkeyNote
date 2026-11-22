import { settings } from "./settings.js";
import { applyFont, applyTheme, themeLabel } from "./theme.js";
import { icon } from "./icons.js";
import { initMidi } from "./midi.js";
import { input } from "./input.js";
import { audio } from "./audio.js";
import { isPaletteOpen, openPalette } from "./palette.js";
import * as testPage from "./pages/test.js";
import * as settingsPage from "./pages/settings.js";
import * as statsPage from "./pages/stats.js";

export const VERSION = "0.8.0";

const pages = { test: testPage, settings: settingsPage, stats: statsPage };
let currentPage = null;

function renderHeader() {
  document.getElementById("top").innerHTML = `
    <a class="logo" href="#" aria-label="monkeyscore">${icon("logo")}<span class="name">monkeyscore</span></a>
    <nav class="nav">
      <a href="#" title="start test" aria-label="start test">${icon("piano")}</a>
      <a href="#stats" title="stats" aria-label="stats">${icon("chart")}</a>
      <a href="#settings" title="settings" aria-label="settings">${icon("gear")}</a>
    </nav>`;
}

function renderFooter() {
  document.getElementById("bottom").innerHTML = `
    <div class="keytips"><kbd>tab</kbd> - restart test<br /><kbd>esc</kbd> or <kbd>ctrl</kbd> + <kbd>shift</kbd> + <kbd>p</kbd> - command line</div>
    <div class="footer-row">
      <div class="footer-links">
        <a href="https://github.com/AndrewEmets/MonkeyScore" target="_blank" rel="noopener">${icon("code")}<span>github</span></a>
      </div>
      <div class="footer-links">
        <button class="theme-indicator" title="change theme">${icon("palette")}<span>${themeLabel(settings.get("theme"))}</span></button>
        <span class="version">v${VERSION}</span>
      </div>
    </div>`;
}

function route() {
  const [name, section] = location.hash.replace(/^#/, "").split("/");
  const pageName = Object.hasOwn(pages, name) ? name : "test";
  const page = pages[pageName];
  if (page !== currentPage) {
    currentPage?.unmount();
    currentPage = page;
    const container = document.getElementById("page");
    container.replaceChildren();
    container.dataset.page = pageName;
    page.mount(container);
    window.scrollTo(0, 0);
  }
  if (section) currentPage.scrollToSection?.(section);
}

applyTheme(settings.get("theme"));
applyFont(settings.get("fontFamily"));
document.documentElement.classList.toggle("flip-colors", settings.get("flipColors"));
audio.setVolume(settings.get("volume"));
audio.setInstrument(settings.get("instrument"));
settings.subscribe((key, value) => {
  if (key === "theme" || (key === "customTheme" && settings.get("theme") === "custom")) {
    applyTheme(settings.get("theme"));
    renderFooter();
  }
  if (key === "flipColors") document.documentElement.classList.toggle("flip-colors", value);
  if (key === "fontFamily") applyFont(value);
  if (key === "volume") audio.setVolume(value);
  if (key === "instrument") audio.setInstrument(value);
});

// Command palette: Esc (outside text fields) or Ctrl/Cmd+Shift+P; the footer theme name opens its theme list.
document.addEventListener("keydown", (e) => {
  if (isPaletteOpen()) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  const shortcut = (e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyP";
  if (shortcut || (e.key === "Escape" && !typing)) {
    e.preventDefault();
    openPalette();
  }
});
document.getElementById("bottom").addEventListener("click", (e) => {
  if (e.target.closest(".theme-indicator")) openPalette("theme");
});

// Audio may only start after a user gesture.
for (const type of ["pointerdown", "keydown"]) document.addEventListener(type, () => audio.unlock(), { capture: true });

// Sound for the notes you play (MIDI keyboards often have their own speakers, hence "nomidi").
input.subscribe((ev) => {
  if (ev.type === "off") return audio.noteOff(ev.midi);
  if (ev.type !== "on") return;
  const mode = settings.get("playOnPress");
  if (mode === "all" || (mode === "nomidi" && ev.source !== "midi")) audio.noteOn(ev.midi);
});

renderHeader();
renderFooter();
window.addEventListener("hashchange", route);
route();
initMidi();
