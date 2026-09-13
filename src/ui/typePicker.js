// Filtro de tipo: botão + painel com todos os 18 tipos numa grade colorida.
// Permite escolher até 2 tipos (o 3º clique substitui o mais antigo).

import { el, clear } from "./dom.js";
import { TYPE_LABEL, paintType } from "./types.js";

const ORDER = [
  "normal", "fire", "water", "electric", "grass", "ice",
  "fighting", "poison", "ground", "flying", "psychic", "bug",
  "rock", "ghost", "dragon", "dark", "steel", "fairy",
];

export function createTypePicker({ onChange }) {
  let selected = [];
  let open = false;

  const labelEl = el("span", { class: "typepick__label" }, "Tipos");
  const chipsEl = el("span", { class: "typepick__chips" });
  const clearBtn = el("button", {
    class: "locpick__x", type: "button", "aria-label": "Limpar tipos",
    onclick: (e) => { e.stopPropagation(); set([]); },
  }, "×");
  const btn = el("button", {
    class: "locpick__btn typepick__btn", type: "button",
    "aria-haspopup": "dialog", "aria-expanded": "false",
    onclick: () => toggle(),
  }, labelEl, chipsEl, clearBtn, el("span", { class: "locpick__caret", "aria-hidden": "true" }, "▾"));

  const grid = el("div", { class: "typepick__grid" });
  const panel = el("div", {
    class: "locpick__panel typepick__panel", role: "dialog", "aria-label": "Filtrar por tipo", hidden: true,
  },
    el("div", { class: "typepick__head" }, "Filtrar por tipo ", el("small", {}, "escolha até 2")),
    grid,
    el("button", { class: "typepick__reset", type: "button", onclick: () => set([]) }, "Limpar seleção"),
  );
  const root = el("div", { class: "locpick typepick" }, btn, panel);

  for (const t of ORDER) {
    const b = el("button", {
      class: "typepick__opt", type: "button", "aria-pressed": "false",
      dataset: { t }, onclick: () => toggleType(t),
    }, TYPE_LABEL[t]);
    paintType(b, t);
    grid.append(b);
  }

  function toggle(force) {
    open = force ?? !open;
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    root.classList.toggle("is-open", open);
  }

  function toggleType(t) {
    if (selected.includes(t)) set(selected.filter((x) => x !== t));
    else if (selected.length < 2) set([...selected, t]);
    else set([selected[1], t]); // já tem 2 → troca o mais antigo
  }

  function set(arr) {
    selected = arr.slice(0, 2);
    render();
    onChange([...selected]);
  }

  function render() {
    for (const b of grid.children) {
      b.setAttribute("aria-pressed", String(selected.includes(b.dataset.t)));
    }
    clear(chipsEl);
    const has = selected.length > 0;
    root.classList.toggle("has-sel", has);
    labelEl.hidden = has;
    for (const t of selected) {
      const c = el("span", { class: "typepick__chip" }, TYPE_LABEL[t]);
      paintType(c, t);
      chipsEl.append(c);
    }
  }

  document.addEventListener("click", (e) => { if (open && !root.contains(e.target)) toggle(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) toggle(false); });

  return {
    el: root,
    setSelected(arr) { selected = (arr || []).slice(0, 2); render(); },
    get value() { return [...selected]; },
  };
}
