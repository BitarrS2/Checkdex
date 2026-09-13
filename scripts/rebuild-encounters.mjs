// Reconstrói data/encounters.json a partir do cache local, com a CHANCE REAL de
// encontrar cada Pokémon num local: soma os slots dele naquela tabela de
// encontro (por método + condições), limitada pelo max_chance da PokéAPI.
//   node scripts/rebuild-encounters.mjs

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "scripts", ".cache");
const DATA = path.join(ROOT, "data");
const MAX_ID = 1025;

const GAMES = [
  ["red", "blue"], ["yellow"], ["gold", "silver"], ["crystal"],
  ["ruby", "sapphire"], ["emerald"], ["firered", "leafgreen"],
  ["diamond", "pearl"], ["platinum"], ["heartgold", "soulsilver"],
  ["black", "white"], ["black-2", "white-2"], ["x", "y"],
  ["omega-ruby", "alpha-sapphire"], ["sun", "moon"], ["ultra-sun", "ultra-moon"],
  ["lets-go-pikachu", "lets-go-eevee"], ["sword", "shield"],
  ["brilliant-diamond", "shining-pearl"], ["legends-arceus"], ["scarlet", "violet"],
];
const SLUGS = [
  "red-blue", "yellow", "gold-silver", "crystal", "ruby-sapphire", "emerald",
  "firered-leafgreen", "diamond-pearl", "platinum", "heartgold-soulsilver",
  "black-white", "black-2-white-2", "x-y", "omega-ruby-alpha-sapphire", "sun-moon",
  "ultra-sun-ultra-moon", "lets-go-pikachu-lets-go-eevee", "sword-shield",
  "brilliant-diamond-and-shining-pearl", "legends-arceus", "scarlet-violet",
];
const VERSION_TO_GAME = new Map();
GAMES.forEach((vers, i) => vers.forEach((v) => VERSION_TO_GAME.set(v, SLUGS[i])));

const titleCase = (s) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function normalize(raw) {
  const byGame = {};
  for (const entry of raw || []) {
    const location = titleCase(entry.location_area.name.replace(/-area$/, ""));
    for (const vd of entry.version_details) {
      const slug = VERSION_TO_GAME.get(vd.version.name);
      if (!slug) continue;

      // agrupa os slots por método + condições e SOMA a chance de cada slot
      const groups = new Map();
      for (const ed of vd.encounter_details) {
        const conds = (ed.condition_values || []).map((c) => titleCase(c.name)).sort();
        const method = titleCase(ed.method.name);
        const key = `${method}|${conds.join(",")}`;
        let g = groups.get(key);
        if (!g) {
          g = { location, method, conditions: conds, minLevel: ed.min_level, maxLevel: ed.max_level, chance: 0 };
          groups.set(key, g);
        }
        g.chance += ed.chance || 0;
        g.minLevel = Math.min(g.minLevel, ed.min_level);
        g.maxLevel = Math.max(g.maxLevel, ed.max_level);
      }

      const ceil = vd.max_chance || 100;
      (byGame[slug] ||= []);
      for (const g of groups.values()) {
        // a soma dos slots é a chance real; o max_chance da PokéAPI evita
        // superestimar quando o mesmo slot aparece repetido sem condição
        g.chance = Math.min(g.chance || ceil, ceil, 100);
        byGame[slug].push(g);
      }
    }
  }

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

const encounters = {};
let mons = 0;
for (let id = 1; id <= MAX_ID; id++) {
  const f = path.join(CACHE, `pokemon_${id}_encounters.json`);
  if (!existsSync(f)) continue;
  const raw = JSON.parse(await readFile(f, "utf8"));
  const byGame = normalize(raw);
  if (Object.keys(byGame).length) { encounters[id] = byGame; mons++; }
}

await writeFile(path.join(DATA, "encounters.json"), JSON.stringify(encounters));
console.log(`✓ ${mons} Pokémon com encontros — chances recalculadas`);

// conferência
const lit = encounters[607]?.["black-2-white-2"] || [];
const cel = lit.filter((e) => /Celestial Tower/.test(e.location)).sort((a, b) => b.chance - a.chance)[0];
console.log("Litwick · Celestial Tower · BW2:", cel ? cel.chance + "%" : "não achou");
