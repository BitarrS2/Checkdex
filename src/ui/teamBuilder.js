// "Times de batalha": monta e salva times de até 6 Pokémon com item, natureza
// e EVs por espaço. Layout inspirado numa caixa de PC de batalha (grade de
// espaços dentro de uma caixa), no mesmo estilo visual do resto do site.
// Stats finais calculados com IV 31 (perfeito) e Nível 100 fixos — só as EVs
// e a Natureza mudam o resultado, como nas outras ferramentas de build do site.

import { el, clear, debounce, pad3 } from "./dom.js";
import { store, loadBuildsData } from "../data.js";
import { spriteImg } from "./sprite.js";
import { typeSymbol } from "./types.js";
import { STAT_KEYS, STAT_ABBR, STAT_FULL, NATURE_NAME, NATURE_EFFECT, slugName, recommendItem } from "./builds.js";
import * as teamsStore from "../teams.js";
import * as favorites from "../favorites.js";

const LEVEL = 100;
const IV = 31;
const SLOT_COUNT = 6;

const NEUTRAL_NATURES = ["hardy", "docile", "serious", "bashful", "quirky"];
const NATURE_NEUTRAL_NAME = {
  hardy: "Hardy", docile: "Docile", serious: "Serious", bashful: "Bashful", quirky: "Quirky",
};
const natureLabel = (key) => NATURE_NAME[key] || NATURE_NEUTRAL_NAME[key] || key;

// Um slot pode guardar a espécie base, uma Mega Evolução ou uma forma regional
// — todas achatadas num mesmo formato "mon-like" pra renderizar igual.
// `megaStoneSlug` só existe pras Megas com pedra conhecida — trava o item.
function resolveMon(slot) {
  if (!slot) return null;
  if (slot.formKey) {
    const mega = (store.megas[slot.pokemonId] || []).find((m) => m.key === slot.formKey);
    if (mega) return {
      name: mega.name, types: mega.types, stats: mega.stats, sprite: mega.sprite,
      megaStoneSlug: mega.stone ? slugName(mega.stone) : null,
    };
    const reg = (store.regionals[slot.pokemonId] || []).find((r) => r.key === slot.formKey);
    if (reg) return { name: reg.name, types: reg.types, stats: reg.stats, sprite: reg.sprite, megaStoneSlug: null };
    return null;
  }
  const p = store.byId.get(slot.pokemonId);
  return p ? { name: p.name, types: p.types, stats: p.stats, sprite: p.sprite, megaStoneSlug: null } : null;
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

// Todas as espécies base + Megas + formas regionais, achatadas numa lista
// buscável só por nome (id serve pro número de referência das espécies base).
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
  rows.sort((a, b) => a.num - b.num || (a.formKey ? 1 : 0) - (b.formKey ? 1 : 0));
  return rows;
}

// Uma linha de resultado a partir de {pokemonId, formKey} — resolve espécie
// base / Mega / regional pro mesmo formato de linha do buscador.
function rowFor(pokemonId, formKey) {
  if (formKey) {
    const mega = (store.megas[pokemonId] || []).find((m) => m.key === formKey);
    if (mega) return { pokemonId, formKey, name: mega.name, sprite: mega.sprite, types: mega.types, num: pokemonId };
    const reg = (store.regionals[pokemonId] || []).find((r) => r.key === formKey);
    if (reg) return { pokemonId, formKey, name: reg.name, sprite: reg.sprite, types: reg.types, num: pokemonId };
    return null;
  }
  const p = store.byId.get(pokemonId);
  return p ? { pokemonId, formKey: null, name: p.name, sprite: p.sprite, types: p.types, num: pokemonId } : null;
}

// Pokémon favoritados, prontos pra lista (aparecem antes de digitar qualquer
// busca — um favorito que já não existe mais em nenhum dado é descartado).
function favoriteRows() {
  return favorites.listFavorites()
    .map((f) => rowFor(f.pokemonId, f.formKey))
    .filter(Boolean)
    .sort((a, b) => a.num - b.num || (a.formKey ? 1 : 0) - (b.formKey ? 1 : 0));
}

let root, grid, nameInput, teamSelect, boxTitle;
let pickerEl, pickerSearch, pickerList, pickerTitle, pickerRender;
let editorEl, editorBody, editorSprite, editorTitle, editorTypes, editorFav, editorCtx = null;

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
          pokemonId, formKey, item: megaStoneFor(pokemonId, formKey), nature: null, evs: { ...teamsStore.EMPTY_EVS },
        });
        refreshGrid();
        openEditor(team.id, idx);
      }),
    },
      el("span", { class: "slot__plus", "aria-hidden": "true" }, "+"),
      el("span", { class: "slot__label" }, `Espaço ${idx + 1}`),
    );
  }

  const evTotal = STAT_KEYS.reduce((s, k) => s + (slot.evs[k] || 0), 0);
  const itemName = slot.item ? (store.items[slot.item]?.n || slot.item) : "Sem item";
  const natName = slot.nature ? natureLabel(slot.nature) : "—";

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
        el("span", { class: "slot__metarow" }, el("b", {}, "Nat.: "), natName),
        el("span", { class: "slot__metarow" }, el("b", {}, "EVs: "), `${evTotal}/508`),
      ),
    ),
  );
}

