// Aba "Status": os 6 status-base em barras (estilo wiki) + o somatório (Total).
// Um seletor de nível (Base / Nv. 1 / Nv. 100) troca os números para o intervalo
// real do status naquele nível — do mínimo (IV 0, EV 0, natureza −) ao máximo
// (IV 31, EV 252, natureza +). As barras seguem sempre o status-base, para a
// comparação entre stats ficar consistente em qualquer nível.
// O seletor de Pokémon inclui as formas regionais e as Mega Evoluções da linha.
// O botão Pokérus (PKRS) mostra o status já com os 252 EVs — o Pokérus dobra o
// rendimento de EVs, então representa um Pokémon "treinado".
// Abaixo das barras: fraquezas / resistências / imunidades da forma escolhida.

import { el, clear, pad3 } from "./dom.js";
import { evolutionStages, megasFor, regionalsFor, store } from "../data.js";
import { spriteImg } from "./sprite.js";
import { typeSymbol } from "./types.js";
import { defensiveProfile, fmtMult } from "./typechart.js";

const STATS = [
  { k: "hp",  short: "HP",       full: "Pontos de vida" },
  { k: "atk", short: "Atq.",     full: "Ataque" },
  { k: "def", short: "Def.",     full: "Defesa" },
  { k: "spa", short: "Sp. Atq.", full: "Ataque Especial" },
  { k: "spd", short: "Sp. Def.", full: "Defesa Especial" },
  { k: "spe", short: "Vel.",     full: "Velocidade" },
];

const BAR_MAX = 255;    // maior status-base possível (escala das barras)
const TOTAL_MAX = 780;  // teto visual do somatório

// faixa de cor estilo wiki (1 = fraco / vermelho … 6 = altíssimo / verde-água)
function bandOf(v) {
  if (v < 30) return 1;
  if (v < 60) return 2;
  if (v < 90) return 3;
  if (v < 110) return 4;
  if (v < 140) return 5;
  return 6;
}

// fórmula de status Gen III+ — HP tem fórmula própria; a natureza (nat) só
// afeta os demais. iv 0–31, ev 0–252, nat 0.9 | 1.0 | 1.1
function calc(k, base, level, iv, ev, nat) {
  const core = Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100);
  if (k === "hp") return base === 1 ? 1 : core + level + 10; // base 1 = Shedinja
  return Math.floor((core + 5) * nat);
}
const rangeAt = (k, base, level) => [
  calc(k, base, level, 0, 0, 0.9),
  calc(k, base, level, 31, 252, 1.1),
];
// status "treinado" (Pokérus = rendimento de EVs dobrado → 252 EVs): IV 31,
// EV 252, natureza neutra.
const trainedAt = (k, base, level) => calc(k, base, level, 31, 252, 1);
// quanto os 252 EVs somam, em pontos de status-base equivalentes (p/ a barra)
const EV_BAR_BONUS = (level) => (252 / 4) * (level / 100) / BAR_MAX * 100;

const LEVELS = [
  { v: 0, label: "Base" },
  { v: 1, label: "Nv. 1" },
  { v: 100, label: "Nv. 100" },
];

// campo de controle rotulado (rótulo curto em cima, seletor embaixo)
const field = (label, control) => el("div", { class: "tabctrl__field" },
  el("span", { class: "tabctrl__label" }, label),
  control,
);

