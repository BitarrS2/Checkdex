// Descrição em PT-BR da condição de evolução (ver pickCond / describeCond).
// Regra: mecânicas em português ("Troca", "Amizade alta", "Nv. 20"), mas
// nomes de itens e lugares ficam como nos jogos ("Dusk Stone", "King's Rock").

// Nomes de itens/lugares NÃO são traduzidos (são os termos dos jogos: "Dusk
// Stone", "King's Rock"…). Só corrigimos formatação do que vem da PokéAPI.
const ITEM_FIX = {
  "Kings Rock": "King's Rock",
  "Up Grade": "Up-Grade",
  "Scroll Of Darkness": "Scroll of Darkness",
  "Scroll Of Waters": "Scroll of Waters",
  "Gimmighoul Coins": "999 Gimmighoul Coins",
};
const itemName = (raw) => ITEM_FIX[raw] || raw;

const TOD = { day: "de dia", night: "à noite", "": "" };
const tod = (t) => TOD[t] ?? "";

const TYPE_PT = {
  normal: "Normal", fire: "Fire", water: "Water", grass: "Grass",
  electric: "Electric", ice: "Ice", fighting: "Fighting", poison: "Poison",
  ground: "Ground", flying: "Flying", psychic: "Psychic", bug: "Bug",
  rock: "Rock", ghost: "Ghost", dragon: "Dragon", dark: "Dark",
  steel: "Steel", fairy: "Fairy",
};

// gatilhos "estranhos" da PokéAPI
const TRIGGER_PT = {
  "three-critical-hits": "3 golpes críticos numa batalha",
  "take-damage": "após levar bastante dano",
  "recoil-damage": "após levar dano de recuo",
  "agile-style-move": "usando golpe no Agile Style",
  "strong-style-move": "usando golpe no Strong Style",
  "tower-of-darkness": "na Tower of Darkness",
  "tower-of-waters": "na Tower of Waters",
  "spin": "girando com uma Sweet",
  "shed": "com espaço no time + Poké Bola vazia",
  "other": "condição especial",
  "trade": "Troca",
};

// junta a base ("Nv. 20", "Subir de nível", "Troca") com os extras entre parênteses
const withExtras = (base, extras) =>
  base + (extras.length ? ` (${extras.filter(Boolean).join(", ")})` : "");

function extrasOf(c) {
  const e = [];
  if (c.heldItem) e.push(`segurando ${itemName(c.heldItem)}`);
  if (c.timeOfDay) e.push(tod(c.timeOfDay));
  if (c.gender === 1) e.push("fêmea");
  if (c.gender === 2) e.push("macho");
  if (c.knownMove) e.push(`golpe ${c.knownMove}`);
  if (c.knownMoveType) e.push(`golpe ${TYPE_PT[c.knownMoveType] || c.knownMoveType}`);
  if (c.minAffection) e.push("afeição alta");
  if (c.minBeauty) e.push("Beleza alta");
  if (c.relativePhysicalStats === 1) e.push("Atk > Def");
  if (c.relativePhysicalStats === -1) e.push("Atk < Def");
  if (c.relativePhysicalStats === 0) e.push("Atk = Def");
  if (c.partySpecies) e.push(`com ${c.partySpecies} no time`);
  if (c.partyType) e.push(`com tipo ${TYPE_PT[c.partyType] || c.partyType} no time`);
  if (c.needsOverworldRain) e.push("na chuva");
  if (c.location) e.push(`em ${c.location}`);
  if (c.turnUpsideDown) e.push("com o console de cabeça pra baixo");
  return e;
}

// A PokéAPI traz uma condição por version group; escolhemos a mais "limpa"
// (item > troca > nível > social > lugar) pra representar a evolução.
export function pickCond(conditions) {
  if (!conditions || !conditions.length) return null;
  const score = (c) => {
    if (c.item) return 7;
    if (c.tradeSpecies || c.trigger === "trade") return 6;
    if (c.heldItem) return 5;
    if (c.minLevel) return 4;
    if (c.minHappiness || c.minAffection || c.minBeauty || c.knownMove
      || c.knownMoveType || c.relativePhysicalStats != null || c.turnUpsideDown) return 3;
    if (c.location || c.timeOfDay) return 2;
    return 1;
  };
  return [...conditions].sort((a, b) => score(b) - score(a))[0];
}

export function describeCond(cond, fallbackLabel = "") {
  const c = cond || {};
  const extras = extrasOf(c);

  if (c.item) return withExtras(itemName(c.item), c.timeOfDay ? [tod(c.timeOfDay)] : []);

  if (c.trigger === "trade") {
    if (c.tradeSpecies) return `Troca por ${c.tradeSpecies}`;
    return c.heldItem ? `Troca segurando ${itemName(c.heldItem)}` : "Troca";
  }

  if (c.minLevel) return withExtras(`Nv. ${c.minLevel}`, extras);

  if (c.minHappiness) return withExtras("Amizade alta", extras);

  if (c.trigger === "level-up" || c.heldItem || (!c.trigger && (extras.length || c.minAffection || c.minBeauty))) {
    if (!extras.length) return "Subir de nível";
    const s = extras.join(" · ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  if (c.trigger && TRIGGER_PT[c.trigger]) return withExtras(TRIGGER_PT[c.trigger], extras);

  // fallback: rótulo já resumido pelo build. Traduz só as mecânicas, nunca
  // nomes de itens ("... Stone" fica como está).
  return (fallbackLabel || "—")
    .replace(/^Lv\. /, "Nv. ")
    .replace(/^Level Up$/, "Subir de nível")
    .replace(/^Felicidade$/, "Amizade alta")
    .replace(/^Troca c\/ /, "Troca segurando ")
    .replace(/^Three Critical Hits$/, "3 golpes críticos numa batalha")
    .replace(/^Recoil Damage$/, "após levar dano de recuo")
    .replace(/^Take Damage$/, "após levar bastante dano");
}
