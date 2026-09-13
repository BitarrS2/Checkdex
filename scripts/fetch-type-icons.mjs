// Baixa os 18 símbolos de tipo (SVG branco, MIT) para assets/types/.
// Fonte: github.com/duiker101/pokemon-type-svg-icons
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "types");
const BASE = "https://raw.githubusercontent.com/duiker101/pokemon-type-svg-icons/master/icons/";
const TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison",
  "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
];

await mkdir(OUT, { recursive: true });
for (const t of TYPES) {
  const res = await fetch(BASE + t + ".svg");
  if (!res.ok) { console.error("FALHOU", t, res.status); continue; }
  let svg = await res.text();
  // deixa o ícone herdar a cor (currentColor) em vez de branco fixo
  svg = svg.replace(/fill="white"/g, 'fill="currentColor"').replace(/#fff(fff)?/gi, "currentColor");
  await writeFile(path.join(OUT, t + ".svg"), svg);
  console.log("ok", t, svg.length, "bytes");
}
