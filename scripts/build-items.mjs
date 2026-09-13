// Monta data/items.json (nome + efeito curto) com TODOS os itens equipáveis
// reais do jogo (não só os citados nas sets do Smogon) + baixa os sprites.
//   node scripts/build-items.mjs
//
// A lista vem de categorias curadas da PokéAPI (held-items, choice,
// bad-held-items, type-enhancement, type-protection, species-specific,
// plates, jewels, memories, z-crystals + as berries de batalha) em vez do
// atributo bruto "holdable" (que inclui Poké Bolas, Poções etc. — qualquer
// item pode ocupar o slot de "held item" mesmo sem ter efeito nenhum lá).
// Some às sets do Smogon (o que já era feito) só por garantia.

import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const ITEMS_DIR = path.join(ROOT, "assets", "items");
const API = "https://pokeapi.co/api/v2";
const PS = "https://raw.githubusercontent.com/msikma/pokesprite/master/items";

const itemSlug = (n) => (n || "").toLowerCase()
  .replace(/[’']/g, "").replace(/[.:]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
const titleCase = (slug) => slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const clean = (s) => {
  let d = (s || "").replace(/\s+/g, " ").replace(/’/g, "'")
    .replace(/^Held:\s*/i, "").replace(/^Holders?\s+/i, "").replace(/\bHolder\b/g, "the holder").trim();
  if (d && d[0] === d[0].toLowerCase()) d = d[0].toUpperCase() + d.slice(1);
  return d;
};

// itens que a PokéAPI ainda não descreve (Gen 8/9, cristais Z, alguns antigos)
const MANUAL_DESC = {
  "loaded-dice": "Multi-hit moves always hit 4 or 5 times.",
  "covert-cloak": "Protects the holder from the additional effects of the opponent's attacks.",
  "clear-amulet": "Prevents other Pokémon from lowering the holder's stats.",
  "mirror-herb": "When an opposing Pokémon's stats rise, the holder copies the boost. Single use.",
  "ability-shield": "The holder's Ability cannot be changed or suppressed.",
  "booster-energy": "Activates Protosynthesis or Quark Drive, boosting the holder's highest stat. Single use.",
  "punching-glove": "Boosts punching moves by 10% and stops them from making contact.",
  "fairy-feather": "Boosts the holder's Fairy-type moves by 20%.",
  "adamant-crystal": "Boosts Dialga's Steel- and Dragon-type moves by 20%.",
  "lustrous-globe": "Boosts Palkia's Water- and Dragon-type moves by 20%.",
  "griseous-core": "Boosts Giratina's Ghost- and Dragon-type moves by 20%.",
  "wellspring-mask": "Boosts Ogerpon (Wellspring)'s moves by 20%; its Tera type is Water.",
  "hearthflame-mask": "Boosts Ogerpon (Hearthflame)'s moves by 20%; its Tera type is Fire.",
  "cornerstone-mask": "Boosts Ogerpon (Cornerstone)'s moves by 20%; its Tera type is Rock.",
  "leek": "Boosts Farfetch'd's and Sirfetch'd's critical-hit ratio by two stages.",
  "stick": "Boosts Farfetch'd's critical-hit ratio by two stages.",
  "thick-club": "Doubles Cubone's and Marowak's Attack.",
  "light-ball": "Doubles Pikachu's Attack and Special Attack.",
  "mint-berry": "Wakes the holder from sleep. Single use.",
  "miracle-berry": "Cures any status condition or confusion. Single use.",
  "pink-bow": "Boosts the holder's Normal-type moves by 10%.",
  "polkadot-bow": "Boosts the holder's Normal-type moves by 10%.",
  "mail": "A held letter. No effect in battle.",
  "berry-juice": "Restores 20 HP when the holder falls below half HP. Single use.",
  "metal-powder": "Doubles Ditto's Defense while it stays untransformed.",
  "quick-powder": "Doubles Ditto's Speed while it stays untransformed.",
  "soul-dew": "Boosts Latias' and Latios' Psychic- and Dragon-type moves by 20%.",
  "crucibellite": "Lets Crucibelle Mega Evolve.",
  "vile-vial": "Boosts Venomicon's Poison- and Flying-type moves by 20%.",
  "red-nectar": "Makes Oricorio take on its Baile Style (Fire type) when held.",
  "yellow-nectar": "Makes Oricorio take on its Pom-Pom Style (Electric type) when held.",
  "pink-nectar": "Makes Oricorio take on its Pa'u Style (Psychic type) when held.",
  "purple-nectar": "Makes Oricorio take on its Sensu Style (Ghost type) when held.",
  "rusted-sword": "Lets Zacian transform into its Crowned Sword form.",
  "rusted-shield": "Lets Zamazenta transform into its Crowned Shield form.",
  "douse-drive": "Turns Genesect's Techno Blast into a Water-type move.",
  "shock-drive": "Turns Genesect's Techno Blast into an Electric-type move.",
  "burn-drive": "Turns Genesect's Techno Blast into a Fire-type move.",
  "chill-drive": "Turns Genesect's Techno Blast into an Ice-type move.",
};
const Z_TYPE = {
  normalium: "Normal", firium: "Fire", waterium: "Water", electrium: "Electric", grassium: "Grass",
  icium: "Ice", fightinium: "Fighting", poisonium: "Poison", groundium: "Ground", flyinium: "Flying",
  psychium: "Psychic", buginium: "Bug", rockium: "Rock", ghostium: "Ghost", dragonium: "Dragon",
  darkinium: "Dark", steelium: "Steel", fairium: "Fairy",
};
function fallbackDesc(slug) {
  if (MANUAL_DESC[slug]) return MANUAL_DESC[slug];
  if (megaStoneDesc[slug]) return megaStoneDesc[slug];
  const z = slug.match(/^([a-z]+ium)-z$/);
  if (z && Z_TYPE[z[1]]) return `Lets the holder use a powerful ${Z_TYPE[z[1]]}-type Z-Move once per battle.`;
  if (slug.endsWith("-z")) return "Lets a specific Pokémon use its exclusive Z-Move once per battle.";
  return "";
}

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return r.json(); if (r.status === 404) return null; }
    catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 500 * (i + 1)));
  }
  return null;
}
async function download(dest, url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 70) return false;
    await writeFile(dest, buf);
    return true;
  } catch { return false; }
}
async function grabSprite(slug) {
  const dest = path.join(ITEMS_DIR, `${slug}.png`);
  try { await access(dest); return true; } catch { /* baixa */ }
  const sources = [
    `${PS}/evo-item/${slug}.png`, `${PS}/hold-item/${slug}.png`, `${PS}/other-item/${slug}.png`,
    `${PS}/berry/${slug}.png`, `${PS}/medicine/${slug}.png`,
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${slug}.png`,
    `https://www.serebii.net/itemdex/sprites/${slug.replace(/-/g, "")}.png`,
  ];
  for (const u of sources) if (await download(dest, u)) return true;
  return false;
}

