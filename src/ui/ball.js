// Pokébola de progresso: enche de baixo pra cima conforme a linha evolutiva
// vai sendo completada. O tipo de bola indica a raridade do Pokémon —
// comum: Poké Ball · semi-lendário: Ultra Ball · lendário: Master Ball ·
// mítico: Cherish Ball.

import { el } from "./dom.js";

const CHECK = '<svg viewBox="0 0 24 24"><path d="M9.6 16.2 4.8 11.4l1.4-1.4 3.4 3.4 8-8L21 6.8z"/></svg>';

// bolas raras: imagem; Poké Ball comum: desenhada em SVG
const IMG = {
  ultra: "assets/balls/ultra-ball.png",
  master: "assets/balls/master-ball.png",
  cherish: "assets/balls/cherish-ball.png",
};

// no modo shiny TODAS as bolas viram Luxury Ball
const LUXURY = '<img src="assets/balls/luxury-ball.png" alt="" draggable="false">';

export const BALL_LABEL = {
  poke: "Poké Ball",
  ultra: "Ultra Ball",
  master: "Master Ball",
  cherish: "Cherish Ball",
};

let uid = 0;

function pokeSvg() {
  const cid = "ball-clip-" + ++uid;
  return `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <defs><clipPath id="${cid}"><circle cx="24" cy="24" r="22"/></clipPath></defs>
    <g clip-path="url(#${cid})">
      <rect x="0" y="0" width="48" height="48" fill="#fff"/>
      <rect x="0" y="0" width="48" height="24" fill="#ee1c25"/>
      <rect x="0" y="21" width="48" height="6" fill="#17171b"/>
    </g>
    <circle cx="24" cy="24" r="22" fill="none" stroke="#17171b" stroke-width="2.4"/>
    <circle cx="24" cy="24" r="6.6" fill="#17171b"/>
    <circle cx="24" cy="24" r="3.4" fill="#fff"/>
  </svg>`;
}

const art = (kind) =>
  IMG[kind] ? `<img src="${IMG[kind]}" alt="" draggable="false">` : pokeSvg();

// { kind, name, onToggle } -> { node, update({ progress, mine, done, total }) }
export function createBall({ kind, name, onToggle }) {
  const dim = el("span", { class: "ball__layer ball__layer--dim", html: art(kind) });
  const lit = el("span", { class: "ball__layer ball__layer--lit", html: art(kind) });
  const disc = el("span", { class: "ball__disc" }, dim, lit);
  const got = el("span", { class: "ball__got", html: CHECK });

  const btn = el("button", {
    type: "button",
    class: "ball",
    dataset: { kind },
    "aria-pressed": "false",
    onclick: (e) => { e.stopPropagation(); onToggle(); },
  }, disc, got);

  let shinyArt = false; // arte atual das camadas (false = bola da raridade)
  function setArt(gold) {
    if (shinyArt === gold) return;
    shinyArt = gold;
    const html = gold ? LUXURY : art(kind);
    dim.innerHTML = html;
    lit.innerHTML = html;
  }

  function update({ progress, mine, done, total, gold }) {
    setArt(!!gold);
    const p = Math.max(0, Math.min(1, progress));
    btn.style.setProperty("--empty", Math.round((1 - p) * 100) + "%");
    btn.classList.toggle("is-full", p >= 1);
    btn.classList.toggle("is-mine", mine);
    btn.classList.toggle("is-gold", !!gold);   // modo shiny: check dourado + Luxury Ball
    btn.setAttribute("aria-pressed", String(mine));
    const word = gold ? (mine ? "shiny marcado" : "shiny não marcado") : (mine ? "capturado" : "não capturado");
    btn.setAttribute(
      "aria-label",
      `${name} (${BALL_LABEL[kind] || BALL_LABEL.poke}) — ${word}.` +
        (total > 1 ? ` Linha evolutiva: ${done} de ${total}.` : ""),
    );
    btn.title = total > 1 ? `${done}/${total} da linha` : word;
  }

  return { node: btn, update };
}
