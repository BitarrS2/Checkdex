// Filtros: botão (ícone de funil) + painel com traços de coleção
// (tem Mega, semi-lendário, lendário, mítico, Ultra Beast, Paradoxo, inicial).
// Multi-seleção, sem limite. Semântica OU: a linha entra se tem QUALQUER
// um dos traços marcados — então um lendário com Mega aparece nos dois.

import { el, clear } from "./dom.js";
import { TRAIT_ORDER, TRAIT_LABEL } from "../data.js";

const FUNNEL = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 2.5A.5.5 0 0 1 1.5 2h13a.5.5 0 0 1 .4.8L10 9.2V14a.5.5 0 0 1-.74.44l-3-1.7A.5.5 0 0 1 6 12.3V9.2L1.1 3.3A.5.5 0 0 1 1 2.5z"/></svg>';

export function createTraitPicker({ onChange }) {
  let selected = [];
  let open = false;

  const iconEl = el("span", { class: "traitpick__icon", "aria-hidden": "true", html: FUNNEL });
  const labelEl = el("span", { class: "typepick__label" }, "Filtros");
  const chipsEl = el("span", { class: "typepick__chips traitpick__chips" });
  const clearBtn = el("button", {
    class: "locpick__x", type: "button", "aria-label": "Limpar filtros",
    onclick: (e) => { e.stopPropagation(); set([]); },
  }, "×");
  const btn = el("button", {
    class: "locpick__btn typepick__btn traitpick__btn", type: "button",
    "aria-haspopup": "dialog", "aria-expanded": "false", "aria-label": "Filtros",
    onclick: () => toggle(),
  }, iconEl, labelEl, chipsEl, clearBtn, el("span", { class: "locpick__caret", "aria-hidden": "true" }, "▾"));

  const grid = el("div", { class: "traitpick__grid" });
  const panel = el("div", {
    class: "locpick__panel typepick__panel traitpick__panel",
    role: "dialog", "aria-label": "Filtros", hidden: true,
  },
    el("div", { class: "typepick__head" }, "Filtros ", el("small", {}, "marque as que quiser")),
    grid,
    el("button", { class: "typepick__reset", type: "button", onclick: () => set([]) }, "Limpar seleção"),
  );
  const root = el("div", { class: "locpick typepick traitpick" }, btn, panel);

  for (const t of TRAIT_ORDER) {
    const b = el("button", {
      class: "traitpick__opt", type: "button", "aria-pressed": "false",
      dataset: { t }, onclick: () => toggleTrait(t),
    }, TRAIT_LABEL[t]);
    grid.append(b);
  }

  function toggle(force) {
    open = force ?? !open;
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    root.classList.toggle("is-open", open);
  }

  function toggleTrait(t) {
    set(selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t]);
  }

  function set(arr) {
    selected = TRAIT_ORDER.filter((t) => arr.includes(t)); // mantém a ordem canônica
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
    if (selected.length <= 2) {
      for (const t of selected) {
        chipsEl.append(el("span", { class: "traitpick__chip" }, TRAIT_LABEL[t]));
      }
    } else {
      chipsEl.append(el("span", { class: "traitpick__chip" }, selected.length + " categorias"));
    }
  }

  document.addEventListener("click", (e) => { if (open && !root.contains(e.target)) toggle(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) toggle(false); });

  return {
    el: root,
    setSelected(arr) { selected = TRAIT_ORDER.filter((t) => (arr || []).includes(t)); render(); },
    get value() { return [...selected]; },
  };
}
