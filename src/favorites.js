// Favoritos do montador de times (Pokémon e itens) — atalho pra aparecerem
// de cara nos respectivos buscadores, antes de digitar qualquer coisa.
// Independente do progresso de captura da dex principal.

const KEY = "checkdex.favorites";
const ITEMS_KEY = "checkdex.favorites.items";

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

const favKey = (pokemonId, formKey) => (formKey ? `f:${formKey}` : `p:${pokemonId}`);

let favorites = readJSON(KEY, []).filter((f) => f && f.pokemonId);
const keys = new Set(favorites.map((f) => favKey(f.pokemonId, f.formKey || null)));

function persist() {
  writeJSON(KEY, favorites);
}

export function isFavorite(pokemonId, formKey = null) {
  return keys.has(favKey(pokemonId, formKey));
}
export function toggleFavorite(pokemonId, formKey = null) {
  const key = favKey(pokemonId, formKey);
  if (keys.has(key)) {
    keys.delete(key);
    favorites = favorites.filter((f) => favKey(f.pokemonId, f.formKey || null) !== key);
  } else {
    keys.add(key);
    favorites.push({ pokemonId, formKey: formKey || null });
  }
  persist();
}
export function listFavorites() {
  return favorites.map((f) => ({ pokemonId: f.pokemonId, formKey: f.formKey || null }));
}

/* ---------------- itens ---------------- */
let itemFavorites = readJSON(ITEMS_KEY, []).filter((s) => typeof s === "string");
const itemKeys = new Set(itemFavorites);

export function isItemFavorite(slug) {
  return itemKeys.has(slug);
}
export function toggleItemFavorite(slug) {
  if (itemKeys.has(slug)) {
    itemKeys.delete(slug);
    itemFavorites = itemFavorites.filter((s) => s !== slug);
  } else {
    itemKeys.add(slug);
    itemFavorites.push(slug);
  }
  writeJSON(ITEMS_KEY, itemFavorites);
}
export function listItemFavorites() {
  return [...itemFavorites];
}
