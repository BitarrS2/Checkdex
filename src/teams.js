// Times de batalha: times salvos pelo usuário (6 espaços cada), com Pokémon +
// item + natureza + EVs por espaço. Independente do progresso de captura.
// Persiste em localStorage; publica eventos simples pra UI reagir.

const TEAMS_KEY = "checkdex.teams";
const ACTIVE_KEY = "checkdex.teams.active";

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

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const EMPTY_EVS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
export const EMPTY_MOVES = [null, null, null, null];

function normalizeMoves(m) {
  const moves = Array.isArray(m) ? m.slice(0, 4).map((x) => x || null) : [];
  while (moves.length < 4) moves.push(null);
  return moves;
}

function normalizeSlot(s) {
  if (!s || !s.pokemonId) return null;
  return {
    pokemonId: s.pokemonId,
    formKey: s.formKey || null, // null = espécie base; senão chave da Mega/forma regional
    item: s.item || null,
    ability: s.ability || null,
    nature: s.nature || null,
    evs: { ...EMPTY_EVS, ...(s.evs || {}) },
    moves: normalizeMoves(s.moves),
  };
}
function normalizeTeam(t) {
  const slots = Array.from({ length: 6 }, (_, i) => normalizeSlot(t.slots?.[i]));
  return { id: t.id || uid(), name: t.name || "Time sem nome", slots };
}

let teams = readJSON(TEAMS_KEY, []).map(normalizeTeam);
let activeId = readJSON(ACTIVE_KEY, null);

function persist() { writeJSON(TEAMS_KEY, teams); }
function persistActive() { writeJSON(ACTIVE_KEY, activeId); }

const listeners = new Set();
function emit() { for (const fn of listeners) fn(); }
export function subscribeTeams(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function listTeams() {
  return teams.map((t) => ({ id: t.id, name: t.name }));
}
export function getTeam(id) {
  return teams.find((t) => t.id === id) || null;
}
export function getActiveId() {
  if (activeId && teams.some((t) => t.id === activeId)) return activeId;
  return teams[0]?.id || null;
}
export function setActiveId(id) {
  activeId = id;
  persistActive();
  emit();
}

export function createTeam(name) {
  const t = normalizeTeam({ name: name || `Time ${teams.length + 1}`, slots: [] });
  teams.push(t);
  activeId = t.id;
  persist();
  persistActive();
  emit();
  return t.id;
}
export function deleteTeam(id) {
  teams = teams.filter((t) => t.id !== id);
  persist();
  if (activeId === id) {
    activeId = teams[0]?.id || null;
    persistActive();
  }
  emit();
}
export function renameTeam(id, name) {
  const t = getTeam(id);
  if (!t) return;
  t.name = (name || "").trim() || t.name;
  persist();
  emit();
}
export function setSlot(teamId, idx, patch) {
  const t = getTeam(teamId);
  if (!t) return;
  const cur = t.slots[idx] || { pokemonId: null, item: null, ability: null, nature: null, evs: { ...EMPTY_EVS }, moves: [...EMPTY_MOVES] };
  t.slots[idx] = normalizeSlot({ ...cur, ...patch });
  persist();
  emit();
}
export function clearSlot(teamId, idx) {
  const t = getTeam(teamId);
  if (!t) return;
  t.slots[idx] = null;
  persist();
  emit();
}

/* ---- exportar / importar (backup em arquivo) ---- */
export function exportTeams() {
  return { teams: teams.map((t) => structuredClone(t)), activeId };
}

export function importTeams(data) {
  if (!data || !Array.isArray(data.teams)) return;
  teams = data.teams.map(normalizeTeam);
  activeId = teams.some((t) => t.id === data.activeId) ? data.activeId : (teams[0]?.id || null);
  persist();
  persistActive();
  emit();
}