/* ---------------- editor de um espaço (item / natureza / EVs) ---------------- */
function buildEditor() {
  editorSprite = el("img", { class: "slotEdit__sprite", alt: "" });
  editorTitle = el("strong", { class: "slotEdit__name" });
  editorTypes = el("span", { class: "slotEdit__types" });
  editorFav = el("button", {
    type: "button", class: "slotEdit__fav", "aria-label": "Favoritar Pokémon", title: "Favoritar",
    onclick: () => {
      const { teamId, idx } = editorCtx;
      const slot = teamsStore.getTeam(teamId)?.slots[idx];
      if (!slot) return;
      favorites.toggleFavorite(slot.pokemonId, slot.formKey);
      syncFavBtn(slot);
    },
  }, "★");
  const swapBtn = el("button", {
    type: "button", class: "slotEdit__swap",
    onclick: () => openSpeciesPicker((pokemonId, formKey) => {
      const stone = megaStoneFor(pokemonId, formKey);
      const patch = { pokemonId, formKey };
      if (stone) patch.item = stone; // Mega com pedra conhecida: item vira a pedra, sem exceção
      teamsStore.setSlot(editorCtx.teamId, editorCtx.idx, patch);
      refreshGridTile(editorCtx.idx);
      openEditor(editorCtx.teamId, editorCtx.idx);
    }),
  }, "Trocar Pokémon");
  const closeBtn = el("button", { type: "button", class: "slotEdit__close", "aria-label": "Fechar", onclick: closeEditor }, "×");

  editorBody = el("div", { class: "slotEdit__body" });

  const head = el("header", { class: "slotEdit__head" },
    editorSprite,
    el("div", { class: "slotEdit__titlewrap" }, editorTitle, editorTypes),
    editorFav, swapBtn, closeBtn,
  );
  const backdrop = el("div", { class: "slotEdit__backdrop", onclick: closeEditor });
  const card = el("div", { class: "slotEdit__card" }, head, editorBody);
  editorEl = el("div", { class: "slotEdit", hidden: true }, backdrop, card);
  root.append(editorEl);
}

function syncFavBtn(slot) {
  const on = favorites.isFavorite(slot.pokemonId, slot.formKey);
  editorFav.classList.toggle("is-fav", on);
  editorFav.setAttribute("aria-pressed", String(on));
  editorFav.title = on ? "Remover dos favoritos" : "Favoritar";
}

function sectionEl(label, ...content) {
  return el("section", { class: "slotEdit__sec" }, el("h4", { class: "slotEdit__sechead" }, label), ...content);
}
function itemImg(slug) {
  return el("img", {
    src: `assets/items/${slug}.png`, alt: "", class: "pk__itemimg", loading: "lazy",
    onerror: (e) => e.target.remove(),
  });
}

