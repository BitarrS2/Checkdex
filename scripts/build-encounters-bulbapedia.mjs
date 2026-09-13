// Gera data/encounters.json a partir da Bulbapedia (não mais da PokéAPI).
// Uso: node scripts/build-encounters-bulbapedia.mjs --regions kanto
//      node scripts/build-encounters-bulbapedia.mjs --regions kanto,johto,hoenn
//
// Roda por região porque cada página de local da Bulbapedia já cobre TODAS
// as gerações que passaram por ali (uma rota de Kanto tem RBY + GSC + FRLG +
// HGSS + LGPE na mesma página) — buscar por região evita refazer a mesma
// página várias vezes. Resultado é mesclado no encounters.json existente:
// linhas de páginas já vistas nesta região são substituídas (idempotente),
// o resto do arquivo (outras regiões/jogos) fica intocado.

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchWikitext, categoryMembers, inBatches } from "./bulbapedia/fetch.mjs";
import { parseLocationPage, hasCatchTable } from "./bulbapedia/parseCatch.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const OUT = path.join(DATA_DIR, "encounters.json");

// nome da categoria na Bulbapedia por região (chave = como o usuário passa em --regions)
const REGION_CATEGORIES = {
  kanto: "Kanto locations",
  johto: "Johto locations",
  hoenn: "Hoenn locations",
  sinnoh: "Sinnoh locations",
  unova: "Unova locations",
  kalos: "Kalos locations",
  alola: "Alola locations",
  galar: "Galar locations",
};

const args = process.argv.slice(2);
const regionArgIdx = args.indexOf("--regions");
const regions = (regionArgIdx >= 0 ? args[regionArgIdx + 1] : "kanto").split(",").map((s) => s.trim().toLowerCase());
// jogos cujas regiões TODAS já foram reprocessadas pela Bulbapedia — apaga
// de vez qualquer sobra da PokéAPI antiga pra esse slug (senão fica lixo
// duplicado de local que a Bulbapedia nomeia diferente, tipo "Pokemon
// Mansion 2f" vindo da PokéAPI ao lado de "Pokémon Mansion (Kanto)" novo).
// Passe só quando TODAS as regiões daquele jogo já rodaram nesta sessão.
const completeArgIdx = args.indexOf("--complete-games");
const completeGames = new Set((completeArgIdx >= 0 ? args[completeArgIdx + 1] : "").split(",").map((s) => s.trim()).filter(Boolean));

async function loadExisting() {
  if (!existsSync(OUT)) return {};
  try { return JSON.parse(await readFile(OUT, "utf8")); } catch { return {}; }
}

// remove do encounters existente qualquer linha cujo `location` esteja no
// conjunto de páginas processadas nesta rodada (pra reprocessar sem duplicar)
function pruneLocations(existing, locationTitles) {
  for (const pid of Object.keys(existing)) {
    for (const slug of Object.keys(existing[pid])) {
      existing[pid][slug] = existing[pid][slug].filter((e) => !locationTitles.has(e.location));
      if (!existing[pid][slug].length) delete existing[pid][slug];
    }
    if (!Object.keys(existing[pid]).length) delete existing[pid];
  }
}

// apaga TODAS as entradas antigas (de qualquer fonte) de um jogo já completo
function wipeGames(existing, slugs) {
  if (!slugs.size) return;
  for (const pid of Object.keys(existing)) {
    for (const slug of Object.keys(existing[pid])) {
      if (slugs.has(slug)) delete existing[pid][slug];
    }
    if (!Object.keys(existing[pid]).length) delete existing[pid];
  }
}

function addRow(existing, row) {
  const pid = String(row.pokemonId);
  (existing[pid] ??= {});
  (existing[pid][row.gameSlug] ??= []);
  existing[pid][row.gameSlug].push({
    location: row.location,
    method: row.method,
    conditions: row.conditions,
    minLevel: row.minLevel,
    maxLevel: row.maxLevel,
    chance: row.chance,
    exclusiveTo: row.exclusiveTo ?? null,
  });
}

function dedupe(existing) {
  for (const pid of Object.keys(existing)) {
    for (const slug of Object.keys(existing[pid])) {
      const seen = new Set();
      existing[pid][slug] = existing[pid][slug].filter((e) => {
        const k = `${e.location}|${e.method}|${e.minLevel}|${e.maxLevel}|${e.chance}|${(e.conditions || []).join(",")}|${e.exclusiveTo || ""}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      existing[pid][slug].sort((a, b) => (b.chance ?? 100) - (a.chance ?? 100));
    }
  }
}

async function processRegion(region) {
  const category = REGION_CATEGORIES[region];
  if (!category) { console.log(`região desconhecida: ${region}`); return { rows: [], titles: new Set() }; }

  console.log(`\n== ${region} (categoria: ${category}) ==`);
  const members = await categoryMembers(category);
  console.log(`  ${members.length} páginas na categoria`);

  const pages = await inBatches(members, 8, async (title) => {
    const wt = await fetchWikitext(title);
    return wt ? { title, wt } : null;
  }, "buscando");

  const locationPages = pages.filter((p) => p && hasCatchTable(p.wt));
  console.log(`  ${locationPages.length} páginas com tabela de captura`);

  const rows = [];
  const titles = new Set();
  for (const { title, wt } of locationPages) {
    titles.add(title);
    for (const row of parseLocationPage(wt, title)) rows.push(row);
  }
  console.log(`  ${rows.length} linhas de encontro extraídas`);
  return { rows, titles };
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const existing = await loadExisting();

  const allTitles = new Set();
  const allRows = [];
  for (const region of regions) {
    const { rows, titles } = await processRegion(region);
    for (const t of titles) allTitles.add(t);
    for (const r of rows) allRows.push(r);
  }

  pruneLocations(existing, allTitles);
  wipeGames(existing, completeGames);
  for (const row of allRows) addRow(existing, row);
  dedupe(existing);

  await writeFile(OUT, JSON.stringify(existing));
  console.log(`\nescrito ${OUT}`);

  // resumo por jogo tocado nesta rodada
  const perGame = {};
  for (const row of allRows) perGame[row.gameSlug] = (perGame[row.gameSlug] || 0) + 1;
  for (const [slug, n] of Object.entries(perGame).sort()) console.log(`  ${slug.padEnd(38)} ${n}`);
}

main();
