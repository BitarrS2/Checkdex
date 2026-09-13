// Checkdex — gerador de dados.
// Percorre a PokéAPI (só em build) e escreve data/*.json + assets/sprites/*.png.
// Uso: node scripts/build-data.mjs --gen 3
//
// Reexecuções são rápidas: respostas da API ficam em cache em scripts/.cache/.

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CACHE_DIR = path.join(__dirname, ".cache");
const DATA_DIR = path.join(ROOT, "data");
const SPRITE_DIR = path.join(ROOT, "assets", "sprites");
const SPRITE_SHINY_DIR = path.join(SPRITE_DIR, "shiny");
const MEGA_DIR = path.join(ROOT, "assets", "mega");
const MEGA_SHINY_DIR = path.join(MEGA_DIR, "shiny");
const REGIONAL_DIR = path.join(ROOT, "assets", "regional");
const REGIONAL_SHINY_DIR = path.join(REGIONAL_DIR, "shiny");
const ITEMS_DIR = path.join(ROOT, "assets", "items");
const ITEM_SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/";
const SEREBII_ITEMS = "https://www.serebii.net/itemdex/sprites/";
const ART_SHINY = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/";

const API = "https://pokeapi.co/api/v2";
// máximo da Pokédex nacional por geração
const GEN_LIMIT = { 1: 151, 2: 251, 3: 386, 4: 493, 5: 649, 6: 721, 7: 809, 8: 905, 9: 1025 };

// --- jogos principais / version groups (todas as gerações) ------------------
const GAMES = [
  { slug: "red-blue", label: "Red · Blue", generation: 1, versions: ["red", "blue"] },
  { slug: "yellow", label: "Yellow", generation: 1, versions: ["yellow"] },
  { slug: "gold-silver", label: "Gold · Silver", generation: 2, versions: ["gold", "silver"] },
  { slug: "crystal", label: "Crystal", generation: 2, versions: ["crystal"] },
  { slug: "ruby-sapphire", label: "Ruby · Sapphire", generation: 3, versions: ["ruby", "sapphire"] },
  { slug: "emerald", label: "Emerald", generation: 3, versions: ["emerald"] },
  { slug: "firered-leafgreen", label: "FireRed · LeafGreen", generation: 3, versions: ["firered", "leafgreen"] },
  { slug: "diamond-pearl", label: "Diamond · Pearl", generation: 4, versions: ["diamond", "pearl"] },
  { slug: "platinum", label: "Platinum", generation: 4, versions: ["platinum"] },
  { slug: "heartgold-soulsilver", label: "HeartGold · SoulSilver", generation: 4, versions: ["heartgold", "soulsilver"] },
  { slug: "black-white", label: "Black · White", generation: 5, versions: ["black", "white"] },
  { slug: "black-2-white-2", label: "Black 2 · White 2", generation: 5, versions: ["black-2", "white-2"] },
  { slug: "x-y", label: "X · Y", generation: 6, versions: ["x", "y"] },
  { slug: "omega-ruby-alpha-sapphire", label: "Omega Ruby · Alpha Sapphire", generation: 6, versions: ["omega-ruby", "alpha-sapphire"] },
  { slug: "sun-moon", label: "Sun · Moon", generation: 7, versions: ["sun", "moon"] },
  { slug: "ultra-sun-ultra-moon", label: "Ultra Sun · Ultra Moon", generation: 7, versions: ["ultra-sun", "ultra-moon"] },
  { slug: "lets-go-pikachu-lets-go-eevee", label: "Let's Go Pikachu · Eevee", generation: 7, versions: ["lets-go-pikachu", "lets-go-eevee"] },
  { slug: "sword-shield", label: "Sword · Shield", generation: 8, versions: ["sword", "shield"] },
  { slug: "brilliant-diamond-and-shining-pearl", label: "Brilliant Diamond · Shining Pearl", generation: 8, versions: ["brilliant-diamond", "shining-pearl"] },
  { slug: "legends-arceus", label: "Legends: Arceus", generation: 8, versions: ["legends-arceus"] },
  { slug: "scarlet-violet", label: "Scarlet · Violet", generation: 9, versions: ["scarlet", "violet"] },
];
const VERSION_TO_GAME = new Map();
for (const g of GAMES) for (const v of g.versions) VERSION_TO_GAME.set(v, g.slug);