function openEditor(teamId, idx) {
  const team = teamsStore.getTeam(teamId);
  const slot = team?.slots[idx];
  const mon = resolveMon(slot);
  if (!mon) return;
  editorCtx = { teamId, idx };

  editorSprite.src = mon.sprite;
  editorTitle.textContent = mon.name;
  syncFavBtn(slot);
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
  const itemFavBtn = el("button", {
    type: "button", class: "slotEdit__fav slotEdit__fav--sm", "aria-label": "Favoritar item", title: "Favoritar item",
    onclick: () => { favorites.toggleItemFavorite(slot.item); syncItemFav(); },
  }, "★");
  const syncItemFav = () => {
    const show = !locked && !!slot.item;
    itemFavBtn.hidden = !show;
    const on = show && favorites.isItemFavorite(slot.item);
    itemFavBtn.classList.toggle("is-fav", !!on);
    itemFavBtn.setAttribute("aria-pressed", String(!!on));
  };
  const syncItemBtn = () => {
    clear(itemBtn);
    if (slot.item) {
      itemBtn.append(itemImg(slot.item), el("span", {}, store.items[slot.item]?.n || slot.item));
      itemDesc.textContent = store.items[slot.item]?.d || "";
    } else {
      itemBtn.append(el("span", { class: "slotEdit__itemplaceholder" }, "Escolher item…"));
      itemDesc.textContent = "";
    }
    syncItemFav();
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
  editorBody.append(sectionEl("Item", el("div", { class: "slotEdit__itemrow" }, itemBtn, itemFavBtn), itemDesc,
    locked ? el("p", { class: "slotEdit__note" }, "Mega Evolução — o item é sempre essa pedra, não dá pra trocar.") : null));

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
  pickerList = el("div", { class: "pk__list" });

  pickerSearch.addEventListener("input", debounce(() => {
    if (pickerRender) pickerRender(pickerSearch.value.trim().toLowerCase());
  }, 100));

  const card = el("div", { class: "pk__card" },
    el("div", { class: "pk__head" }, pickerTitle, closeBtn),
    pickerSearch,
    pickerList,
  );
  const backdrop = el("div", { class: "pk__backdrop", onclick: closePicker });
  pickerEl = el("div", { class: "pk", hidden: true }, backdrop, card);
  root.append(pickerEl);
}

function openPicker(title, renderFn, placeholder) {
  pickerTitle.textContent = title;
  pickerSearch.value = "";
  pickerSearch.placeholder = placeholder || "Buscar…";
  pickerRender = renderFn;
  renderFn("");
  pickerEl.hidden = false;
  requestAnimationFrame(() => pickerSearch.focus());
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

function openSpeciesPicker(onPick) {
  openPicker("Escolher Pokémon", (q) => {
    clear(pickerList);
    if (!q) {
      const favs = favoriteRows();
      if (!favs.length) {
        pickerList.append(el("p", { class: "pk__empty" }, "Digite um nome ou número pra buscar. Favorite (★) um Pokémon no editor pra ele aparecer aqui."));
        return;
      }
      pickerList.append(el("p", { class: "pk__group" }, "Favoritos"));
      for (const r of favs) pickerList.append(speciesRowBtn(r, onPick));
      return;
    }
    const list = allSpeciesRows(q);
    if (!list.length) { pickerList.append(el("p", { class: "pk__empty" }, "Nenhum Pokémon encontrado.")); return; }
    for (const r of list) pickerList.append(speciesRowBtn(r, onPick));
  }, "Buscar Pokémon por nome ou número");
}

function itemRowBtn(slug, onPick) {
  const it = store.items[slug];
  return el("button", {
    type: "button", class: "pk__row",
    onclick: () => { closePicker(); onPick(slug); },
  }, itemImg(slug), el("span", { class: "pk__rowname" }, it?.n || slug));
}

const ORDINAL = ["1º", "2º", "3º"];
function recommendedRowBtn(rec, i, onPick) {
  return el("button", {
    type: "button", class: "pk__row pk__row--rec",
    onclick: () => { closePicker(); onPick(rec.slug); },
  },
    el("span", { class: "pk__recbadge" }, ORDINAL[i] || `${i + 1}º`),
    itemImg(rec.slug),
    el("span", { class: "pk__rowtext" },
      el("span", { class: "pk__rowname" }, rec.name),
      rec.why ? el("span", { class: "pk__rowwhy" }, rec.why) : null,
    ),
  );
}

// sugestão automática (mesma heurística da aba Builds) pro item de UM
// Pokémon específico — sempre na geração mais atual, já que o montador de
// times não tem um jogo selecionado.
function recommendedItemsFor(pokemonId, types, stats) {
  const base = store.byId.get(pokemonId);
  const pseudo = { id: base?.id ?? pokemonId, evolutionChainId: base?.evolutionChainId ?? null, types, stats };
  return recommendItem(pseudo, 9).list;
}

function openItemPicker(onPick, recFor) {
  loadBuildsData().then(() => { if (pickerRender) pickerRender(pickerSearch.value.trim().toLowerCase()); });
  openPicker("Escolher item", (q) => {
    clear(pickerList);
    pickerList.append(el("button", {
      type: "button", class: "pk__row pk__row--none",
      onclick: () => { closePicker(); onPick(null); },
    }, el("span", { class: "pk__noneico" }, "—"), el("span", { class: "pk__rowname" }, "Nenhum item")));

    const stones = allMegaStoneSlugs();
    if (!q) {
      let any = false;
      if (recFor) {
        const recs = recommendedItemsFor(recFor.pokemonId, recFor.types, recFor.stats)
          .filter((r) => store.items[r.slug] && !stones.has(r.slug));
        if (recs.length) {
          any = true;
          pickerList.append(el("p", { class: "pk__group" }, "Recomendados pra esse Pokémon"));
          recs.forEach((r, i) => pickerList.append(recommendedRowBtn(r, i, onPick)));
        }
      }
      const favs = favorites.listItemFavorites().filter((slug) => store.items[slug] && !stones.has(slug));
      if (favs.length) {
        any = true;
        pickerList.append(el("p", { class: "pk__group" }, "Favoritos"));
        for (const slug of favs) pickerList.append(itemRowBtn(slug, onPick));
      }
      if (!any) pickerList.append(el("p", { class: "pk__empty" }, "Digite pra buscar. Favorite (★) um item no editor pra ele aparecer aqui."));
      return;
    }

    const entries = Object.entries(store.items || {})
      .filter(([slug]) => !stones.has(slug))
      .filter(([slug, it]) => nameStarts(it.n, q) || slug.startsWith(q))
      .sort((a, b) => a[1].n.localeCompare(b[1].n))
      .slice(0, 80);
    if (!entries.length) { pickerList.append(el("p", { class: "pk__empty" }, "Nenhum item encontrado.")); return; }
    for (const [slug] of entries) pickerList.append(itemRowBtn(slug, onPick));
  }, "Buscar item por nome");
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
