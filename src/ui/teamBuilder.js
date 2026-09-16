// "Times de batalha": monta e salva times de até 6 Pokémon com item, natureza
// e EVs por espaço. Layout inspirado numa caixa de PC de batalha (grade de
// espaços dentro de uma caixa), no mesmo estilo visual do resto do site.
// Stats finais calculados com IV 31 (perfeito) e Nível 100 fixos — só as EVs
// e a Natureza mudam o resultado, como nas outras ferramentas de build do site.

import { el, clear, debounce, pad3 } from "./dom.js";
import { store, loadBuildsData } from "../data.js";
import { spriteImg, shinyPath, registerSprite } from "./sprite.js";
import { isShiny } from "../state.js";
import { typeSymbol, TYPE_LABEL } from "./types.js";
import { TYPES } from "../search.js";
import { STAT_KEYS, STAT_ABBR, STAT_FULL, NATURE_NAME, NATURE_EFFECT, slugName, recommendItem, legalMovesFor } from "./builds.js";
import * as teamsStore from "../teams.js";
import * as favorites from "../favorites.js";

const pad4 = (n) => String(n).padStart(4, "0");
// fallback pra nome de habilidade quando abilities.json ainda não carregou
// (ex.: "flash-fire" -> "Flash Fire")
const capWords = (s) => s.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

const LEVEL = 100;
const IV = 31;
const SLOT_COUNT = 6;

const CAT_PT = { phys: "Fís.", spec: "Esp.", stat: "Stat." };

const NEUTRAL_NATURES = ["hardy", "docile", "serious", "bashful", "quirky"];
const NATURE_NEUTRAL_NAME = {
  hardy: "Hardy", docile: "Docile", serious: "Serious", bashful: "Bashful", quirky: "Quirky",
};
const natureLabel = (key) => NATURE_NAME[key] || NATURE_NEUTRAL_NAME[key] || key;

// Um slot pode guardar a espécie base, uma Mega Evolução ou uma forma regional
// — todas achatadas num mesmo formato "mon-like" pra renderizar igual.
// `megaStoneSlug` só existe pras Megas com pedra conhecida — trava o item.
// `abilities`: [{slug, hidden}] pra escolher no editor. Mega tem habilidade
// fixa (`abilityLocked`); formas regionais/alternativas ainda não têm esse
// dado na base — ficam com lista vazia (editor mostra aviso em vez de opções).
function resolveMon(slot) {
  if (!slot) return null;
  if (slot.formKey) {
    const mega = (store.megas[slot.pokemonId] || []).find((m) => m.key === slot.formKey);
    if (mega) return {
      name: mega.name, types: mega.types, stats: mega.stats, sprite: mega.sprite,
      megaStoneSlug: mega.stone ? slugName(mega.stone) : null,
      abilities: mega.ability ? [{ slug: mega.ability, hidden: false }] : [],
      abilityLocked: true,
    };
    const reg = (store.regionals[slot.pokemonId] || []).find((r) => r.key === slot.formKey);
    if (reg) return { name: reg.name, types: reg.types, stats: reg.stats, sprite: reg.sprite, megaStoneSlug: null, abilities: [], abilityLocked: false };
    const alt = (store.altforms[slot.pokemonId] || []).find((f) => f.key === slot.formKey);
    if (alt) return { name: alt.name, types: alt.types, stats: alt.stats, sprite: alt.sprite, megaStoneSlug: null, abilities: [], abilityLocked: false };
    return null;
  }
  const p = store.byId.get(slot.pokemonId);
  return p ? { name: p.name, types: p.types, stats: p.stats, sprite: p.sprite, megaStoneSlug: null, abilities: p.abilities || [], abilityLocked: false } : null;
}

// pedra correspondente a uma linha da busca de Pokémon (null se não for Mega
// com pedra conhecida) — usada pra já entrar com o item certo no slot.
function megaStoneFor(pokemonId, formKey) {
  if (!formKey) return null;
  const mega = (store.megas[pokemonId] || []).find((m) => m.key === formKey);
  return mega?.stone ? slugName(mega.stone) : null;
}

// todas as Mega Stones conhecidas — saem do buscador genérico de item porque
// cada uma já é travada automaticamente na Mega Evolução correspondente.
function allMegaStoneSlugs() {
  const out = new Set();
  for (const list of Object.values(store.megas || {})) {
    for (const m of list) if (m.stone) out.add(slugName(m.stone));
  }
  return out;
}

// Casa a busca só pelo COMEÇO do nome inteiro ou de alguma palavra dele —
// "char" acha Charmander e Mega Charizard X (palavra "Charizard" começa com
// "char"), mas não pega nada que só CONTENHA as letras no meio (ex.: "vee"
// não deveria trazer "Eevee").
function nameStarts(name, q) {
  const lower = name.toLowerCase();
  if (lower.startsWith(q)) return true;
  return lower.split(/[^a-z0-9à-ú]+/).some((w) => w.startsWith(q));
}

