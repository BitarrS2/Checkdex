// Filtro da dex: geração + jogo + tipo + texto.
// Retorna UM Pokémon por linha evolutiva (o estágio-base, ou o 1º que existe no jogo,
// ou o estágio buscado). As demais evoluções aparecem ao abrir o dropdown do card.

import { store, existsInGame, pokeTraits, lineTraitSet } from "./data.js";
import { isCaught, isCaughtShiny, isShiny } from "./state.js";

// "marcado" = capturado, ou shiny marcado quando o modo shiny está ligado
const isMarked = (id) => (isShiny() ? isCaughtShiny(id) : isCaught(id));

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
const norm = (s) =>
  s.normalize("NFD").replace(DIACRITICS, "").toLowerCase().trim();

const cleanTypes = (t) => (Array.isArray(t) ? t : t && t !== "all" ? [t] : []).filter(Boolean);
const cleanTraits = (t) => (Array.isArray(t) ? t : t ? [t] : []).filter(Boolean);
const hasAllTypes = (p, types) => types.every((t) => p.types.includes(t));
// traço: OR — a linha entra se tem QUALQUER um dos traços escolhidos
const pokeHasTrait = (p, list) => pokeTraits(p).some((t) => list.includes(t));

export function filterDex({ gen, game, types, traits, onlyCaught, query, forceId, location }) {
  const gameObj = game && game !== "all" ? store.games.find((g) => g.slug === game) : null;
  const genNum = gen && gen !== "all" ? Number(gen) : null;
  const typeList = cleanTypes(types);
  const traitList = cleanTraits(traits);
  const q = norm(query || "");
  const qNum = q.replace(/^#/, "").replace(/^0+/, "");
  const loc = location && gameObj ? store.locations[game]?.byKey.get(location) : null;

  const result = [];
  for (const line of store.lines) {
    const stages = line.stageIds.map((id) => store.byId.get(id)).filter(Boolean);
    if (!stages.length) continue;

    // modo "local": só linhas com algum estágio naquele local; o card é esse estágio
    let locRep = null;
    if (loc) {
      locRep = stages.find((p) => loc.pokemonIds.has(p.id));
      if (!locRep) continue;
    }

    // modo geração (sem jogo): a linha entra se tem algum estágio dessa geração;
    // o representante é o 1º estágio dessa geração (ex.: Gen I mostra Pikachu, não Pichu)
    let genRep = null;
    if (!gameObj && genNum) {
      genRep = stages.find((p) => p.generation === genNum);
      if (!genRep) continue;
    }

    const rep = locRep
      ? locRep
      : genRep
        ? genRep
        : gameObj
          ? stages.find((p) => existsInGame(p, gameObj))
          : stages[0];
    if (!rep) continue;

    // filtro de tipo: precisa de um estágio que tenha TODOS os tipos escolhidos
    if (typeList.length) {
      const okAny = typeList.every((t) => line.types.has(t)) &&
        stages.some((p) => hasAllTypes(p, typeList));
      if (!okAny) continue;
    }

    // filtro de traço (lendário / mítico / mega / …): a linha entra se algum
    // estágio tem qualquer um dos traços marcados
    if (traitList.length) {
      const lt = lineTraitSet(line);
      if (!traitList.some((t) => lt.has(t))) continue;
    }

    // "só marcados": a linha entra se tem algum estágio marcado
    if (onlyCaught && !stages.some((p) => isMarked(p.id))) continue;

    let hit = rep;
    // modo "local": mostra UM card por estágio realmente encontrado ali (não
    // só o representante da linha) — ex.: se Doduo E Dodrio aparecem
    // selvagens na mesma rota, cada um vira seu próprio card.
    let locHits = null;
    if (loc) {
      locHits = stages.filter((p) => loc.pokemonIds.has(p.id));
    }
    if (!loc) {
      // mostra o estágio que casa com os tipos (ex.: Eevee → Vaporeon em Water)
      if (typeList.length && !hasAllTypes(rep, typeList)) {
        const typed = stages.find((p) => hasAllTypes(p, typeList) && (!gameObj || existsInGame(p, gameObj)));
        if (typed) hit = typed;
      }
      // mostra o estágio que carrega o traço (ex.: Semi-lendário → Dragonite)
      if (traitList.length && !pokeHasTrait(hit, traitList)) {
        const traited = stages.find((p) => pokeHasTrait(p, traitList) && (!gameObj || existsInGame(p, gameObj)));
        if (traited) hit = traited;
      }
      // "só marcados": mostra um estágio efetivamente marcado
      if (onlyCaught && !isMarked(hit.id)) {
        const marked = stages.find((p) => isMarked(p.id) && (!gameObj || existsInGame(p, gameObj)));
        if (marked) hit = marked;
      }
      // deep-link ?sel= aponta pra um estágio específico desta linha
      if (forceId && line.stageIds.includes(forceId)) {
        hit = store.byId.get(forceId) || rep;
      }
    }
    if (q) {
      const named = stages.find((p) => norm(p.name).includes(q));
      const numbered = qNum && stages.find((p) => String(p.id).includes(qNum));
      if (!named && !numbered) continue;
      if (!loc) {
        const match = named || numbered;
        if (!gameObj || existsInGame(match, gameObj)) hit = match;
      }
    }
    if (locHits) result.push(...locHits);
    else result.push(hit);
  }
  return result.sort((a, b) => a.id - b.id);
}

// Conta Pokémon individuais (todos os estágios) visíveis com os filtros —
// usado no contador do header, para "capturados / total".
export function visiblePokemon({ gen, game, types, traits }) {
  const gameObj = game && game !== "all" ? store.games.find((g) => g.slug === game) : null;
  const genNum = gen && gen !== "all" ? Number(gen) : null;
  const typeList = cleanTypes(types);
  const traitList = cleanTraits(traits);
  const ids = [];
  for (const line of store.lines) {
    if (typeList.length && !typeList.every((t) => line.types.has(t))) continue;
    if (traitList.length) {
      const lt = lineTraitSet(line);
      if (!traitList.some((t) => lt.has(t))) continue;
    }
    for (const id of line.stageIds) {
      const p = store.byId.get(id);
      if (!p) continue;
      if (gameObj && !existsInGame(p, gameObj)) continue;
      // modo "geração" (sem jogo): conta quem foi introduzido nela
      if (!gameObj && genNum && p.generation !== genNum) continue;
      if (typeList.length && !hasAllTypes(p, typeList)) continue;
      // com traço marcado, conta só os estágios que carregam o traço
      if (traitList.length && !pokeHasTrait(p, traitList)) continue;
      ids.push(id);
    }
  }
  return ids;
}

export const TYPES = [
  "normal", "fire", "water", "grass", "electric", "ice",
  "fighting", "poison", "ground", "flying", "psychic", "bug",
  "rock", "ghost", "dragon", "dark", "steel", "fairy",
];
