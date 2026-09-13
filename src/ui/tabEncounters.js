// Aba "Onde encontrar": um acordeão de jogos (recolhido), cada um com UM item
// por local (consolidado), a faixa de nível e a melhor chance. Escolhe o
// estágio da linha e o jogo.

import { el, clear, pad3 } from "./dom.js";
import { evolutionStages, encountersByGame, store } from "../data.js";
import { getFilters } from "../state.js";
import { method, cond, chanceBand } from "./encounterText.js";
import { spriteImg } from "./sprite.js";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
const CAP = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const MAX_LOCS = 6;

export function renderEncounters(pokemon) {
  const stages = evolutionStages(pokemon);
  const wrap = el("div", { class: "enc" });
  const filt = getFilters();
  const state = {
    monId: pokemon.id,
    game: filt.game !== "all" ? filt.game : "all",
    open: null,
  };

  const bar = el("div", { class: "tabctrl enc__bar" });
  const field = (label, control) => el("div", { class: "tabctrl__field" },
    el("span", { class: "tabctrl__label" }, label),
    control,
  );

  if (stages.length > 1) {
    const seg = el("div", { class: "seg", role: "group", "aria-label": "Pokémon da linha" });
    stages.forEach((s) => {
      const mon = store.byId.get(s.id);
      seg.append(el("button", {
        type: "button",
        "aria-pressed": String(s.id === state.monId),
        dataset: { stageId: String(s.id) },
        onclick: () => { state.monId = s.id; state.open = null; sync(); },
      },
        spriteImg(mon ? mon.sprite : `assets/sprites/${pad3(s.id)}.png`, { alt: "" }),
        s.name,
      ));
    });
    bar.append(field("Pokémon", seg));
  }

  const select = el("select", {
    "aria-label": "Jogo",
    onchange: (e) => { state.game = e.target.value; state.open = null; render(); },
  });
  bar.append(field("Jogo", select));

  const out = el("div", { class: "enc__groups" });
  wrap.append(bar, out);

  function refreshGames() {
    const all = encountersByGame(state.monId, "all");
    clear(select);
    select.append(el("option", { value: "all" },
      all.length ? `Todos os jogos (${all.length})` : "Todos os jogos"));
    for (const g of all) select.append(el("option", { value: g.slug }, g.label));
    if (![...select.options].some((o) => o.value === state.game)) state.game = "all";
    select.value = state.game;
  }

  function sync() {
    for (const b of bar.querySelectorAll(".seg button")) {
      b.setAttribute("aria-pressed", String(Number(b.dataset.stageId) === state.monId));
    }
    refreshGames();
    render();
  }

  function locRow(loc) {
    const methods = [...new Set([...loc.methods].map((m) => method(m).label))];
    const conds = [...loc.conditions].map(cond).filter(Boolean);
    // "Mato alto" sem condição é o caso comum → não polui a linha
    const plain = methods.length === 1 && methods[0] === "Mato alto" && !conds.length;
    const sub = plain ? "" : [methods.slice(0, 2).join(" / "), conds.slice(0, 2).join(", ")]
      .filter(Boolean).join(" · ");
    const lvl = loc.minLevel
      ? (loc.minLevel === loc.maxLevel ? `Nv. ${loc.minLevel}` : `Nv. ${loc.minLevel}–${loc.maxLevel}`)
      : "";
    return el("div", { class: "enc__row" },
      el("div", { class: "enc__where" }, el("b", {}, loc.label), sub ? el("span", {}, sub) : null),
      lvl ? el("span", { class: "enc__lvl" }, lvl) : null,
      loc.chance > 0 && loc.chance < 100
        ? el("span", { class: "enc__chance", dataset: { band: chanceBand(loc.chance) } }, loc.chance + "%")
        : null,
    );
  }

  // nome do jogo com cada versão na sua cor ("Red" vermelho · "Blue" azul)
  // escurece um pouco cada cor pra garantir contraste no fundo claro
  function gameName(g) {
    const out = [];
    g.nameParts.forEach((p, i) => {
      if (i) out.push(el("span", { class: "enc__acc-sep" }, " · "));
      out.push(el("span", {
        style: `color:color-mix(in srgb, ${p.color} 80%, #1a1a1f)`,
      }, p.text));
    });
    return out;
  }

  function locList(g) {
    const list = el("div", { class: "enc__list" });
    for (const loc of g.locs.slice(0, MAX_LOCS)) list.append(locRow(loc));
    if (g.locs.length > MAX_LOCS) {
      list.append(el("p", { class: "enc__more" },
        `+ ${g.locs.length - MAX_LOCS} outros locais neste jogo`));
    }
    return list;
  }

  function render() {
    clear(out);
    const games = encountersByGame(state.monId, state.game);
    const mon = store.byId.get(state.monId);

    if (!games.length) {
      out.append(el("p", { class: "enc__empty" },
        `${mon?.name ?? "Este Pokémon"} não aparece na natureza`
        + `${state.game === "all" ? "" : " em " + (store.games.find((x) => x.slug === state.game)?.label ?? "")}. `
        + "Você o consegue por evolução, troca ou presente."));
      return;
    }

    // um jogo escolhido → lista direta, sem acordeão
    if (state.game !== "all") {
      const list = locList(games[0]);
      list.style.setProperty("--game", games[0].color);
      list.classList.add("enc__list--solo");
      out.append(list);
      return;
    }

    if (state.open == null || !games.some((g) => g.slug === state.open)) {
      state.open = games[0].slug;
    }
    for (const g of games) {
      const open = state.open === g.slug;
      const head = el("button", {
        class: "enc__acc", type: "button", "aria-expanded": String(open),
        onclick: () => { state.open = open ? null : g.slug; render(); },
      },
        el("span", { class: "enc__acc-name" }, ...gameName(g)),
        el("span", { class: "enc__acc-gen" }, "Gen " + ROMAN[g.generation - 1]),
        el("span", { class: "enc__acc-sum" },
          `${g.region ? CAP(g.region) + " · " : ""}${g.locs.length} ${g.locs.length === 1 ? "local" : "locais"}`),
        el("span", { class: "enc__acc-caret", "aria-hidden": "true" }, "▾"),
      );
      const sec = el("section", { class: "enc__acc-wrap" + (open ? " is-open" : "") },
        head, open ? locList(g) : null);
      sec.style.setProperty("--game", g.color);
      out.append(sec);
    }
  }

  sync();
  return wrap;
}
