import { settings } from "./settings.js";
import { applyFont, applyTheme, themeLabel } from "./theme.js";
import { icon } from "./icons.js";
import { initMidi, keyLights, midiOut, onMidiChange } from "./midi.js";
import { input } from "./input.js";
import { audio } from "./audio.js";
import { isPaletteOpen, openPalette } from "./palette.js";
import { initTooltips, tipAttr } from "./tooltip.js";
import { initProfiles } from "./profiles.js";
import { applySharedLink } from "./share.js";
import { notify } from "./notify.js";
import * as testPage from "./pages/test.js";
import * as settingsPage from "./pages/settings.js";
import * as statsPage from "./pages/stats.js";

export const VERSION = "0.19.0";

const pages = { test: testPage, settings: settingsPage, stats: statsPage };
let currentPage = null;

function renderHeader() {
  document.getElementById("top").innerHTML = `
    <a class="logo" href="#" aria-label="monkeyscore">${icon("logo")}<span class="name"><span class="name-full">monkeyscore</span><span class="name-short">ms</span></span></a>
    <nav class="nav">
      <a href="#" aria-label="start test">${icon("piano")}</a>
      <a href="#stats" aria-label="stats">${icon("chart")}</a>
      <a href="#settings" aria-label="settings">${icon("gear")}</a>
      <button class="nav-user" aria-label="user settings"${tipAttr("user settings (coming soon)")}>${icon("user")}</button>
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
        <button class="theme-indicator">${icon("palette")}<span>${themeLabel(settings.get("theme"))}</span></button>
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

// Per-presentation settings, then settings from a shared link (before anything reads them).
initProfiles();
const shared = applySharedLink();
if (shared) notify(shared.ok ? `settings applied from link (${shared.applied})` : "couldn't read the settings in this link", { type: shared.ok ? "info" : "error" });

applyTheme(settings.get("theme"));
applyFont(settings.get("fontFamily"));
document.documentElement.classList.toggle("flip-colors", settings.get("flipColors"));
audio.setVolume(settings.get("volume"));
midiOut.setVolume(settings.get("volume"));
keyLights.setChannel(settings.get("keyLightChannel"));
// Give the guide channel its volume back when the page closes.
window.addEventListener("pagehide", () => {
  keyLights.clear();
  keyLights.unmute();
});
audio.setInstrument(settings.get("instrument"));
settings.subscribe((key, value) => {
  if (key === "theme" || (key === "customTheme" && settings.get("theme") === "custom")) {
    applyTheme(settings.get("theme"));
    renderFooter();
  }
  if (key === "flipColors") document.documentElement.classList.toggle("flip-colors", value);
  if (key === "fontFamily") applyFont(value);
  if (key === "volume") {
    audio.setVolume(value);
    midiOut.setVolume(value);
  }
  if (key === "instrument") audio.setInstrument(value);
  if (key === "soundOutput") updateSoundOutput();
  if (key === "keyLightChannel") keyLights.setChannel(value);
  if (key === "keyLights" && value === "off") {
    keyLights.clear();
    keyLights.unmute();
  }
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
// When sound goes to the MIDI keyboard, notes played on it already sound there, so they aren't echoed.
input.subscribe((ev) => {
  if (ev.type === "control") return;
  const mode = settings.get("playOnPress");
  const wanted = mode === "all" || (mode === "nomidi" && ev.source !== "midi");
  if (!wanted || (ev.source === "midi" && audio.isRouted())) return;
  if (ev.type === "off") audio.noteOff(ev.midi);
  else audio.noteOn(ev.midi);
});

// Sound output: the MIDI keyboard when chosen and connected, otherwise the built-in synth.
const updateSoundOutput = () => audio.setRouter(settings.get("soundOutput") === "midi" && midiOut.available() ? midiOut : null);
onMidiChange(updateSoundOutput);

initTooltips();
renderHeader();
renderFooter();
window.addEventListener("hashchange", route);
route();
initMidi();
registerServiceWorker();

/** Installable app + offline use (sw.js); hands the worker the files this page already loaded. */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const register = () =>
    navigator.serviceWorker
      .register("sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        const loaded = performance.getEntriesByType("resource").map((e) => e.name);
        reg.active?.postMessage({ cache: [location.href.split(/[?#]/)[0], ...loaded].filter((u) => !u.startsWith("data:")) });
      })
      .catch(() => {}); // (no offline copy; the app works the same)
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
