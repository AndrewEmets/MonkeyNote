import { settings } from "./settings.js";
import { applyFont, applyTheme, themeLabel } from "./theme.js";
import { icon } from "./icons.js";
import { initMidi } from "./midi.js";
import { input } from "./input.js";
import { audio } from "./audio.js";
import * as testPage from "./pages/test.js";
import * as settingsPage from "./pages/settings.js";

export const VERSION = "0.5.0";

const pages = { test: testPage, settings: settingsPage };
let currentPage = null;

function renderHeader() {
  document.getElementById("top").innerHTML = `
    <a class="logo" href="#" aria-label="monkeynote">${icon("logo")}<span class="name">monkeynote</span></a>
    <nav class="nav">
      <a href="#" title="start test" aria-label="start test">${icon("piano")}</a>
      <a href="#settings" title="settings" aria-label="settings">${icon("gear")}</a>
    </nav>`;
}

function renderFooter() {
  document.getElementById("bottom").innerHTML = `
    <div class="keytips"><kbd>tab</kbd> - restart test</div>
    <div class="footer-row">
      <div class="footer-links">
        <a href="https://github.com/AndrewEmets/MonkeyNote" target="_blank" rel="noopener">${icon("code")}<span>github</span></a>
      </div>
      <div class="footer-links">
        <a href="#settings/theme" class="theme-indicator">${icon("palette")}<span>${themeLabel(settings.get("theme"))}</span></a>
        <span class="version">v${VERSION}</span>
      </div>
    </div>`;
}

function route() {
  const [name, section] = location.hash.replace(/^#/, "").split("/");
  const pageName = name === "settings" ? "settings" : "test";
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
audio.setVolume(settings.get("volume"));
audio.setInstrument(settings.get("instrument"));
settings.subscribe((key, value) => {
  if (key === "theme") {
    applyTheme(value);
    renderFooter();
  }
  if (key === "fontFamily") applyFont(value);
  if (key === "volume") audio.setVolume(value);
  if (key === "instrument") audio.setInstrument(value);
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