// Todas as espécies base + Megas + formas regionais + variações (Lycanroc
// Midnight/Dusk, Toxtricity Low Key, Urshifu Rapid Strike…), achatadas numa
// lista buscável só por nome (id serve pro número de referência das espécies base).
function allSpeciesRows(q) {
  const rows = [];
  for (const p of store.pokedex) {
    if (!q || nameStarts(p.name, q) || String(p.id).startsWith(q)) {
      rows.push({ pokemonId: p.id, formKey: null, name: p.name, sprite: p.sprite, types: p.types, num: p.id });
    }
  }
  for (const [speciesId, list] of Object.entries(store.regionals || {})) {
    for (const f of list) {
      if (!q || nameStarts(f.name, q)) {
        rows.push({ pokemonId: Number(speciesId), formKey: f.key, name: f.name, sprite: f.sprite, types: f.types, num: Number(speciesId) });
      }
    }
  }
  for (const [speciesId, list] of Object.entries(store.megas || {})) {
    for (const m of list) {
      if (!q || nameStarts(m.name, q)) {
        rows.push({ pokemonId: Number(speciesId), formKey: m.key, name: m.name, sprite: m.sprite, types: m.types, num: Number(speciesId) });
      }
    }
  }
  for (const [speciesId, list] of Object.entries(store.altforms || {})) {
    for (const f of list) {
      if (!q || nameStarts(f.name, q)) {
        rows.push({ pokemonId: Number(speciesId), formKey: f.key, name: f.name, sprite: f.sprite, types: f.types, num: Number(speciesId) });
      }
    }
  }
  rows.sort((a, b) => a.num - b.num || (a.formKey ? 1 : 0) - (b.formKey ? 1 : 0));
  return rows;
}

let root, grid, nameInput, teamSelect, boxTitle;
let pickerEl, pickerCard, pickerSearch, pickerTypebar, pickerList, pickerTitle, pickerRender;
let pickerTypeFilter = "all";
let editorEl, editorBody, editorSprite, editorTitle, editorTypes, editorCtx = null;

export function mountTeamBuilder(container) {
  root = el("div", { class: "teamz", hidden: true, role: "dialog", "aria-modal": "true", "aria-label": "Montar times de batalha" });
  container.append(root);
  buildTop();
  buildPicker();
  buildEditor();

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || root.hidden) return;
    if (!pickerEl.hidden) closePicker();
    else if (!editorEl.hidden) closeEditor();
    else closeAll();
  });

  return { open: openBuilder, close: closeAll };
}

/* ---------------- topo: navegação entre times ---------------- */
function buildTop() {
  const back = el("button", { type: "button", class: "teamz__back", onclick: closeAll }, "← Voltar à Pokédex");

  teamSelect = el("select", {
    class: "teamz__select", "aria-label": "Time selecionado",
    onchange: () => { teamsStore.setActiveId(teamSelect.value); syncTeam(); },
  });
  const newBtn = el("button", { type: "button", class: "teamz__btn", onclick: onNewTeam, title: "Criar novo time" }, "+ Novo");
  const delBtn = el("button", { type: "button", class: "teamz__btn teamz__btn--danger", onclick: onDeleteTeam, title: "Excluir este time" }, "Excluir");

  nameInput = el("input", {
    class: "teamz__name", type: "text", maxlength: "24", "aria-label": "Nome do time", placeholder: "Nome do time",
    oninput: () => { boxTitle.textContent = nameInput.value; },
    onchange: () => {
      teamsStore.renameTeam(teamsStore.getActiveId(), nameInput.value);
      syncTeamSelect();
    },
  });

  const top = el("div", { class: "teamz__top" },
    back,
    el("div", { class: "teamz__switch" }, teamSelect, newBtn, delBtn),
    nameInput,
  );

  boxTitle = el("span", { class: "pcbox__title" });
  grid = el("div", { class: "pcbox__grid" });
  const box = el("div", { class: "pcbox" },
    el("div", { class: "pcbox__fold", "aria-hidden": "true" }),
    el("div", { class: "pcbox__head" }, boxTitle),
    grid,
  );

  root.append(top, el("div", { class: "teamz__body" }, box));
}

function syncTeamSelect() {
  clear(teamSelect);
  for (const t of teamsStore.listTeams()) teamSelect.append(el("option", { value: t.id }, t.name));
  teamSelect.value = teamsStore.getActiveId() || "";
}
function syncTeam() {
  const team = teamsStore.getTeam(teamsStore.getActiveId());
  nameInput.value = team ? team.name : "";
  boxTitle.textContent = team ? team.name : "";
  refreshGrid();
}

function onNewTeam() {
  teamsStore.createTeam();
  syncTeamSelect();
  syncTeam();
}
function onDeleteTeam() {
  const team = teamsStore.getTeam(teamsStore.getActiveId());
  if (!team) return;
  if (!confirm(`Excluir o time "${team.name}"? Essa ação não pode ser desfeita.`)) return;
  teamsStore.deleteTeam(team.id);
  if (!teamsStore.listTeams().length) teamsStore.createTeam("Time 1");
  syncTeamSelect();
  syncTeam();
}

/* ---------------- grade de 6 espaços ---------------- */
// duas colunas (esquerda = espaços pares 1/3/5, direita = 2/4/6); a coluna da
// direita desce um pouco (`.pcbox__col--offset`) pra ficar torta, como na
// caixa de referência, em vez de um grid certinho.
function refreshGrid() {
  clear(grid);
  const team = teamsStore.getTeam(teamsStore.getActiveId());
  if (!team) return;
  const colL = el("div", { class: "pcbox__col" });
  const colR = el("div", { class: "pcbox__col pcbox__col--offset" });
  for (let i = 0; i < SLOT_COUNT; i++) (i % 2 === 0 ? colL : colR).append(buildSlotTile(team, i));
  grid.append(colL, colR);
}

