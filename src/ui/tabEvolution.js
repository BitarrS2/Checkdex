// Aba "Evolução": a linha evolutiva como ÁRVORE (ramificações — Eevee, Wurmple,
// Gardevoir/Gallade…). As formas regionais entram como ramos extras (com a região
// no card e o método na seta). Clicar num nó marca a captura.

import { el, pad3 } from "./dom.js";
import { evolutionStages, regionalsFor, altFormsFor, store } from "../data.js";
import {
  isCaught, toggleCaught, isCaughtShiny, toggleCaughtShiny, isShiny, subscribe,
  isRegionalCaught, toggleRegionalCaught, isAltCaught, toggleAltCaught,
} from "../state.js";
import { typeSymbol } from "./types.js";
import { describeCond, pickCond } from "./evoText.js";
import { regionalHowto } from "./regionalText.js";
import { spriteImg } from "./sprite.js";

const caughtOf = (id) => (isShiny() ? isCaughtShiny(id) : isCaught(id));
const toggleCaughtOf = (id) => (isShiny() ? toggleCaughtShiny : toggleCaught)(id);

const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4l9 8-9 8"/></svg>';
const REGION_PT = { alola: "Alola", galar: "Galar", hisui: "Hisui", paldea: "Paldea" };
const typesOf = (id) => store.byId.get(id)?.types ?? [];
const nodeTypes = (node) => (node.regKey || node.altKey ? node.types : typesOf(node.id));

// Espécies canônicas que só evoluem a partir de UMA forma regional específica —
// não penduram no tronco canônico, e sim no ramo daquela região.
const REGIONAL_ONLY_EVO = {
  862: "galar",   // Obstagoon  ← Linoone de Galar
  863: "galar",   // Perrserker ← Meowth de Galar
  864: "galar",   // Cursola    ← Corsola de Galar
  865: "galar",   // Sirfetch'd ← Farfetch'd de Galar
  866: "galar",   // Mr. Rime   ← Mr. Mime de Galar
  867: "galar",   // Runerigus  ← Yamask de Galar
  902: "hisui",   // Basculegion ← Basculin de Hisui
  903: "hisui",   // Sneasler   ← Sneasel de Hisui
  904: "hisui",   // Overqwil   ← Qwilfish de Hisui
  980: "paldea",  // Clodsire   ← Wooper de Paldea
};

export function renderEvolution(pokemon) {
  const stages = evolutionStages(pokemon);
  const regionals = regionalsFor(pokemon);
  const alts = altFormsFor(pokemon);

  const wrap = el("div", { class: "evo-tab" });
  if (stages.length <= 1 && !regionals.length && !alts.length) {
    wrap.append(el("p", { class: "evo--none" }, `${pokemon.name} não evolui.`));
    return wrap;
  }

  // árvore canônica a partir do campo `from` — pulando as evoluções que só saem
  // de forma regional (entram depois, no ramo da região certa).
  const nodes = new Map(stages.map((s) => [s.id, { ...s, kids: [] }]));
  let root = null;
  for (const n of nodes.values()) {
    if (REGIONAL_ONLY_EVO[n.id]) continue;
    if (n.from != null && nodes.has(n.from)) nodes.get(n.from).kids.push(n);
    else if (!root) root = n;
  }
  root = root || nodes.get(stages[0].id) || { id: pokemon.id, name: pokemon.name, kids: [] };

  if (stages.length <= 1) {
    wrap.append(el("p", { class: "evo--none" },
      `${pokemon.name} não evolui — só tem forma${regionals.length > 1 ? "s" : ""} regional${regionals.length > 1 ? "is" : ""}.`));
  }

  // enxerta as formas regionais como ramos; as formas-base regionais (evo 1)
  // voltam como raízes extras, empilhadas junto da linha canônica.
  const extraRoots = spliceRegionals(regionals, nodes, root);
  spliceAltForms(alts, nodes);

  const branches = [root, ...extraRoots].map((r) => renderBranch(r, pokemon.id));
  const forest = extraRoots.length
    ? el("div", { class: "evo__stack" }, ...branches)
    : branches[0];

  const tree = el("div", { class: "evo", role: "list" }, forest);
  wrap.append(tree);

  const unsub = subscribe((kind) => {
    if (!wrap.isConnected) return;
    if (kind === "caught" || kind === "shiny") {
      const shiny = isShiny();
      for (const node of tree.querySelectorAll(".evo__node[data-stage-id]")) {
        const on = caughtOf(Number(node.dataset.stageId));
        node.classList.toggle("is-caught", on);
        node.classList.toggle("is-shiny", shiny);
        node.setAttribute("aria-pressed", String(on));
      }
    }
    if (kind === "mega" || kind === "caught") {
      for (const node of tree.querySelectorAll(".evo__node[data-rk]")) {
        const on = isRegionalCaught(node.dataset.rk);
        node.classList.toggle("is-caught", on);
        node.setAttribute("aria-pressed", String(on));
      }
      for (const node of tree.querySelectorAll(".evo__node[data-ak]")) {
        const on = isAltCaught(node.dataset.ak);
        node.classList.toggle("is-caught", on);
        node.setAttribute("aria-pressed", String(on));
      }
    }
  });
  wrap.addEventListener("checkdex:dispose", unsub, { once: true });
  return wrap;
}

