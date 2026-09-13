// Baixa as sets competitivas do Smogon (mirror pkmn.github.io/smogon) das 9
// gerações e monta data/sets.json. Completa moves.json / abilities.json com o
// que as sets referenciam e ainda não temos.
//   node scripts/build-sets.mjs

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const API = "https://pokeapi.co/api/v2";
const SRC = "https://pkmn.github.io/smogon/data/sets/gen";

// chave-lookup: casa nome do Smogon com o nome do dex / a `key` da forma
export const slugName = (s) => (s || "").toString().toLowerCase()
  .replace(/[’'.:]/g, "")
  .replace(/é/g, "e").replace(/♀/g, "-f").replace(/♂/g, "-m")
  .replace(/%/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

// prioridade de formato — do "mais padrão singles" pro mais nichado
const FMT_RANK = [
  "ou", "uu", "ru", "nu", "pu", "zu", "nfe", "lc", "ubers", "anythinggoes",
  "nationaldex", "nationaldexuu", "nationaldexru", "nationaldexubers", "dlc1nationaldexag",
  "bdspou", "letsgoou", "tradebacksou", "stadiumou", "dreamworldou",
  "battlestadiumsingles", "1v1", "monotype", "nationaldexmonotype",
  "vgc2025", "vgc2024", "vgc2023", "vgc2022", "vgc2021", "vgc2020", "vgc2019", "vgc2018",
  "vgc2017", "vgc2016", "vgc2014", "vgc2013", "vgc2012", "vgc2011", "vgc2010", "vgc2009",
  "doublesou", "nationaldexdoubles", "2v2doubles", "battlespotsingles", "battlespotdoubles",
  "battlespottriples", "battlestadiumdoubles", "middlecup", "petitcup", "pikacup", "lclevel100",
  "nc1997", "nc1999",
  "cap", "stabmons", "almostanyability", "balancedhackmons", "purehackmons",
  "mixandmega", "godlygift", "camomons", "inheritance", "partnersincrime", "ubersuu",
];
const FMT_LABEL = {
  ou: "OU", uu: "UU", ru: "RU", nu: "NU", pu: "PU", zu: "ZU", lc: "LC", nfe: "NFE",
  ubers: "Ubers", anythinggoes: "AG", nationaldex: "Nat. Dex", nationaldexuu: "Nat. Dex UU",
  nationaldexru: "Nat. Dex RU", nationaldexubers: "Nat. Dex Ubers", bdspou: "BDSP OU",
  letsgoou: "Let's Go OU", monotype: "Monotype", nationaldexmonotype: "Nat. Dex Mono",
  doublesou: "Doubles", "1v1": "1v1", battlestadiumsingles: "BSS", stadiumou: "Stadium OU",
  tradebacksou: "Tradebacks", stabmons: "STABmons", almostanyability: "AAA",
  balancedhackmons: "BH", purehackmons: "Pure Hackmons", mixandmega: "Mix & Mega",
  godlygift: "Godly Gift", cap: "CAP", camomons: "Camomons", middlecup: "Middle Cup",
  petitcup: "Petit Cup", pikacup: "Pika Cup", nc1997: "'97 Cup", nc1999: "'99 Cup",
  dreamworldou: "Dream World OU",
};
const fmtLabel = (f) => FMT_LABEL[f] || (/^vgc\d+$/.test(f) ? "VGC " + f.slice(3) : f.toUpperCase());
const fmtRank = (f) => { const i = FMT_RANK.indexOf(f); return i < 0 ? 999 : i; };
// formatos gimmick / metagames alternativos — fora
const SKIP_FMT = new Set([
  "almostanyability", "balancedhackmons", "purehackmons", "stabmons", "mixandmega",
  "godlygift", "camomons", "inheritance", "partnersincrime", "cap", "ubersuu",
  "dlc1nationaldexag", "2v2doubles",
]);

const moveSlug = (n) => (n || "").toLowerCase().replace(/[’']/g, "").replace(/[.:]/g, "")
  .replace(/\s+/g, "-").replace(/[()]/g, "");
const abilSlug = (n) => (n || "").toLowerCase().replace(/[’']/g, "").replace(/[.:()]/g, "")
  .replace(/\s+/g, "-");
const arr = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);
const clean = (s) => (s || "").replace(/\s+/g, " ").replace(/’/g, "'").trim();

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return r.json(); if (r.status === 404) return null; }
    catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 500 * (i + 1)));
  }
  return null;
}

/* ---------- 1. baixa e normaliza as sets ---------- */
const sets = {}; // slugName -> { gen: [ {fmt,name,moves,ability,item,nature,evs,ivs,tera,level} ] }
const usedMoves = new Set();
const usedAbilities = new Set();

for (let gen = 1; gen <= 9; gen++) {
  console.log(`• Smogon gen ${gen}`);
  const raw = await getJSON(`${SRC}${gen}.json`);
  if (!raw) continue;
  for (const [name, byFmt] of Object.entries(raw)) {
    const key = slugName(name);
    for (const [fmt, bySet] of Object.entries(byFmt)) {
      if (SKIP_FMT.has(fmt)) continue;
      for (const [setName, s] of Object.entries(bySet)) {
        const moves = arr(s.moves).map((slot) => arr(slot).map(moveSlug));
        moves.flat().forEach((m) => usedMoves.add(m));
        const ability = arr(s.ability).map(abilSlug);
        ability.forEach((a) => usedAbilities.add(a));
        const entry = {
          fmt, fmtLabel: fmtLabel(fmt), name: setName, rank: fmtRank(fmt),
          moves,
          ability,
          item: arr(s.item),
          nature: s.nature || null,
          evs: s.evs || null,
          ivs: s.ivs || null,
          tera: arr(s.teratypes).map((t) => t.toLowerCase()),
          level: Array.isArray(s.level) ? s.level[0] : s.level || null,
        };
        ((sets[key] ||= {})[gen] ||= []).push(entry);
      }
    }
  }
}
for (const byGen of Object.values(sets)) {
  for (const gen of Object.keys(byGen)) {
    byGen[gen].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    // dedup por nome de set (mantém o formato de maior prioridade), teto de 10
    const seen = new Set();
    byGen[gen] = byGen[gen].filter((s) => {
      const k = s.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 10);
  }
}
console.log(`  ${Object.keys(sets).length} Pokémon com set`);

/* ---------- 2. completa moves.json ---------- */
const moves = JSON.parse(await readFile(path.join(DATA, "moves.json"), "utf8"));
const missM = [...usedMoves].filter((m) => m && !moves[m]);
console.log(`• Golpes faltando: ${missM.length}`);
const CLASS = { physical: "phys", special: "spec", status: "stat" };
for (let i = 0; i < missM.length; i += 16) {
  await Promise.all(missM.slice(i, i + 16).map(async (slug) => {
    const m = await getJSON(`${API}/move/${slug}`);
    if (!m) return;
    const en = (m.names || []).find((n) => n.language.name === "en");
    const eff = (m.effect_entries || []).find((e) => e.language.name === "en");
    const flav = (m.flavor_text_entries || []).filter((e) => e.language.name === "en").pop();
    let d = clean(eff?.short_effect || flav?.flavor_text || "");
    if (m.effect_chance != null) d = d.replace(/\$effect_chance/g, m.effect_chance);
    d = d.replace(/\$effect_chance/g, "some")
      .replace(/^Inflicts (regular )?damage with no additional effect\.?$/i, "")
      .replace(/^Inflicts regular damage and can hit ([A-Za-z]+) users\.?$/i, "Also hits Pokémon in the semi-invulnerable turn of $1.")
      .replace(/^Inflicts regular damage\. /i, "");
    if (m.priority && !/priority/i.test(d)) {
      d = `Priority ${m.priority > 0 ? "+" : ""}${m.priority}.${d ? " " + d : ""}`;
    }
    moves[slug] = {
      n: en ? en.name : slug, t: m.type?.name || "normal",
      c: CLASS[m.damage_class?.name] || "stat", p: m.power ?? null, a: m.accuracy ?? null, d,
    };
  }));
  process.stdout.write(`\r  ${Math.min(i + 16, missM.length)}/${missM.length}`);
}
process.stdout.write("\n");

/* ---------- 3. completa abilities.json ---------- */
const abilities = JSON.parse(await readFile(path.join(DATA, "abilities.json"), "utf8"));
const missA = [...usedAbilities].filter((a) => a && !abilities[a]);
console.log(`• Habilidades faltando: ${missA.length}`);
for (let i = 0; i < missA.length; i += 16) {
  await Promise.all(missA.slice(i, i + 16).map(async (slug) => {
    const a = await getJSON(`${API}/ability/${slug}`);
    if (!a) return;
    const en = (a.names || []).find((n) => n.language.name === "en");
    const eff = (a.effect_entries || []).find((e) => e.language.name === "en");
    abilities[slug] = { n: en ? en.name : slug, short: clean(eff?.short_effect || "") };
  }));
}

/* ---------- 4. grava ---------- */
await writeFile(path.join(DATA, "sets.json"), JSON.stringify(sets));
await writeFile(path.join(DATA, "moves.json"), JSON.stringify(moves));
await writeFile(path.join(DATA, "abilities.json"), JSON.stringify(abilities));
const totalSets = Object.values(sets).reduce((n, g) => n + Object.values(g).reduce((k, l) => k + l.length, 0), 0);
console.log(`\n✓ ${Object.keys(sets).length} Pokémon · ${totalSets} sets · ${Object.keys(moves).length} golpes · ${Object.keys(abilities).length} habilidades`);
