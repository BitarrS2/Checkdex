// Carrega os JSONs gerados e monta índices em memória.

const base = new URL("../data/", import.meta.url);

async function json(name) {
  const res = await fetch(new URL(name, base));
  if (!res.ok) throw new Error(`Falha ao carregar ${name}`);
  return res.json();
}

export const store = {
  pokedex: [],
  byId: new Map(),
  chains: {},
  encounters: {},
  megas: {},        // speciesId -> [ { key, name, sprite, types, stone, stoneSprite } ]
  megaTotal: 0,     // nº total de formas Mega (denominador do contador)
  regionals: {},    // speciesId -> [ { key, name, region, sprite, types } ]
  regionalTotal: 0,
  moves: {},        // slug -> { n, t, c, p, a, d }
  movesets: {},     // pokemonId -> { moveSlug: geraçãoMínima }
  abilities: {},    // slug -> { n, short }
  sets: {},         // slugName -> { gen: [ set do Smogon ] }
  items: {},        // slug -> { n, d }
  evoItems: new Set(), // slugs de item de evolução com ícone em assets/items/
  games: [],
  meta: {},
  lines: [],
  locations: {}, // gameSlug -> { list: [loc], byKey: Map }
};

// cor de cada VERSÃO (para colorir cada parte do nome: "Red" vermelho, "Blue" azul)
export const VERSION_COLOR = {
  red: "#df3f3d", blue: "#2f74d0", yellow: "#e3ab16",
  gold: "#caa02a", silver: "#9aa3ad", crystal: "#3f9bbf",
  ruby: "#c33b45", sapphire: "#2f6fb8", emerald: "#28a05f",
  firered: "#e2542f", leafgreen: "#3faf4b",
  diamond: "#6f86cf", pearl: "#d878a6", platinum: "#8a94a3",
  heartgold: "#d4a017", soulsilver: "#98a2ae",
  black: "#3f3f48", white: "#8b93a1",
  "black-2": "#4a4a58", "white-2": "#828b9c",
  x: "#df3f3d", y: "#2f74d0",
  "omega-ruby": "#c33b45", "alpha-sapphire": "#2f6fb8",
  sun: "#e8912e", moon: "#4a63c0",
  "ultra-sun": "#d2691e", "ultra-moon": "#5a4fbf",
  "lets-go-pikachu": "#e3ab16", "lets-go-eevee": "#b07a3f",
  sword: "#2f8fc9", shield: "#c0322b",
  "brilliant-diamond": "#6f86cf", "shining-pearl": "#d878a6",
  "legends-arceus": "#3f8a76",
  scarlet: "#c33a2b", violet: "#7b4fb8",
};

// nome do jogo em pedaços coloridos: [{ text, color }] — split pelo " · "
export function gameNameParts(game) {
  const parts = game.label.split(" · ");
  const vers = game.versions || [];
  return parts.map((text, i) => ({
    text,
    color: VERSION_COLOR[vers[i]] || game.color,
  }));
}

// rótulo + cor de uma versão específica dentro de um jogo (ex.: gameSlug
// "ruby-sapphire", version "ruby" -> {label:"Ruby", color:"#c33b45"}) — usa
// a mesma ordem de `game.versions`/`game.label` pra achar o texto certo.
// Usado pro selo "Só em <Versão>" (exclusividade de versão nos encontros).
export function versionLabel(gameSlug, version) {
  const game = store.games.find((g) => g.slug === gameSlug);
  if (!game) return { label: version, color: "#8b909c" };
  const idx = (game.versions || []).indexOf(version);
  const label = idx >= 0 ? game.label.split(" · ")[idx] : version;
  return { label, color: VERSION_COLOR[version] || game.color };
}

