// Tabela de efetividade de tipos (Gen VI+) e o perfil defensivo de um Pokémon:
// que multiplicador de dano ele recebe de cada tipo atacante.

// atacante -> tipos que recebem dano DOBRADO desse ataque
const SUPER = {
  normal: [],
  fire: ["grass", "ice", "bug", "steel"],
  water: ["fire", "ground", "rock"],
  electric: ["water", "flying"],
  grass: ["water", "ground", "rock"],
  ice: ["grass", "ground", "flying", "dragon"],
  fighting: ["normal", "ice", "rock", "dark", "steel"],
  poison: ["grass", "fairy"],
  ground: ["fire", "electric", "poison", "rock", "steel"],
  flying: ["grass", "fighting", "bug"],
  psychic: ["fighting", "poison"],
  bug: ["grass", "psychic", "dark"],
  rock: ["fire", "ice", "flying", "bug"],
  ghost: ["psychic", "ghost"],
  dragon: ["dragon"],
  dark: ["psychic", "ghost"],
  steel: ["ice", "rock", "fairy"],
  fairy: ["fighting", "dragon", "dark"],
};

// atacante -> tipos que recebem METADE do dano
const NOTVERY = {
  normal: ["rock", "steel"],
  fire: ["fire", "water", "rock", "dragon"],
  water: ["water", "grass", "dragon"],
  electric: ["electric", "grass", "dragon"],
  grass: ["fire", "grass", "poison", "flying", "bug", "dragon", "steel"],
  ice: ["fire", "water", "ice", "steel"],
  fighting: ["poison", "flying", "psychic", "bug", "fairy"],
  poison: ["poison", "ground", "rock", "ghost"],
  ground: ["grass", "bug"],
  flying: ["electric", "rock", "steel"],
  psychic: ["psychic", "steel"],
  bug: ["fire", "fighting", "poison", "flying", "ghost", "steel", "fairy"],
  rock: ["fighting", "ground", "steel"],
  ghost: ["dark"],
  dragon: ["steel"],
  dark: ["fighting", "dark", "fairy"],
  steel: ["fire", "water", "electric", "steel"],
  fairy: ["fire", "poison", "steel"],
};

// atacante -> tipos IMUNES
const NONE = {
  normal: ["ghost"],
  electric: ["ground"],
  fighting: ["ghost"],
  poison: ["steel"],
  ground: ["flying"],
  psychic: ["dark"],
  ghost: ["normal"],
  dragon: ["fairy"],
};

export const ALL_TYPES = [
  "normal", "fire", "water", "grass", "electric", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
];

// { weak: [{type,mult}], resist: [...], immune: [...] } — só o que difere de 1×
export function defensiveProfile(types) {
  const defTypes = [...new Set((types || []).filter(Boolean))];
  const rows = [];
  for (const atk of ALL_TYPES) {
    let mult = 1;
    for (const def of defTypes) {
      if ((NONE[atk] || []).includes(def)) mult *= 0;
      else if (SUPER[atk].includes(def)) mult *= 2;
      else if (NOTVERY[atk].includes(def)) mult *= 0.5;
    }
    if (mult !== 1) rows.push({ type: atk, mult });
  }
  return {
    weak: rows.filter((r) => r.mult > 1).sort((a, b) => b.mult - a.mult),
    resist: rows.filter((r) => r.mult > 0 && r.mult < 1).sort((a, b) => a.mult - b.mult),
    immune: rows.filter((r) => r.mult === 0),
  };
}

export const fmtMult = (m) => (m === 0.25 ? "¼" : m === 0.5 ? "½" : String(m));
