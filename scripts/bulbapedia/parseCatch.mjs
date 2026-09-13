// Parser das tabelas de encontro selvagem da Bulbapedia.
//
// A Bulbapedia usa um template MediaWiki fixo por geração/remake pra essas
// tabelas: {{catch/entryN|dexnum|nome|flag1|flag2[|flag3]|método|nível|chance...}}.
// Cada "flag" (yes/no) indica se aquele Pokémon aparece naquele jogo; o número
// de colunas de chance varia (às vezes 1 chance compartilhada por todas as
// flags "yes" da linha, às vezes 1 por flag — e por vezes template exporta
// mais colunas de chance do que flags reais, sobra que é ignorada).
//
// Assinaturas confirmadas lendo o wikitext-fonte de cada template + exemplos
// reais de páginas de rota (ver plano). `chanceCols: "shared"` = 1 valor pra
// todas as flags da linha; "zip" = 1 valor por flag, na ordem.

// `flags`: uma entrada por coluna de flag do template, na ordem — `game` é o
// slug (pode repetir quando 2 versões do mesmo jogo colapsam num só slug,
// tipo Ruby+Sapphire) e `version` é o slug de versão real (bate com
// `versions` de data/games.json), usado pra saber exclusividade de versão
// (só Ruby, não Sapphire) e pra achar a cor/rótulo certo na UI.
export const TEMPLATE_SPECS = {
  entry1: {
    flags: [{ game: "red-blue", version: "red" }, { game: "red-blue", version: "blue" }, { game: "yellow", version: "yellow" }],
    chanceCols: "shared",
  },
  entry2: {
    flags: [{ game: "gold-silver", version: "gold" }, { game: "gold-silver", version: "silver" }, { game: "crystal", version: "crystal" }],
    chanceCols: "zip",
  },
  entry3: {
    flags: [{ game: "ruby-sapphire", version: "ruby" }, { game: "ruby-sapphire", version: "sapphire" }, { game: "emerald", version: "emerald" }],
    chanceCols: "shared",
  },
  entry3a: {
    flags: [{ game: "ruby-sapphire", version: "ruby" }, { game: "ruby-sapphire", version: "sapphire" }, { game: "emerald", version: "emerald" }],
    chanceCols: "shared",
  },
  entryfl: {
    flags: [{ game: "firered-leafgreen", version: "firered" }, { game: "firered-leafgreen", version: "leafgreen" }],
    chanceCols: "shared",
  },
  entry4: {
    flags: [{ game: "diamond-pearl", version: "diamond" }, { game: "diamond-pearl", version: "pearl" }, { game: "platinum", version: "platinum" }],
    chanceCols: "zip",
  },
  entryhs: {
    flags: [{ game: "heartgold-soulsilver", version: "heartgold" }, { game: "heartgold-soulsilver", version: "soulsilver" }],
    chanceCols: "zip",
  },
  entrybdsp: {
    flags: [{ game: "brilliant-diamond-and-shining-pearl", version: "brilliant-diamond" }, { game: "brilliant-diamond-and-shining-pearl", version: "shining-pearl" }],
    chanceCols: "zip",
  },
  entrype: {
    flags: [{ game: "lets-go-pikachu-lets-go-eevee", version: "lets-go-pikachu" }, { game: "lets-go-pikachu-lets-go-eevee", version: "lets-go-eevee" }],
    chanceCols: "shared",
  },
  entry6: {
    flags: [{ game: "x-y", version: "x" }, { game: "x-y", version: "y" }],
    chanceCols: "shared",
  },
  entryoras: {
    flags: [{ game: "omega-ruby-alpha-sapphire", version: "omega-ruby" }, { game: "omega-ruby-alpha-sapphire", version: "alpha-sapphire" }],
    chanceCols: "shared",
  },
  // entry5 (B/W) tem chance por ESTAÇÃO (primavera/verão/outono/inverno), não
  // por versão, quando não usa all= — tratamos como "shared" (pega a 1ª
  // coluna, geralmente primavera) já que quase todo uso real é all=.
  entry5: {
    flags: [{ game: "black-white", version: "black" }, { game: "black-white", version: "white" }],
    chanceCols: "shared",
  },
  "entry5-2": {
    flags: [{ game: "black-2-white-2", version: "black-2" }, { game: "black-2-white-2", version: "white-2" }],
    chanceCols: "shared",
  },
  entry7: {
    flags: [{ game: "sun-moon", version: "sun" }, { game: "sun-moon", version: "moon" }],
    chanceCols: "daynight",
  },
  entryusum: {
    flags: [{ game: "ultra-sun-ultra-moon", version: "ultra-sun" }, { game: "ultra-sun-ultra-moon", version: "ultra-moon" }],
    chanceCols: "daynight",
  },
  entry8: {
    flags: [{ game: "sword-shield", version: "sword" }, { game: "sword-shield", version: "shield" }],
    chanceCols: "shared",
  },
};

const METHOD_ALIASES = {
  "fish old": "Old Rod",
  "fish good": "Good Rod",
  "fish super": "Super Rod",
  "rock smash": "Rock Smash",
};

