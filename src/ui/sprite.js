// <img> de sprite que respeita o modo shiny. Guarda os dois caminhos em
// data-attrs; um listener global troca o src de todos quando o modo liga/desliga.

import { el } from "./dom.js";
import { subscribe, isShiny } from "../state.js";

// caminho normal -> caminho shiny (mesma pasta, subpasta /shiny/)
export function shinyPath(url) {
  if (url.startsWith("assets/sprites/") && !url.startsWith("assets/sprites/shiny/")) {
    return url.replace("assets/sprites/", "assets/sprites/shiny/");
  }
  if (url.startsWith("assets/mega/") && !/^assets\/mega\/(shiny|stones)\//.test(url)) {
    return url.replace("assets/mega/", "assets/mega/shiny/");
  }
  if (url.startsWith("assets/regional/") && !url.startsWith("assets/regional/shiny/")) {
    return url.replace("assets/regional/", "assets/regional/shiny/");
  }
  return url;
}

// Registro de todos os <img> de sprite já criados — não dá pra confiar em
// document.querySelectorAll aqui, porque cards ficam em cache e são
// desconectados/reconectados do DOM a cada re-render (troca de filtro/geração).
// Um card fora do DOM no momento do toggle não seria pego pela query e voltaria
// pra tela com o sprite do modo antigo (shiny aparecendo com o modo desligado).
const registry = new Set();

export function spriteImg(url, attrs = {}) {
  const shiny = shinyPath(url);
  const img = el("img", {
    ...attrs,
    src: isShiny() ? shiny : url,
    dataset: { ...(attrs.dataset || {}), spr: url, sprShiny: shiny },
  });
  registry.add(img);
  return img;
}

// Para <img> montadas fora do spriteImg() (ex.: um sprite reaproveitado que
// troca de Pokémon no lugar) — registra pra também reagir ao toggle.
export function registerSprite(img) {
  registry.add(img);
  return img;
}

subscribe((kind) => {
  if (kind !== "shiny") return;
  const on = isShiny();
  document.documentElement.classList.toggle("is-shiny", on);
  for (const im of registry) {
    im.src = on ? im.dataset.sprShiny : im.dataset.spr;
  }
});
