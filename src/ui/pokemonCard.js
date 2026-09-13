// Card de Pokémon: linha recolhida (sprite + nome + tipos + pokébola de progresso
// da linha evolutiva) e painel expansível (evolução / onde encontrar).

import { el, clear, pad3 } from "./dom.js";
import { typeBadge } from "./types.js";
import { evolutionLineIds, evoPosition, megaScope, ballKind, versionLabel } from "../data.js";
import {
  isCaught, toggleCaught, isCaughtShiny, toggleCaughtShiny, isShiny, subscribe,
} from "../state.js";
import { renderEvolution } from "./tabEvolution.js";
import { renderMega } from "./tabMega.js";
import { renderEncounters } from "./tabEncounters.js";
import { renderStats } from "./tabStats.js";
import { renderBuilds } from "./tabBuilds.js";
import { hereSummary, pickBest, rodIcon } from "./encounterText.js";
import { createBall } from "./ball.js";
import { spriteImg } from "./sprite.js";

export function createCard(pokemon) {
  const lineIds = evolutionLineIds(pokemon);
  const card = el("article", { class: "mon", dataset: { id: String(pokemon.id) } });
  if (lineIds.length <= 1) card.dataset.single = "";
  card.style.setProperty("--tc", `var(--type-${pokemon.types[0]})`);

  // --- sprite + meta ---
  const img = spriteImg(pokemon.sprite, {
    alt: pokemon.name, loading: "lazy", decoding: "async", width: 72, height: 72,
  });
  const types = el("span", { class: "mon__types" }, ...pokemon.types.map(typeBadge));

  const evo = evoPosition(pokemon);
  const mScope = megaScope(pokemon);
  const numRow = el("span", { class: "mon__numrow" },
    el("span", { class: "mon__num" }, "N.º " + pad3(pokemon.id)),
    mScope
      ? el("img", {
          class: "mon__mega", src: "assets/mega-dna.png", width: 16, height: 16,
          dataset: { scope: mScope },
          alt: "Mega Evolução",
          title: mScope === "self"
            ? "Tem Mega Evolução"
            : "A linha evolutiva tem Mega Evolução",
        })
      : null,
    el("span", { class: "mon__evo" }, evo ? `Evo ${evo.pos}/${evo.max}` : "No evo"),
  );

  const meta = el("span", { class: "mon__meta" },
    numRow,
    el("span", { class: "mon__name" }, pokemon.name),
    types,
  );
  const openBtn = el("button", {
    class: "mon__open", type: "button", "aria-expanded": "false",
    onclick: () => toggle(),
  },
    el("span", { class: "mon__sprite" }, img),
    meta,
  );

  // "como pegar aqui" (modo local)
  let hereEl = null;
  function setHere(entries, gameSlug) {
    if (hereEl) { hereEl.remove(); hereEl = null; }
    card.classList.toggle("has-here", !!(entries && entries.length));
    if (entries && entries.length) {
      const best = pickBest(entries);
      const rod = rodIcon(best.method);
      let exclBadge = null;
      if (best.exclusiveTo && gameSlug) {
        const v = versionLabel(gameSlug, best.exclusiveTo);
        exclBadge = el("span", { class: "mon__here-excl", style: `--vc:${v.color}` }, v.label);
      }
      hereEl = el("span", { class: "mon__here" },
        rod ? el("img", { class: "mon__here-rod", src: rod, alt: "", draggable: "false" }) : null,
        hereSummary(entries),
        exclBadge,
      );
      meta.append(hereEl);
    }
  }

  // no modo shiny, o check marca/conta os shinies (e fica dourado)
  const caughtOf = (id) => (isShiny() ? isCaughtShiny(id) : isCaught(id));

  // --- pokébola de progresso da linha (tipo de bola = raridade) ---
  const ball = createBall({
    kind: ballKind(pokemon),
    name: pokemon.name,
    onToggle: () => (isShiny() ? toggleCaughtShiny : toggleCaught)(pokemon.id),
  });
  const status = el("span", { class: "mon__status" }, ball.node);

  card.append(openBtn, status);

  let panelProgress = null; // linha "X de Y (Z%)" no painel aberto

  function refresh() {
    const shiny = isShiny();
    const done = lineIds.filter(caughtOf).length;
    const total = lineIds.length;
    const percent = Math.round((done / total) * 100);
    const on = caughtOf(pokemon.id);
    ball.update({ progress: done / total, mine: on, done, total, gold: shiny });
    card.classList.toggle("is-caught", on);
    card.classList.toggle("is-caught-shiny", on && shiny);
    if (panelProgress) {
      const word = shiny ? "shinies" : "capturados";
      panelProgress.textContent = total > 1
        ? `Linha evolutiva: ${done} de ${total} ${word} · ${percent}%`
        : on ? (shiny ? "Shiny marcado" : "Capturado") : (shiny ? "Shiny não marcado" : "Ainda não capturado");
    }
  }

  // --- painel expansível ---
  let panel = null;
  let openTab = "evo";
  let show = (k) => { openTab = k; };

  function build() {
    panel = el("div", { class: "mon__panel" });
    const facts = el("p", { class: "mon__facts" },
      `Geração ${["I","II","III","IV","V","VI","VII","VIII","IX"][(pokemon.generation || 1) - 1]}`,
      pokemon.height ? ` · ${(pokemon.height / 10).toLocaleString("pt-BR")} m` : "",
      pokemon.weight ? ` · ${(pokemon.weight / 10).toLocaleString("pt-BR")} kg` : "",
    );
    panelProgress = el("p", { class: "mon__lineprog" });
    const bar = el("div", { class: "tabs", role: "tablist" });
    const body = el("div");
    let statsSel = null; // pré-seleção da aba Status (ex.: uma Mega vinda da aba Mega)
    const tabs = [
      { k: "evo", label: "Evolução", make: () => renderEvolution(pokemon) },
      { k: "stats", label: "Status e fraquezas", make: () => renderStats(pokemon, { sel: statsSel }) },
      { k: "builds", label: "Builds", make: () => renderBuilds(pokemon) },
      { k: "enc", label: "Onde encontrar", make: () => renderEncounters(pokemon) },
    ];
    if (mScope) {
      tabs.splice(1, 0, {
        k: "mega", label: "Mega Evolução",
        make: () => renderMega(pokemon, {
          onSeeStats: (megaKey) => { statsSel = megaKey; show("stats"); },
        }),
      });
    }
    show = (k) => {
      openTab = k;
      for (const b of bar.children) b.setAttribute("aria-selected", String(b.dataset.k === k));
      dispose();
      clear(body);
      body.append(tabs.find((t) => t.k === k).make());
      statsSel = null; // consumido
    };
    for (const t of tabs) {
      bar.append(el("button", {
        type: "button", role: "tab", dataset: { k: t.k },
        "aria-selected": String(t.k === openTab),
        onclick: () => show(t.k),
      }, t.label));
    }
    panel.append(facts, panelProgress, bar, body);
    card.append(panel);
    refresh();
    show(openTab);
  }

  function dispose() {
    if (panel) for (const n of panel.querySelectorAll(".evo-tab")) n.dispatchEvent(new CustomEvent("checkdex:dispose"));
  }

  function toggle(force) {
    const open = force ?? !card.classList.contains("is-open");
    card.classList.toggle("is-open", open);
    openBtn.setAttribute("aria-expanded", String(open));
    if (open && !panel) { openTab = "evo"; build(); } // sempre abre na Evolução
    else if (!open && panel) { dispose(); panel.remove(); panel = null; panelProgress = null; }
    card.dispatchEvent(new CustomEvent("checkdex:open", { bubbles: true, detail: { open } }));
  }

  const unsub = subscribe((kind) => { if (kind === "caught" || kind === "shiny") refresh(); });
  card.addEventListener("checkdex:remove", unsub, { once: true });
  refresh();

  card.checkdex = {
    id: pokemon.id,
    toggle,
    setHere,
    setTab(k) { if (!panel) build(); show(k); },
  };
  return card;
}