// Espécies com Mega Evolução oficial. Lista fixa — os "varieties" da PokéAPI
// vêm poluídos com formas não-canônicas.
// Fontes: Bulbapedia + Serebii (Mega Evolution / Legends: Z-A).
const MEGA_IDS = new Set([
  // Gen 6 — X/Y + Omega Ruby/Alpha Sapphire
  3, 6, 9, 15, 18, 65, 80, 94, 115, 127, 130, 142, 150,
  181, 208, 212, 214, 229, 248,
  254, 257, 260, 282, 302, 303, 306, 308, 310, 319, 323, 334, 354, 359, 362, 373, 376, 380, 381, 384,
  428, 445, 448, 460, 475,
  531, 719,
  // Legends: Z-A (jogo base + DLC Mega Dimension) — 44 espécies;
  // Absol (359), Garchomp (445) e Lucario (448) ganharam uma 2ª Mega e já estão acima.
  26, 36, 71, 121, 149,
  154, 160, 227,
  358, 398,
  478, 485, 491,
  500, 530, 545, 560, 604, 609, 623,
  652, 655, 658, 668, 670, 678, 687, 689, 691, 701, 718,
  740, 768, 780,
  801, 807, 870,
  952, 970, 978, 998,
]);

// Pedra de Mega Evolução de cada espécie. speciesId -> slug ou [slugs...]
// (Gen 6: 1 pedra, salvo X/Y; Absol/Garchomp/Lucario têm 2ª Mega em
// Legends: Z-A e por isso 2 pedras, a normal e a "-z").
// As Megas de Legends: Z-A também têm pedra — item categoria "mega-stones"
// na PokéAPI, ainda sem sprite publicado (ver stoneSprite: null em buildMegas).
// Rayquaza (384) é a única exceção: não tem pedra (evolui sabendo Dragon Ascent).
const MEGA_STONES = {
  3: "venusaurite", 6: ["charizardite-x", "charizardite-y"], 9: "blastoisinite",
  15: "beedrillite", 18: "pidgeotite", 65: "alakazite", 80: "slowbronite",
  94: "gengarite", 115: "kangaskhanite", 127: "pinsirite", 130: "gyaradosite",
  142: "aerodactylite", 150: ["mewtwonite-x", "mewtwonite-y"], 181: "ampharosite",
  208: "steelixite", 212: "scizorite", 214: "heracronite", 229: "houndoominite",
  248: "tyranitarite", 254: "sceptilite", 257: "blazikenite", 260: "swampertite",
  282: "gardevoirite", 302: "sablenite", 303: "mawilite", 306: "aggronite",
  308: "medichamite", 310: "manectite", 319: "sharpedonite", 323: "cameruptite",
  334: "altarianite", 354: "banettite", 359: ["absolite", "absolite-z"], 362: "glalitite",
  373: "salamencite", 376: "metagrossite", 380: "latiasite", 381: "latiosite",
  428: "lopunnite", 445: ["garchompite", "garchompite-z"], 448: ["lucarionite", "lucarionite-z"],
  460: "abomasite", 475: "galladite", 531: "audinite", 719: "diancite",
  // Legends: Z-A
  26: ["raichunite-x", "raichunite-y"], 36: "clefablite", 71: "victreebelite",
  121: "starminite", 149: "dragoninite", 154: "meganiumite", 160: "feraligite",
  227: "skarmorite", 358: "chimechite", 398: "staraptite", 478: "froslassite",
  485: "heatranite", 491: "darkranite", 500: "emboarite", 530: "excadrite",
  545: "scolipite", 560: "scraftinite", 604: "eelektrossite", 609: "chandelurite",
  623: "golurkite", 652: "chesnaughtite", 655: "delphoxite", 658: "greninjite",
  668: "pyroarite", 670: "floettite", 678: "meowsticite", 687: "malamarite",
  689: "barbaracite", 691: "dragalgite", 701: "hawluchanite", 718: "zygardite",
  740: "crabominite", 768: "golisopite", 780: "drampanite", 801: "magearnite",
  807: "zeraorite", 870: "falinksite", 952: "scovillainite", 970: "glimmoranite",
  978: "tatsugirinite", 998: "baxcalibrite",
};