/* ---------------- monta a lista curada de slugs ---------------- */
async function categoryItems(cat) {
  const j = await getJSON(`${API}/item-category/${cat}`);
  return (j?.items || []).map((i) => i.name);
}

const names = new Set();

// sets do Smogon (mantém — cobre qualquer item citado lá que não esteja nas
// categorias abaixo) + a lista fixa que a heurística de item usa
try {
  const sets = JSON.parse(await readFile(path.join(DATA, "sets.json"), "utf8"));
  for (const byGen of Object.values(sets)) {
    for (const list of Object.values(byGen)) {
      for (const s of list) for (const it of s.item || []) if (it && it !== "No Item") names.add(itemSlug(it));
    }
  }
} catch { /* roda build-sets.mjs primeiro pra ter isso — segue sem */ }
for (const n of ["Life Orb", "Leftovers", "Eviolite", "Choice Band", "Choice Specs", "Choice Scarf",
  "Assault Vest", "Focus Sash", "Expert Belt", "Rocky Helmet", "Wide Lens", "Silk Scarf", "Charcoal",
  "Mystic Water", "Magnet", "Miracle Seed", "Never-Melt Ice", "Black Belt", "Poison Barb", "Soft Sand",
  "Sharp Beak", "Twisted Spoon", "Silver Powder", "Hard Stone", "Spell Tag", "Dragon Fang",
  "Black Glasses", "Metal Coat", "Pixie Plate"]) names.add(itemSlug(n));

