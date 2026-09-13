// Adiciona `d` (efeito curto, em inglês) a cada golpe em data/moves.json.
//   node scripts/add-move-desc.mjs

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "data", "moves.json");
const API = "https://pokeapi.co/api/v2";

const clean = (s) => (s || "").replace(/\s+/g, " ").replace(/­/g, "").replace(/’/g, "'").trim();

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return r.json(); if (r.status === 404) return null; }
    catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 500 * (i + 1)));
  }
  throw new Error("falhou: " + url);
}

const moves = JSON.parse(await readFile(FILE, "utf8"));
const slugs = Object.keys(moves);
console.log(`${slugs.length} golpes — buscando efeito…`);

let done = 0;
for (let i = 0; i < slugs.length; i += 16) {
  await Promise.all(slugs.slice(i, i + 16).map(async (slug) => {
    const m = await getJSON(`${API}/move/${slug}`);
    done++;
    process.stdout.write(`\r${done}/${slugs.length}`);
    if (!m) return;
    const en = (m.effect_entries || []).find((e) => e.language.name === "en");
    let d = clean(en?.short_effect || "");
    if (m.effect_chance != null) d = d.replace(/\$effect_chance/g, m.effect_chance);
    d = d.replace(/\$effect_chance/g, "some");
    moves[slug].d = d;
  }));
}
process.stdout.write("\n");

await writeFile(FILE, JSON.stringify(moves));
console.log("data/moves.json atualizado.");