function refreshGridTile(idx) {
  const team = teamsStore.getTeam(teamsStore.getActiveId());
  const col = grid.children[idx % 2];
  const posInCol = Math.floor(idx / 2);
  if (!team || !col || !col.children[posInCol]) return refreshGrid();
  col.children[posInCol].replaceWith(buildSlotTile(team, idx));
}

function buildSlotTile(team, idx) {
  const slot = team.slots[idx];
  const mon = resolveMon(slot);

  if (!slot || !mon) {
    return el("button", {
      type: "button", class: "slot slot--empty",
      onclick: () => openSpeciesPicker((pokemonId, formKey) => {
        teamsStore.setSlot(team.id, idx, {
          pokemonId, formKey, item: megaStoneFor(pokemonId, formKey), nature: null,
          evs: { ...teamsStore.EMPTY_EVS }, moves: [...teamsStore.EMPTY_MOVES],
        });
        refreshGrid();
        openEditor(team.id, idx);
      }, { slotLabel: `Espaço ${idx + 1}` }),
    },
      el("span", { class: "slot__plus", "aria-hidden": "true" }, "+"),
      el("span", { class: "slot__label" }, `Espaço ${idx + 1}`),
    );
  }

  const evTotal = STAT_KEYS.reduce((s, k) => s + (slot.evs[k] || 0), 0);
  const itemName = slot.item ? (store.items[slot.item]?.n || slot.item) : "Sem item";
  const abName = slot.ability ? (store.abilities[slot.ability]?.n || capWords(slot.ability)) : "—";
  const natName = slot.nature ? natureLabel(slot.nature) : "—";
  const moveCount = slot.moves.filter(Boolean).length;

  return el("div", { class: "slot slot--filled", style: `--tcol:var(--type-${mon.types[0]})` },
    el("button", {
      type: "button", class: "slot__remove", "aria-label": `Remover ${mon.name} do time`,
      onclick: (e) => { e.stopPropagation(); teamsStore.clearSlot(team.id, idx); refreshGrid(); },
    }, "×"),
    el("button", { type: "button", class: "slot__main", onclick: () => openEditor(team.id, idx) },
      spriteImg(mon.sprite, { class: "slot__sprite", alt: "" }),
      el("span", { class: "slot__name" }, mon.name),
      el("span", { class: "slot__typerow" }, ...mon.types.map((t) => typeSymbol(t))),
      el("span", { class: "slot__meta" },
        el("span", { class: "slot__metarow" }, el("b", {}, "Item: "), itemName),
        el("span", { class: "slot__metarow" }, el("b", {}, "Hab.: "), abName),
        el("span", { class: "slot__metarow" }, el("b", {}, "Nat.: "), natName),
        el("span", { class: "slot__metarow" }, el("b", {}, "EVs: "), `${evTotal}/508`),
        el("span", { class: "slot__metarow" }, el("b", {}, "Golpes: "), `${moveCount}/4`),
      ),
    ),
  );
}

/* ---------------- editor de um espaço (item / natureza / EVs) ---------------- */
function buildEditor() {
  editorSprite = registerSprite(el("img", { class: "slotEdit__sprite", alt: "" }));
  editorTitle = el("strong", { class: "slotEdit__name" });
  editorTypes = el("span", { class: "slotEdit__types" });
  const swapBtn = el("button", {
    type: "button", class: "slotEdit__swap",
    onclick: () => {
      const slot = teamsStore.getTeam(editorCtx.teamId)?.slots[editorCtx.idx];
      openSpeciesPicker((pokemonId, formKey) => {
        const stone = megaStoneFor(pokemonId, formKey);
        // troca de espécie/forma: golpes e habilidade zeram, porque o learnset e
        // as habilidades legais mudam (uma forma regional, por exemplo, não tem
        // as mesmas habilidades da base)
        const patch = { pokemonId, formKey, moves: [...teamsStore.EMPTY_MOVES], ability: null };
        if (stone) patch.item = stone; // Mega com pedra conhecida: item vira a pedra, sem exceção
        teamsStore.setSlot(editorCtx.teamId, editorCtx.idx, patch);
        refreshGridTile(editorCtx.idx);
        openEditor(editorCtx.teamId, editorCtx.idx);
      }, {
        slotLabel: `Espaço ${editorCtx.idx + 1}`,
        current: slot ? { pokemonId: slot.pokemonId, formKey: slot.formKey } : null,
      });
    },
  }, "Trocar Pokémon");
  const closeBtn = el("button", { type: "button", class: "slotEdit__close", "aria-label": "Fechar", onclick: closeEditor }, "×");

  editorBody = el("div", { class: "slotEdit__body" });

  const head = el("header", { class: "slotEdit__head" },
    editorSprite,
    el("div", { class: "slotEdit__titlewrap" }, editorTitle, editorTypes),
    swapBtn, closeBtn,
  );
  const backdrop = el("div", { class: "slotEdit__backdrop", onclick: closeEditor });
  const card = el("div", { class: "slotEdit__card" }, head, editorBody);
  editorEl = el("div", { class: "slotEdit", hidden: true }, backdrop, card);
  root.append(editorEl);
}

function sectionEl(label, ...content) {
  return el("section", { class: "slotEdit__sec" }, el("h4", { class: "slotEdit__sechead" }, label), ...content);
}
function itemImg(slug, cls = "pk__itemimg") {
  return el("img", {
    src: `assets/items/${slug}.png`, alt: "", class: cls, loading: "lazy",
    onerror: (e) => e.target.remove(),
  });
}

