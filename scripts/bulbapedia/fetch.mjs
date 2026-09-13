// Cliente da API do MediaWiki da Bulbapedia (wikitext bruto), com cache em
// disco — mesma ideia do getJSON de build-data.mjs, mas pra HTML/wikitext.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", ".cache-bulbapedia");
const API = "https://bulbapedia.bulbagarden.net/w/api.php";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cacheKey(kind, param) {
  return path.join(CACHE_DIR, kind + "__" + param.replace(/[^a-z0-9]+/gi, "_") + ".json");
}

async function cachedFetch(url, cp) {
  await mkdir(CACHE_DIR, { recursive: true });
  if (existsSync(cp)) {
    try { return JSON.parse(await readFile(cp, "utf8")); } catch { /* refaz */ }
  }
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Checkdex-build-script/1.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      await writeFile(cp, JSON.stringify(json));
      return json;
    } catch (err) {
      if (attempt === 4) throw err;
      await sleep(500 * attempt);
    }
  }
}

// Wikitext completo de uma página. Retorna null se a página não existe.
export async function fetchWikitext(title) {
  const url = `${API}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json&redirects=1`;
  const json = await cachedFetch(url, cacheKey("page", title));
  if (json.error) return null;
  return json.parse.wikitext["*"];
}

// Títulos de todas as páginas de uma categoria (ex.: "Kanto locations").
export async function categoryMembers(category) {
  const titles = [];
  let cont = "";
  for (;;) {
    const url = `${API}?action=query&list=categorymembers&cmtitle=${encodeURIComponent("Category:" + category)}&cmlimit=500&format=json${cont ? "&cmcontinue=" + encodeURIComponent(cont) : ""}`;
    const json = await cachedFetch(url, cacheKey("cat", category + "_" + cont));
    if (json.error) break;
    for (const m of json.query.categorymembers) titles.push(m.title);
    if (json.continue?.cmcontinue) cont = json.continue.cmcontinue;
    else break;
  }
  return titles;
}

// roda tarefas em lotes com concorrência limitada (igual build-data.mjs)
export async function inBatches(items, size, worker, label = "") {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    out.push(...(await Promise.all(batch.map(worker))));
    process.stdout.write(`\r  ${label} ${Math.min(i + size, items.length)}/${items.length}`);
    await sleep(120);
  }
  process.stdout.write("\n");
  return out;
}
