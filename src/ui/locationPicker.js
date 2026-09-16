// Seletor de local: botão + painel flutuante com busca e lista agrupada.
// Usado duas vezes: um pra rotas, outro pros demais locais.

import { el, clear } from "./dom.js";
import { isCaught, subscribe } from "../state.js";

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function createLocationPicker({ onPick, label = "Locais", groupBy = "type" }) {
  let locations = [];
  let current = null;
  let open = false;

  const labelEl = el("span", { class: "locpick__label" }, label);
  const countEl = el("span", { class: "locpick__btncount" });
  const clearBtn = el("button", {
    class: "locpick__x", type: "button", "aria-label": "Limpar",
    onclick: (e) => { e.stopPropagation(); choose(null); },
  }, "×");
  const btn = el("button", {
    class: "locpick__btn", type: "button", "aria-haspopup": "dialog", "aria-expanded": "false",
    onclick: () => toggle(),
  }, labelEl, countEl, clearBtn, el("span", { class: "locpick__caret", "aria-hidden": "true" }, "▾"));

  const search = el("input", {
    class: "locpick__search", type: "search", placeholder: "Buscar…",
    "aria-label": "Buscar", autocomplete: "off",
    oninput: () => renderList(),
    onkeydown: (e) => { if (e.key === "Escape") toggle(false); },
  });
  const listEl = el("div", { class: "locpick__list", role: "listbox" });
  const panel = el("div", { class: "locpick__panel", role: "dialog", "aria-label": label, hidden: true },
    el("div", { class: "locpick__head" }, search),
    listEl,
  );
  const root = el("div", { class: "locpick" }, btn, panel);

  const groupOf = (loc) =>
    groupBy === "region" ? (loc.region ? cap(loc.region) : null)
      : groupBy === "none" ? null
        : loc.typeLabel;

  function toggle(force) {
    open = force ?? !open;
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    root.classList.toggle("is-open", open);
    if (open) {
      search.value = "";
      renderList();
      // só foca (e abre o teclado) em quem tem ponteiro fino de verdade — em
      // touch isso cobria o painel com o teclado assim que ele abria.
      if (matchMedia("(pointer: fine)").matches) requestAnimationFrame(() => search.focus());
      listEl.querySelector(".locpick__row.is-current")?.scrollIntoView({ block: "center" });
    }
  }

  function choose(key) {
    current = key;
    updateButton();
    toggle(false);
    onPick(key);
  }

  const progress = (loc) => ({
    done: [...loc.pokemonIds].filter(isCaught).length,
    total: loc.pokemonIds.size,
  });

  function updateButton() {
    const loc = current && locations.find((l) => l.key === current);
    if (loc) {
      const { done, total } = progress(loc);
      labelEl.textContent = loc.label;
      countEl.textContent = `${done}/${total}`;
      countEl.classList.toggle("is-done", total > 0 && done === total);
      root.classList.add("has-loc");
    } else {
      labelEl.textContent = label;
      countEl.textContent = "";
      root.classList.remove("has-loc");
    }
  }

  function renderList() {
    clear(listEl);
    const q = search.value.trim().toLowerCase();
    const shown = locations.filter(
      (loc) => !q || loc.label.toLowerCase().includes(q) || (loc.typeLabel || "").toLowerCase().includes(q),
    );
    const groups = new Set(shown.map(groupOf).filter(Boolean));
    const showHeaders = groups.size > 1;

    listEl.append(el("button", {
      class: "locpick__row locpick__row--all" + (current == null ? " is-current" : ""),
      type: "button", role: "option", "aria-selected": String(current == null),
      onclick: () => choose(null),
    }, el("span", {}, "Todo o jogo")));

    let group = null;
    for (const loc of shown) {
      const g = groupOf(loc);
      if (showHeaders && g !== group) {
        group = g;
        listEl.append(el("div", { class: "locpick__group" }, g));
      }
      const { done, total } = progress(loc);
      // com cabeçalho de região, o sufixo "· Johto" no nome fica redundante
      const name = showHeaders && groupBy === "region"
        ? loc.label.replace(/\s·\s[^·]+$/, "")
        : loc.label;
      listEl.append(el("button", {
        class: "locpick__row" + (loc.key === current ? " is-current" : ""),
        type: "button", role: "option", "aria-selected": String(loc.key === current),
        onclick: () => choose(loc.key),
      },
        el("span", { class: "locpick__name" }, name),
        el("span", { class: "locpick__count" + (total > 0 && done === total ? " is-done" : "") }, `${done}/${total}`),
      ));
    }
    if (q && !shown.length) listEl.append(el("p", { class: "locpick__empty" }, "Nada com esse nome."));
  }

  document.addEventListener("click", (e) => { if (open && !root.contains(e.target)) toggle(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) toggle(false); });
  subscribe((k) => { if (k !== "caught") return; updateButton(); if (open) renderList(); });

  return {
    el: root,
    setLocations(locs) {
      locations = locs || [];
      root.hidden = locations.length === 0;
      if (!locations.find((l) => l.key === current)) current = null;
      updateButton();
      if (open) renderList();
    },
    setCurrent(key) {
      current = locations.find((l) => l.key === key) ? key : null;
      updateButton();
    },
    close: () => toggle(false),
  };
}
