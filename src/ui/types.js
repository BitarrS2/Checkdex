// Rótulos, cores e símbolos dos tipos.

import { el } from "./dom.js";

export const TYPE_LABEL = {
  normal: "Normal", fire: "Fire", water: "Water", grass: "Grass",
  electric: "Electric", ice: "Ice", fighting: "Fighting", poison: "Poison",
  ground: "Ground", flying: "Flying", psychic: "Psychic", bug: "Bug",
  rock: "Rock", ghost: "Ghost", dragon: "Dragon", dark: "Dark",
  steel: "Steel", fairy: "Fairy",
};

// url() dentro de custom property resolve relativo ao CSS, então usamos caminho absoluto
const symUrl = (t) => new URL(`assets/types/${t}.svg`, document.baseURI).href;

// aplica as variáveis de cor + símbolo de um tipo num elemento
export function paintType(node, t) {
  node.style.setProperty("--tc", `var(--type-${t})`);
  node.style.setProperty("--tc-ink", `var(--type-${t}-ink)`);
  node.style.setProperty("--tsym", `url("${symUrl(t)}")`);
}

// selo colorido com símbolo + nome (usado nos cards e nas evoluções)
export function typeBadge(t) {
  const b = el("span", { class: "type", title: TYPE_LABEL[t] || t }, TYPE_LABEL[t] || t);
  paintType(b, t);
  return b;
}

// só o símbolo, num quadradinho colorido (compacto)
export function typeSymbol(t) {
  const s = el("span", { class: "tsym", role: "img", "aria-label": TYPE_LABEL[t] || t, title: TYPE_LABEL[t] || t });
  paintType(s, t);
  return s;
}
