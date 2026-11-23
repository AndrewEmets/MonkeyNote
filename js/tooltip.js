// Themed tooltips for any element with a data-tip attribute (instead of the browser's title tooltip).
// One delegated listener for the whole page; the tip sits below the element (above if there's no room).

let tip = null;
let anchor = null;

function show(el) {
  const text = el.dataset.tip;
  if (!text) return;
  // While a menu or the command line is open, only its own items show tips (nothing on top of it).
  if (document.querySelector(".dropdown, .palette-backdrop") && !el.closest(".dropdown")) return hide();
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "tooltip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
  }
  anchor = el;
  tip.textContent = text;
  tip.hidden = false;
  const box = el.getBoundingClientRect();
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  const vw = document.documentElement.clientWidth;
  // Menu items: beside the item (below would cover the next items). Otherwise below, or above if no room.
  if (el.dataset.tipSide === "right" && box.right + 10 + width < vw) {
    tip.style.left = `${window.scrollX + box.right + 10}px`;
    tip.style.top = `${window.scrollY + box.top + box.height / 2 - height / 2}px`;
    return;
  }
  const left = Math.max(8, Math.min(box.left + box.width / 2 - width / 2, vw - width - 8));
  const below = box.bottom + 8 + height < window.innerHeight;
  tip.style.left = `${window.scrollX + left}px`;
  tip.style.top = `${window.scrollY + (below ? box.bottom + 8 : box.top - height - 8)}px`;
}

function hide() {
  anchor = null;
  if (tip) tip.hidden = true;
}

export const hideTooltip = hide;

export function initTooltips() {
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest?.("[data-tip]");
    if (el && el !== anchor) show(el);
    else if (!el && anchor) hide();
  });
  document.addEventListener("focusin", (e) => {
    const el = e.target.closest?.("[data-tip]");
    if (el) show(el);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide, true);
  window.addEventListener("scroll", hide, true);
}

/** data-tip attribute (escaped) for an element's markup; side "right" places it beside the element. */
export const tipAttr = (text, side = "") =>
  text ? ` data-tip="${String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}"${side ? ` data-tip-side="${side}"` : ""}` : "";
