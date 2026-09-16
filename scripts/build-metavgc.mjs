// Monta data/metavgc.json a partir das páginas públicas de Pokémon do
// metavgc.com (agregador de Pokémon Champions / VGC — golpes, item e
// habilidade mais usados por Pokémon, extraídos do JSON-LD que o próprio
// site expõe pra SEO/LLMs). Sem Natureza/EVs: o site não estrutura isso por
// Pokémon, só em pastes de time individuais.
//   node scripts/build-metavgc.mjs
//
// A lista de Pokémon cobertos (SLUGS) foi levantada uma vez à mão em
// https://metavgc.com/tierlist (todas as tiers expandidas) — o site não tem
// um índice estático crawleável, e não vale a pena carregar Playwright só
// pra isso. Se quiser atualizar a lista, repita esse passo manualmente.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");

const slugName = (s) => (s || "").toString().toLowerCase()
  .replace(/[’'.:]/g, "").replace(/é/g, "e").replace(/♀/g, "-f").replace(/♂/g, "-m")
  .replace(/%/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

// slug do metavgc -> slug usado neste projeto, quando diferem
const ALIAS = {
  "tauros-paldea-aqua": "tauros-paldea-aqua-breed",
  "meowstic-mega": "meowstic-male-mega",
  "meowstic-female": "meowstic-f",
};

// formas que o metavgc lista separado mas este projeto não modela como
// entrada própria (gênero/appliance/estilo de combate sem entrada no dex) —
// pular evita atribuir a build de uma forma pra outra mecanicamente diferente.
// (Lycanroc Midnight/Dusk, Toxtricity Low Key, Urshifu, Meowstic Female e
// Polteageist Antique GANHARAM entrada própria em data/altforms.json — não
// pulam mais, e casam via `altformKeys` abaixo.)
const SKIP = new Set([
  "indeedee-female", "basculegion-female",
  "rotom-frost", "rotom-heat", "rotom-mow", "rotom-wash", "rotomwashrotom",
  "aegislash-blade",
  "maushold-family-of-three",
]);

const SLUGS = JSON.parse(await readFile(path.join(ROOT, "scripts", "metavgc-slugs.json"), "utf8"));

async function fetchOne(slug, tries = 3) {
  const url = `https://metavgc.com/pokemon/${slug}`;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; checkdex-project build script)" } });
      if (!r.ok) return { slug, error: `HTTP ${r.status}` };
      return parse(slug, await r.text());
    } catch (e) {
      if (i === tries - 1) return { slug, error: String(e) };
      await new Promise((res) => setTimeout(res, 500 * (i + 1)));
    }
  }
}

function parse(slug, html) {
  const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let m, graph = null;
  while ((m = re.exec(html))) {
    try { const j = JSON.parse(m[1]); if (j["@graph"]) { graph = j["@graph"]; break; } } catch { /* skip */ }
  }
  if (!graph) return { slug, error: "no @graph found" };

  const itemPage = graph.find((x) => x["@type"] === "ItemPage");
  const moveList = graph.find((x) => x["@id"]?.endsWith("#moves"));
  const itemList = graph.find((x) => x["@id"]?.endsWith("#items"));
  const listNames = (list) => (list?.itemListElement || []).map((li) => li.item?.name).filter(Boolean);

  const moves = listNames(moveList);
  const items = listNames(itemList);
  const mentions = (itemPage?.mentions || []).map((x) => x.name);
  // a página só reserva o 1º "mentions" pra habilidade quando há uma — quando
  // não há, ele cai direto pro 1º golpe (mesmo texto de moves[0])
  const ability = mentions[0] && mentions[0] !== moves[0] ? mentions[0] : null;

  return { slug, ability, items: items.slice(0, 3), moves: moves.slice(0, 4) };
}

const [megas, regionals, altforms, pokedex, movesData, abilitiesData, itemsData] = await Promise.all([
  readFile(path.join(DATA, "megas.json"), "utf8").then(JSON.parse),
  readFile(path.join(DATA, "regionals.json"), "utf8").then(JSON.parse),
  readFile(path.join(DATA, "altforms.json"), "utf8").then(JSON.parse),
  readFile(path.join(DATA, "pokedex.json"), "utf8").then(JSON.parse),
  readFile(path.join(DATA, "moves.json"), "utf8").then(JSON.parse),
  readFile(path.join(DATA, "abilities.json"), "utf8").then(JSON.parse),
  readFile(path.join(DATA, "items.json"), "utf8").then(JSON.parse),
]);

const megaByKey = new Map();
for (const list of Object.values(megas)) for (const m of list) megaByKey.set(m.key, m);
const regionalKeys = new Set();
for (const list of Object.values(regionals)) for (const r of list) regionalKeys.add(r.key);
// formas alternativas pós-evolução (Lycanroc Midnight/Dusk, Urshifu Rapid
// Strike…) — casam pelo `setKey` (nome usado no Smogon/MetaVGC) quando
// existir, senão pelo `key` (mesmo usado em data.js/tabBuilds.js).
const altformKeys = new Set();
for (const list of Object.values(altforms)) for (const f of list) altformKeys.add(f.setKey || f.key);
const pokedexSlugs = new Set(pokedex.map((p) => slugName(p.name)));

console.log(`buscando ${SLUGS.length} páginas do metavgc.com…`);
const CONCURRENCY = 6;
const raw = [];
let done = 0;
for (let i = 0; i < SLUGS.length; i += CONCURRENCY) {
  const batch = SLUGS.slice(i, i + CONCURRENCY);
  raw.push(...(await Promise.all(batch.map((s) => fetchOne(s)))));
  done += batch.length;
  process.stdout.write(`\r${done}/${SLUGS.length}`);
  await new Promise((res) => setTimeout(res, 150));
}
process.stdout.write("\n");

const errors = raw.filter((x) => x.error);
if (errors.length) console.log("erros:", errors);

const out = {};
const unmatched = [];
for (const p of raw) {
  if (p.error || SKIP.has(p.slug)) continue;
  const key = ALIAS[p.slug] || p.slug;

  let targetKey = null;
  if (megaByKey.has(key)) targetKey = key;
  else if (regionalKeys.has(key)) targetKey = key;
  else if (altformKeys.has(key)) targetKey = key;
  else if (pokedexSlugs.has(key)) targetKey = key;
  if (!targetKey) { unmatched.push(p.slug); continue; }

  const mega = megaByKey.get(key);
  let item = [];
  if (mega?.stone) {
    item = [slugName(mega.stone)];
  } else {
    item = p.items.map(slugName).filter((s) => itemsData[s]).slice(0, 2);
  }

  const abilitySlug = p.ability ? slugName(p.ability) : null;
  const ability = abilitySlug && abilitiesData[abilitySlug] ? [abilitySlug] : [];

  const moves = p.moves.map(slugName).filter((s) => movesData[s]);
  if (!moves.length) continue; // nada útil pra mostrar

  out[targetKey] = {
    fmt: "metavgc", fmtLabel: "MetaVGC", name: "Pokémon Champions",
    nature: [], ability, item, evs: {}, ivs: {},
    moves: moves.map((s) => [s]), teratypes: [],
  };
}

if (unmatched.length) console.log("sem correspondência neste projeto (ignorados):", unmatched);
console.log(`${Object.keys(out).length} builds do MetaVGC prontas.`);

await writeFile(path.join(DATA, "metavgc.json"), JSON.stringify(out));
console.log("data/metavgc.json escrito.");
