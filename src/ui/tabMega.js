// Aba "Mega Evolução": as Megas da linha evolutiva. Marcar aqui NÃO conta no
// total de capturados. Mostra o artwork da Mega + a pedra (quando tem).

import { el } from "./dom.js";
import { megasFor } from "../data.js";
import { isMegaCaught, toggleMegaCaught, subscribe } from "../state.js";
import { typeSymbol } from "./types.js";
import { spriteImg } from "./sprite.js";

const CHECK = '<svg viewBox="0 0 24 24"><path d="M9.6 16.2 4.8 11.4l1.4-1.4 3.4 3.4 8-8L21 6.8z"/></svg>';

export function renderMega(pokemon, { onSeeStats } = {}) {
  const megas = megasFor(pokemon);
  const wrap = el("div", { class: "mega-tab evo-tab" });

  if (!megas.length) {
    wrap.append(el("p", { class: "evo--none" }, "Nenhum Pokémon dessa linha tem Mega Evolução."));
    return wrap;
  }

  const head = el("div", { class: "mega__head" },
    el("p", { class: "mega__note" },
      "As Megas são marcadas à parte — não entram no total de capturados."),
  );
  if (onSeeStats && megas.some((m) => m.stats)) {
    head.append(el("button", {
      class: "mega__statsbtn", type: "button",
      onclick: () => onSeeStats((megas.find((m) => m.stats) || megas[0]).key),
    }, "Ver status ", el("span", { "aria-hidden": "true" }, "→")));
  }
  wrap.append(head);

  const grid = el("div", { class: "mega__grid" });
  for (const m of megas) {
    const card = el("button", {
      class: "mega__card" + (isMegaCaught(m.key) ? " is-caught" : ""),
      type: "button",
      "aria-pressed": String(isMegaCaught(m.key)),
      dataset: { megaKey: m.key },
      onclick: () => toggleMegaCaught(m.key),
    },
      el("span", { class: "mega__got", html: CHECK }),
      el("span", { class: "mega__art" },
        spriteImg(m.sprite, { alt: m.name, loading: "lazy", decoding: "async" }),
      ),
      el("b", { class: "mega__name" }, m.name),
      el("span", { class: "mega__types" }, ...m.types.map(typeSymbol)),
      m.stoneSprite
        ? el("span", { class: "mega__stone" },
            el("img", { src: m.stoneSprite, alt: "", width: 24, height: 24 }),
            m.stone,
          )
        : el("span", { class: "mega__stone mega__stone--none" }, "Legends: Z-A"),
    );
    grid.append(card);
  }
  wrap.append(grid);

  const unsub = subscribe((kind) => {
    if (kind !== "mega" || !wrap.isConnected) return;
    for (const c of grid.querySelectorAll(".mega__card")) {
      const on = isMegaCaught(c.dataset.megaKey);
      c.classList.toggle("is-caught", on);
      c.setAttribute("aria-pressed", String(on));
    }
  });
  wrap.addEventListener("checkdex:dispose", unsub, { once: true });
  return wrap;
}