function openEditor(teamId, idx) {
  const team = teamsStore.getTeam(teamId);
  const slot = team?.slots[idx];
  const mon = resolveMon(slot);
  if (!mon) return;
  editorCtx = { teamId, idx };

  editorSprite.dataset.spr = mon.sprite;
  editorSprite.dataset.sprShiny = shinyPath(mon.sprite);
  editorSprite.src = isShiny() ? editorSprite.dataset.sprShiny : mon.sprite;
  editorTitle.textContent = mon.name;
  clear(editorTypes);
  for (const t of mon.types) editorTypes.append(typeSymbol(t));
  clear(editorBody);

  /* item — Mega com pedra conhecida: trava no item certo, sem opção de trocar */
  if (mon.megaStoneSlug && slot.item !== mon.megaStoneSlug) {
    slot.item = mon.megaStoneSlug;
    teamsStore.setSlot(teamId, idx, { item: mon.megaStoneSlug });
    refreshGridTile(idx);
  }
  const locked = !!mon.megaStoneSlug;
  const itemBtn = el("button", { type: "button", class: "slotEdit__itembtn", disabled: locked });
  const itemDesc = el("p", { class: "slotEdit__itemdesc" });
  const syncItemBtn = () => {
    clear(itemBtn);
    if (slot.item) {
      itemBtn.append(itemImg(slot.item), el("span", {}, store.items[slot.item]?.n || slot.item));
      itemDesc.textContent = store.items[slot.item]?.d || "";
    } else {
      itemBtn.append(el("span", { class: "slotEdit__itemplaceholder" }, "Escolher item…"));
      itemDesc.textContent = "";
    }
  };
  syncItemBtn();
  if (!locked) {
    itemBtn.onclick = () => openItemPicker((slug) => {
      slot.item = slug;
      teamsStore.setSlot(teamId, idx, { item: slug });
      syncItemBtn();
      refreshGridTile(idx);
    }, { pokemonId: slot.pokemonId, types: mon.types, stats: mon.stats });
  }
  editorBody.append(sectionEl("Item", el("div", { class: "slotEdit__itemrow" }, itemBtn), itemDesc,
    locked ? el("p", { class: "slotEdit__note" }, "Mega Evolução — o item é sempre essa pedra, não dá pra trocar.") : null));

  /* habilidade — chips com todas as habilidades legais da forma; a
     descrição da escolhida some embaixo. Mega tem habilidade fixa (trava,
     igual ao item); formas regionais/alternativas ainda não têm esse dado
     na base, então mostram só um aviso em vez de opções. */
  const abilities = mon.abilities || [];
  const abilityLocked = !!mon.abilityLocked;
  if (abilityLocked && abilities.length && slot.ability !== abilities[0].slug) {
    slot.ability = abilities[0].slug;
    teamsStore.setSlot(teamId, idx, { ability: abilities[0].slug });
    refreshGridTile(idx);
  }
  const abilityRow = el("div", { class: "builds__itemrow" });
  const abilityDesc = el("p", { class: "slotEdit__itemdesc" });
  const syncAbilityUI = () => {
    clear(abilityRow);
    if (!abilities.length) { abilityDesc.textContent = ""; return; }
    const cur = abilities.find((a) => a.slug === slot.ability) || abilities[0];
    for (const a of abilities) {
      const info = store.abilities[a.slug];
      abilityRow.append(el("button", {
        type: "button",
        class: "builds__itemchip" + (a.slug === cur.slug ? " is-active" : ""),
        "aria-pressed": String(a.slug === cur.slug),
        disabled: abilityLocked || undefined,
        onclick: () => {
          slot.ability = a.slug;
          teamsStore.setSlot(teamId, idx, { ability: a.slug });
          refreshGridTile(idx);
          syncAbilityUI();
        },
      },
        el("span", {}, info?.n || capWords(a.slug)),
        a.hidden ? el("span", { class: "builds__hidden" }, "oculta") : null,
      ));
    }
    abilityDesc.textContent = store.abilities[cur.slug]?.short || "";
  };
  syncAbilityUI();
  loadBuildsData().then(() => { if (editorCtx?.teamId === teamId && editorCtx?.idx === idx) syncAbilityUI(); });
  editorBody.append(sectionEl("Habilidade", abilityRow, abilityDesc,
    !abilities.length
      ? el("p", { class: "slotEdit__note" }, `Habilidades de ${mon.name} ainda não estão na nossa base de dados.`)
      : abilityLocked
        ? el("p", { class: "slotEdit__note" }, "Mega Evolução — a habilidade muda automaticamente, não dá pra trocar.")
        : null));

  /* natureza */
  const natSel = el("select", { class: "slotEdit__natsel" },
    el("optgroup", { label: "Neutra (sem efeito)" },
      ...NEUTRAL_NATURES.map((k) => el("option", { value: k }, NATURE_NEUTRAL_NAME[k]))),
    el("optgroup", { label: "Com efeito" },
      ...Object.keys(NATURE_EFFECT).sort((a, b) => NATURE_NAME[a].localeCompare(NATURE_NAME[b])).map((k) => {
        const [p, m] = NATURE_EFFECT[k];
        return el("option", { value: k }, `${NATURE_NAME[k]} (+${STAT_ABBR[p]} / −${STAT_ABBR[m]})`);
      })),
  );
  natSel.value = slot.nature || "hardy";
  const natHint = el("span", { class: "slotEdit__nathint" });
  const syncNatHint = () => {
    const eff = NATURE_EFFECT[natSel.value];
    natHint.textContent = eff ? `+${STAT_FULL[eff[0]]} · −${STAT_FULL[eff[1]]}` : "Sem efeito nos stats.";
  };
  syncNatHint();
  natSel.onchange = () => {
    teamsStore.setSlot(teamId, idx, { nature: natSel.value });
    syncNatHint();
    renderStats();
    refreshGridTile(idx);
  };
  editorBody.append(sectionEl("Natureza", natSel, natHint));

  /* EVs / stats finais */
  const budgetEl = el("span", { class: "slotEdit__budget" });
  const rows = {};
  const statsWrap = el("div", { class: "slotEdit__stats" });
  for (const k of STAT_KEYS) {
    const input = el("input", {
      type: "number", min: "0", max: "252", step: "4", class: "slotEdit__evinput",
      value: String(slot.evs[k] || 0),
    });
    const finalVal = el("span", { class: "slotEdit__finalval" });
    rows[k] = finalVal;
    input.addEventListener("input", () => {
      let v = Math.max(0, Math.min(252, Math.floor(Number(input.value) || 0)));
      const others = STAT_KEYS.filter((x) => x !== k).reduce((s, x) => s + (slot.evs[x] || 0), 0);
      if (others + v > 508) v = Math.max(0, 508 - others);
      input.value = String(v);
      slot.evs = { ...slot.evs, [k]: v };
      teamsStore.setSlot(teamId, idx, { evs: slot.evs });
      renderStats();
      refreshGridTile(idx);
    });
    statsWrap.append(el("div", { class: "slotEdit__statrow" },
      el("span", { class: "slotEdit__statname" }, STAT_ABBR[k]),
      el("span", { class: "slotEdit__base", title: STAT_FULL[k] }, String(mon.stats[k])),
      input,
      finalVal,
    ));
  }
  function renderStats() {
    const total = STAT_KEYS.reduce((s, k) => s + (slot.evs[k] || 0), 0);
    budgetEl.textContent = `${total} / 508 EVs usadas`;
    budgetEl.classList.toggle("is-full", total >= 508);
    const finals = computeFinalStats(mon.stats, slot.evs, natSel.value);
    for (const k of STAT_KEYS) rows[k].textContent = finals[k];
  }
  renderStats();
  editorBody.append(sectionEl("Stats (EVs)", budgetEl, statsWrap,
    el("p", { class: "slotEdit__note" }, "Calculado com IV 31 (perfeito) e Nível 100, como em batalha.")));

  /* golpes — só os que essa forma específica realmente aprende (nível, MT,
     tutor ou ovo, em algum jogo); formas regionais e variações pós-evolução
     têm seu próprio learnset, não o da espécie base. Cada espaço abre o
     mesmo seletor de busca usado pra item/Pokémon, filtrado pro golpe. */
  const legalMoves = legalMovesFor(slot.pokemonId, slot.formKey);
  const movesWrap = el("div", { class: "slotEdit__movegrid" });
  for (let i = 0; i < 4; i++) {
    const setMove = (slug) => {
      const moves = [...slot.moves];
      moves[i] = slug;
      slot.moves = moves;
      teamsStore.setSlot(teamId, idx, { moves });
      syncSlot();
      refreshGridTile(idx);
    };
    const mainBtn = el("button", { type: "button", class: "slotEdit__movemain" });
    const clearBtn = el("button", {
      type: "button", class: "slotEdit__moveclear", "aria-label": `Remover golpe ${i + 1}`, title: "Remover golpe",
      onclick: (e) => { e.stopPropagation(); setMove(null); },
    }, "×");
    const wrap = el("div", { class: "slotEdit__moveslot" }, mainBtn, clearBtn);
    const syncSlot = () => {
      clear(mainBtn);
      const m = legalMoves.find((x) => x.slug === slot.moves[i]);
      wrap.classList.toggle("has-move", !!m);
      wrap.style.setProperty("--tcol", m ? `var(--type-${m.t})` : "");
      clearBtn.hidden = !m;
      mainBtn.append(m
        ? el("div", { class: "slotEdit__moverow" },
          typeSymbol(m.t),
          el("span", { class: "slotEdit__movename" }, m.n),
          el("span", { class: "slotEdit__movemeta" },
            m.p ? el("span", { class: "slotEdit__movepow" }, String(m.p)) : el("span", { class: "slotEdit__movepow is-dash" }, "—"),
            el("span", { class: "slotEdit__movecat" }, CAT_PT[m.c] || ""),
          ),
        )
        : el("div", { class: "slotEdit__moverow" },
          el("span", { class: "slotEdit__moveplus", "aria-hidden": "true" }, "+"),
          el("span", { class: "slotEdit__moveplaceholder" }, `Golpe ${i + 1}`),
        ));
    };
    mainBtn.onclick = () => openMovePicker(setMove, {
      legalMoves, exclude: slot.moves.filter((v, j) => j !== i && v),
    });
    syncSlot();
    movesWrap.append(wrap);
  }
  editorBody.append(sectionEl("Golpes", movesWrap,
    el("p", { class: "slotEdit__note" },
      legalMoves.length
        ? `Só golpes que ${mon.name} realmente aprende (nível, MT, tutor ou ovo, em algum jogo) — sem repetir golpe no time.`
        : `Sem dados de golpes conhecidos para ${mon.name}.`)));

  editorEl.hidden = false;
}