export function renderStats(pokemon, { sel } = {}) {
  const wrap = el("div", { class: "stats-tab evo-tab" });

  // seletor: estágios canônicos da linha + formas regionais + Mega Evoluções
  const entries = [];
  for (const s of evolutionStages(pokemon)) {
    const mon = store.byId.get(s.id);
    entries.push({
      id: String(s.id), name: s.name, types: mon?.types || [],
      sprite: mon ? mon.sprite : `assets/sprites/${pad3(s.id)}.png`,
      stats: mon?.stats || {},
    });
  }
  for (const f of regionalsFor(pokemon)) {
    if (f.stats) entries.push({ id: f.key, name: f.name, reg: f.region, types: f.types || [], sprite: f.sprite, stats: f.stats });
  }
  for (const m of megasFor(pokemon)) {
    if (m.stats) entries.push({ id: m.key, name: m.name, mega: true, types: m.types || [], sprite: m.sprite, stats: m.stats });
  }

  const first = sel && entries.some((e) => e.id === sel) ? sel : String(pokemon.id);
  const state = { sel: first, level: 0, pkrs: false };
  const entryOf = () => entries.find((e) => e.id === state.sel) || entries[0];

  const ctrl = el("div", { class: "tabctrl" });

  if (entries.length > 1) {
    const seg = el("div", { class: "seg seg--mons", role: "group", "aria-label": "Pokémon" });
    for (const e of entries) {
      seg.append(el("button", {
        type: "button",
        "aria-pressed": String(e.id === state.sel),
        dataset: { sel: e.id, mega: e.mega ? "1" : null },
        style: e.mega || !e.types[0] ? null : `--tcol:var(--type-${e.types[0]})`,
        onclick: () => { state.sel = e.id; sync(); },
      },
        spriteImg(e.sprite, { alt: "" }),
        el("span", { class: "seg__label" }, e.name),
      ));
    }
    const hasMega = entries.some((e) => e.mega);
    const hasReg = entries.some((e) => e.reg);
    const label = ["Pokémon", hasReg && "regional", hasMega && "Mega"].filter(Boolean).join(" / ");
    ctrl.append(field(label, seg));
  }

  const lvlSeg = el("div", { class: "seg seg--lvl", role: "group", "aria-label": "Nível" });
  for (const o of LEVELS) {
    lvlSeg.append(el("button", {
      type: "button",
      "aria-pressed": String(o.v === state.level),
      dataset: { lvl: String(o.v) },
      onclick: () => { state.level = o.v; if (!o.v) state.pkrs = false; sync(); },
    }, o.label));
  }
  ctrl.append(field("Nível", lvlSeg));

  const pkrsBtn = el("button", {
    class: "pkrs-toggle", type: "button", "aria-pressed": "false",
    title: "Pokérus — mostra o status já com 252 EVs (o Pokérus dobra o rendimento de EVs)",
    onclick: () => {
      state.pkrs = !state.pkrs;
      if (state.pkrs && !state.level) state.level = 100; // Pokérus só faz sentido num nível
      sync();
    },
  }, el("img", { src: "assets/pokerus.png", alt: "Pokérus", width: 22, height: 22, loading: "lazy" }));
  ctrl.append(field("PKRS", pkrsBtn));

  const grid = el("div", { class: "stats__grid" });
  const note = el("p", { class: "stats__note" });
  const dfx = el("div", { class: "dfx" });
  wrap.append(ctrl, grid, note, dfx);

  const dfxRow = (label, items, cls) => items.length === 0 ? null : el("div", { class: "dfx__row" },
    el("span", { class: "dfx__label" }, label),
    el("span", { class: "dfx__chips" }, ...items.map((r) =>
      el("span", { class: "dfx__chip " + cls },
        typeSymbol(r.type),
        el("span", { class: "dfx__mult" }, "×" + fmtMult(r.mult)),
      ),
    )),
  );

  function renderDfx() {
    clear(dfx);
    const types = entryOf().types;
    if (!types || !types.length) return;
    const p = defensiveProfile(types);
    dfx.append(el("div", { class: "dfx__head" },
      el("span", { class: "dfx__title" }, "Fraquezas e resistências"),
      el("span", { class: "dfx__for" }, ...types.map(typeSymbol)),
    ));
    const rows = [
      dfxRow("Fraco a", p.weak, "is-weak"),
      dfxRow("Resiste", p.resist, "is-resist"),
      dfxRow("Imune", p.immune, "is-immune"),
    ].filter(Boolean);
    dfx.append(...(rows.length
      ? rows
      : [el("p", { class: "dfx__none" }, "Sem fraquezas ou resistências de tipo.")]));
  }

  function render() {
    const st = entryOf().stats || {};
    const pk = state.pkrs;
    const evBonus = pk ? EV_BAR_BONUS(state.level || 100) : 0;
    clear(grid);
    let total = 0, tLo = 0, tHi = 0, tPk = 0;

    for (const s of STATS) {
      const base = st[s.k] ?? 0;
      total += base;

      let valText;
      if (pk) {
        const t = trainedAt(s.k, base, state.level);
        tPk += t;
        valText = String(t);
      } else if (state.level) {
        const [lo, hi] = rangeAt(s.k, base, state.level);
        tLo += lo; tHi += hi;
        valText = `${lo}–${hi}`;
      } else {
        valText = String(base);
      }

      const baseW = Math.min(100, base / BAR_MAX * 100);
      const bar = el("span", { class: "stats__bar", dataset: { band: String(bandOf(base)) } },
        el("i", { style: `width:${baseW.toFixed(1)}%` }),
      );
      if (pk && evBonus > 0.3) {
        bar.append(el("i", {
          class: "stats__ev",
          style: `left:${baseW.toFixed(1)}%;width:${Math.min(100 - baseW, evBonus).toFixed(1)}%`,
        }));
      }

      grid.append(el("div", { class: "stats__row" + (pk ? " is-pkrs" : "") },
        el("span", { class: "stats__name", title: s.full }, s.short),
        el("span", { class: "stats__val" }, valText),
        bar,
      ));
    }

    grid.append(el("div", { class: "stats__row stats__row--total" + (pk ? " is-pkrs" : "") },
      el("span", { class: "stats__name" }, "Total"),
      el("span", { class: "stats__val" }, pk ? String(tPk) : state.level ? `${tLo}–${tHi}` : String(total)),
      el("span", { class: "stats__bar stats__bar--total" },
        el("i", { style: `width:${Math.min(100, total / TOTAL_MAX * 100).toFixed(1)}%` }),
      ),
    ));

    note.textContent = pk
      ? `Com Pokérus: status no ${state.level === 1 ? "Nv. 1" : "Nv. 100"} já com 252 EVs (IV 31, natureza neutra). A faixa rosa na barra é o ganho dos EVs.`
      : state.level
        ? "As barras seguem o status-base. Os números vão do mínimo (IV 0, EV 0, natureza −) ao máximo (IV 31, EV 252, natureza +)."
        : "Status-base. Troque para Nv. 1 ou Nv. 100 para ver o intervalo real no nível.";

    renderDfx();
  }

  function sync() {
    for (const b of ctrl.querySelectorAll(".seg button")) {
      if (b.dataset.sel != null) {
        b.setAttribute("aria-pressed", String(b.dataset.sel === state.sel));
      } else if (b.dataset.lvl != null) {
        b.setAttribute("aria-pressed", String(Number(b.dataset.lvl) === state.level));
      }
    }
    pkrsBtn.setAttribute("aria-pressed", String(state.pkrs));
    render();
  }

  sync();
  return wrap;
}
