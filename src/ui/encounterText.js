// Traduções e rótulos para dados de encontro (compartilhado).

// método cru (PokéAPI, já em Title Case) -> { label, wild }
export function method(raw) {
  const s = raw.toLowerCase();
  if (s.includes("gift") || s.includes("egg")) return { label: "Presente", wild: false };
  if (s.includes("trade")) return { label: "Troca", wild: false };
  if (s.includes("rod") || s.includes("fish")) return { label: "Pescando", wild: true };
  if (s.includes("surf")) return { label: "Surfando", wild: true };
  if (s.includes("rock-smash") || s.includes("rock smash")) return { label: "Quebra-pedra", wild: true };
  if (s.includes("headbutt")) return { label: "Cabeçada em árvore", wild: true };
  if (s.includes("horde")) return { label: "Horda", wild: true };
  if (s.includes("swarm")) return { label: "Enxame", wild: true };
  if (s.includes("sky")) return { label: "Voando", wild: true };
  if (s.includes("overworld")) return { label: "No mapa", wild: true };
  if (s === "walk") return { label: "Mato alto", wild: true };
  if (/grass|spots|flowers|terrain|seaweed|bush|sand|snow|dark-grass/.test(s))
    return { label: "Mato alto", wild: true };
  if (s.includes("cave") || s.includes("rough")) return { label: "Caverna", wild: true };
  return { label: raw, wild: true };
}

const COND = {
  "Time Day": "de dia",
  "Time Night": "à noite",
  "Time Morning": "de manhã",
  Swarm: "durante enxame",
  Radar: "com o Poké Radar",
};
export function cond(c) {
  if (COND[c]) return COND[c];
  if (/^Story Progress/.test(c)) return "no pós-jogo";
  if (/^Slot2/.test(c)) return "com o cartucho certo no Slot 2";
  if (/^Radio/.test(c)) return "com o rádio na frequência certa";
  if (/^Season/.test(c)) return c.replace("Season ", "na estação ").toLowerCase();
  const coins = c.match(/^Coins (\d+)/);
  if (coins) return `${coins[1]} fichas`;
  return c.toLowerCase();
}

export function levelText(e) {
  if (e.minLevel == null) return "";
  return e.minLevel === e.maxLevel ? `Nv. ${e.minLevel}` : `Nv. ${e.minLevel}–${e.maxLevel}`;
}

export function chanceBand(c) {
  return c >= 20 ? "high" : c >= 8 ? "mid" : "low";
}

// a entrada "mais provável" de uma lista (maior chance primeiro)
export function pickBest(entries) {
  return [...entries].sort((a, b) => (b.chance ?? 0) - (a.chance ?? 0))[0];
}

// resumo curto de uma lista de entradas do mesmo Pokémon num local
export function hereSummary(entries) {
  const best = pickBest(entries);
  const m = method(best.method);
  const parts = [m.label, levelText(best)].filter(Boolean);
  if (m.wild && best.chance != null && best.chance < 100) parts.push(best.chance + "%");
  return parts.join(" · ");
}

// imagem da vara de pesca (Old/Good/Super Rod) pro método bruto guardado no
// encontro — null quando o método não é pesca com vara.
const ROD_ICON = {
  "old rod": "assets/items/old-rod.png",
  "good rod": "assets/items/good-rod.png",
  "super rod": "assets/items/super-rod.png",
};
export function rodIcon(rawMethod) {
  return ROD_ICON[(rawMethod || "").trim().toLowerCase()] || null;
}
