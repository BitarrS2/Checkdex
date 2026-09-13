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

export function spriteImg(url, attrs = {}) {
  const shiny = shinyPath(url);
  return el("img", {
    ...attrs,
    src: isShiny() ? shiny : url,
    dataset: { ...(attrs.dataset || {}), spr: url, sprShiny: shiny },
  });
}

subscribe((kind) => {
  if (kind !== "shiny") return;
  const on = isShiny();
  document.documentElement.classList.toggle("is-shiny", on);
  for (const im of document.querySelectorAll("img[data-spr]")) {
    im.src = on ? im.dataset.sprShiny : im.dataset.spr;
  }
});