// cada forma regional vira um nó filho do seu pré-evo (regional se existir,
// senão canônico). As formas-base regionais (sem pré-evo) NÃO entram como filho
// da raiz canônica — voltam como raízes extras, pra ficarem na mesma coluna dos
// "evo 1" normais, mantendo o próprio caminho de evolução.
function spliceRegionals(regionals, nodes, root) {
  const byKey = new Map(); // `${speciesId}:${region}` -> nó regional
  const extraRoots = [];
  for (const f of [...regionals].sort((a, b) => a.speciesId - b.speciesId)) {
    const how = regionalHowto(f);
    const rnode = {
      regKey: f.key, name: f.name, region: f.region, speciesId: f.speciesId,
      sprite: f.sprite, types: f.types,
      howShort: how.short, howLong: how.long, howItem: how.item || null,
      kids: [],
    };
    byKey.set(`${f.speciesId}:${f.region}`, rnode);

    const preId = store.byId.get(f.speciesId)?.evolvesFrom;
    let parent = null;
    if (preId != null) {
      parent = byKey.get(`${preId}:${f.region}`) || nodes.get(preId) || null;
    }
    if (parent) parent.kids.push(rnode);
    else extraRoots.push(rnode);
  }

  // pendura as evoluções regional-exclusivas (Perrserker, Obstagoon, Clodsire…)
  // no nó da forma regional do pré-evo; se ela não estiver nesta linha, volta pro tronco.
  for (const [id, region] of Object.entries(REGIONAL_ONLY_EVO)) {
    const cn = nodes.get(Number(id));
    if (!cn) continue;
    const preId = store.byId.get(Number(id))?.evolvesFrom;
    const parent = byKey.get(`${preId}:${region}`) || nodes.get(preId) || root;
    parent.kids.push(cn);
  }

  return extraRoots;
}

// formas alternativas pós-evolução (Lycanroc Midnight/Dusk, Toxtricity Low
// Key, Urshifu Rapid Strike…): cada uma vira um nó IRMÃO da forma canônica
// que já está na pokedex — mesmo pai, mesmo N.º, condição de evolução
// diferente (achada em `sibling.conditions` pelo filtro `match`).
function spliceAltForms(alts, nodes) {
  for (const f of alts) {
    const sibling = nodes.get(f.siblingId);
    if (!sibling) continue;
    const cond = (sibling.conditions || []).find((c) =>
      Object.entries(f.match || {}).every(([k, v]) => c[k] === v));
    const parent = sibling.from != null ? nodes.get(sibling.from) : null;
    if (!cond || !parent) continue;
    parent.kids.push({
      altKey: f.key, name: f.name, tag: f.tag, sprite: f.sprite, types: f.types,
      speciesId: f.siblingId, conditions: [cond], conditionLabel: sibling.conditionLabel,
      kids: [],
    });
  }
}

// um ramo = [nó] + (se tem filhos) [coluna de filhos, cada um com sua condição]
function renderBranch(node, focusId) {
  const branch = el("div", { class: "evo__branch" }, evoNode(node, focusId));
  if (!node.kids.length) return branch;

  const fan = node.kids.length >= 4 && node.kids.every((k) => !k.kids.length);
  const cls = fan ? " evo__kids--fan" : node.kids.length > 1 ? " evo__kids--branch" : "";
  const kids = el("div", { class: "evo__kids" + cls });
  for (const kid of node.kids) {
    kids.append(el("div", { class: "evo__link" }, evoCond(node, kid), renderBranch(kid, focusId)));
  }

  if (fan) {
    branch.classList.add("evo__branch--fan");
    branch.append(el("span", { class: "evo__fork", "aria-hidden": "true" }), kids);
  } else {
    branch.append(kids);
  }
  return branch;
}

