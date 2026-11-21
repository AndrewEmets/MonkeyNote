// Small toast notifications in the top-right corner.
let container = null;

export function notify(text, { type = "info", duration = 3000 } = {}) {
  if (!container) {
    container = document.createElement("div");
    container.className = "notifications";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }
  const note = document.createElement("div");
  note.className = `notification ${type}`;
  note.textContent = text;
  container.appendChild(note);
  setTimeout(() => {
    note.classList.add("leaving");
    setTimeout(() => note.remove(), 250);
  }, duration);
}