// --- helpers ---------------------------------------------------------------
const args = process.argv.slice(2);
const rawGen = args.indexOf("--gen") >= 0 ? args[args.indexOf("--gen") + 1] : "9";
const genArg = rawGen === "all" ? 9 : Number(rawGen) || 9;
const MAX_ID = GEN_LIMIT[genArg] ?? GEN_LIMIT[9];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const titleCase = (s) =>
  s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

async function ensureDirs() {
  for (const d of [CACHE_DIR, DATA_DIR, SPRITE_DIR, SPRITE_SHINY_DIR]) await mkdir(d, { recursive: true });
}

// ícone de item (pokesprite = estilo Gen 8 consistente; PokéAPI como fallback)
const PS = "https://raw.githubusercontent.com/msikma/pokesprite/master/items";
async function downloadItem(slug) {
  const dest = path.join(ITEMS_DIR, `${slug}.png`);
  try { await access(dest); return null; } catch { /* baixa */ }
  const sources = [
    `${PS}/evo-item/${slug}.png`,
    `${PS}/hold-item/${slug}.png`,
    `${PS}/other-item/${slug}.png`,
    ITEM_SPRITES + slug + ".png",
    // itens recentes (Gen 8/9) que ainda não estão nos repos acima
    `https://www.serebii.net/itemdex/sprites/${slug.replace(/-/g, "")}.png`,
  ];
  for (const url of sources) if (await downloadTo(dest, url)) return null;
  return null;
}

// baixa a versão shiny; se não existir, copia o sprite normal (pra o caminho
// /shiny/ sempre resolver no front)
async function downloadShiny(dest, url, fallback) {
  try { await access(dest); return; } catch { /* baixa */ }
  if (url && await downloadTo(dest, url)) return;
  try { await writeFile(dest, await readFile(fallback)); } catch { /* sem fallback */ }
}

function cachePath(url) {
  const key = url.replace(API + "/", "").replace(/[^a-z0-9]+/gi, "_");
  return path.join(CACHE_DIR, key + ".json");
}

async function getJSON(url) {
  const cp = cachePath(url);
  if (existsSync(cp)) {
    try {
      return JSON.parse(await readFile(cp, "utf8"));
    } catch {
      /* cache corrompido, refaz */
    }
  }
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) {
        await writeFile(cp, "null");
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      await writeFile(cp, JSON.stringify(json));
      return json;
    } catch (err) {
      if (attempt === 4) throw err;
      await sleep(400 * attempt);
    }
  }
}

async function downloadSprite(id, url) {
  return downloadTo(path.join(SPRITE_DIR, `${String(id).padStart(3, "0")}.png`), url);
}

// baixa `url` pra `dest` (pula se já existir). Retorna true se o arquivo existe.
async function downloadTo(dest, url) {
  try { await access(dest); return true; } catch { /* baixa */ }
  if (!url) return false;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

// roda tarefas em lotes com concorrência limitada
async function inBatches(items, size, worker) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    out.push(...(await Promise.all(batch.map(worker))));
    process.stdout.write(`\r  ${Math.min(i + size, items.length)}/${items.length}`);
    await sleep(150);
  }
  process.stdout.write("\n");
  return out;
}

// --- extração ------------------------------------------------------------
function pickStats(statsArr) {
  const map = { hp: "hp", attack: "atk", defense: "def", "special-attack": "spa", "special-defense": "spd", speed: "spe" };
  const out = {};
  for (const s of statsArr) if (map[s.stat.name]) out[map[s.stat.name]] = s.base_stat;
  return out;
}

function normalizeEvolutionChain(chain) {
  const stages = [];
  const walk = (node, fromId) => {
    const id = Number(node.species.url.split("/").filter(Boolean).pop());
    const conditions = (node.evolution_details || []).map((d) => ({
      trigger: d.trigger?.name || null,
      minLevel: d.min_level ?? null,
      item: d.item?.name ? titleCase(d.item.name) : null,
      itemSlug: d.item?.name || null,
      heldItem: d.held_item?.name ? titleCase(d.held_item.name) : null,
      heldItemSlug: d.held_item?.name || null,
      timeOfDay: d.time_of_day || null,
      minHappiness: d.min_happiness ?? null,
      minAffection: d.min_affection ?? null,
      minBeauty: d.min_beauty ?? null,
      location: d.location?.name ? titleCase(d.location.name) : null,
      knownMove: d.known_move?.name ? titleCase(d.known_move.name) : null,
      knownMoveType: d.known_move_type?.name || null,
      gender: d.gender ?? null,
      relativePhysicalStats: d.relative_physical_stats ?? null,
      partySpecies: d.party_species?.name ? titleCase(d.party_species.name) : null,
      partyType: d.party_type?.name || null,
      tradeSpecies: d.trade_species?.name ? titleCase(d.trade_species.name) : null,
      needsOverworldRain: !!d.needs_overworld_rain,
      turnUpsideDown: !!d.turn_upside_down,
    }));
    stages.push({
      id,
      name: titleCase(node.species.name),
      from: fromId,
      conditions: fromId ? conditions : [],
    });
    for (const next of node.evolves_to || []) walk(next, id);
  };
  walk(chain.chain, null);
  return stages;
}