function evoCond(parent, kid) {
  // ramo regional: método curto na seta + tooltip completo
  if (kid.regKey) {
    const gained = kid.types.filter((t) => !nodeTypes(parent).includes(t));
    const hasIcon = kid.howItem && store.evoItems.has(kid.howItem);
    return el("span", { class: "evo__cond" + (hasIcon ? " evo__cond--item" : "") },
      el("span", { class: "evo__arrow", html: ARROW }),
      hasIcon
        ? el("img", { class: "evo__item", src: `assets/items/${kid.howItem}.png`, alt: "", loading: "lazy" })
        : null,
      kid.howShort
        ? el("span", { class: "evo__lvl", title: kid.howLong || kid.howShort }, kid.howShort)
        : null,
      ...(gained.length
        ? [el("span", { class: "evo__gain", title: "ganha " + gained.join(" / ") }, ...gained.map(typeSymbol))]
        : []),
    );
  }

  const c = pickCond(kid.conditions);
  const cond = describeCond(c, kid.conditionLabel);
  const gained = nodeTypes(kid).filter((t) => !nodeTypes(parent).includes(t));
  const itemSlug = c && (c.itemSlug || c.heldItemSlug);
  const hasIcon = itemSlug && store.evoItems.has(itemSlug);
  return el("span", { class: "evo__cond" + (hasIcon ? " evo__cond--item" : "") },
    el("span", { class: "evo__arrow", html: ARROW }),
    hasIcon
      ? el("img", { class: "evo__item", src: `assets/items/${itemSlug}.png`, alt: "", loading: "lazy" })
      : null,
    el("span", { class: "evo__lvl", title: cond }, cond),
    ...(gained.length
      ? [el("span", { class: "evo__gain", title: "ganha " + gained.join(" / ") }, ...gained.map(typeSymbol))]
      : []),
  );
}

function evoNode(node, focusId) {
  if (node.altKey) {
    const on = isAltCaught(node.altKey);
    return el("button", {
      class: "evo__node evo__node--alt" + (on ? " is-caught" : ""),
      type: "button", role: "listitem",
      "aria-pressed": String(on),
      dataset: { ak: node.altKey },
      onclick: () => toggleAltCaught(node.altKey),
    },
      el("i", {}),
      el("span", { class: "evo__alttag" }, node.tag || "FORMA"),
      spriteImg(node.sprite, { alt: node.name }),
      el("b", {}, node.name),
      el("span", { class: "evo__id" }, "N.º " + pad3(node.speciesId)),
      el("span", { class: "evo__types" }, ...node.types.map(typeSymbol)),
    );
  }

  if (node.regKey) {
    const on = isRegionalCaught(node.regKey);
    return el("button", {
      class: "evo__node evo__node--reg" + (on ? " is-caught" : ""),
      type: "button", role: "listitem",
      "aria-pressed": String(on),
      dataset: { rk: node.regKey, region: node.region },
      onclick: () => toggleRegionalCaught(node.regKey),
    },
      el("i", {}),
      el("span", { class: "evo__regtag", dataset: { region: node.region } }, REGION_PT[node.region] || node.region),
      spriteImg(node.sprite, { alt: node.name }),
      el("b", {}, node.name),
      el("span", { class: "evo__id" }, "N.º " + pad3(node.speciesId)),
      el("span", { class: "evo__types" }, ...node.types.map(typeSymbol)),
    );
  }

  const mon = store.byId.get(node.id);
  return el("button", {
    class: "evo__node"
      + (caughtOf(node.id) ? " is-caught" : "")
      + (isShiny() ? " is-shiny" : "")
      + (node.id === focusId ? " is-focus" : ""),
    type: "button", role: "listitem",
    "aria-pressed": String(caughtOf(node.id)),
    dataset: { stageId: String(node.id) },
    onclick: () => toggleCaughtOf(node.id),
  },
    el("i", {}),
    mon?.mega
      ? el("img", { class: "evo__mega", src: "assets/mega-dna.png", width: 20, height: 20, alt: "Mega Evolução", title: "Tem Mega Evolução" })
      : null,
    spriteImg(mon ? mon.sprite : `assets/sprites/${pad3(node.id)}.png`, { alt: node.name }),
    el("b", {}, node.name),
    el("span", { class: "evo__id" }, "N.º " + pad3(node.id)),
    el("span", { class: "evo__types" }, ...typesOf(node.id).map(typeSymbol)),
  );
}