// tira marcação wiki residual de um texto exibível (rótulos de catch/div,
// que às vezes trazem {{template|...}} ou [[link|texto]] dentro).
function stripWikiMarkup(s) {
  let out = s;
  for (let i = 0; i < 2; i++) {
    out = out.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => inner.split("|").pop().trim());
  }
  out = out
    .replace(/\[\[([^\]|]*)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return out.replace(/\s+/g, " ").trim();
}

function normalizeMethod(raw) {
  if (!raw) return raw;
  const key = raw.trim().toLowerCase();
  return METHOD_ALIASES[key] || raw.trim();
}

// em algumas páginas "consolidadas" (ex.: "Pokémon Mansion (Kanto)") o campo
// método vem preenchido com o andar ("1F", "B1F") em vez do método real —
// nesses casos joga o andar pra conditions e assume andar-a-pé (indoor).
function isFloorLabel(s) {
  return /^b?\d+f$/i.test(s.trim());
}

function parseLevel(raw) {
  if (!raw) return { minLevel: null, maxLevel: null };
  const nums = [...raw.matchAll(/\d+/g)].map((m) => Number(m[0]));
  if (!nums.length) return { minLevel: null, maxLevel: null };
  return { minLevel: Math.min(...nums), maxLevel: Math.max(...nums) };
}

function parseChance(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s === "-" || s === "?") return null;
  if (/^(only\s*)?one$/i.test(s)) return 100;
  // só aceita número seguido de "%" — evita pegar dígito de texto livre tipo
  // "Purchase for {{PDollar}}500" (preço, não taxa de encontro)
  const pct = s.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) return Number(pct[1]);
  if (/purchase|gift|trade|reward/i.test(s)) return 100;
  return null;
}

// separa "a|b|c|k=v" respeitando [[...]] e {{...}} aninhados (não deve
// ocorrer nas chamadas de catch/entry, mas fica seguro).
function splitArgs(inner) {
  const parts = [];
  let depth = 0, cur = "";
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === "{{" || two === "[[") { depth++; cur += two; i++; continue; }
    if (two === "}}" || two === "]]") { depth--; cur += two; i++; continue; }
    if (inner[i] === "|" && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += inner[i];
  }
  parts.push(cur);
  const positional = [];
  const named = {};
  for (const p of parts) {
    const eq = p.indexOf("=");
    // "type1=Fire" é nomeado; "2-5" ou "50%" (tem "=" ausente) é posicional.
    // Evita confundir com nomes que por acaso tenham "=" (não ocorre aqui).
    if (eq > 0 && /^[a-zA-Z][\w-]*$/.test(p.slice(0, eq).trim())) {
      named[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
    } else {
      positional.push(p.trim());
    }
  }
  return { positional, named };
}

// encontra todas as chamadas {{catch/entryX|...}} e {{catch/div|...}} de um
// bloco de wikitext, respeitando aninhamento de {{ }}.
function findTemplateCalls(wikitext, namePattern) {
  const calls = [];
  for (let i = 0; i < wikitext.length - 1; i++) {
    if (wikitext[i] !== "{" || wikitext[i + 1] !== "{") continue;
    let depth = 1, j = i + 2;
    while (j < wikitext.length - 1 && depth > 0) {
      if (wikitext[j] === "{" && wikitext[j + 1] === "{") { depth++; j += 2; continue; }
      if (wikitext[j] === "}" && wikitext[j + 1] === "}") { depth--; j += 2; continue; }
      j++;
    }
    const inner = wikitext.slice(i + 2, j - 2);
    const pipeIdx = inner.indexOf("|");
    const name = (pipeIdx === -1 ? inner : inner.slice(0, pipeIdx)).trim().toLowerCase();
    if (namePattern.test(name)) {
      calls.push({ name, argsRaw: pipeIdx === -1 ? "" : inner.slice(pipeIdx + 1) });
    }
    i = j - 1;
  }
  return calls;
}

// divide o wikitext completo da página nas seções ===Generation N=== dentro
// de ==Pokémon== (nível de "=" varia entre páginas, então casamos qualquer).
export function extractGenerationSections(wikitext) {
  const pokeIdx = wikitext.search(/={2,}\s*Pokémon\s*={2,}/i);
  if (pokeIdx === -1) return [];
  const rest = wikitext.slice(pokeIdx);
  // corta no próximo heading de nível <=2 (==Something==, não ===Something===)
  const nextTop = rest.slice(1).search(/\n==[^=][^\n]*==\s*\n/);
  const section = nextTop === -1 ? rest : rest.slice(0, nextTop + 1);

  const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9 };
  const headingRe = /={2,}\s*Generation\s+([IVX]+)\s*={2,}/gi;
  const sections = [];
  let m, last = null;
  while ((m = headingRe.exec(section))) {
    if (last) sections.push({ gen: last.gen, text: section.slice(last.end, m.index) });
    last = { gen: ROMAN[m[1].toUpperCase()] || null, end: headingRe.lastIndex };
  }
  if (last) sections.push({ gen: last.gen, text: section.slice(last.end) });
  // regiões com só uma geração de jogos (Kalos, Galar, Paldea…) não têm
  // subtítulo "===Generation N===" — a tabela fica direto sob ==Pokémon==
  if (!sections.length) sections.push({ gen: null, text: section });
  return sections;
}

