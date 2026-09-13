// Builds. Fonte principal: as sets competitivas do Smogon (data/sets.json).
// Quando o Pokémon/forma não tem set numa geração, cai numa heurística a partir
// dos status, tipos e golpes que ele aprende.

import { store, evolutionStages } from "../data.js";

export const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
export const STAT_FULL = {
  hp: "PV", atk: "Ataque", def: "Defesa", spa: "Ataque Especial", spd: "Defesa Especial", spe: "Velocidade",
};

// nome (Smogon / dex / forma) -> chave de lookup
export const slugName = (s) => (s || "").toString().toLowerCase()
  .replace(/[’'.:]/g, "").replace(/é/g, "e").replace(/♀/g, "-f").replace(/♂/g, "-m")
  .replace(/%/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

// sufixos de forma-padrão que o Smogon guarda sob o nome-base
const BASE_FORM = /-(normal|altered|land|incarnate|standard|aria|shield|red-striped|average|midday|baile|full-belly|single-strike|amped|two-segment|curly|zero|male|female|natural|plant|overcast|west|east|striped|combat-breed|blaze-breed|aqua-breed|meteor|core)$/;

function megaStoneSet() {
  const out = new Set();
  for (const list of Object.values(store.megas || {})) {
    for (const m of list) if (m.stone) out.add(slugName(m.stone));
  }
  return out;
}

// sets do Smogon para uma entrada do seletor, na geração escolhida
export function smogonSets(entry, gen) {
  const sets = store.sets || {};
  if (entry.mega) {
    const list = sets[entry.baseSlug]?.[gen] || [];
    const stone = slugName(entry.stone || "");
    return stone ? list.filter((s) => (s.item || []).some((it) => slugName(it) === stone)) : [];
  }
  const raw = entry.regKey || slugName(entry.name);
  const key = sets[raw] ? raw : (BASE_FORM.test(raw) ? raw.replace(BASE_FORM, "") : raw);
  const stones = megaStoneSet();
  return (sets[key]?.[gen] || []).filter((s) => !(s.item || []).some((it) => stones.has(slugName(it))));
}

// build do MetaVGC (uso real em Pokémon Champions/VGC) pra uma entrada do
// seletor — golpe/item/habilidade mais usados; sem Natureza/EVs porque o
// site-fonte não estrutura isso por Pokémon, só em pastes de time.
export function metavgcSet(entry) {
  const data = store.metavgc || {};
  const key = entry.mega || entry.regKey ? entry.id : slugName(entry.name);
  return data[key] || null;
}

const moveSlug = (n) => slugName(n);
const arr = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);

// resolve uma set do Smogon num modelo pronto pra renderizar
export function resolveSet(set) {
  const natSlug = slugName(arr(set.nature)[0] || "");
  const eff = NATURE_EFFECT[natSlug];
  const nature = natSlug ? {
    name: NATURE_NAME[natSlug] || arr(set.nature)[0],
    plus: eff ? eff[0] : null, minus: eff ? eff[1] : null,
  } : null;

  const abSlug = arr(set.ability)[0];
  const ability = abSlug ? {
    slug: abSlug, name: store.abilities[abSlug]?.n || abSlug, short: store.abilities[abSlug]?.short || "",
  } : null;

  const items = (set.item || []).filter((i) => i && i !== "No Item")
    .map((n) => {
      const s = slugName(n);
      return { slug: s, name: store.items[s]?.n || n, d: store.items[s]?.d || "" };
    });
  const item = items.length ? { ...items[0], alts: items.slice(1) } : null;

  const evs = STAT_KEYS.filter((k) => set.evs && set.evs[k]).map((k) => ({ k, v: set.evs[k] }));
  const ivs = STAT_KEYS.filter((k) => set.ivs && set.ivs[k] != null).map((k) => ({ k, v: set.ivs[k] }));

  const moves = (set.moves || []).map((slot) => {
    const opts = arr(slot).map(moveSlug);
    const m = store.moves[opts[0]];
    return {
      slug: opts[0],
      n: m?.n || opts[0], t: m?.t || "normal", c: m?.c || "stat", p: m?.p ?? null, d: m?.d || "",
      alts: opts.slice(1).map((s) => store.moves[s]?.n || s),
    };
  });

  return {
    fmt: set.fmt, fmtLabel: set.fmtLabel, name: set.name,
    nature, ability, item, evs, ivs, tera: set.tera || [], level: set.level || null, moves,
  };
}

/* ---------------- naturezas ---------------- */
// nome -> [ +stat , -stat ]  (neutras ficam de fora)
export const NATURE_EFFECT = {
  lonely: ["atk", "def"], brave: ["atk", "spe"], adamant: ["atk", "spa"], naughty: ["atk", "spd"],
  bold: ["def", "atk"], relaxed: ["def", "spe"], impish: ["def", "spa"], lax: ["def", "spd"],
  timid: ["spe", "atk"], hasty: ["spe", "def"], jolly: ["spe", "spa"], naive: ["spe", "spd"],
  modest: ["spa", "atk"], mild: ["spa", "def"], quiet: ["spa", "spe"], rash: ["spa", "spd"],
  calm: ["spd", "atk"], gentle: ["spd", "def"], sassy: ["spd", "spe"], careful: ["spd", "spa"],
};
const NATURE_BY_PAIR = {};
for (const [name, [p, m]] of Object.entries(NATURE_EFFECT)) NATURE_BY_PAIR[`${p}:${m}`] = name;

export const NATURE_NAME = {
  adamant: "Adamant", modest: "Modest", jolly: "Jolly", timid: "Timid",
  careful: "Careful", calm: "Calm", bold: "Bold", impish: "Impish",
  brave: "Brave", quiet: "Quiet", relaxed: "Relaxed", sassy: "Sassy",
  lonely: "Lonely", naughty: "Naughty", lax: "Lax", hasty: "Hasty",
  naive: "Naive", mild: "Mild", rash: "Rash", gentle: "Gentle",
};

export const STAT_ABBR = { hp: "PV", atk: "Atq.", def: "Def.", spa: "Sp. Atq.", spd: "Sp. Def.", spe: "Vel." };

export function recommendNature(s) {
  const atkKey = s.spa > s.atk ? "spa" : "atk";
  const unused = atkKey === "spa" ? "atk" : "spa";
  const bulk = Math.max(s.def, s.spd);
  const off = s[atkKey];

  let plus, minus;
  if (bulk > off && s.hp >= 70 && off < 95) {
    // parede: reforça a defesa maior, corta o ataque que não usa
    plus = s.spd >= s.def ? "spd" : "def";
    minus = "atk";
  } else if (s.spe > off || (s.spe >= off * 0.82 && s.spe >= 80)) {
    // veloz: reforça velocidade
    plus = "spe";
    minus = unused;
  } else {
    plus = atkKey;
    minus = unused;
  }
  if (plus === minus) minus = plus === "atk" ? "spe" : "atk";
  const key = NATURE_BY_PAIR[`${plus}:${minus}`];
  return { key, name: NATURE_NAME[key] || key, plus, minus };
}

/* ---------------- habilidade ---------------- */
// habilidades fracas/situacionais — se a oculta for uma dessas, prefere a normal
const WEAK_ABILITY = new Set([
  "gluttony", "run-away", "illuminate", "honey-gather", "ball-fetch", "stall", "klutz",
  "normalize", "truant", "slow-start", "defeatist", "friend-guard", "telepathy", "healer",
  "pickup", "anticipation", "forewarn", "frisk", "keen-eye", "hyper-cutter", "big-pecks",
  "tangled-feet", "minus", "plus", "pickpocket", "receiver", "power-of-alchemy", "symbiosis",
  "steadfast", "sweet-veil", "flower-veil", "aroma-veil", "grass-pelt", "cheek-pouch",
  "wimp-out", "emergency-exit", "shields-down", "stakeout", "cursed-body", "sand-veil",
  "snow-cloak", "own-tempo", "oblivious", "rattled", "rivalry",
  "damp", "leaf-guard", "sticky-hold", "liquid-ooze", "heatproof", "dazzling",
  "wonder-skin", "color-change", "shed-skin", "hydration", "insomnia", "vital-spirit",
]);
// habilidades muito boas — priorizadas entre as normais
const STRONG_ABILITY = new Set([
  "thick-fat", "levitate", "regenerator", "intimidate", "multiscale", "shadow-shield",
  "huge-power", "pure-power", "speed-boost", "drought", "drizzle", "sand-stream", "snow-warning",
  "protean", "libero", "adaptability", "technician", "sheer-force", "guts", "moxie",
  "beast-boost", "magic-guard", "water-absorb", "volt-absorb", "flash-fire", "storm-drain",
  "lightning-rod", "sap-sipper", "prankster", "unaware", "natural-cure", "magic-bounce",
  "mold-breaker", "contrary", "tinted-lens", "no-guard", "skill-link", "serene-grace",
  "swift-swim", "chlorophyll", "sand-rush", "slush-rush", "poison-heal", "triage",
  "gorilla-tactics", "transistor", "dragons-maw", "steelworker", "rocky-payload",
  "water-bubble", "purifying-salt", "well-baked-body", "toxic-debris", "supreme-overlord",
  "good-as-gold", "quark-drive", "protosynthesis", "unburden", "tough-claws", "strong-jaw",
  "iron-fist", "reckless", "solar-power", "grassy-surge", "electric-surge", "psychic-surge",
  "misty-surge", "orichalcum-pulse", "hadron-engine",
  "dry-skin", "static", "flame-body", "rough-skin", "iron-barbs", "gooey", "tangling-hair",
  "stamina", "fluffy", "fur-coat", "ice-scales", "filter", "solid-rock", "prism-armor",
  "disguise", "sturdy", "wonder-guard",
]);

export function recommendAbility(pokemon, gen) {
  const abis = pokemon.abilities || [];
  if (!abis.length || gen < 3) return null;
  const hidden = abis.find((a) => a.hidden);
  const regs = abis.filter((a) => !a.hidden);
  let pick;
  if (gen >= 5 && hidden && !WEAK_ABILITY.has(hidden.slug)) pick = hidden;
  else {
    pick = regs.find((a) => STRONG_ABILITY.has(a.slug))
      || regs.find((a) => !WEAK_ABILITY.has(a.slug))
      || regs[0] || abis[0];
  }
  const info = store.abilities[pick.slug] || { n: pick.slug, short: "" };
  const others = abis
    .filter((a) => a.slug !== pick.slug)
    .map((a) => {
      const i = store.abilities[a.slug] || { n: a.slug, short: "" };
      return { slug: a.slug, hidden: !!a.hidden, name: i.n, short: i.short };
    });
  return { slug: pick.slug, hidden: !!pick.hidden, name: info.n, short: info.short, others };
}

/* ---------------- item ---------------- */
const TYPE_ITEM = {
  normal: "silk-scarf", fire: "charcoal", water: "mystic-water", electric: "magnet",
  grass: "miracle-seed", ice: "never-melt-ice", fighting: "black-belt", poison: "poison-barb",
  ground: "soft-sand", flying: "sharp-beak", psychic: "twisted-spoon", bug: "silver-powder",
  rock: "hard-stone", ghost: "spell-tag", dragon: "dragon-fang", dark: "black-glasses",
  steel: "metal-coat", fairy: "pixie-plate",
};
export const ITEM_NAME = {
  "life-orb": "Life Orb", "leftovers": "Leftovers", "eviolite": "Eviolite",
  "choice-band": "Choice Band", "choice-specs": "Choice Specs", "choice-scarf": "Choice Scarf",
  "assault-vest": "Assault Vest", "focus-sash": "Focus Sash", "expert-belt": "Expert Belt",
  "rocky-helmet": "Rocky Helmet", "wide-lens": "Wide Lens",
  "silk-scarf": "Silk Scarf", "charcoal": "Charcoal", "mystic-water": "Mystic Water",
  "magnet": "Magnet", "miracle-seed": "Miracle Seed", "never-melt-ice": "Never-Melt Ice",
  "black-belt": "Black Belt", "poison-barb": "Poison Barb", "soft-sand": "Soft Sand",
  "sharp-beak": "Sharp Beak", "twisted-spoon": "Twisted Spoon", "silver-powder": "Silver Powder",
  "hard-stone": "Hard Stone", "spell-tag": "Spell Tag", "dragon-fang": "Dragon Fang",
  "black-glasses": "Black Glasses", "metal-coat": "Metal Coat", "pixie-plate": "Pixie Plate",
};
const ITEM_WHY = {
  "life-orb": "Aumenta o dano em 30%, mas custa 10% do PV a cada golpe.",
  "leftovers": "Recupera 1/16 do PV máximo no fim de cada turno.",
  "eviolite": "Aumenta Def. e Sp. Def. em 50% — só funciona em quem ainda evolui.",
  "choice-band": "+50% de Atq., mas trava no primeiro golpe usado.",
  "choice-specs": "+50% de Sp. Atq., mas trava no primeiro golpe usado.",
  "choice-scarf": "+50% de Velocidade, mas trava no primeiro golpe usado.",
  "assault-vest": "+50% de Sp. Def., mas só deixa usar golpes de dano.",
  "focus-sash": "Se estiver com o PV cheio, segura um golpe que nocautearia com 1 de PV.",
  "expert-belt": "+20% de dano nos golpes super-efetivos.",
  "rocky-helmet": "Quem encostar no portador leva 1/6 do PV máximo de dano.",
  "wide-lens": "+10% de precisão em todos os golpes.",
};
const TYPE_ITEM_WHY = "Aumenta em 20% o dano dos golpes do tipo principal do Pokémon.";

// ainda evolui? (tem algum estágio que vem deste Pokémon)
function isNFE(pokemon) {
  return evolutionStages(pokemon).some((s) => s.from === pokemon.id);
}

// devolve até 3 itens em ordem do melhor pro pior para o papel do Pokémon
export function recommendItem(pokemon, gen) {
  if (gen < 2) return { list: [] }; // Gen I não tem itens equipáveis
  const s = pokemon.stats;
  const atkKey = s.spa > s.atk ? "spa" : "atk";
  const bulky = Math.max(s.def, s.spd) >= s[atkKey] && s.hp >= 70;
  const frail = s.hp + s.def + s.spd <= 200;
  const fast = s.spe >= 95;

  const order = [];
  const add = (slug, minGen = 2) => {
    if (slug && gen >= minGen && !order.includes(slug)) order.push(slug);
  };

  if (isNFE(pokemon)) add("eviolite", 5);
  if (bulky) {
    add("leftovers", 2);
    add("assault-vest", 6);
    add("rocky-helmet", 5);
  } else {
    add("life-orb", 4);
    add(atkKey === "atk" ? "choice-band" : "choice-specs", atkKey === "atk" ? 3 : 4);
    if (fast) add("choice-scarf", 4);
    if (frail) add("focus-sash", 4);
    add("expert-belt", 4);
  }
  add(TYPE_ITEM[pokemon.types[0]], 2); // sempre disponível (Gen 2+)
  add("leftovers", 2);

  const list = order.slice(0, 3).map((slug) => ({
    slug,
    name: ITEM_NAME[slug] || slug,
    why: ITEM_WHY[slug] || (Object.values(TYPE_ITEM).includes(slug) ? TYPE_ITEM_WHY : ""),
  }));
  return { list };
}

/* ---------------- golpes ---------------- */
// golpes ruins pra IA simples: 2 turnos / recarga / auto-KO / custo alto de HP /
// condicionais — não são banidos, só bem penalizados (só aparecem sem opção).
const AWFUL = new Set([
  "solar-beam", "solar-blade", "sky-attack", "skull-bash", "razor-wind", "freeze-shock",
  "ice-burn", "geomancy", "meteor-beam", "electro-shot", "phantom-force", "shadow-force",
  "bounce", "dig", "dive", "fly", "sky-drop",
  "hyper-beam", "giga-impact", "frenzy-plant", "hydro-cannon", "blast-burn", "rock-wrecker",
  "roar-of-time", "prismatic-laser", "eternabeam", "hyperspace-hole", "meteor-assault",
  "self-destruct", "explosion", "misty-explosion", "final-gambit", "steel-beam", "mind-blown",
  "chloroblast", "light-of-ruin", "shell-trap", "beak-blast",
  "focus-punch", "steel-roller", "dream-eater", "last-resort", "belch", "synchronoise",
  "hidden-power", "natural-gift", "fling", "stored-power", "power-trip", "spit-up",
  "snore", "sleep-talk", "wring-out", "crush-grip", "eruption", "water-spout", "dragon-energy",
  "return", "frustration", "false-swipe", "hold-back",
]);
// nukes que baixam status próprio — bons, mas só se quer 1
const NUKE_DROP = new Set([
  "leaf-storm", "overheat", "draco-meteor", "fleur-cannon", "psycho-boost", "make-it-rain",
  "superpower", "close-combat", "dragon-ascent", "hammer-arm", "v-create", "clanging-scales",
]);
// golpes que prendem o usuário / desgastam
const LOCKS = new Set([
  "outrage", "thrash", "petal-dance", "ice-ball", "rollout", "uproar", "raging-fury",
]);

// setup coerente com o atacante
const SETUP = {
  atk: ["swords-dance", "dragon-dance", "bulk-up", "coil", "howl", "shift-gear"],
  spa: ["nasty-plot", "calm-mind", "quiver-dance", "tail-glow", "growth"],
};
// utilidade genérica (qualquer build)
const UTIL_ORDER = [
  "roost", "recover", "slack-off", "soft-boiled", "synthesis", "morning-sun", "moonlight",
  "spore", "sleep-powder", "will-o-wisp", "toxic", "thunder-wave", "nuzzle", "glare",
  "leech-seed", "substitute", "stealth-rock", "defog", "rapid-spin", "knock-off",
  "u-turn", "volt-switch", "taunt", "encore",
];

export function recommendMoves(pokemon, gen, mode) {
  const set = store.movesets[pokemon.id] || {};
  const s = pokemon.stats;
  const atkKey = s.spa > s.atk ? "spa" : "atk";

  const learnable = Object.entries(set)
    .filter(([slug, g]) => g <= gen && store.moves[slug])
    .map(([slug]) => ({ slug, ...store.moves[slug] }));
  if (!learnable.length) return null;

  const has = (slug) => set[slug] != null && set[slug] <= gen && store.moves[slug];
  const mv = (slug) => ({ slug, ...store.moves[slug] });

  const dmg = learnable.filter((m) => m.p);
  const score = (m) => {
    const stab = pokemon.types.includes(m.t) ? 1.5 : 0.92;
    const fit = gen < 3 ? 1
      : (m.c === "spec" && atkKey === "spa") || (m.c === "phys" && atkKey === "atk") ? 1.35
        : 0.5;
    const acc = 0.34 + (m.a ?? 100) / 152;
    const pen = AWFUL.has(m.slug) ? 0.12
      : LOCKS.has(m.slug) ? 0.62
        : NUKE_DROP.has(m.slug) ? 0.9 : 1;
    return m.p * stab * fit * acc * pen;
  };
  dmg.sort((a, b) => score(b) - score(a));

  // 1 golpe por tipo (o melhor de cada)
  const oneEach = [];
  const seen = new Set();
  for (const m of dmg) {
    if (seen.has(m.t)) continue;
    seen.add(m.t);
    oneEach.push(m);
  }
  if (mode === "pve") {
    // PvE: 4 golpes de dano, cobrindo tipos diferentes
    const out = oneEach.slice(0, 4);
    while (out.length < 4) {
      const nx = dmg.find((m) => !out.includes(m));
      if (!nx) break;
      out.push(nx);
    }
    return out.slice(0, 4);
  }

  // 3 golpes de dano com cobertura + 1 de utilidade (setup coerente / suporte)
  const cover = oneEach.slice(0, 3);
  const u = [...SETUP[atkKey], ...UTIL_ORDER].find((x) => has(x) && !cover.some((c) => c.slug === x));
  if (u) cover.push(mv(u));
  else if (oneEach[3]) cover.push(oneEach[3]);
  return cover.slice(0, 4);
}

/* ---------------- sets automáticas (quando não há set do Smogon) ----------------
   Gera 2 conjuntos no MESMO formato de uma set do Smogon crua, pra passar pelo
   mesmo resolveSet() e ser renderizado igualzinho. */
export function heuristicSets(mon, gen, entry) {
  const s = mon.stats;
  if (!s) return [];
  const offMoves = recommendMoves(mon, gen, "pve");
  if (!offMoves || !offMoves.length) return [];

  const atkKey = s.spa > s.atk ? "spa" : "atk";
  const unusedAtk = atkKey === "spa" ? "atk" : "spa";
  const ranked = ["atk", "def", "spa", "spd", "spe"].sort((a, b) => s[b] - s[a]);
  const fast = ranked.indexOf("spe") <= 1;
  const defKey = s.def >= s.spd ? "def" : "spd";
  const otherDef = defKey === "def" ? "spd" : "def";
  const weakAtk = s.atk <= s.spa ? "atk" : "spa";
  const nfe = isNFE(mon);

  const abSlug = entry?.megaAbility || recommendAbility(mon, gen)?.slug || null;
  const natSlug = (plus, minus) => (plus === minus ? null : NATURE_BY_PAIR[`${plus}:${minus}`]);
  const raw = (name, nature, ability, item, evs, ivs, moves) => ({
    fmt: "auto", fmtLabel: "Auto", name, rank: 0,
    nature, ability, item, evs, ivs: ivs || null,
    moves: moves.map((m) => [m.slug]), teratypes: [],
  });

  // Mega com pedra canônica: o slot de item é a própria pedra — sem ela a
  // Mega Evolução nem acontece, então nada de Life Orb/Leftovers/etc aqui.
  const megaStone = entry?.mega && entry.stone ? slugName(entry.stone) : null;
  const offItem = megaStone
    ? [megaStone]
    : gen >= 4 ? ["life-orb"] : gen >= 2 ? [TYPE_ITEM[mon.types[0]] || "silk-scarf"] : [];
  const defItem = megaStone
    ? [megaStone]
    : gen < 2 ? [] : nfe && gen >= 5 ? ["eviolite"] : ["leftovers"];

  const out = [];

  // Ofensiva — investe no ataque dominante (ou na velocidade se for veloz)
  out.push(raw(
    "Ofensiva",
    natSlug(fast ? "spe" : atkKey, unusedAtk),
    abSlug,
    offItem,
    gen >= 3 ? { [atkKey]: 252, spe: 252, hp: 4 } : null,
    gen >= 3 && atkKey === "spa" ? { atk: 0 } : null,
    offMoves,
  ));

  // Defensiva — muralha, corta o ataque que não usa
  const defMoves = recommendMoves(mon, gen, "pvp") || offMoves;
  out.push(raw(
    "Defensiva",
    natSlug(defKey, weakAtk),
    abSlug,
    defItem,
    gen >= 3 ? { hp: 252, [defKey]: 252, [otherDef]: 4 } : null,
    null,
    defMoves,
  ));

  return out;
}
