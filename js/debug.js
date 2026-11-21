// Debug mode: cheat keys on the test page for trying the app without finding the right notes.
// Turn it on from the command palette ("toggle debug mode") or by opening the page with ?debug
// (?debug=0 turns it off). The choice is remembered in this browser.

const STORAGE_KEY = "monkeynote.debug";
const listeners = new Set();

function initial() {
  const param = new URLSearchParams(location.search).get("debug");
  if (param !== null) {
    const enabled = param !== "0" && param !== "false";
    store(enabled);
    return enabled;
  }
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function store(enabled) {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable: lasts for this page view
  }
}

let enabled = initial();

export const debug = {
  get on() {
    return enabled;
  },
  set(value) {
    if (value === enabled) return;
    enabled = value;
    store(value);
    listeners.forEach((fn) => fn(value));
  },
  toggle() {
    this.set(!enabled);
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
