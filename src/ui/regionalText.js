// Como conseguir cada forma regional. Chave = variety da PokéAPI.
//   short → vai na seta da evolução (curto, sem repetir a região)
//   long  → tooltip / texto completo
// Sem entrada específica → texto genérico da região.

const REGION_GENERIC = {
  alola: { short: "Selvagem em Alola", long: "Selvagem nos jogos de Alola (Sun/Moon, Ultra Sun/Ultra Moon)." },
  galar: { short: "Selvagem em Galar", long: "Selvagem nos jogos de Galar (Sword/Shield)." },
  hisui: { short: "Legends: Arceus", long: "Só em Pokémon Legends: Arceus." },
  paldea: { short: "Selvagem em Paldea", long: "Selvagem em Pokémon Scarlet/Violet." },
};

const HOWTO = {
  // Alola
  "sandslash-alola": { short: "Ice Stone", item: "ice-stone", long: "Use uma Ice Stone no Sandshrew de Alola." },
  "ninetales-alola": { short: "Ice Stone", item: "ice-stone", long: "Use uma Ice Stone no Vulpix de Alola." },
  "dugtrio-alola": { short: "Nv. 26", long: "Diglett de Alola no nível 26." },
  "persian-alola": { short: "Nv. 28", long: "Meowth de Alola no nível 28." },
  "raichu-alola": { short: "Thunder Stone", item: "thunder-stone", long: "Use uma Thunder Stone num Pikachu enquanto estiver em Alola." },
  "graveler-alola": { short: "Nv. 25", long: "Geodude de Alola no nível 25." },
  "golem-alola": { short: "Troca", long: "Troque um Graveler de Alola." },
  "muk-alola": { short: "Nv. 38", long: "Grimer de Alola no nível 38." },
  "raticate-alola": { short: "Nv. 20, à noite", long: "Rattata de Alola no nível 20, à noite." },
  "marowak-alola": { short: "Nv. 28, à noite", long: "Suba um Cubone ao nível 28, à noite, estando em Alola." },
  "exeggutor-alola": { short: "Leaf Stone", item: "leaf-stone", long: "Use uma Leaf Stone num Exeggcute enquanto estiver em Alola." },
  // Galar
  "rapidash-galar": { short: "Nv. 40", long: "Ponyta de Galar no nível 40." },
  "weezing-galar": { short: "Nv. 35", long: "Koffing no nível 35 em Sword/Shield." },
  "slowbro-galar": { short: "Galarica Cuff", item: "galarica-cuff", long: "Use uma Galarica Cuff no Slowpoke de Galar." },
  "slowking-galar": { short: "Galarica Wreath", item: "galarica-wreath", long: "Use uma Galarica Wreath no Slowpoke de Galar." },
  "linoone-galar": { short: "Nv. 20", long: "Zigzagoon de Galar no nível 20." },
  "darmanitan-galar-standard": { short: "Ice Stone", item: "ice-stone", long: "Use uma Ice Stone no Darumaka de Galar." },
  // Paldea
  "wooper-paldea": { short: "Selvagem", long: "Selvagem em Paldea. Evolui pro Clodsire no nível 20." },
};

export function regionalHowto(form) {
  return HOWTO[form.key] || REGION_GENERIC[form.region] || { short: "", long: "" };
}