// extrai o rótulo de agrupamento mais recente ({{catch/div|land|Rótulo}})
// que precede cada entry, pra virar "conditions".
function withDivLabels(genText) {
  const calls = findTemplateCalls(genText, /^catch\/(entry[\w-]*|div)$/);
  const out = [];
  let currentDiv = null;
  for (const c of calls) {
    if (c.name === "catch/div") {
      const { positional } = splitArgs(c.argsRaw);
      // {{catch/div|land|Rótulo}} -> rótulo é o 2º posicional
      currentDiv = stripWikiMarkup(positional[1] || "") || null;
      continue;
    }
    out.push({ name: c.name, argsRaw: c.argsRaw, div: currentDiv });
  }
  return out;
}

// pokemonId aqui é sempre o número da Pokédex nacional (mesma convenção do
// resto do app — formas regionais/alternativas caem na espécie base).
export function parseEntryCall(name, argsRaw, div) {
  const spec = TEMPLATE_SPECS[name.replace(/^catch\//, "")];
  if (!spec) return [];
  const { positional, named } = splitArgs(argsRaw);
  const dexnum = parseInt(positional[0], 10);
  if (!dexnum) return [];

  const nFlags = spec.flags.length;
  const flags = spec.flags.map((f, i) => ({ ...f, yes: /^y(es)?$/i.test(positional[2 + i] || "") }));
  let method = normalizeMethod(positional[2 + nFlags]);
  const { minLevel, maxLevel } = parseLevel(positional[3 + nFlags]);
  const chanceArgs = positional.slice(4 + nFlags);
  const allVal = named.all != null ? parseChance(named.all) : null;

  const conditions = div ? [div] : [];
  if (method && isFloorLabel(method)) {
    const floor = method.toUpperCase();
    if (!conditions.includes(floor)) conditions.push(floor);
    method = "Walk";
  }

  // se só ALGUMAS das versões de um mesmo jogo (slug) estão "yes" nesta
  // linha, é exclusivo de versão — marca qual.
  const byGame = new Map();
  for (const f of flags) (byGame.get(f.game) ?? byGame.set(f.game, []).get(f.game)).push(f);

  const rows = [];
  for (let i = 0; i < flags.length; i++) {
    if (!flags[i].yes) continue;
    const groupFlags = byGame.get(flags[i].game);
    const yesCount = groupFlags.filter((f) => f.yes).length;
    const exclusiveTo = yesCount < groupFlags.length ? flags[i].version : null;
    const base = { pokemonId: dexnum, gameSlug: flags[i].game, method, minLevel, maxLevel, conditions, exclusiveTo };

    // entry7/entryusum (Alola): as 2 colunas de chance são DIA e NOITE, não
    // por versão — cada flag "yes" pode gerar até 2 linhas (uma por turno em
    // que realmente aparece; "-" nessa coluna = não aparece naquele turno).
    if (spec.chanceCols === "daynight" && allVal == null) {
      for (const [label, raw] of [["De dia", chanceArgs[0]], ["À noite", chanceArgs[1]]]) {
        const chance = parseChance(raw);
        if (chance == null || chance === 0) continue; // 0% = não sai de verdade nesse turno
        rows.push({ ...base, chance, conditions: [...conditions, label] });
      }
      continue;
    }

    let chance;
    if (allVal != null) chance = allVal;
    else if (spec.chanceCols === "shared" || spec.chanceCols === "daynight") chance = parseChance(chanceArgs[0]);
    else chance = parseChance(chanceArgs[i] ?? chanceArgs[0]);
    if (chance === 0) continue; // 0% = a fonte tá dizendo que não sai de verdade nessa versão
    rows.push({ ...base, chance });
  }
  return rows;
}

// ponto de entrada: wikitext de UMA página de local -> linhas por jogo,
// já com `location` preenchido (título da página, mesmo formato que
// src/data.js espera vindo do build antigo baseado em PokéAPI).
export function parseLocationPage(wikitext, pageTitle) {
  const sections = extractGenerationSections(wikitext);
  const rows = [];
  for (const { text } of sections) {
    for (const { name, argsRaw, div } of withDivLabels(text)) {
      if (name === "catch/div") continue;
      for (const row of parseEntryCall(name, argsRaw, div)) {
        rows.push({ ...row, location: pageTitle });
      }
    }
  }
  return rows;
}

// true se o wikitext tiver pelo menos uma tabela de captura reconhecida —
// usado pra filtrar páginas de categoria que não são locais de jogo (lugares
// só-de-anime nunca têm {{catch/entryN}}).
export function hasCatchTable(wikitext) {
  return /\{\{\s*catch\/entry[\w-]*\s*\|/i.test(wikitext);
}
