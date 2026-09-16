// Aba "Builds": as sets competitivas do Smogon para o Pokémon (por geração /
// jogo). Quando não há set numa geração, cai numa sugestão automática.
// Por padrão abre no estágio final da linha (a forma "campeã").

import { el, clear } from "./dom.js";
import { evolutionStages, megasFor, regionalsFor, altFormsFor, loadBuildsData, gameNameParts, store } from "../data.js";
import { getFilters } from "../state.js";
import { spriteImg } from "./sprite.js";
import { typeSymbol } from "./types.js";
import { smogonSets, metavgcSet, heuristicSets, resolveSet, STAT_FULL, STAT_ABBR } from "./builds.js";

const CAT_PT = { phys: "Fís.", spec: "Esp.", stat: "Stat." };
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

const field = (label, control) => el("div", { class: "tabctrl__field" },
  el("span", { class: "tabctrl__label" }, label),
  control,
);
const row = (label, ...content) => el("div", { class: "builds__row" },
  el("span", { class: "builds__label" }, label),
  el("div", { class: "builds__val" }, ...content.filter(Boolean)),
);
const evText = (list) => list.map((e) => `${e.v} ${STAT_ABBR[e.k]}`).join(" · ");

export function renderBuilds(pokemon) {
  const wrap = el("div", { class: "builds-tab evo-tab" });
  wrap.append(el("p", { class: "builds__hint" }, "Carregando builds…"));
  loadBuildsData().then(() => { if (wrap.isConnected) mount(wrap, pokemon); });
  return wrap;
}

