// Helpers de DOM.

const SVG_NS = "http://www.w3.org/2000/svg";
// createElement("svg") cria um elemento fora do namespace SVG (não desenha nada);
// esses tags precisam de createElementNS pra virar vetor de verdade.
const SVG_TAGS = new Set(["svg", "path", "rect", "circle", "ellipse", "g", "line", "polyline", "polygon", "defs", "clipPath", "use", "mask"]);

export function el(tag, props = {}, ...children) {
  const isSvg = SVG_TAGS.has(tag);
  const node = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    // atributos SVG (class incluso) não refletem como propriedades JS — sempre setAttribute
    if (isSvg) { node.setAttribute(k, v); continue; }
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const clear = (node) => { while (node.firstChild) node.firstChild.remove(); };

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const pad3 = (n) => String(n).padStart(3, "0");