// cor de cada jogo (version-group) — pista visual na aba "Onde encontrar"
const GAME_COLOR = {
  "red-blue": "#d0484d",
  "yellow": "#e0a91b",
  "gold-silver": "#c8a022",
  "crystal": "#3f9bbf",
  "ruby-sapphire": "#c0414a",
  "emerald": "#2f9e63",
  "firered-leafgreen": "#e2652f",
  "diamond-pearl": "#6d7fc4",
  "platinum": "#8a94a3",
  "heartgold-soulsilver": "#cfab3e",
  "black-white": "#54545c",
  "black-2-white-2": "#6a5acd",
  "x-y": "#7a5cc4",
  "omega-ruby-alpha-sapphire": "#c1465c",
  "sun-moon": "#e8912e",
  "ultra-sun-ultra-moon": "#d16a1f",
  "lets-go-pikachu-lets-go-eevee": "#e8b93a",
  "sword-shield": "#4b8fbf",
  "brilliant-diamond-and-shining-pearl": "#7d8ac9",
  "legends-arceus": "#3f8a76",
  "scarlet-violet": "#c0433a",
};

export async function loadData() {
  const [pokedex, chains, encounters, megas, regionals, evoItems, games, meta] = await Promise.all([
    json("pokedex.json"),
    json("evolution-chains.json"),
    json("encounters.json"),
    json("megas.json"),
    json("regionals.json"),
    json("evo-items.json"),
    json("games.json"),
    json("meta.json"),
  ]);

  store.pokedex = pokedex;
  store.chains = chains;
  store.encounters = encounters;
  store.megas = megas;
  store.megaTotal = Object.values(megas).reduce((n, arr) => n + arr.length, 0);
  store.regionals = regionals;
  store.regionalTotal = Object.values(regionals).reduce((n, arr) => n + arr.length, 0);
  store.evoItems = new Set(evoItems);
  for (const g of games) g.color = GAME_COLOR[g.slug] || "#8b909c";
  store.games = games;
  store.meta = meta;
  store.byId = new Map(pokedex.map((p) => [p.id, p]));

  // agrupa os Pokémon por linha evolutiva → 1 grupo por dropdown na dex
  store.lines = buildLines();
  // inverte os encontros → locais de cada jogo, ordenados pra progressão
  store.locations = buildLocations();

  return store;
}

// Dados de "Builds" (golpes, movesets, habilidades, sets competitivas do Smogon,
// itens) — pesados e usados só na aba Builds, então carregam sob demanda.
let _buildsPromise = null;
export function loadBuildsData() {
  if (!_buildsPromise) {
    _buildsPromise = Promise.all([
      json("moves.json"), json("movesets.json"), json("abilities.json"),
      json("sets.json"), json("items.json"), json("metavgc.json"),
    ]).then(([moves, movesets, abilities, sets, items, metavgc]) => {
      store.moves = moves;
      store.movesets = movesets;
      store.abilities = abilities;
      store.sets = sets;
      store.items = items;
      store.metavgc = metavgc;
      return store;
    });
  }
  return _buildsPromise;
}

/* ---------------- índice de locais (por jogo) ---------------- */

const REGION_ORDER = {
  johto: 0, kanto: 1, hoenn: 2, sinnoh: 3, unova: 4,
  kalos: 5, alola: 6, galar: 7, hisui: 8, paldea: 9,
};
const TYPE_ORDER = { route: 0, forest: 1, cave: 2, city: 3, water: 4, other: 5 };
const LOC_TYPE_LABEL = {
  route: "Rotas",
  forest: "Florestas",
  cave: "Cavernas e montanhas",
  city: "Cidades e vilas",
  water: "Mar e água",
  other: "Outros locais",
};

function classifyLocation(label) {
  const s = label.toLowerCase();
  // rotas de verdade só vêm de parseRoute; aqui ignoramos a palavra "route" solta
  if (/forest|woods|jungle/.test(s)) return "forest";
  if (/cave|tunnel|\bmt\b|\bmt\.|mount |cavern|chamber|chasm|grotto|\bden\b|ruins|tower|graveyard|catacomb|pillar/.test(s)) return "cave";
  if (/city|town|village|plateau|resort|colosseum/.test(s)) return "city";
  if (/sea|ocean|lake|bay|beach|shore|underwater|seafloor|\bisland\b|waterfall|pond|swamp/.test(s)) return "water";
  return "other";
}

