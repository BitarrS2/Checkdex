// Uso pontual: busca os status-base de cada forma regional na PokéAPI e grava
// `stats` em data/regionals.json (as demais chaves ficam intactas).
//   node scripts/add-regional-stats.mjs

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "data", "regionals.json");
const API = "https://pokeapi.co/api/v2";

const STAT_KEY = {
  hp: "hp", attack: "atk", defense: "def",
  "special-attack": "spa", "special-defense": "spd", speed: "spe",
};
const pickStats = (arr) => {
  const out = {};
  for (const s of arr) if (STAT_KEY[s.stat.name]) out[STAT_KEY[s.stat.name]] = s.base_stat;
  return out;
};

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r.json();
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  throw new Error("falhou: " + url);
}

const regionals = JSON.parse(await readFile(FILE, "utf8"));
const forms = Object.values(regionals).flat();
console.log(`${forms.length} formas regionais — buscando status…`);

let done = 0;
for (let i = 0; i < forms.length; i += 6) {
  await Promise.all(forms.slice(i, i + 6).map(async (f) => {
    const mon = await getJSON(`${API}/pokemon/${f.key}`);
    f.stats = pickStats(mon.stats);
    done++;
    process.stdout.write(`\r${done}/${forms.length}`);
  }));
}
process.stdout.write("\n");

await writeFile(FILE, JSON.stringify(regionals));
console.log("data/regionals.json atualizado.");