function mount(wrap, pokemon) {
  clear(wrap);

  const entries = [];
  for (const s of evolutionStages(pokemon)) {
    const mon = store.byId.get(s.id);
    if (mon) entries.push({ id: String(s.id), baseId: s.id, name: mon.name, types: mon.types, stats: mon.stats, sprite: mon.sprite });
  }
  for (const f of regionalsFor(pokemon)) {
    if (f.stats) entries.push({ id: f.key, baseId: f.speciesId, name: f.name, regKey: f.key, reg: f.region, types: f.types, stats: f.stats, sprite: f.sprite });
  }
  for (const f of altFormsFor(pokemon)) {
    const key = f.setKey || f.key;
    if (f.stats) entries.push({ id: key, baseId: f.siblingId, name: f.name, altKey: key, types: f.types, stats: f.stats, sprite: f.sprite });
  }
  for (const m of megasFor(pokemon)) {
    if (m.stats) entries.push({ id: m.key, baseId: pokemon.id, baseSlug: m.key.split("-mega")[0], name: m.name, mega: true, stone: m.stone, megaAbility: m.ability || null, types: m.types, stats: m.stats, sprite: m.sprite });
  }

  // abre no estágio final da linha (forma "campeã")
  const finalCanon = [...entries].reverse().find((e) => !e.mega && !e.regKey && !e.altKey);
  const start = finalCanon || entries[entries.length - 1] || entries[0];

  const games = store.games;
  const filt = getFilters();
  const state = {
    sel: start.id,
    game: games.find((g) => g.slug === filt.game)?.slug || "scarlet-violet",
    setIdx: 0,     // conjunto/build escolhido
    itemPick: 0,   // item escolhido (0 = principal, 1+ = alternativos)
  };
  const entryOf = () => entries.find((e) => e.id === state.sel) || entries[0];
  const gameOf = () => games.find((g) => g.slug === state.game) || games[games.length - 1];
  const monOf = () => {
    const e = entryOf();
    return { ...(store.byId.get(e.baseId) || {}), name: e.name, types: e.types, stats: e.stats };
  };

  /* ---------- controles ---------- */
  const ctrl = el("div", { class: "tabctrl" });

  if (entries.length > 1) {
    const seg = el("div", { class: "seg seg--mons", role: "group", "aria-label": "Pokémon" });
    for (const e of entries) {
      seg.append(el("button", {
        type: "button", "aria-pressed": String(e.id === state.sel),
        dataset: { sel: e.id, mega: e.mega ? "1" : null, reg: e.reg || null },
        style: e.mega ? null : `--tcol:var(--type-${e.types[0]})`,
        onclick: () => { state.sel = e.id; state.setIdx = 0; state.itemPick = 0; sync(); },
      }, spriteImg(e.sprite, { alt: "" }), el("span", { class: "seg__label" }, e.name)));
    }
    const l = ["Pokémon", entries.some((e) => e.reg) && "regional", entries.some((e) => e.altKey) && "forma alt.", entries.some((e) => e.mega) && "Mega"].filter(Boolean).join(" / ");
    ctrl.append(field(l, seg));
  }

  const gp = gamePicker(games, () => state.game, (slug) => { state.game = slug; state.setIdx = 0; state.itemPick = 0; sync(); });
  ctrl.append(field("Jogo", gp.root));
  wrap.addEventListener("checkdex:dispose", gp.dispose, { once: true });

  const grid = el("div", { class: "builds__grid" });
  const movesBox = el("div", { class: "builds__moves" });
  const note = el("p", { class: "builds__note" });
  wrap.append(ctrl, grid, movesBox, note);

  /* ---------- render ---------- */
  const chip = (t, cls = "") => el("span", { class: "builds__chip " + cls }, t);
  const abilityBlock = (tag, name, short, hidden) => el("div", { class: "builds__ab" },
    el("div", { class: "builds__abhead" },
      tag ? el("span", { class: "builds__abtag" }, tag) : null,
      el("b", { class: "builds__abname" }, name),
      hidden ? el("span", { class: "builds__hidden" }, "oculta") : null,
    ),
    short ? el("p", { class: "builds__desc" }, short) : null,
  );
  const itemImg = (slug) => el("img", {
    src: `assets/items/${slug}.png`, alt: "", class: "builds__itemimg", loading: "lazy",
    onerror: (e) => { e.target.remove(); },
  });

  // itens de uma set do Smogon: cada um é um botão; clicar mostra a descrição dele.
  function smogonItemBlock(opts) {
    if (state.itemPick >= opts.length) state.itemPick = 0;
    const rowEl = el("div", { class: "builds__itemrow" });
    opts.forEach((o, i) => {
      if (i === 1) rowEl.append(el("span", { class: "builds__itemou" }, "ou"));
      rowEl.append(el("button", {
        class: "builds__itemchip" + (i === state.itemPick ? " is-active" : ""),
        type: "button", "aria-pressed": String(i === state.itemPick),
        onclick: () => { state.itemPick = i; render(); },
      }, itemImg(o.slug), el("span", {}, o.name)));
    });
    const cur = opts[state.itemPick];
    return [rowEl, cur.d ? el("p", { class: "builds__desc" }, cur.d) : null];
  }

  function moveRow(m) {
    return el("div", { class: "builds__move" },
      el("div", { class: "builds__mtop" },
        typeSymbol(m.t),
        el("span", { class: "builds__mnamewrap" },
          el("b", { class: "builds__mname" }, m.n),
          m.alts && m.alts.length ? el("span", { class: "builds__malt" }, "/ " + m.alts.join(" / ")) : null,
        ),
        el("span", { class: "builds__cat", dataset: { c: m.c } }, CAT_PT[m.c]),
        el("span", { class: "builds__pow" }, m.p ? String(m.p) : "—"),
      ),
      m.d ? el("p", { class: "builds__mdesc" }, m.d) : null,
    );
  }

  const setLabel = (b) => (b.fmtLabel && b.fmtLabel !== "Auto" ? `${b.fmtLabel} · ${b.name}` : b.name);

  function render() {
    const e = entryOf();
    const gen = gameOf().generation;
    clear(grid);
    clear(movesBox);

    const smog = smogonSets(e, gen);
    // MetaVGC é uso atual (Pokémon Champions) sem recorte por jogo/geração —
    // só faz sentido junto do jogo mais atual da lista, senão empurra golpes
    // e itens modernos pra cima de um jogo antigo que nem tem isso
    const meta = state.game === games[games.length - 1].slug ? metavgcSet(e) : null;
    const known = [...smog, ...(meta ? [meta] : [])];
    const auto = !known.length;
    const builds = (auto ? heuristicSets(monOf(), gen, e) : known).map(resolveSet);

    if (!builds.length) {
      grid.append(row("Conjunto", el("span", { class: "builds__hint" },
        `${entryOf().name} não aprende golpes em ${gameOf().label}.`)));
      note.textContent = "";
      return;
    }
    if (state.setIdx >= builds.length) state.setIdx = 0;
    const b = builds[state.setIdx];

    // Conjunto — dropdown pra escolher a build
    if (builds.length > 1) {
      const sel = el("select", {
        class: "builds__setsel", "aria-label": "Conjunto",
        onchange: (ev) => { state.setIdx = +ev.target.value; state.itemPick = 0; render(); },
      });
      builds.forEach((x, i) => sel.append(el("option", { value: String(i) }, setLabel(x))));
      sel.value = String(state.setIdx);
      grid.append(row("Conjunto", sel));
    } else {
      grid.append(row("Conjunto", chip(setLabel(b), "is-set")));
    }

    if (b.nature) {
      grid.append(row("Natureza", el("div", { class: "builds__natrow" },
        chip(b.nature.name, "is-nat"),
        b.nature.plus
          ? el("span", { class: "builds__hint" }, `+${STAT_ABBR[b.nature.plus]} · −${STAT_ABBR[b.nature.minus]}`)
          : el("span", { class: "builds__hint" }, "neutra"),
      )));
    }
    if (b.ability) grid.append(row("Habilidade", abilityBlock(null, b.ability.name, b.ability.short, false)));
    if (b.item) {
      const opts = [{ slug: b.item.slug, name: b.item.name, d: b.item.d }, ...b.item.alts];
      grid.append(row("Item", ...smogonItemBlock(opts)));
    }
    if (b.evs.length) {
      grid.append(row("EVs", el("div", { class: "builds__evrow" },
        ...b.evs.map((x) => el("span", { class: "builds__ev", title: STAT_FULL[x.k] },
          el("b", {}, String(x.v)), " ", STAT_ABBR[x.k])),
      )));
    }
    if (b.ivs.length) grid.append(row("IVs", el("span", { class: "builds__hint" }, evText(b.ivs))));
    if (b.tera.length) {
      grid.append(row("Tera", el("div", { class: "builds__terarow" },
        ...b.tera.map((t) => el("span", { class: "builds__teratag" }, typeSymbol(t), el("span", {}, cap(t)))),
      )));
    }
    if (b.level) grid.append(row("Nível", chip(String(b.level))));

    movesBox.append(el("div", { class: "builds__mhead" }, el("span", { class: "builds__label" }, "Golpes")));
    const list = el("div", { class: "builds__mlist" });
    for (const m of b.moves) list.append(moveRow(m));
    movesBox.append(list);

    note.textContent = auto
      ? "Sem set competitiva conhecida pra esse Pokémon — sugestão automática a partir dos status, tipos e golpes que ele aprende."
      : b.fmt === "metavgc"
        ? "Golpe, item e habilidade mais usados em Pokémon Champions (VGC), via MetaVGC — sem Natureza/EVs porque o site-fonte não estrutura isso por Pokémon."
        : `Set competitiva do Smogon (${b.fmtLabel}) para ${gameOf().label}. Os golpes com “/” têm alternativas.`;
  }

  function sync() {
    for (const b of ctrl.querySelectorAll(".seg--mons button")) {
      b.setAttribute("aria-pressed", String(b.dataset.sel === state.sel));
    }
    gp.refresh();
    render();
  }

  sync();
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* ---------- dropdown de jogo (nome nas cores das versões) ---------- */
// "Red · Blue" -> "Red" vermelho · "Blue" azul (escurecido pra contraste)
function gameLabel(g) {
  const out = [];
  gameNameParts(g).forEach((p, i) => {
    if (i) out.push(el("span", { class: "gp__sep" }, "·"));
    out.push(el("span", { style: `color:color-mix(in srgb, ${p.color} 82%, var(--ink))` }, p.text));
  });
  return out;
}

function gamePicker(games, getSlug, onPick) {
  let open = false;
  const cur = () => games.find((g) => g.slug === getSlug()) || games[games.length - 1];

  const label = el("span", { class: "gp__cur" });
  const btn = el("button", {
    class: "gp__btn", type: "button", "aria-haspopup": "listbox", "aria-expanded": "false",
    onclick: (e) => { e.stopPropagation(); toggle(); },
  }, label, el("span", { class: "gp__caret", "aria-hidden": "true" }, "▾"));

  const menu = el("div", { class: "gp__menu", role: "listbox", hidden: true });
  let lastGen = 0;
  for (const g of games) {
    if (g.generation !== lastGen) {
      lastGen = g.generation;
      menu.append(el("div", { class: "gp__genhead" }, "Geração " + ROMAN[g.generation - 1]));
    }
    menu.append(el("button", {
      class: "gp__opt", type: "button", role: "option", dataset: { slug: g.slug },
      onclick: () => { onPick(g.slug); toggle(false); },
    }, ...gameLabel(g)));
  }

  const root = el("div", { class: "gp" }, btn, menu);

  // o card (.mon.is-open) tem overflow:hidden pra manter os cantos
  // arredondados — se o menu ficasse dentro dele, um card baixo (ex.: Pokémon
  // sem golpes no jogo escolhido) cortava o dropdown pela metade. Enquanto
  // aberto, o menu vira filho direto do <body> (position: fixed, posição
  // calculada a partir do botão), escapando desse clip.
  function place() {
    const r = btn.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.left = `${r.left}px`;
    menu.style.width = `${Math.max(240, r.width)}px`;
  }
  function unplace() {
    menu.style.position = "";
    menu.style.top = "";
    menu.style.left = "";
    menu.style.width = "";
  }
  function toggle(f) {
    open = f ?? !open;
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    root.classList.toggle("is-open", open);
    if (open) {
      place();
      document.body.append(menu);
    } else if (menu.parentElement === document.body) {
      root.append(menu);
      unplace();
    }
  }
  const onDoc = (e) => { if (open && !root.contains(e.target) && !menu.contains(e.target)) toggle(false); };
  const onKey = (e) => { if (e.key === "Escape" && open) toggle(false); };
  // scroll da página (não o scroll interno da lista) fecha, pra não deixar
  // o menu fixo flutuando longe do botão
  const onScroll = (e) => { if (open && !menu.contains(e.target)) toggle(false); };
  document.addEventListener("click", onDoc);
  document.addEventListener("keydown", onKey);
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  window.addEventListener("resize", onScroll);
  const dispose = () => {
    document.removeEventListener("click", onDoc);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("scroll", onScroll, { capture: true });
    window.removeEventListener("resize", onScroll);
    if (menu.parentElement === document.body) menu.remove();
  };

  function refresh() {
    const g = cur();
    clear(label);
    label.append(...gameLabel(g));
    for (const o of menu.querySelectorAll(".gp__opt")) o.setAttribute("aria-selected", String(o.dataset.slug === g.slug));
  }
  refresh();
  return { root, refresh, dispose };
}
