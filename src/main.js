// Checkdex — orquestração da UI.

import { loadData, store, hereEntries } from "./data.js";
import {
  getFilters, setFilter, subscribe, caughtCount, isCaught,
  isShiny, toggleShiny, isCaughtShiny, caughtShinyCount, megaCaughtCount, regionalCaughtCount,
} from "./state.js";
import { filterDex, visiblePokemon } from "./search.js";
import { el, clear, debounce } from "./ui/dom.js";
import { createCard } from "./ui/pokemonCard.js";
import { createLocationPicker } from "./ui/locationPicker.js";
import { createTypePicker } from "./ui/typePicker.js";
import { createTraitPicker } from "./ui/traitPicker.js";
import { mountTeamBuilder } from "./ui/teamBuilder.js";
import { createBackupMenu } from "./ui/backupMenu.js";
import { method as methodInfo } from "./ui/encounterText.js";
import { registerServiceWorker } from "./ui/updateToast.js";

registerServiceWorker();

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
const $ = (sel) => document.querySelector(sel);
const refs = {
  subtitle: $('[data-role="subtitle"]'),
  counter: $('[data-role="counter"]'),
  counterCaught: $('[data-role="counter-caught"]'),
  counterTotal: $('[data-role="counter-total"]'),
  counterFill: $('[data-role="counter-fill"]'),
  counterMega: $('[data-role="counter-mega"]'),
  counterShiny: $('[data-role="counter-shiny"]'),
  counterReg: $('[data-role="counter-reg"]'),
  megaCount: $('[data-role="mega-count"]'),
  megaTotal: $('[data-role="mega-total"]'),
  shinyCount: $('[data-role="shiny-count"]'),
  shinyTotal: $('[data-role="shiny-total"]'),
  regCount: $('[data-role="reg-count"]'),
  regTotal: $('[data-role="reg-total"]'),
  genTabs: $('[data-role="gen-tabs"]'),
  gameScroller: $('[data-role="game-scroller"]'),
  gameTabs: $('[data-role="game-tabs"]'),
  locPickers: $('[data-role="loc-pickers"]'),
  typePicker: $('[data-role="type-picker"]'),
  traitPicker: $('[data-role="trait-picker"]'),
  search: $('[data-role="search"]'),
  searchClear: $('[data-role="search-clear"]'),
  shinyToggle: $('[data-role="shiny-toggle"]'),
  themeToggle: $('[data-role="theme-toggle"]'),
  caughtToggle: $('[data-role="caught-toggle"]'),
  dexhead: $('[data-role="dexhead"]'),
  dexheadTitle: $('[data-role="dexhead-title"]'),
  dexheadSub: $('[data-role="dexhead-sub"]'),
  dex: $('[data-role="dex"]'),
  empty: $('[data-role="empty"]'),
  emptyTitle: $('[data-role="empty-title"]'),
  emptyText: $('[data-role="empty-text"]'),
  resetFilters: $('[data-role="reset-filters"]'),
  toTop: $('[data-role="to-top"]'),
  teamsRoot: $('[data-role="teams-root"]'),
  teamsNav: $('[data-role="teams-nav"]'),
  backupRoot: $('[data-role="backup-root"]'),
  controls: $('[data-role="controls"]'),
  controlsToggle: $('[data-role="controls-toggle"]'),
};

const cardCache = new Map();
let query = "";
let openId = null;
let openTab = null;
let locKey = null;   // chave do local selecionado (só com um jogo escolhido)
let prevGame = "all";
const routePicker = createLocationPicker({ onPick: setLocation, label: "Rotas", groupBy: "region" });
const placePicker = createLocationPicker({ onPick: setLocation, label: "Locais", groupBy: "type" });
const typePicker = createTypePicker({ onChange: (types) => setFilter({ types }) });
const traitPicker = createTraitPicker({ onChange: (traits) => setFilter({ traits }) });

init();