// categorias curadas — itens equipáveis "de verdade" (exclui Poké Bolas,
// poções, doces, TMs, flautas, itens-chave etc., que tecnicamente podem
// ocupar o slot de item mas não fazem nada lá)
const CATS = [
  "held-items", "choice", "bad-held-items", "type-enhancement", "type-protection",
  "species-specific", "plates", "jewels", "memories",
];
for (const cat of CATS) for (const n of await categoryItems(cat)) names.add(n);

// plates "vazias"/de spin-off — não existem em jogo pra segurar de verdade
names.delete("blank-plate");
names.delete("legend-plate");

// cristais Z: a PokéAPI guarda o slug com sufixo "--held" pro item segurável
for (const n of await categoryItems("z-crystals")) names.add(n.replace(/--held$/, ""));

// berries de batalha (status, fraqueza, "in-a-pinch", redutoras de EV) — a
// PokéAPI classifica todas como "medicine" junto de Poções, então a lista é
// manual em vez de vir de uma categoria
for (const n of [
  "cheri-berry", "chesto-berry", "pecha-berry", "rawst-berry", "aspear-berry", "leppa-berry",
  "oran-berry", "persim-berry", "lum-berry", "sitrus-berry",
  "figy-berry", "wiki-berry", "mago-berry", "aguav-berry", "iapapa-berry",
  "liechi-berry", "ganlon-berry", "salac-berry", "petaya-berry", "apicot-berry",
  "lansat-berry", "starf-berry", "enigma-berry", "micle-berry", "custap-berry",
  "jaboca-berry", "rowap-berry",
  "pomeg-berry", "kelpsy-berry", "qualot-berry", "hondew-berry", "grepa-berry", "tamato-berry",
]) names.add(n);

// itens recentes que a PokéAPI ainda não categoriza direito (ficam sob
// "training"/"event-items" junto de itens-chave, então entram na mão)
for (const n of ["adamant-crystal", "lustrous-globe", "griseous-core"]) names.add(n);

/* ---------------- pedras de Mega Evolução (reais, do nosso megas.json — a
   categoria "mega-stones" da PokéAPI está poluída com Megas fã-feitas) ---------------- */
const megaStoneDesc = {};
try {
  const megas = JSON.parse(await readFile(path.join(DATA, "megas.json"), "utf8"));
  for (const list of Object.values(megas)) {
    for (const m of list) {
      if (!m.stone) continue;
      names.add(itemSlug(m.stone));
      const base = m.name.replace(/^Mega /, "").replace(/ [XYZ]$/, "");
      megaStoneDesc[itemSlug(m.stone)] = `Allows ${base} to Mega Evolve into ${m.name}.`;
    }
  }
} catch { /* data/megas.json ainda não existe — roda build-data.mjs primeiro */ }

console.log(`${names.size} itens`);
const items = {};
let noSprite = [];
const list = [...names];
for (let i = 0; i < list.length; i += 12) {
  await Promise.all(list.slice(i, i + 12).map(async (slug) => {
    const j = await getJSON(`${API}/item/${slug}`);
    const en = j && (j.effect_entries || []).find((e) => e.language.name === "en");
    const ft = j && (j.flavor_text_entries || []).find((e) => e.language.name === "en");
    const nm = j && (j.names || []).find((e) => e.language.name === "en");
    items[slug] = {
      n: nm?.name || titleCase(slug),
      d: clean(en?.short_effect || ft?.text || "") || fallbackDesc(slug),
    };
    if (!(await grabSprite(slug))) noSprite.push(slug);
  }));
  process.stdout.write(`\r${Math.min(i + 12, list.length)}/${list.length}`);
}
process.stdout.write("\n");

await writeFile(path.join(DATA, "items.json"), JSON.stringify(items));
console.log(`✓ ${Object.keys(items).length} itens · sem sprite: ${noSprite.length}${noSprite.length ? " (" + noSprite.join(", ") + ")" : ""}`);
