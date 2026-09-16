// Estado global: capturados + filtros + preferências. Persiste em localStorage.
// Publica eventos para a UI reagir.

const CAUGHT_KEY = "checkdex.caught";
const SHINY_KEY = "checkdex.shinycaught";
const MEGA_KEY = "checkdex.megas";
const REGIONAL_KEY = "checkdex.regionals";
const ALTFORM_KEY = "checkdex.altforms";
const PREFS_KEY = "checkdex.prefs";

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* modo privado / cota — segue sem persistir */
  }
}

const caught = new Set(Object.keys(readJSON(CAUGHT_KEY, {})).map(Number));
// Shinies marcados — contagem própria (o check fica dourado no modo shiny).
const caughtShiny = new Set(readJSON(SHINY_KEY, []).map(Number));
// Megas marcadas — NÃO entram no total de capturados. Chave = variety da PokéAPI.
const megaCaught = new Set(readJSON(MEGA_KEY, []));
// Formas regionais marcadas — contagem própria.
const regionalCaught = new Set(readJSON(REGIONAL_KEY, []));
// Formas alternativas pós-evolução marcadas (Lycanroc Midnight/Dusk…) — separado.
const altCaught = new Set(readJSON(ALTFORM_KEY, []));
const prefs = Object.assign(
  { gen: "all", game: "all", types: [], traits: [], shiny: false, onlyCaught: false },
  readJSON(PREFS_KEY, {}),
);
if (!Array.isArray(prefs.types)) prefs.types = [];
if (!Array.isArray(prefs.traits)) prefs.traits = [];

function persistPrefs() {
  writeJSON(PREFS_KEY, {
    gen: prefs.gen, game: prefs.game, types: prefs.types, traits: prefs.traits,
    shiny: prefs.shiny, onlyCaught: prefs.onlyCaught,
  });
}

const listeners = new Set();
function emit(kind) {
  for (const fn of listeners) fn(kind);
}
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ---- capturados ---- */
export function isCaught(id) {
  return caught.has(id);
}
export function toggleCaught(id) {
  caught.has(id) ? caught.delete(id) : caught.add(id);
  persistCaught();
  emit("caught");
}
export function setCaught(id, value) {
  value ? caught.add(id) : caught.delete(id);
  persistCaught();
  emit("caught");
}
export function caughtCount() {
  return caught.size;
}
function persistCaught() {
  writeJSON(CAUGHT_KEY, Object.fromEntries([...caught].map((id) => [id, true])));
}

/* ---- shinies marcados (contagem separada) ---- */
export function isCaughtShiny(id) {
  return caughtShiny.has(id);
}
export function toggleCaughtShiny(id) {
  caughtShiny.has(id) ? caughtShiny.delete(id) : caughtShiny.add(id);
  writeJSON(SHINY_KEY, [...caughtShiny]);
  emit("caught");
}
export function caughtShinyCount() {
  return caughtShiny.size;
}

/* ---- megas marcadas (separado; não conta como capturado) ---- */
export function isMegaCaught(key) {
  return megaCaught.has(key);
}
export function toggleMegaCaught(key) {
  megaCaught.has(key) ? megaCaught.delete(key) : megaCaught.add(key);
  writeJSON(MEGA_KEY, [...megaCaught]);
  emit("mega");
}
export function megaCaughtCount() {
  return megaCaught.size;
}

/* ---- formas regionais marcadas (separado) ---- */
export function isRegionalCaught(key) {
  return regionalCaught.has(key);
}
export function toggleRegionalCaught(key) {
  regionalCaught.has(key) ? regionalCaught.delete(key) : regionalCaught.add(key);
  writeJSON(REGIONAL_KEY, [...regionalCaught]);
  emit("mega");
}
export function regionalCaughtCount() {
  return regionalCaught.size;
}

/* ---- formas alternativas pós-evolução marcadas (separado) ---- */
export function isAltCaught(key) {
  return altCaught.has(key);
}
export function toggleAltCaught(key) {
  altCaught.has(key) ? altCaught.delete(key) : altCaught.add(key);
  writeJSON(ALTFORM_KEY, [...altCaught]);
  emit("mega");
}
export function altCaughtCount() {
  return altCaught.size;
}

/* ---- modo shiny (só troca os sprites; não é filtro) ---- */
export function isShiny() {
  return !!prefs.shiny;
}
export function toggleShiny() {
  prefs.shiny = !prefs.shiny;
  persistPrefs();
  emit("shiny");
}

/* ---- filtros / prefs ---- */
export function getFilters() {
  return { ...prefs };
}
export function setFilter(patch) {
  Object.assign(prefs, patch);
  persistPrefs();
  emit("filter");
}

/* ---- exportar / importar (backup em arquivo) ---- */
export function exportState() {
  return {
    caught: [...caught],
    shiny: [...caughtShiny],
    megas: [...megaCaught],
    regionals: [...regionalCaught],
    altforms: [...altCaught],
    prefs: { ...prefs },
  };
}

export function importState(data) {
  if (!data || typeof data !== "object") return;
  const nums = (v) => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n)) : []);
  const strs = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === "string") : []);

  caught.clear();
  nums(data.caught).forEach((id) => caught.add(id));
  caughtShiny.clear();
  nums(data.shiny).forEach((id) => caughtShiny.add(id));
  megaCaught.clear();
  strs(data.megas).forEach((k) => megaCaught.add(k));
  regionalCaught.clear();
  strs(data.regionals).forEach((k) => regionalCaught.add(k));
  altCaught.clear();
  strs(data.altforms).forEach((k) => altCaught.add(k));

  if (data.prefs && typeof data.prefs === "object") {
    const base = { gen: "all", game: "all", types: [], traits: [], shiny: false, onlyCaught: false };
    Object.assign(prefs, base, data.prefs);
    if (!Array.isArray(prefs.types)) prefs.types = [];
    if (!Array.isArray(prefs.traits)) prefs.traits = [];
  }

  persistCaught();
  writeJSON(SHINY_KEY, [...caughtShiny]);
  writeJSON(MEGA_KEY, [...megaCaught]);
  writeJSON(REGIONAL_KEY, [...regionalCaught]);
  writeJSON(ALTFORM_KEY, [...altCaught]);
  persistPrefs();

  emit("caught");
  emit("mega");
  emit("shiny");
  emit("filter");
}
