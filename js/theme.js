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

export const themeNames = () => Object.keys(THEMES);
export const themeColors = (name) => THEMES[name];
export const themeLabel = (name) => name.replaceAll("_", " ");

/** Apply a theme. persist=false is used for hover previews. */
export function applyTheme(name, { persist = true } = {}) {
  const theme = THEMES[name];
  if (!theme) return;
  const root = document.documentElement.style;
  const vars = {};
  for (const [key, cssVar] of Object.entries(VARS)) {
    root.setProperty(cssVar, theme[key]);
    vars[cssVar] = theme[key];
  }
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
