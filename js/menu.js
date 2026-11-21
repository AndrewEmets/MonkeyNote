// Dropdown menu anchored under an element (e.g. the clef / key words above the staff).
// items: [{ label, active, run }]. Closes on pick, outside click, Esc or scroll.
import { icon } from "./icons.js";

let open = null; // { el, close }

export const isMenuOpen = () => !!open;

export function openMenu(anchor, items) {
  const wasForThis = open?.anchor === anchor;
  closeMenu();
  if (wasForThis) return; // clicking the same word again just closes it

  const el = document.createElement("div");
  el.className = "dropdown";
  el.setAttribute("role", "menu");
  el.innerHTML = items
    .map((item, i) => `<button class="dropdown-item${item.active ? " active" : ""}" role="menuitem" data-i="${i}">${item.active ? icon("check") : `<span class="icon"></span>`}<span>${item.label}</span></button>`)
    .join("");
  document.body.appendChild(el);

  const box = anchor.getBoundingClientRect();
  const left = Math.min(window.scrollX + box.left, window.scrollX + document.documentElement.clientWidth - el.offsetWidth - 8);
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${window.scrollY + box.bottom + 6}px`;
  el.querySelector(".active")?.scrollIntoView({ block: "nearest" });

  const onKey = (e) => {
    if (e.key !== "Escape") return;
    e.stopImmediatePropagation(); // don't also open the command palette
    e.preventDefault();
    closeMenu();
  };
  const onDown = (e) => !el.contains(e.target) && e.target !== anchor && !anchor.contains(e.target) && closeMenu();
  el.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-i]");
    if (!btn) return;
    closeMenu();
    items[Number(btn.dataset.i)].run();
  });
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onDown, true);
  window.addEventListener("scroll", closeMenu, { once: true });
  window.addEventListener("resize", closeMenu, { once: true });

  open = {
    anchor,
    close() {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", closeMenu);
      window.removeEventListener("resize", closeMenu);
      el.remove();
    },
  };
}

export function closeMenu() {
  open?.close();
  open = null;
}