function closeEditor() {
  editorEl.hidden = true;
  editorCtx = null;
}

function computeFinalStats(base, evs, natureKey) {
  const eff = NATURE_EFFECT[natureKey] || null;
  const out = {};
  for (const k of STAT_KEYS) {
    const ev = evs[k] || 0;
    if (k === "hp") {
      out.hp = base.hp <= 1 ? base.hp
        : Math.floor(((2 * base.hp + IV + Math.floor(ev / 4)) * LEVEL) / 100) + LEVEL + 10;
    } else {
      const raw = Math.floor(((2 * base[k] + IV + Math.floor(ev / 4)) * LEVEL) / 100) + 5;
      const mod = eff ? (eff[0] === k ? 1.1 : eff[1] === k ? 0.9 : 1) : 1;
      out[k] = Math.floor(raw * mod);
    }
  }
  return out;
}

/* ---------------- seletor genérico (Pokémon / item) ---------------- */
function buildPicker() {
  pickerTitle = el("h3", { class: "pk__title" });
  pickerSearch = el("input", { class: "pk__search", type: "search", placeholder: "Buscar…", autocomplete: "off" });
  const closeBtn = el("button", { type: "button", class: "pk__close", "aria-label": "Fechar busca", onclick: closePicker }, "×");
  const searchRow = el("div", { class: "pk__searchrow" },
    el("span", { class: "pk__searchicon", "aria-hidden": "true" }, "›"),
    pickerSearch,
  );

  pickerTypebar = el("nav", { class: "pk__typebar", hidden: true, "aria-label": "Filtrar por tipo" },
    el("button", {
      type: "button", class: "pk__typebtn is-active", dataset: { t: "all" },
      onclick: () => setPickerType("all"),
    }, "Todos"),
    ...TYPES.map((t) => el("button", {
      type: "button", class: "pk__typebtn", dataset: { t },
      onclick: () => setPickerType(t),
    }, TYPE_LABEL[t])),
  );
  // arrasta com o mouse pra rolar os tipos (trackpad/touch já rolam nativamente,
  // e a roda vertical do mouse também vira scroll horizontal aqui)
  pickerTypebar.addEventListener("wheel", (e) => {
    if (!e.deltaY) return;
    e.preventDefault();
    pickerTypebar.scrollLeft += e.deltaY;
  }, { passive: false });
  let dragX = 0, dragScroll = 0, dragging = false, dragMoved = false;
  pickerTypebar.addEventListener("pointerdown", (e) => {
    dragging = true; dragMoved = false;
    dragX = e.clientX; dragScroll = pickerTypebar.scrollLeft;
  });
  pickerTypebar.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragX;
    if (Math.abs(dx) > 4) dragMoved = true;
    if (dragMoved) {
      pickerTypebar.classList.add("is-dragging");
      pickerTypebar.scrollLeft = dragScroll - dx;
    }
  });
  const endDrag = () => { dragging = false; pickerTypebar.classList.remove("is-dragging"); };
  pickerTypebar.addEventListener("pointerup", endDrag);
  pickerTypebar.addEventListener("pointerleave", endDrag);
  // depois de arrastar, o click seguinte no botão não deve contar como escolha
  pickerTypebar.addEventListener("click", (e) => { if (dragMoved) { e.preventDefault(); e.stopPropagation(); dragMoved = false; } }, true);

  pickerList = el("div", { class: "pk__list" });

  pickerSearch.addEventListener("input", debounce(() => {
    if (pickerRender) pickerRender(pickerSearch.value.trim().toLowerCase());
  }, 100));

  pickerCard = el("div", { class: "pk__card" },
    el("div", { class: "pk__head" }, pickerTitle, closeBtn),
    searchRow,
    pickerTypebar,
    pickerList,
  );
  const backdrop = el("div", { class: "pk__backdrop", onclick: closePicker });
  pickerEl = el("div", { class: "pk", hidden: true }, backdrop, pickerCard);
  root.append(pickerEl);
}

