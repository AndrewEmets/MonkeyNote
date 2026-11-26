// Dropdown menu anchored under an element (e.g. the clef / key words above the staff).
// items: [{ label, active, run, tip, sub }] ({ divider: true } draws a line), or a function returning
// them (rebuilt after each pick, so the checkmarks follow). An item with `sub` opens a side panel on hover
// or click; sub is a list of columns: [{ title, items: [{ label, active, run }] }].
// Instead of items, { columns } shows such columns in the dropdown itself.
// A pick keeps the menu open (to change several things); it closes on outside click, Esc, scroll or resize.
import { icon } from "./icons.js";
import { hideTooltip, tipAttr } from "./tooltip.js";

let open = null; // { anchor, close }

export const isMenuOpen = () => !!open;

const itemHtml = (item, attrs) =>
  item.divider
    ? `<div class="dropdown-divider" role="separator"></div>`
    : `<button class="dropdown-item${item.active ? " active" : ""}${item.sub ? " has-sub" : ""}" role="menuitem" ${attrs}${tipAttr(item.tip, "right")}>${
    item.active ? icon("check") : `<span class="icon"></span>`
  }<span>${item.label}</span>${item.sub ? `<span class="sub-arrow">${icon("chevronRight")}</span>` : ""}</button>`;

const columnsHtml = (columns) =>
  columns
    .map(
      (col, c) =>
        `<div class="dropdown-col">${col.title ? `<div class="dropdown-col-title">${col.title}</div>` : ""}${col.items
          .map((item, j) => itemHtml(item, `data-c="${c}" data-j="${j}"`))
          .join("")}</div>`,
    )
    .join("");

export function openMenu(anchor, source) {
  const wasForThis = open?.anchor === anchor;
  closeMenu();
  if (wasForThis) return; // clicking the same word again just closes it
  hideTooltip();

  const build = typeof source === "function" ? source : () => source;
  let items = build();
  const el = document.createElement("div");
  el.className = "dropdown";
  el.setAttribute("role", "menu");
  const renderItems = () => {
    el.classList.toggle("dropdown-panel", !!items.columns);
    el.innerHTML = items.columns ? columnsHtml(items.columns) : items.map((item, i) => itemHtml(item, `data-i="${i}"`)).join("");
  };
  renderItems();
  document.body.appendChild(el);

  const box = anchor.getBoundingClientRect();
  const left = Math.min(window.scrollX + box.left, window.scrollX + document.documentElement.clientWidth - el.offsetWidth - 8);
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${window.scrollY + box.bottom + 6}px`;
  el.querySelector(".active")?.scrollIntoView({ block: "nearest" });

  // Side panel for an item with sub-columns.
  let panel = null;
  let panelFor = -1;
  const closePanel = () => {
    panel?.remove();
    panel = null;
    panelFor = -1;
    el.querySelectorAll(".dropdown-item.open").forEach((b) => b.classList.remove("open"));
  };
  const openPanel = (i, button) => {
    if (panelFor === i) return;
    closePanel();
    panelFor = i;
    button.classList.add("open");
    panel = document.createElement("div");
    panel.className = "dropdown dropdown-panel";
    renderPanel();
    document.body.appendChild(panel);
    const b = button.getBoundingClientRect();
    const menu = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const right = menu.right + 4;
    const x = right + panel.offsetWidth < vw - 8 ? right : Math.max(8, menu.left - 4 - panel.offsetWidth);
    const y = Math.max(8, Math.min(b.top - 6, window.innerHeight - panel.offsetHeight - 8));
    panel.style.left = `${window.scrollX + x}px`;
    panel.style.top = `${window.scrollY + y}px`;
    panel.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-c]");
      if (!btn) return;
      pick(items[panelFor].sub[Number(btn.dataset.c)].items[Number(btn.dataset.j)]);
    });
  };
  const renderPanel = () => (panel.innerHTML = columnsHtml(items[panelFor].sub));
  // Run a pick, then redraw both lists in place so the checkmarks show the new state.
  const pick = (item) => {
    item.run();
    if (open?.el !== el) return; // the pick closed the menu (or opened another)
    items = build();
    renderItems();
    if (panel && items[panelFor]?.sub) {
      el.querySelector(`[data-i="${panelFor}"]`)?.classList.add("open");
      renderPanel();
    } else closePanel();
  };

  el.addEventListener("mouseover", (e) => {
    const btn = e.target.closest("[data-i]");
    if (!btn) return;
    const i = Number(btn.dataset.i);
    if (items[i].sub) openPanel(i, btn);
    else closePanel();
  });
  el.addEventListener("click", (e) => {
    const cell = e.target.closest("[data-c]");
    if (cell && items.columns) return pick(items.columns[Number(cell.dataset.c)].items[Number(cell.dataset.j)]);
    const btn = e.target.closest("[data-i]");
    if (!btn) return;
    const i = Number(btn.dataset.i);
    if (items[i].sub) return openPanel(i, btn);
    pick(items[i]);
  });

  const onKey = (e) => {
    if (e.key !== "Escape") return;
    e.stopImmediatePropagation(); // don't also open the command palette
    e.preventDefault();
    if (panel) closePanel();
    else closeMenu();
  };
  const onDown = (e) => {
    if (el.contains(e.target) || panel?.contains(e.target) || anchor.contains(e.target)) return;
    closeMenu();
  };
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onDown, true);
  window.addEventListener("scroll", closeMenu, { once: true });
  window.addEventListener("resize", closeMenu, { once: true });

  open = {
    anchor,
    el,
    close() {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", closeMenu);
      window.removeEventListener("resize", closeMenu);
      panel?.remove();
      el.remove();
    },
  };
}

export function closeMenu() {
  open?.close();
  open = null;
}
