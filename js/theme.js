// Theme colors and fonts, applied as CSS custom properties on :root.
import { THEMES } from "./data/themes.js";

const THEME_VARS_KEY = "monkeynote.themeVars";
const VARS = {
  bg: "--bg-color",
  main: "--main-color",
  caret: "--caret-color",
  sub: "--sub-color",
  subAlt: "--sub-alt-color",
  text: "--text-color",
  error: "--error-color",
  errorExtra: "--error-extra-color",
  colorfulError: "--colorful-error-color",
  colorfulErrorExtra: "--colorful-error-extra-color",
};

const hexToRgb = (hex) => {
  let h = hex.slice(1);
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const mix = (a, b, t) => {
  const [ra, rb] = [hexToRgb(a), hexToRgb(b)];
  return `#${ra.map((v, i) => Math.round(v * t + rb[i] * (1 - t)).toString(16).padStart(2, "0")).join("")}`;
};
const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Piano key colors derived from the theme: white keys lighter and black keys darker than the background. */
function pianoColors(t) {
  if (luminance(t.bg) < 0.5) {
    return { "--key-white": mix(t.text, t.bg, 0.3), "--key-white-label": t.bg, "--key-black": mix("#000000", t.bg, 0.35), "--key-black-label": t.sub };
  }
  return { "--key-white": mix("#ffffff", t.bg, 0.6), "--key-white-label": t.sub, "--key-black": mix(t.text, t.bg, 0.8), "--key-black-label": t.bg };
}

export const themeNames = () => Object.keys(THEMES);
export const themeColors = (name) => THEMES[name];
export const themeLabel = (name) => name.replaceAll("_", " ");

/** Apply a theme. persist=false is used for hover previews. */
export function applyTheme(name, { persist = true } = {}) {
  const theme = THEMES[name];
  if (!theme) return;
  const root = document.documentElement.style;
  const vars = {};
  for (const [key, cssVar] of Object.entries(VARS)) vars[cssVar] = theme[key];
  Object.assign(vars, pianoColors(theme));
  for (const [cssVar, value] of Object.entries(vars)) root.setProperty(cssVar, value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.bg);
  if (persist) {
    try {
      localStorage.setItem(THEME_VARS_KEY, JSON.stringify(vars));
    } catch {
      // storage unavailable: the theme still applies for this page view
    }
  }
}

const loadedFonts = new Set(["Roboto Mono"]);

export function applyFont(family) {
  if (!loadedFonts.has(family)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${family.replaceAll(" ", "+")}:wght@400;500;700&display=swap`;
    document.head.appendChild(link);
    loadedFonts.add(family);
  }
  document.documentElement.style.setProperty("--font", `"${family}", "Roboto Mono", monospace`);
}