function setPickerType(t) {
  pickerTypeFilter = t;
  for (const b of pickerTypebar.children) b.classList.toggle("is-active", b.dataset.t === t);
  if (pickerRender) pickerRender(pickerSearch.value.trim().toLowerCase());
}

function openPicker(title, renderFn, placeholder, { grid = false, typebar = grid } = {}) {
  pickerTitle.textContent = title;
  pickerSearch.value = "";
  pickerSearch.placeholder = placeholder || "Buscar…";
  pickerRender = renderFn;
  pickerTypeFilter = "all";
  pickerTypebar.hidden = !typebar;
  for (const b of pickerTypebar.children) b.classList.toggle("is-active", b.dataset.t === "all");
  pickerList.classList.toggle("pk__list--grid", grid);
  pickerCard.classList.toggle("pk__card--grid", grid);
  renderFn("");
  pickerEl.hidden = false;
  // só foca (e abre o teclado) em quem tem ponteiro fino de verdade — em
  // touch isso cobria a tela com o teclado assim que o seletor abria.
  if (matchMedia("(pointer: fine)").matches) {
    requestAnimationFrame(() => pickerSearch.focus());
  }
}
function closePicker() {
  pickerEl.hidden = true;
  pickerRender = null;
}

function speciesRowBtn(r, onPick) {
  return el("button", {
    type: "button", class: "pk__row", style: `--tcol:var(--type-${r.types[0]})`,
    onclick: () => { closePicker(); onPick(r.pokemonId, r.formKey); },
  },
    spriteImg(r.sprite, { class: "pk__sprite", alt: "", loading: "lazy" }),
    el("span", { class: "pk__rowname" }, r.name),
    el("span", { class: "pk__rownum" }, r.formKey ? "" : "#" + pad3(r.pokemonId)),
    el("span", { class: "pk__rowtypes" }, ...r.types.map((t) => typeSymbol(t))),
  );
}