function parseRoute(label) {
  const m = label.match(/^(\w+)\s+(sea\s+)?route\s+(\d+)/i);
  if (m && (m[1].toLowerCase() in REGION_ORDER)) {
    return { region: m[1].toLowerCase(), num: Number(m[3]), sea: !!m[2] };
  }
  const m2 = label.match(/^(sea\s+)?route\s+(\d+)/i);
  if (m2) return { region: null, num: Number(m2[2]), sea: !!m2[1] };
  return null;
}

function regionOf(label) {
  const first = label.split(/\s+/)[0]?.toLowerCase();
  return first in REGION_ORDER ? first : null;
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

// Agrupa sub-áreas do mesmo lugar:
//  "Kanto Route 2 South Towards Viridian City"  → Rota 2
//  "Altering Cave A/B/C"                        → Altering Cave
//  "Bell Tower 2f" … "Bell Tower 10f"           → Bell Tower
//  "Johto Safari Zone Forest"                   → Safari Zone
//  "Celadon City Prize Corner"                  → Celadon City
const MIRAGE_KIND = {
  cave: { label: "Miragem — cavernas", type: "cave" },
  forest: { label: "Miragem — florestas", type: "forest" },
  island: { label: "Miragem — ilhas", type: "water" },
  mountain: { label: "Miragem — montanhas", type: "cave" },
};

function groupKeyAndBase(raw) {
  // ORAS: dezenas de "Mirage Spot ..." aleatórios → colapsa em 4 grupos
  const mir = raw.match(/^mirage spot (\w+)/i);
  if (mir) {
    const k = mir[1].toLowerCase();
    const m = MIRAGE_KIND[k] || { label: `Miragem — ${k}`, type: "other" };
    return { key: "mirage:" + k, base: m.label, region: "hoenn", routeNum: null, type: m.type };
  }

  const rt = parseRoute(raw);
  if (rt) {
    return {
      key: `route:${rt.region || ""}:${rt.num}`,
      base: `${rt.region ? cap(rt.region) + " " : ""}${rt.sea ? "Sea " : ""}Route ${rt.num}`,
      region: rt.region,
      routeNum: rt.num,
      type: rt.sea ? "water" : "route",
    };
  }
  const region = regionOf(raw);
  let type = classifyLocation(raw);
  let base = raw;

  const safari = raw.match(/^(.*?\bsafari zone)\b/i);
  const city = raw.match(/^(\w+\s+(?:city|town|island))\b\s+\S/i);
  if (safari) { base = safari[1]; type = "other"; }
  else if (city) { base = city[1]; type = "city"; }
  else {
    // colapsa andares / salas / entradas de dungeons no lugar "pai"
    base = raw
      .replace(/\s+(b?\d+f\S*|b\d+\b|\d+r\b|basement|entrance|inside|exterior|interior|cellar|hideout|outside|summit|apex|\S*small room|\S*large room|\S*\broom\b).*$/i, "")
      .replace(/\s+[A-Z]$/, "")       // "Altering Cave A"
      .replace(/\s+\d+$/, "")         // "Safari Zone Area 1"
      .trim();
    if (!base) base = raw;
  }

  return { key: "loc:" + base.toLowerCase(), base, region, routeNum: null, type };
}

function buildLocations() {
  const out = {};
  for (const g of store.games) {
    const byKey = new Map();
    for (const [pidStr, byGame] of Object.entries(store.encounters)) {
      const rows = byGame[g.slug];
      if (!rows) continue;
      const pid = Number(pidStr);
      for (const r of rows) {
        const gk = groupKeyAndBase(r.location);
        let loc = byKey.get(gk.key);
        if (!loc) {
          loc = {
            key: gk.key,
            base: gk.base,
            type: gk.type,
            region: gk.region,
            routeNum: gk.routeNum,
            entries: [],
            pokemonIds: new Set(),
          };
          byKey.set(gk.key, loc);
        }
        loc.entries.push({
          pokemonId: pid,
          method: r.method,
          minLevel: r.minLevel,
          maxLevel: r.maxLevel,
          chance: r.chance,
          conditions: r.conditions || [],
          exclusiveTo: r.exclusiveTo || null,
        });
        loc.pokemonIds.add(pid);
      }
    }

    const list = [...byKey.values()];
    const regions = new Set(list.map((l) => l.region).filter(Boolean));
    const multiRegion = regions.size > 1;
    for (const l of list) {
      l.typeLabel = LOC_TYPE_LABEL[l.type];
      l.label = locationLabel(l, multiRegion);
    }
    list.sort(compareLocations);
    out[g.slug] = { list, byKey, multiRegion };
  }
  return out;
}

function locationLabel(loc, multiRegion) {
  const regionSuffix = multiRegion && loc.region ? ` · ${cap(loc.region)}` : "";
  if (loc.routeNum != null && loc.type === "route") return `Rota ${loc.routeNum}${regionSuffix}`;
  let s = loc.base;
  if (loc.region) s = s.replace(new RegExp(`^${loc.region}\\s+`, "i"), "");
  return s + regionSuffix;
}

function compareLocations(a, b) {
  // agrupa por tipo (1 cabeçalho de cada), depois região, depois número da rota
  if (TYPE_ORDER[a.type] !== TYPE_ORDER[b.type]) return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
  const ra = REGION_ORDER[a.region] ?? 50;
  const rb = REGION_ORDER[b.region] ?? 50;
  if (ra !== rb) return ra - rb;
  if (a.routeNum != null && b.routeNum != null) return a.routeNum - b.routeNum;
  return a.label.localeCompare(b.label, "pt");
}

// Entradas de um Pokémon específico num local.
export function hereEntries(gameSlug, locationKey, pokemonId) {
  const loc = store.locations[gameSlug]?.byKey.get(locationKey);
  if (!loc) return [];
  return loc.entries.filter((e) => e.pokemonId === pokemonId);
}

function buildLines() {
  const groups = new Map(); // key -> { key, stageIds:[...], types:Set, names:[...] }
  for (const p of store.pokedex) {
    const key = p.evolutionChainId ? "chain-" + p.evolutionChainId : "solo-" + p.id;
    if (!groups.has(key)) groups.set(key, { key, stageIds: [], types: new Set(), names: [] });
    const g = groups.get(key);
    g.stageIds.push(p.id);
    p.types.forEach((t) => g.types.add(t));
    g.names.push(p.name.toLowerCase());
  }
  // ordena os estágios pela ordem da cadeia (quando houver)
  for (const g of groups.values()) {
    const chain = g.key.startsWith("chain-") && store.chains[g.key.slice(6)];
    if (chain) {
      const order = new Map(chain.stages.map((s, i) => [s.id, i]));
      g.stageIds.sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
    } else {
      g.stageIds.sort((a, b) => a - b);
    }
    // geração de introdução = a do primeiro estágio
    g.gen = store.byId.get(g.stageIds[0])?.generation ?? null;
  }
  return [...groups.values()];
}

// Pokémon de uma linha evolutiva (ordenados como na cadeia).
export function evolutionStages(pokemon) {
  const chain = store.chains[pokemon.evolutionChainId];
  if (!chain) return [{ id: pokemon.id, name: pokemon.name, from: null, conditions: [], conditionLabel: "" }];
  return chain.stages;
}

// Todos os ids de uma linha evolutiva (para a barra de progresso).
export function evolutionLineIds(pokemon) {
  return evolutionStages(pokemon).map((s) => s.id);
}

// Pseudo-lendários ("semi-lendários"): formas finais de linhas de 600 de total
// de base, não-lendárias. Lista fixa (Bulbapedia).
const PSEUDO_LEGENDARY = new Set([149, 248, 373, 376, 445, 635, 706, 784, 887, 998]);

// Ultra Beasts (Gen VII). Lista fixa.
const ULTRA_BEAST = new Set([793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806]);

// Pokémon Paradoxo (Gen IX) — passado e futuro, incluindo os do DLC. Lista fixa.
const PARADOX = new Set([
  984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995,
  1005, 1006, 1009, 1010, 1020, 1021, 1022, 1023,
]);

// Iniciais de cada geração (só o 1º estágio; a linha inteira herda pela agregação).
const STARTER = new Set([
  1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393,
  495, 498, 501, 650, 653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912,
]);

// Traços "de coleção" pra filtrar. Ordem = ordem de exibição no picker.
export const TRAIT_ORDER = ["mega", "regional", "pseudo", "legendary", "mythical", "ultrabeast", "paradox", "starter"];
export const TRAIT_LABEL = {
  mega: "Tem Mega",
  regional: "Forma regional",
  pseudo: "Semi-lendário",
  legendary: "Lendário",
  mythical: "Mítico",
  ultrabeast: "Ultra Beast",
  paradox: "Paradoxo",
  starter: "Inicial",
};

// Traços de UM Pokémon (o "mega" vale só pra quem tem Mega própria; "regional"
// vale pra espécie que tem alguma forma de Alola/Galar/Hisui/Paldea).
export function pokeTraits(p) {
  if (!p) return [];
  const out = [];
  if (p.mega) out.push("mega");
  if (store.regionals[p.id]?.length) out.push("regional");
  if (PSEUDO_LEGENDARY.has(p.id)) out.push("pseudo");
  if (p.legendary) out.push("legendary");
  if (p.mythical) out.push("mythical");
  if (ULTRA_BEAST.has(p.id)) out.push("ultrabeast");
  if (PARADOX.has(p.id)) out.push("paradox");
  if (STARTER.has(p.id)) out.push("starter");
  return out;
}

// Traços de uma LINHA evolutiva (união dos traços de cada estágio).
export function lineTraitSet(line) {
  const s = new Set();
  for (const id of line.stageIds) {
    const p = store.byId.get(id);
    if (p) for (const t of pokeTraits(p)) s.add(t);
  }
  return s;
}

// Raridade da LINHA evolutiva → bola exibida no card (o card representa a linha
// inteira, então vale a forma mais rara dela):
//   mítico → cherish · lendário → master · pseudo-lendário → ultra · resto → poke
const BALL_RANK = { poke: 0, ultra: 1, master: 2, cherish: 3 };
function rarityOf(p) {
  if (!p) return "poke";
  if (p.mythical) return "cherish";
  if (p.legendary) return "master";
  return PSEUDO_LEGENDARY.has(p.id) ? "ultra" : "poke";
}
export function ballKind(pokemon) {
  let best = "poke";
  for (const id of evolutionLineIds(pokemon)) {
    const k = rarityOf(store.byId.get(id));
    if (BALL_RANK[k] > BALL_RANK[best]) best = k;
  }
  return best;
}

// "self" se o próprio Pokémon tem Mega, "line" se algum na linha tem, senão null
export function megaScope(pokemon) {
  if (pokemon.mega) return "self";
  return evolutionLineIds(pokemon).some((id) => store.byId.get(id)?.mega) ? "line" : null;
}

// Todas as Mega Evoluções da LINHA evolutiva (o card representa a linha).
export function megasFor(pokemon) {
  const out = [];
  for (const id of evolutionLineIds(pokemon)) {
    const list = store.megas[id];
    if (list) out.push(...list);
  }
  return out;
}

// Formas regionais (Alola / Galar / Hisui / Paldea) da LINHA evolutiva.
// Cada item ganha `speciesId` (a espécie canônica de onde a forma vem).
export function regionalsFor(pokemon) {
  const out = [];
  for (const id of evolutionLineIds(pokemon)) {
    const list = store.regionals[id];
    if (list) for (const f of list) out.push({ ...f, speciesId: id });
  }
  return out;
}

// Posição do Pokémon dentro da linha evolutiva: { pos, max } ou null (não evolui).
// pos = ordem na linha, max = total de membros da linha — inclui ramificações:
// Bulbasaur 1/3, Venusaur 3/3; Eevee 1/9, Vaporeon 2/9, Sylveon 9/9.
export function evoPosition(pokemon) {
  const chain = store.chains[pokemon.evolutionChainId];
  if (!chain || chain.stages.length <= 1) return null;
  const idx = chain.stages.findIndex((s) => s.id === pokemon.id);
  if (idx < 0) return null;
  return { pos: idx + 1, max: chain.stages.length };
}

// Um Pokémon "existe" em um jogo se pertence à geração daquele jogo ou anterior.
// (Aproximação: a Pokédex nacional cresce por geração; jogos de Gen N contêm 1..limite(N).)
const GEN_MAX = { 1: 151, 2: 251, 3: 386, 4: 493, 5: 649, 6: 721, 7: 809, 8: 905, 9: 1025 };
export function existsInGame(pokemon, game) {
  if (!game || game.slug === "all") return true;
  return pokemon.id <= (GEN_MAX[game.generation] ?? Infinity);
}

// Encontros agrupados por jogo (ordem de geração). gameSlug "all" = todos.
// Cada jogo: { slug, label, generation, region, locs: [...] } — UM item por local
// (mesma consolidação do seletor de locais: "Kanto Route 11 South" → "Rota 11"),
// com faixa de nível combinada e a melhor chance.
export function encountersByGame(pokemonId, gameSlug) {
  const byGame = store.encounters[pokemonId];
  if (!byGame) return [];

  const wanted = store.games.filter(
    (g) => byGame[g.slug]?.length && (gameSlug === "all" || g.slug === gameSlug),
  );

  return wanted.map((g) => {
    const groups = new Map();
    for (const e of byGame[g.slug]) {
      const gk = groupKeyAndBase(e.location);
      let loc = groups.get(gk.key);
      if (!loc) {
        loc = {
          key: gk.key, base: gk.base, region: gk.region, routeNum: gk.routeNum, type: gk.type,
          chance: 0, minLevel: Infinity, maxLevel: 0,
          methods: new Set(), conditions: new Set(),
        };
        groups.set(gk.key, loc);
      }
      loc.chance = Math.max(loc.chance, e.chance || 0);
      if (e.minLevel) loc.minLevel = Math.min(loc.minLevel, e.minLevel);
      if (e.maxLevel) loc.maxLevel = Math.max(loc.maxLevel, e.maxLevel);
      loc.methods.add(e.method);
      for (const c of e.conditions || []) loc.conditions.add(c);
    }

    const locs = [...groups.values()];
    const regions = new Set(locs.map((l) => l.region).filter(Boolean));
    const multiRegion = regions.size > 1;
    for (const l of locs) {
      l.label = locationLabel(l, multiRegion);
      if (l.minLevel === Infinity) l.minLevel = l.maxLevel || 0;
    }
    locs.sort((a, b) =>
      b.chance - a.chance ||
      (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) ||
      a.label.localeCompare(b.label, "pt"));

    const region = [...regions].sort(
      (a, b) => (REGION_ORDER[a] ?? 99) - (REGION_ORDER[b] ?? 99),
    )[0] || null;

    return {
      slug: g.slug, label: g.label, generation: g.generation,
      color: g.color, nameParts: gameNameParts(g), region, locs,
    };
  });
}
