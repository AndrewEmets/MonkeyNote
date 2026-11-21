// Piano keyboard component, used as the on-screen input and as the results miss map.
const BLACK = new Set([1, 3, 6, 8, 10]);
export const isBlack = (midi) => BLACK.has(((midi % 12) + 12) % 12);

/** Expand [low, high] outward so both ends are white keys. */
export function whiteRange(low, high) {
  while (isBlack(low)) low--;
  while (isBlack(high)) high++;
  return [low, high];
}

/**
 * opts: { low, high, interactive, onDown(midi), onUp(midi) }
 * Returns { el, keys: Map(midi -> element), setPressed, flash, setLabels, destroy }
 */
export function createPiano(container, opts) {
  const [low, high] = whiteRange(opts.low, opts.high);
  const el = document.createElement("div");
  el.className = `piano${opts.interactive ? " interactive" : ""}`;
  const keys = new Map();
  const whites = [];
  for (let m = low; m <= high; m++) if (!isBlack(m)) whites.push(m);
  el.style.setProperty("--whites", whites.length);

  whites.forEach((m) => {
    const key = document.createElement("div");
    key.className = "key white";
    key.dataset.midi = m;
    key.innerHTML = `<span class="key-label"></span>${m % 12 === 0 ? `<span class="key-name">C${m / 12 - 1}</span>` : ""}`;
    el.appendChild(key);
    keys.set(m, key);
  });
  for (let m = low + 1; m < high; m++) {
    if (!isBlack(m)) continue;
    const key = document.createElement("div");
    key.className = "key black";
    key.dataset.midi = m;
    key.style.left = `${(whites.indexOf(m - 1) + 1) * (100 / whites.length)}%`;
    key.innerHTML = `<span class="key-label"></span>`;
    el.appendChild(key);
    keys.set(m, key);
  }

  const pointers = new Map(); // pointerId -> midi
  const release = (e) => {
    const midi = pointers.get(e.pointerId);
    if (midi === undefined) return;
    pointers.delete(e.pointerId);
    opts.onUp?.(midi);
  };
  if (opts.interactive) {
    el.addEventListener("pointerdown", (e) => {
      const key = e.target.closest(".key");
      if (!key) return;
      e.preventDefault();
      const midi = Number(key.dataset.midi);
      pointers.set(e.pointerId, midi);
      opts.onDown?.(midi);
    });
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("pointerleave", release);
  }

  container.replaceChildren(el);

  return {
    el,
    keys,
    setPressed(midi, on) {
      keys.get(midi)?.classList.toggle("pressed", on);
    },
    flash(midi, kind) {
      const key = keys.get(midi);
      if (!key) return;
      key.classList.remove("flash-correct", "flash-error");
      void key.offsetWidth; // restart the animation
      key.classList.add(`flash-${kind}`);
    },
    setLabels(labels) {
      for (const [midi, key] of keys) key.querySelector(".key-label").textContent = labels?.get(midi) ?? "";
    },
    destroy() {
      for (const midi of pointers.values()) opts.onUp?.(midi);
      pointers.clear();
      el.remove();
    },
  };
}