function speciesGridCardBtn(r, onPick, isSelected) {
  const isFav = favorites.isFavorite(r.pokemonId, r.formKey);
  const favBtn = el("button", {
    type: "button", class: "pk__gridfav" + (isFav ? " is-fav" : ""),
    "aria-label": isFav ? "Remover dos favoritos" : "Favoritar", title: isFav ? "Remover dos favoritos" : "Favoritar",
    "aria-pressed": String(isFav),
    onclick: (e) => {
      e.stopPropagation();
      favorites.toggleFavorite(r.pokemonId, r.formKey);
      if (pickerRender) pickerRender(pickerSearch.value.trim().toLowerCase());
    },
  }, "★");

  const pickBtn = el("button", {
    type: "button", class: "pk__gridpick",
    onclick: () => { closePicker(); onPick(r.pokemonId, r.formKey); },
  },
    spriteImg(r.sprite, { class: "pk__gridsprite", alt: "", loading: "lazy" }),
    el("span", { class: "pk__gridname" }, r.name),
    el("span", { class: "pk__gridnum" }, r.formKey ? "" : "#" + pad4(r.pokemonId)),
  );

  return el("div", {
    class: "pk__gridcard" + (isSelected ? " is-sel" : ""),
    style: `--tcol:var(--type-${r.types[0]})`,
  }, favBtn, pickBtn);
}

// opts.slotLabel: rótulo do espaço (ex.: "Espaço 1") pro título do seletor.
// opts.current: {pokemonId, formKey} do Pokémon já no espaço, pra vir destacado na grade.
function openSpeciesPicker(onPick, opts = {}) {
  const title = opts.slotLabel ? `Escolher Pokémon — ${opts.slotLabel}` : "Escolher Pokémon";
  openPicker(title, (q) => {
    clear(pickerList);
    const filtered = allSpeciesRows(q).filter(
      (r) => pickerTypeFilter === "all" || r.types.includes(pickerTypeFilter),
    );
    if (!filtered.length) { pickerList.append(el("p", { class: "pk__empty" }, "Nenhum Pokémon encontrado.")); return; }

    const favs = filtered.filter((r) => favorites.isFavorite(r.pokemonId, r.formKey));
    const rest = filtered.filter((r) => !favorites.isFavorite(r.pokemonId, r.formKey));

    const appendCard = (r) => {
      const isSelected = !!opts.current
        && opts.current.pokemonId === r.pokemonId
        && (opts.current.formKey || null) === (r.formKey || null);
      pickerList.append(speciesGridCardBtn(r, onPick, isSelected));
    };
    // favoritos primeiro, numa seção separada — só aparece quando há algum
    if (favs.length) {
      pickerList.append(el("p", { class: "pk__group pk__group--grid" }, "Favoritos"));
      favs.forEach(appendCard);
      pickerList.append(el("p", { class: "pk__group pk__group--grid" }, "Todos"));
    }
    rest.forEach(appendCard);
  }, "Buscar por nome ou número", { grid: true });
}

const ORDINAL = ["1º", "2º", "3º"];

// mesmo cartão de grade do seletor de Pokémon: ícone + nome + estrela de
// favorito; opts.rank marca o selo de recomendado (1º/2º/3º) quando presente.
function itemGridCardBtn(slug, onPick, opts = {}) {
  const it = store.items[slug];
  const isFav = favorites.isItemFavorite(slug);
  const favBtn = el("button", {
    type: "button", class: "pk__gridfav" + (isFav ? " is-fav" : ""),
    "aria-label": isFav ? "Remover dos favoritos" : "Favoritar", title: isFav ? "Remover dos favoritos" : "Favoritar",
    "aria-pressed": String(isFav),
    onclick: (e) => {
      e.stopPropagation();
      favorites.toggleItemFavorite(slug);
      if (pickerRender) pickerRender(pickerSearch.value.trim().toLowerCase());
    },
  }, "★");

  const title = [it?.d, opts.why].filter(Boolean).join(" — ") || undefined;
  const pickBtn = el("button", {
    type: "button", class: "pk__gridpick", title,
    onclick: () => { closePicker(); onPick(slug); },
  },
    itemImg(slug, "pk__griditemimg"),
    el("span", { class: "pk__gridname" }, it?.n || slug),
  );

  const recBadge = opts.rank ? el("span", { class: "pk__gridrec" }, ORDINAL[opts.rank - 1] || `${opts.rank}º`) : null;

  return el("div", { class: "pk__gridcard" }, favBtn, recBadge, pickBtn);
}