async function init() {
  await loadData();
  readUrl();
  refs.locPickers.append(routePicker.el, placePicker.el);
  refs.typePicker.append(typePicker.el);
  refs.traitPicker.append(traitPicker.el);
  buildGenTabs();
  buildSearch();
  buildShinyToggle();
  buildThemeToggle();
  buildToTop();
  buildControlsToggle();
  refs.caughtToggle.addEventListener("click", () => {
    setFilter({ onlyCaught: !getFilters().onlyCaught });
  });
  buildGameTabs();
  refreshLocPicker();

  const teamBuilder = mountTeamBuilder(refs.teamsRoot);
  refs.teamsNav.addEventListener("click", teamBuilder.open);

  refs.backupRoot.replaceWith(createBackupMenu().el);

  refs.resetFilters.addEventListener("click", () => {
    // vazio por causa do "Marcados" → só volta pra Pokédex geral (mantém o resto)
    if (getFilters().onlyCaught && !currentList().length) {
      setFilter({ onlyCaught: false });
      return;
    }
    query = "";
    refs.search.value = "";
    refs.searchClear.hidden = true;
    locKey = null;
    setFilter({ gen: "all", game: "all", types: [], traits: [], onlyCaught: false });
  });

  subscribe((kind) => {
    if (kind === "filter") {
      const g = getFilters().game;
      if (g !== prevGame) { locKey = null; prevGame = g; }
      buildGameTabs();
      refreshLocPicker();
      render();
      syncControls();
      writeUrl();
    }
    if (kind === "caught") { updateCounter(); updateDexhead(); }
    if (kind === "mega" || kind === "shiny") updateCounter();
    // com "só marcados" ativo, marcar/desmarcar (ou trocar o modo shiny) muda a lista
    if ((kind === "caught" || kind === "shiny") && getFilters().onlyCaught) render();
  });

  prevGame = getFilters().game;
  render();
  syncControls();
}

function setLocation(key) {
  locKey = key;
  routePicker.setCurrent(key);
  placePicker.setCurrent(key);
  render();
  syncControls();
  writeUrl();
}

/* ---------- controles ---------- */
function buildGenTabs() {
  clear(refs.genTabs);
  refs.genTabs.append(chip("Todas", "chip--gen", { gen: "all" }, () => setFilter({ gen: "all", game: "all" })));
  for (let g = 1; g <= 9; g++) {
    refs.genTabs.append(
      chip("Gen " + ROMAN[g - 1], "chip--gen", { gen: String(g) }, () => setFilter({ gen: String(g), game: "all" })),
    );
  }
}

function buildGameTabs() {
  const { gen } = getFilters();
  const showGames = gen !== "all";
  refs.gameScroller.hidden = !showGames;
  if (!showGames) { clear(refs.gameTabs); return; }

  const games = store.games.filter((x) => String(x.generation) === gen);
  clear(refs.gameTabs);
  refs.gameTabs.append(chip("Toda a geração", "chip--game", { slug: "all" }, () => setFilter({ game: "all" })));
  for (const g of games) {
    refs.gameTabs.append(chip(g.label, "chip--game", { slug: g.slug }, () => setFilter({ game: g.slug })));
  }
}

function chip(label, variant, dataset, onclick) {
  return el("button", { class: "chip " + variant, type: "button", "aria-pressed": "false", dataset, onclick }, label);
}

function refreshLocPicker() {
  const { game } = getFilters();
  const data = game !== "all" ? store.locations[game] : null;
  const all = data ? data.list : [];
  const routes = all.filter((l) => l.routeNum != null)
    .sort((a, b) => (a.region || "").localeCompare(b.region || "") || a.routeNum - b.routeNum);
  const places = all.filter((l) => l.routeNum == null);
  routePicker.setLocations(routes);
  placePicker.setLocations(places);
  if (locKey && !(data && data.byKey.has(locKey))) locKey = null;
  routePicker.setCurrent(locKey);
  placePicker.setCurrent(locKey);
}

function updateDexhead() {
  const { game } = getFilters();
  const loc = locKey && game !== "all" ? store.locations[game]?.byKey.get(locKey) : null;
  refs.dexhead.hidden = !loc;
  if (!loc) return;
  const gameLabel = store.games.find((g) => g.slug === game)?.label ?? "";
  const total = loc.pokemonIds.size;
  const done = [...loc.pokemonIds].filter(isCaught).length;
  refs.dexheadTitle.textContent = loc.label;
  refs.dexheadSub.textContent =
    `${gameLabel} · ${total} Pokémon ${total === 1 ? "aparece" : "aparecem"} aqui · ${done} capturado${done === 1 ? "" : "s"}`;
}

function buildSearch() {
  const onInput = debounce(() => {
    query = refs.search.value;
    refs.searchClear.hidden = !query;
    render();
    writeUrl();
  }, 140);
  refs.search.addEventListener("input", onInput);
  refs.searchClear.addEventListener("click", () => {
    query = "";
    refs.search.value = "";
    refs.searchClear.hidden = true;
    render();
    writeUrl();
    refs.search.focus();
  });
  refs.search.value = query;
  refs.searchClear.hidden = !query;
}

function buildToTop() {
  const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  let ticking = false;
  const update = () => {
    refs.toTop.classList.toggle("is-visible", window.scrollY > 350);
    ticking = false;
  };
  addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  refs.toTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
  });
  update();
}