function summarizeCondition(conditions) {
  if (!conditions?.length) return "";
  const c = conditions[0];
  if (c.minLevel) return `Lv. ${c.minLevel}`;
  if (c.item) return c.item;
  if (c.trigger === "trade") return c.heldItem ? `Troca c/ ${c.heldItem}` : "Troca";
  if (c.minHappiness) return "Felicidade";
  if (c.knownMove) return `Sabendo ${c.knownMove}`;
  if (c.trigger) return titleCase(c.trigger);
  return "";
}

function normalizeEncounters(raw) {
  // raw: array de { location_area, version_details:[{version, max_chance, encounter_details:[...]}] }
  // A chance de encontrar o Pokémon num local = SOMA dos slots dele naquela
  // tabela (por método + condições), limitada pelo max_chance da PokéAPI.
  const byGame = {}; // slug -> [ {location, method, minLevel, maxLevel, chance, conditions[]} ]
  for (const entry of raw || []) {
    const location = titleCase(entry.location_area.name.replace(/-area$/, ""));
    for (const vd of entry.version_details) {
      const slug = VERSION_TO_GAME.get(vd.version.name);
      if (!slug) continue;

      const groups = new Map();
      for (const ed of vd.encounter_details) {
        const conditions = (ed.condition_values || []).map((c) => titleCase(c.name)).sort();
        const method = titleCase(ed.method.name);
        const key = `${method}|${conditions.join(",")}`;
        let g = groups.get(key);
        if (!g) {
          g = { location, method, conditions, minLevel: ed.min_level, maxLevel: ed.max_level, chance: 0 };
          groups.set(key, g);
        }
        g.chance += ed.chance || 0;
        g.minLevel = Math.min(g.minLevel, ed.min_level);
        g.maxLevel = Math.max(g.maxLevel, ed.max_level);
      }

      const ceil = vd.max_chance || 100;
      (byGame[slug] ||= []);
      for (const g of groups.values()) {
        g.chance = Math.min(g.chance || ceil, ceil, 100);
        byGame[slug].push(g);
      }
    }
  }
  // dedupe + ordena por chance desc
  for (const slug of Object.keys(byGame)) {
    const seen = new Set();
    byGame[slug] = byGame[slug]
      .filter((e) => {
        const k = `${e.location}|${e.method}|${e.minLevel}|${e.maxLevel}|${e.chance}|${e.conditions.join(",")}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => b.chance - a.chance);
  }
  return byGame;
}

// --- Mega Evoluções ----------------------------------------------------
// "charizard-mega-x" -> "Mega Charizard X" ; "venusaur-mega" -> "Mega Venusaur"
function megaDisplayName(speciesName, varietyName) {
  const suf = (varietyName.match(/-mega(?:-([a-z]))?$/) || [])[1];
  return `Mega ${titleCase(speciesName)}${suf ? " " + suf.toUpperCase() : ""}`;
}

async function buildMegas(raw) {
  await mkdir(MEGA_DIR, { recursive: true });
  await mkdir(MEGA_SHINY_DIR, { recursive: true });
  await mkdir(path.join(MEGA_DIR, "stones"), { recursive: true });

  const bySpecies = new Map(raw.filter((r) => r.species).map((r) => [r.species.id, r.species]));
  const ids = [...MEGA_IDS].filter((id) => bySpecies.has(id)).sort((a, b) => a - b);
  const out = {};

  await inBatches(ids, 8, async (id) => {
    const species = bySpecies.get(id);
    const varieties = (species.varieties || [])
      .map((v) => v.pokemon.name)
      .filter((n) => /-mega(?:-[a-z])?$/.test(n));
    if (!varieties.length) return null;

    let stones = MEGA_STONES[id] ?? [];
    stones = Array.isArray(stones) ? stones : [stones];

    const entries = [];
    const seen = new Set();
    for (const vname of varieties) {
      const disp = megaDisplayName(species.name, vname);
      if (seen.has(disp)) continue; // Tatsugiri tem 3 megas idênticas de nome
      seen.add(disp);

      const mon = await getJSON(`${API}/pokemon/${vname}`);
      if (!mon) continue;
      const art = mon.sprites?.other?.["official-artwork"];
      const normal = path.join(MEGA_DIR, `${vname}.png`);
      await downloadTo(normal, art?.front_default || mon.sprites?.front_default);
      await downloadShiny(path.join(MEGA_SHINY_DIR, `${vname}.png`), art?.front_shiny, normal);

      const xyz = (vname.match(/-mega-([xyz])$/) || [])[1];
      const stone = xyz ? stones.find((s) => s.endsWith("-" + xyz)) : stones[0];
      // nome sempre que a pedra é conhecida; sprite tenta a PokéAPI e cai pro
      // Serebii (as pedras de Legends: Z-A ainda não têm sprite na PokéAPI)
      let stoneName = null, stoneSprite = null;
      if (stone) {
        stoneName = titleCase(stone);
        const dest = path.join(MEGA_DIR, "stones", `${stone}.png`);
        const sources = [ITEM_SPRITES + stone + ".png", SEREBII_ITEMS + stone.replace(/-/g, "") + ".png"];
        for (const url of sources) {
          if (await downloadTo(dest, url)) { stoneSprite = `assets/mega/stones/${stone}.png`; break; }
        }
      }

      entries.push({
        key: vname,
        name: disp,
        sprite: `assets/mega/${vname}.png`,
        types: mon.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
        stats: pickStats(mon.stats),
        ability: (mon.abilities || []).sort((a, b) => a.slot - b.slot).map((a) => a.ability.name)[0] || null,
        stone: stoneName,
        stoneSprite,
      });
    }
    if (entries.length) out[id] = entries;
    return null;
  });

  return out;
}

// --- Formas regionais ------------------------------------------------------
const REGION_LABEL = { alola: "Alola", galar: "Galar", hisui: "Hisui", paldea: "Paldea" };
const PALDEA_BREED = { combat: "Combativo", blaze: "Ígneo", aqua: "Aquático" };

function regionalInfo(speciesName, varietyName) {
  // basculin-white-striped é a forma de Hisui (nome esquisito da PokéAPI)
  if (varietyName === "basculin-white-striped") {
    return { region: "hisui", name: `${titleCase(speciesName)} de Hisui` };
  }
  // ignora formas que não são regionais de fato (boné, totem, modo Zen…)
  if (/-(cap|totem|zen|gmax|mega|cosplay|partner|starter|build|drive|construct)\b/.test(varietyName)) {
    return null;
  }
  const m = varietyName.match(/-(alola|galar|hisui|paldea)(?:-(\w+))?/);
  if (!m) return null;
  const region = m[1];
  let name = `${titleCase(speciesName)} de ${REGION_LABEL[region]}`;
  if (region === "paldea" && m[2] && PALDEA_BREED[m[2]]) name += ` (${PALDEA_BREED[m[2]]})`;
  return { region, name };
}

async function buildRegionals(raw) {
  await mkdir(REGIONAL_DIR, { recursive: true });
  await mkdir(REGIONAL_SHINY_DIR, { recursive: true });

  const species = raw.filter((r) => r.species).map((r) => r.species);
  const out = {};

  await inBatches(species, 10, async (sp) => {
    const forms = [];
    for (const v of sp.varieties || []) {
      if (v.is_default) continue;
      const info = regionalInfo(sp.name, v.pokemon.name);
      if (!info) continue;
      const key = v.pokemon.name;
      const mon = await getJSON(`${API}/pokemon/${key}`);
      if (!mon) continue;
      const art = mon.sprites?.other?.["official-artwork"];
      const normal = path.join(REGIONAL_DIR, `${key}.png`);
      await downloadTo(normal, art?.front_default || mon.sprites?.front_default);
      await downloadShiny(path.join(REGIONAL_SHINY_DIR, `${key}.png`), art?.front_shiny, normal);
      forms.push({
        key,
        name: info.name,
        region: info.region,
        sprite: `assets/regional/${key}.png`,
        types: mon.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
        stats: pickStats(mon.stats),
      });
    }
    if (forms.length) out[sp.id] = forms;
    return null;
  });

  return out;
}

// --- main ---------------------------------------------------------------
async function main() {
  await ensureDirs();
  console.log(`Checkdex build — Gen ${genArg} (IDs 1–${MAX_ID})`);

  const ids = Array.from({ length: MAX_ID }, (_, i) => i + 1);

  console.log("• Espécies + Pokémon");
  const raw = await inBatches(ids, 12, async (id) => {
    const [pokemon, species] = await Promise.all([
      getJSON(`${API}/pokemon/${id}`),
      getJSON(`${API}/pokemon-species/${id}`),
    ]);
    return { id, pokemon, species };
  });

  console.log("• Sprites (artwork oficial + shiny)");
  await inBatches(raw, 10, async ({ id, pokemon }) => {
    const art = pokemon?.sprites?.other?.["official-artwork"];
    await downloadSprite(id, art?.front_default || pokemon?.sprites?.front_default);
    const p3 = String(id).padStart(3, "0");
    await downloadShiny(
      path.join(SPRITE_SHINY_DIR, `${p3}.png`),
      art?.front_shiny || ART_SHINY + id + ".png",
      path.join(SPRITE_DIR, `${p3}.png`),
    );
    return null;
  });

  console.log("• Símbolos de tipo");
  await fetchTypeIcons();

  console.log("• Mega Evoluções");
  const megas = await buildMegas(raw);

  console.log("• Formas regionais");
  const regionals = await buildRegionals(raw);

  console.log("• Linhas evolutivas");
  const chainUrls = new Map(); // chainId -> url
  for (const { species } of raw) {
    if (species?.evolution_chain?.url) {
      const cid = Number(species.evolution_chain.url.split("/").filter(Boolean).pop());
      chainUrls.set(cid, species.evolution_chain.url);
    }
  }
  const chains = {};
  await inBatches([...chainUrls.entries()], 10, async ([cid, url]) => {
    const data = await getJSON(url);
    if (data) chains[cid] = { id: cid, stages: normalizeEvolutionChain(data) };
    return null;
  });

  console.log("• Itens de evolução");
  await mkdir(ITEMS_DIR, { recursive: true });
  const itemSlugs = new Set();
  for (const chain of Object.values(chains)) {
    for (const st of chain.stages) {
      for (const c of st.conditions || []) {
        if (c.itemSlug) itemSlugs.add(c.itemSlug);
        if (c.heldItemSlug) itemSlugs.add(c.heldItemSlug);
      }
    }
  }
  await inBatches([...itemSlugs], 10, (slug) => downloadItem(slug));
  const evoItems = [...itemSlugs].filter((s) => existsSync(path.join(ITEMS_DIR, `${s}.png`)));

  console.log("• Encontros (onde encontrar)");
  const encounters = {};
  await inBatches(ids, 12, async (id) => {
    const data = await getJSON(`${API}/pokemon/${id}/encounters`);
    const byGame = normalizeEncounters(data);
    if (Object.keys(byGame).length) encounters[id] = byGame;
    return null;
  });

  // --- monta pokedex.json ---
  console.log("• Escrevendo data/*.json");
  const pokedex = raw
    .filter((r) => r.pokemon && r.species)
    .map(({ id, pokemon, species }) => {
      const chainId = species.evolution_chain
        ? Number(species.evolution_chain.url.split("/").filter(Boolean).pop())
        : null;
      const evolvesFrom = species.evolves_from_species
        ? Number(species.evolves_from_species.url.split("/").filter(Boolean).pop())
        : null;
      const hasMega = MEGA_IDS.has(id);
      return {
        id,
        name: titleCase(pokemon.name),
        types: pokemon.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
        generation: genFromSpecies(species),
        sprite: `assets/sprites/${String(id).padStart(3, "0")}.png`,
        stats: pickStats(pokemon.stats),
        height: pokemon.height,
        weight: pokemon.weight,
        evolutionChainId: chainId,
        evolvesFrom,
        ...(hasMega ? { mega: true } : {}),
        ...(species.is_mythical ? { mythical: true } : species.is_legendary ? { legendary: true } : {}),
      };
    });

  // resumo de condição pré-calculado em cada estágio (para exibir sem lógica no front)
  for (const chain of Object.values(chains)) {
    for (const st of chain.stages) st.conditionLabel = summarizeCondition(st.conditions);
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    genLimit: genArg,
    maxId: MAX_ID,
    count: pokedex.length,
  };

  await writeFile(path.join(DATA_DIR, "pokedex.json"), JSON.stringify(pokedex));
  await writeFile(path.join(DATA_DIR, "megas.json"), JSON.stringify(megas));
  await writeFile(path.join(DATA_DIR, "regionals.json"), JSON.stringify(regionals));
  await writeFile(path.join(DATA_DIR, "evo-items.json"), JSON.stringify(evoItems));
  await writeFile(path.join(DATA_DIR, "evolution-chains.json"), JSON.stringify(chains));
  await writeFile(path.join(DATA_DIR, "encounters.json"), JSON.stringify(encounters));
  await writeFile(path.join(DATA_DIR, "games.json"), JSON.stringify(GAMES));
  await writeFile(path.join(DATA_DIR, "meta.json"), JSON.stringify(meta));

  console.log(`\n✔ Pronto: ${pokedex.length} Pokémon, ${Object.keys(chains).length} linhas evolutivas.`);
}

// Símbolos de tipo (estilo Scarlet/Violet, partywhale/pokemon-type-icons, MIT).
// Cada SVG vem como "badge" (círculo colorido + glifo branco). Tiramos o círculo,
// recolorimos o glifo pra currentColor (pra usar como máscara) e reenquadramos o
// viewBox no glifo — o viewBox por tipo foi calculado a partir da bbox do glifo.
const TYPE_VIEWBOX = {
  normal: "43.3 45.54 169.13 169.13", fire: "38.83 40.65 179.14 179.14",
  water: "30.29 36.6 194.36 194.36", electric: "32.82 28.66 189.4 189.4",
  grass: "42.48 49.09 172.67 172.67", ice: "29.4 29.4 196.12 196.12",
  fighting: "48.97 52.75 157.09 157.09", poison: "36.94 45.73 177.9 177.9",
  ground: "32.5 43.94 189.39 189.39", flying: "36.62 36.66 178.66 178.66",
  psychic: "37.6 37.6 179.8 179.8", bug: "43.25 45.38 168.42 168.42",
  rock: "42.18 40.78 169.94 169.94", ghost: "30.41 31.74 193.96 193.96",
  dragon: "31.06 33.7 192.82 192.82", dark: "43.46 51.67 167.36 167.36",
  steel: "42.64 46.76 169.01 169.01", fairy: "36.62 33.77 181.76 181.76",
};

async function fetchTypeIcons() {
  const dir = path.join(ROOT, "assets", "types");
  await mkdir(dir, { recursive: true });
  const base = "https://raw.githubusercontent.com/partywhale/pokemon-type-icons/main/icons/";
  for (const [t, vb] of Object.entries(TYPE_VIEWBOX)) {
    if (existsSync(path.join(dir, t + ".svg"))) continue;
    const res = await fetch(base + t + ".svg");
    if (!res.ok) { console.error("  falhou", t); continue; }
    let svg = await res.text();
    svg = svg
      .replace(/<\?xml[^>]*\?>\s*/, "")
      .replace(/\s*<circle\b[^>]*\br="128"[^>]*\/>/g, "")   // fundo circular
      .replace(/fill:\s*#[0-9a-fA-F]{3,8}\s*;/g, "fill: currentColor;")
      .replace(/fill="#[0-9a-fA-F]{3,8}"/g, 'fill="currentColor"')
      .replace(/viewBox="[^"]*"/, `viewBox="${vb}"`);
    await writeFile(path.join(dir, t + ".svg"), svg.trim() + "\n");
  }
}

function genFromSpecies(species) {
  const n = species.generation?.name || "";
  const map = {
    "generation-i": 1, "generation-ii": 2, "generation-iii": 3,
    "generation-iv": 4, "generation-v": 5, "generation-vi": 6,
    "generation-vii": 7, "generation-viii": 8, "generation-ix": 9,
  };
  return map[n] || null;
}

main().catch((err) => {
  console.error("\nFalhou:", err);
  process.exit(1);
});