// sugestão automática (mesma heurística da aba Builds) pro item de UM
// Pokémon específico — sempre na geração mais atual, já que o montador de
// times não tem um jogo selecionado.
function recommendedItemsFor(pokemonId, types, stats) {
  const base = store.byId.get(pokemonId);
  const pseudo = { id: base?.id ?? pokemonId, evolutionChainId: base?.evolutionChainId ?? null, types, stats };
  return recommendItem(pseudo, 9).list;
}

// todos os itens buscáveis (sem Mega Stones — cada uma já é travada automático),
// filtrados pelo nome como allSpeciesRows faz com os Pokémon.
function allItemRows(q) {
  const stones = allMegaStoneSlugs();
  return Object.entries(store.items || {})
    .filter(([slug]) => !stones.has(slug))
    .filter(([slug, it]) => !q || nameStarts(it.n, q) || slug.startsWith(q))
    .map(([slug, it]) => ({ slug, name: it.n }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function openItemPicker(onPick, recFor) {
  loadBuildsData().then(() => { if (pickerRender) pickerRender(pickerSearch.value.trim().toLowerCase()); });
  openPicker("Escolher item", (q) => {
    clear(pickerList);
    pickerList.append(el("button", {
      type: "button", class: "pk__row pk__row--none",
      onclick: () => { closePicker(); onPick(null); },
    }, el("span", { class: "pk__noneico" }, "—"), el("span", { class: "pk__rowname" }, "Nenhum item")));

    const all = allItemRows(q);
    if (!all.length) { pickerList.append(el("p", { class: "pk__empty" }, "Nenhum item encontrado.")); return; }
    const allSlugs = new Set(all.map((r) => r.slug));

    // recomendados e favoritos ficam em seções à parte, como no seletor de
    // Pokémon — o resto (Todos) entra depois, sem repetir quem já apareceu.
    const recs = recFor
      ? recommendedItemsFor(recFor.pokemonId, recFor.types, recFor.stats).filter((r) => allSlugs.has(r.slug))
      : [];
    const recSlugs = new Set(recs.map((r) => r.slug));
    const favSlugs = favorites.listItemFavorites().filter((slug) => allSlugs.has(slug) && !recSlugs.has(slug));
    const shown = new Set([...recSlugs, ...favSlugs]);
    const rest = all.filter((r) => !shown.has(r.slug));

    if (recs.length) {
      pickerList.append(el("p", { class: "pk__group pk__group--grid" }, "Recomendados pra esse Pokémon"));
      recs.forEach((r, i) => pickerList.append(itemGridCardBtn(r.slug, onPick, { rank: i + 1, why: r.why })));
    }
    if (favSlugs.length) {
      pickerList.append(el("p", { class: "pk__group pk__group--grid" }, "Favoritos"));
      favSlugs.forEach((slug) => pickerList.append(itemGridCardBtn(slug, onPick)));
    }
    if (rest.length) {
      pickerList.append(el("p", { class: "pk__group pk__group--grid" }, "Todos"));
      rest.forEach((r) => pickerList.append(itemGridCardBtn(r.slug, onPick)));
    }
  }, "Buscar item por nome", { grid: true, typebar: false });
}

function moveRowBtn(m, onPick) {
  return el("button", {
    type: "button", class: "pk__row", style: `--tcol:var(--type-${m.t})`,
    onclick: () => { closePicker(); onPick(m.slug); },
  },
    typeSymbol(m.t),
    el("span", { class: "pk__rowname" }, m.n),
    el("span", { class: "pk__rowmeta" },
      m.p ? el("span", { class: "pk__movepow" }, String(m.p)) : el("span", { class: "pk__movepow is-dash" }, "—"),
      el("span", { class: "pk__movecat" }, CAT_PT[m.c] || ""),
    ),
  );
}

// opts.legalMoves: golpes que essa forma específica pode aprender de verdade
// (vem de legalMovesFor). opts.exclude: golpes já usados nos OUTROS espaços
// de golpe do mesmo Pokémon — não dá pra repetir golpe no time.
function openMovePicker(onPick, { legalMoves, exclude }) {
  openPicker("Escolher golpe", (q) => {
    clear(pickerList);
    pickerList.append(el("button", {
      type: "button", class: "pk__row pk__row--none",
      onclick: () => { closePicker(); onPick(null); },
    }, el("span", { class: "pk__noneico" }, "—"), el("span", { class: "pk__rowname" }, "Nenhum golpe")));

    const avail = legalMoves.filter((m) => !exclude.includes(m.slug));
    const filtered = q ? avail.filter((m) => nameStarts(m.n, q)) : avail;
    if (!filtered.length) {
      pickerList.append(el("p", { class: "pk__empty" },
        q ? "Nenhum golpe encontrado." : "Sem golpes legais disponíveis pra esse espaço."));
      return;
    }
    for (const m of filtered) pickerList.append(moveRowBtn(m, onPick));
  }, "Buscar golpe por nome");
}

/* ---------------- abrir / fechar o menu inteiro ---------------- */
function openBuilder() {
  if (!teamsStore.listTeams().length) teamsStore.createTeam("Time 1");
  syncTeamSelect();
  syncTeam();
  root.hidden = false;
  document.documentElement.classList.add("teamz-open");
  loadBuildsData().then(() => { if (!root.hidden) refreshGrid(); });
}
function closeAll() {
  pickerEl.hidden = true;
  editorEl.hidden = true;
  editorCtx = null;
  root.hidden = true;
  document.documentElement.classList.remove("teamz-open");
}