function buildThemeToggle() {
  const root = document.documentElement;
  const sync = () => {
    const light = root.getAttribute("data-theme") === "light";
    refs.themeToggle.setAttribute("aria-pressed", String(light));
    refs.themeToggle.title = light ? "Mudar para o tema escuro" : "Mudar para o tema claro";
  };
  refs.themeToggle.addEventListener("click", () => {
    const light = root.getAttribute("data-theme") !== "light";
    if (light) root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
    try { localStorage.setItem("checkdex:theme", light ? "light" : "dark"); } catch (e) { /* ignora */ }
    sync();
  });
  sync();
}

function buildControlsToggle() {
  refs.controlsToggle.addEventListener("click", () => {
    const collapsed = refs.controls.classList.toggle("is-collapsed");
    refs.controlsToggle.setAttribute("aria-expanded", String(!collapsed));
    refs.controlsToggle.title = collapsed ? "Mostrar filtros" : "Esconder filtros";
    refs.controlsToggle.setAttribute("aria-label", collapsed ? "Mostrar filtros" : "Esconder filtros");
  });
}

function buildShinyToggle() {
  const sync = () => {
    const on = isShiny();
    refs.shinyToggle.setAttribute("aria-pressed", String(on));
    document.documentElement.classList.toggle("is-shiny", on);
  };
  refs.shinyToggle.addEventListener("click", () => { toggleShiny(); sync(); });
  sync();
}

function syncControls() {
  const { gen, game, types, traits, onlyCaught } = getFilters();
  markPressed(refs.genTabs, "gen", gen);
  markPressed(refs.gameTabs, "slug", game);
  typePicker.setSelected(types);
  traitPicker.setSelected(traits);
  refs.caughtToggle.setAttribute("aria-pressed", String(!!onlyCaught));

  routePicker.setCurrent(locKey);
  placePicker.setCurrent(locKey);

  const g = store.games.find((x) => x.slug === game);
  const locLabel = locKey && g ? store.locations[game]?.byKey.get(locKey)?.label : null;
  refs.subtitle.textContent = locLabel
    ? `em ${g.label} · ${locLabel}`
    : g
      ? `em ${g.label}`
      : gen !== "all"
        ? `na geração ${ROMAN[gen - 1]}`
        : "— todas as gerações";
}

function markPressed(container, key, value) {
  for (const b of container.children) {
    const on = b.dataset[key] === value;
    b.setAttribute("aria-pressed", String(on));
    if (on) b.scrollIntoView({ inline: "center", block: "nearest" });
  }
}

/* ---------- render da dex ---------- */
function currentList() {
  return filterDex({ ...getFilters(), query, location: locKey, forceId: openId ?? undefined });
}

