// Gera os dados de "Builds": movesets por Pokémon (com a geração mínima em que
// cada golpe é aprendido), o dex de golpes (tipo/categoria/poder), as habilidades
// (com um resumo curto do efeito) e injeta `abilities` em pokedex.json.
//   node scripts/build-builds.mjs
//
// Lê o cache local (scripts/.cache/pokemon_*.json) e só vai à PokéAPI buscar
// detalhe de golpe (/move) e de habilidade (/ability).

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "scripts", ".cache");
const DATA = path.join(ROOT, "data");
const API = "https://pokeapi.co/api/v2";
const MAX_ID = 1025;

const VG_GEN = {
  "red-blue": 1, "yellow": 1, "red-green-japan": 1, "blue-japan": 1,
  "gold-silver": 2, "crystal": 2,
  "ruby-sapphire": 3, "emerald": 3, "firered-leafgreen": 3, "colosseum": 3, "xd": 3,
  "diamond-pearl": 4, "platinum": 4, "heartgold-soulsilver": 4,
  "black-white": 5, "black-2-white-2": 5,
  "x-y": 6, "omega-ruby-alpha-sapphire": 6,
  "sun-moon": 7, "ultra-sun-ultra-moon": 7, "lets-go-pikachu-lets-go-eevee": 7,
  "sword-shield": 8, "brilliant-diamond-shining-pearl": 8, "legends-arceus": 8,
  "scarlet-violet": 9, "champions": 9,
};

// golpes de status que valem a pena guardar (o resto de status é descartado)
const STATUS_KEEP = new Set([
  "swords-dance", "nasty-plot", "calm-mind", "dragon-dance", "bulk-up", "quiver-dance",
  "shell-smash", "agility", "rock-polish", "work-up", "coil", "hone-claws", "iron-defense",
  "recover", "roost", "slack-off", "soft-boiled", "moonlight", "morning-sun", "synthesis",
  "wish", "milk-drink", "shore-up", "strength-sap",
  "toxic", "will-o-wisp", "thunder-wave", "spore", "sleep-powder", "stun-spore", "hypnosis",
  "glare", "yawn", "nuzzle", "confuse-ray", "leech-seed", "encore", "taunt", "disable",
  "stealth-rock", "spikes", "toxic-spikes", "sticky-web", "defog", "rapid-spin",
  "substitute", "protect", "detect", "trick", "switcheroo", "baton-pass", "u-turn-fake",
  "aromatherapy", "heal-bell", "haze", "whirlwind", "roar", "dragon-tail", "parting-shot",
  "curse", "destiny-bond", "pain-split", "knock-off-x",
  "swagger", "trick-room", "tailwind", "light-screen", "reflect", "aurora-veil",
]);

const clean = (s) => (s || "")
  .replace(/\s+/g, " ")
  .replace(/­/g, "")
  .trim();

const CLASS = { physical: "phys", special: "spec", status: "stat" };

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r.json();
      if (r.status === 404) return null;
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 500 * (i + 1)));
  }
  throw new Error("falhou: " + url);
}

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
    process.stdout.write(`\r  ${Math.min(i + size, items.length)}/${items.length}`);
  }
  process.stdout.write("\n");
  return out;
}

// ---- 1. lê o cache: movesets + habilidades por Pokémon --------------------
console.log("• Lendo cache dos Pokémon");
const pokeAbilities = {};   // id -> [{ slug, hidden }]
const movesets = {};        // id -> { moveSlug: minGen }
const allMoves = new Set();
const allAbilities = new Set();

for (let id = 1; id <= MAX_ID; id++) {
  const f = path.join(CACHE, `pokemon_${id}.json`);
  if (!existsSync(f)) continue;
  const p = JSON.parse(await readFile(f, "utf8"));

  pokeAbilities[id] = (p.abilities || [])
    .sort((a, b) => a.slot - b.slot)
    .map((a) => ({ slug: a.ability.name, hidden: !!a.is_hidden }));
  for (const a of pokeAbilities[id]) allAbilities.add(a.slug);

  const ms = {};
  for (const m of p.moves || []) {
    let min = 99;
    for (const d of m.version_group_details || []) {
      const g = VG_GEN[d.version_group.name];
      if (g && g < min) min = g;
    }
    if (min <= 9) ms[m.move.name] = min;
  }
  movesets[id] = ms;
  for (const s of Object.keys(ms)) allMoves.add(s);
}

// ---- 2. detalhe dos golpes ----------------------------------------------
console.log(`• Golpes (${allMoves.size})`);
const moveDex = {};
const keptMoves = {};
await inBatches([...allMoves], 16, async (slug) => {
  const m = await getJSON(`${API}/move/${slug}`);
  if (!m) return null;
  const isDmg = m.power != null && m.power > 0;
  if (!isDmg && !STATUS_KEEP.has(slug)) return null; // status irrelevante → fora
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
  moveDex[slug] = {
    n: en ? en.name : slug,
    t: m.type?.name || "normal",
    c: CLASS[m.damage_class?.name] || "stat",
    p: m.power ?? null,
    a: m.accuracy ?? null,
    d,
  };
  return null;
});
// poda os movesets pros golpes que sobraram
for (const id of Object.keys(movesets)) {
  const out = {};
  for (const [slug, gen] of Object.entries(movesets[id])) {
    if (moveDex[slug]) out[slug] = gen;
  }
  keptMoves[id] = out;
}

// ---- 3. habilidades ----------------------------------------------------
console.log(`• Habilidades (${allAbilities.size})`);
const abilityDex = {};
await inBatches([...allAbilities], 16, async (slug) => {
  const a = await getJSON(`${API}/ability/${slug}`);
  if (!a) return null;
  const en = (a.names || []).find((n) => n.language.name === "en");
  const eff = (a.effect_entries || []).find((e) => e.language.name === "en");
  const flavor = (a.flavor_text_entries || []).find((e) => e.language.name === "en");
  abilityDex[slug] = {
    n: en ? en.name : slug,
    short: clean(eff?.short_effect || flavor?.flavor_text || ""),
  };
  return null;
});

// ---- 4. grava -------------------------------------------------------------
await writeFile(path.join(DATA, "moves.json"), JSON.stringify(moveDex));
await writeFile(path.join(DATA, "movesets.json"), JSON.stringify(keptMoves));
await writeFile(path.join(DATA, "abilities.json"), JSON.stringify(abilityDex));

const pokedex = JSON.parse(await readFile(path.join(DATA, "pokedex.json"), "utf8"));
for (const p of pokedex) {
  if (pokeAbilities[p.id]) p.abilities = pokeAbilities[p.id];
}
await writeFile(path.join(DATA, "pokedex.json"), JSON.stringify(pokedex));

const totalMoves = Object.values(keptMoves).reduce((n, o) => n + Object.keys(o).length, 0);
console.log(`\n✓ ${Object.keys(moveDex).length} golpes · ${totalMoves} entradas de moveset · ${Object.keys(abilityDex).length} habilidades`);