let selReconciled = false;
function render() {
  if (openId != null && !selReconciled) {
    selReconciled = true;
    const inList = currentList().some((p) => p.id === openId);
    if (!inList) { setFilter({ gen: "all", game: "all", types: [], traits: [], onlyCaught: false }); return; }
  }

  const list = currentList();
  updateCounter();
  updateDexhead();

  const game = getFilters().game;

  refs.empty.hidden = list.length > 0;
  refs.dex.hidden = list.length === 0;
  if (!list.length) {
    const onlyMarked = getFilters().onlyCaught;
    refs.empty.classList.toggle("empty-state--caught", onlyMarked);
    refs.emptyTitle.textContent = onlyMarked ? "Nada marcado ainda" : "Nada por aqui";
    refs.emptyText.textContent = onlyMarked
      ? "Você não marcou nenhum Pokémon aqui."
      : "Nenhum Pokémon corresponde a esses filtros.";
    refs.resetFilters.textContent = onlyMarked ? "Voltar à Pokédex geral" : "Limpar filtros";
    clear(refs.dex);
    return;
  }

  clear(refs.dex);
  const frag = document.createDocumentFragment();

  const makeCard = (p, hereEntriesForP) => {
    let card = cardCache.get(p.id);
    if (!card) {
      card = createCard(p);
      card.addEventListener("checkdex:open", (e) => {
        if (e.detail.open) {
          const prev = openId;
          openId = p.id;
          // só um Pokémon aberto por vez: fecha o anterior
          if (prev != null && prev !== p.id) cardCache.get(prev)?.checkdex.toggle(false);
        } else if (openId === p.id) {
          openId = null;
        }
        writeUrl();
      });
      cardCache.set(p.id, card);
    }
    // modo local: mostra como pegar o Pokémon ali
    card.checkdex.setHere(hereEntriesForP, game !== "all" ? game : null);
    return card;
  };

  if (locKey) {
    // modo local: separa quem só aparece pescando, surfando, quebrando pedra ou em horda dos demais
    const normal = [];
    const fishing = [];
    const surfing = [];
    const rockSmash = [];
    const horde = [];
    for (const p of list) {
      const entries = hereEntries(game, locKey, p.id);
      const labels = entries.length ? entries.map((e) => methodInfo(e.method).label) : [];
      if (labels.length && labels.every((l) => l === "Pescando")) fishing.push({ p, entries });
      else if (labels.length && labels.every((l) => l === "Surfando")) surfing.push({ p, entries });
      else if (labels.length && labels.every((l) => l === "Quebra-pedra")) rockSmash.push({ p, entries });
      else if (labels.length && labels.every((l) => l === "Horda")) horde.push({ p, entries });
      else normal.push({ p, entries });
    }
    const section = (iconClass, label, group) => {
      if (!group.length) return;
      frag.append(el("div", { class: "dex__section" },
        el("span", { class: "dex__section-label" },
          el("span", { class: "dex__section-icon " + iconClass, "aria-hidden": "true" }),
          label,
        ),
      ));
      for (const { p, entries } of group) frag.append(makeCard(p, entries));
    };
    for (const { p, entries } of normal) frag.append(makeCard(p, entries));
    section("dex__section-icon--fish", "Pesca", fishing);
    section("dex__section-icon--surf", "Surf", surfing);
    section("dex__section-icon--rock", "Quebra-pedra", rockSmash);
    section("dex__section-icon--horde", "Horda", horde);
  } else {
    for (const p of list) frag.append(makeCard(p, null));
  }
  refs.dex.append(frag);

  if (openId != null) {
    const card = cardCache.get(openId);
    if (card && card.isConnected) {
      card.checkdex.toggle(true);
      if (openTab) { card.checkdex.setTab(openTab); openTab = null; } // só uma vez (deep-link)
      card.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }
}

function updateCounter() {
  const { gen, game, types, traits } = getFilters();
  const loc = locKey && game !== "all" ? store.locations[game]?.byKey.get(locKey) : null;
  const ids = loc ? [...loc.pokemonIds] : visiblePokemon({ gen, game, types, traits });
  const caught = ids.filter(isCaught).length;
  const pct = ids.length ? Math.round((caught / ids.length) * 100) : 0;
  refs.counterCaught.textContent = caught;
  refs.counterTotal.textContent = ids.length;
  refs.counterFill.style.width = pct + "%";
  refs.counter.title = `${caught} de ${ids.length} capturados (${pct}%) · ${caughtCount()} no total`;

  // Mega Stones marcadas (aba Mega) — não é filtrado
  const megaN = megaCaughtCount();
  refs.megaCount.textContent = megaN;
  refs.megaTotal.textContent = store.megaTotal;
  refs.counterMega.title = `${megaN} de ${store.megaTotal} Mega Stones coletadas`;

  // Formas regionais marcadas
  const regN = regionalCaughtCount();
  refs.regCount.textContent = regN;
  refs.regTotal.textContent = store.regionalTotal;
  refs.counterReg.title = `${regN} de ${store.regionalTotal} formas regionais marcadas`;

  // Shinies marcados — acompanha os mesmos filtros da dex
  const shinyN = ids.filter(isCaughtShiny).length;
  refs.shinyCount.textContent = shinyN;
  refs.shinyTotal.textContent = ids.length;
  refs.counterShiny.title = `${shinyN} de ${ids.length} shinies marcados · ${caughtShinyCount()} no total`;
}

/* ---------- deep-link ---------- */
function readUrl() {
  const p = new URLSearchParams(location.search);
  const patch = {};
  if (p.get("gen")) patch.gen = p.get("gen");
  if (p.get("game")) {
    patch.game = p.get("game");
    // um jogo implica sua geração (pra mostrar a linha de jogos)
    const g = store.games.find((x) => x.slug === patch.game);
    if (g && !patch.gen) patch.gen = String(g.generation);
  }
  if (p.get("type")) patch.types = p.get("type").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 2);
  if (p.get("trait")) patch.traits = p.get("trait").split(",").map((s) => s.trim()).filter(Boolean);
  if (p.get("caught") === "1") patch.onlyCaught = true;
  if (Object.keys(patch).length) setFilter(patch);
  if (p.get("q")) query = p.get("q");
  if (p.get("loc")) locKey = p.get("loc");
  if (p.get("sel")) openId = Number(p.get("sel")) || null;
  if (p.get("tab")) openTab = p.get("tab");
}

function writeUrl() {
  const { gen, game, types, traits, onlyCaught } = getFilters();
  const p = new URLSearchParams();
  if (gen && gen !== "all") p.set("gen", gen);
  if (game && game !== "all") p.set("game", game);
  if (types && types.length) p.set("type", types.join(","));
  if (traits && traits.length) p.set("trait", traits.join(","));
  if (onlyCaught) p.set("caught", "1");
  if (query) p.set("q", query);
  if (locKey && game !== "all") p.set("loc", locKey);
  if (openId != null) p.set("sel", String(openId));
  const qs = p.toString();
  history.replaceState(null, "", qs ? "?" + qs : location.pathname);
}
