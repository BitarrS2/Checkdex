# Checkdex — Plano do Projeto

> Pokédex web para **marcar Pokémon capturados** e **pesquisar rápido** como evoluir, onde
> encontrar e boas builds/itens — tudo organizado por **jogo** e **geração**, com visual
> limpo e sem poluição, seguindo o modelo das prints.

---

## 1. Objetivo e escopo

### O que o Checkdex faz
1. **Checklist de captura** — usuário marca cada Pokémon como capturado; progresso salvo no navegador.
2. **Busca inteligente** — por nome, número, tipo e jogo.
3. **Ficha rápida** por Pokémon (card expansível):
   - **Evolução** — linha evolutiva completa + condição (nível, item, troca, felicidade…).
   - **Onde encontrar** — local, método, faixa de nível e chance, **por jogo**.
   - **Builds / Itens** — melhores movesets, item segurado, natureza (fase posterior).
4. **Organização por jogo e geração** — abas no topo (Red & Blue, Yellow, Gold & Silver, …).

### Fora do escopo (agora)
- Login/conta na nuvem (usamos `localStorage` + exportar/importar JSON).
- Simulador de batalha / calculadora de dano.
- Multiplayer ou comparação entre usuários.

### Decisões travadas
- **Nomes:** originais/inglês (o usuário pediu, para não confundir quem usa os jogos).
- **Sprites:** artwork oficial (estilo único).
- **Dark mode:** fica para a Fase 4 (tokens já preparados).
- **Cobertura inicial:** Gen 1–3.

### Entrega por fases
| Fase | Conteúdo | Resultado |
|------|----------|-----------|
| **1 — Base** ✅ | Layout, grid, busca, filtro de tipo colorido, abas de jogo, checklist com `localStorage`, aba **Evolução**, aba **Onde encontrar**, deep-links | Pokédex navegável Gen 1–3 |
| **2 — (incorporada à Fase 1)** | Aba **Onde encontrar** com encontros por jogo + seletor de estágio/jogo | ✅ feito junto |
| **3 — Builds/Itens** | Dataset curado de movesets/itens/naturezas; aba **Builds** | Ficha competitiva |
| **4 — Polimento** | Exportar/importar progresso, PWA/offline, atalhos de teclado, dark mode, animações | App "de verdade" |

Cobertura inicial: **Gerações 1 a 3** (jogos das prints). A arquitetura suporta adicionar Gen 4+ só regenerando os dados.

---

## 2. Stack técnica

**Sem framework.** HTML + CSS + JavaScript (ES Modules). Simples de manter, rápido, sem build obrigatório.

| Camada | Escolha | Motivo |
|--------|---------|--------|
| Marcação | HTML5 semântico | Leve, acessível |
| Estilo | CSS puro com **custom properties** (tokens) | Tema e cores de tipo centralizados |
| Lógica | JS ES Modules, sem dependências | Zero peso, sem lock-in |
| Dev server | `vite` **só em desenvolvimento** (opcional) | Hot reload; produção continua sendo arquivos estáticos |
| Dados | **JSON pré-gerado** por script Node | Sem depender da API em runtime; rápido e offline |
| Persistência | `localStorage` (progresso) + export/import `.json` | Sem backend |

Hospedagem: qualquer estático (GitHub Pages, Netlify, Vercel).

---

## 3. Fonte de dados

### PokéAPI (https://pokeapi.co) — gratuita, sem chave
Usada **em build**, não em runtime. Um script percorre os endpoints e gera JSONs locais.

| Dado | Endpoint | Observação |
|------|----------|------------|
| Lista/tipos/stats | `/pokemon/{id}`, `/pokemon-species/{id}` | nome, número, tipos, altura/peso, geração |
| Evolução | `/evolution-chain/{id}` | `min_level`, `trigger`, `item`, `held_item`, `time_of_day`, `min_happiness`, `location` |
| Onde encontrar | `/pokemon/{id}/encounters` | `location_area`, `version_details[].version`, `max_chance`, `encounter_details[]` → `min_level`, `max_level`, `chance`, `method`, `condition_values` |
| Jogos/gerações | `/version-group`, `/version`, `/generation` | mapeia jogo → geração |
| Nomes PT-BR | `/pokemon-species` → `names[lang=es/ja/...]` | PT-BR é parcial na API; ver seção i18n |

### Sprites / imagens
Baixadas **uma vez** pelo script para `assets/sprites/` (confiável, offline, sem hotlink):
- **Artwork oficial** (`sprites/other/official-artwork/front_default`) como estilo **padrão único** — resolve a inconsistência das prints (mistura de pixel art, artwork e sprites animados).
- Opcional: sprite do **jogo selecionado** (`sprites/versions/generation-i/...`) como alternativa "modo retrô".

### Builds/Itens (Fase 3)
PokéAPI **não tem** dados competitivos. Plano: **dataset curado** (`data/builds.json`) — para Gen 1–3 são poucos Pokémon relevantes; montar manualmente a partir de fontes públicas (ex.: Smogon RBY/GSC/ADV). Estrutura já prevista no modelo de dados.

---

## 4. Modelo de dados (JSON gerado)

```jsonc
// data/pokedex.json  — array de Pokémon
{
  "id": 1,
  "name": "Bulbasaur",
  "types": ["grass", "poison"],
  "generation": 1,
  "sprite": "assets/sprites/001.png",
  "stats": { "hp": 45, "atk": 49, "def": 49, "spa": 65, "spd": 65, "spe": 45 },
  "evolutionChainId": 1,
  "evolvesFrom": null
}

// data/evolution-chains.json  — por linha evolutiva
{
  "id": 1,
  "stages": [
    { "id": 1, "name": "Bulbasaur" },
    { "id": 2, "name": "Ivysaur",  "from": 1, "conditions": [{ "trigger": "level-up", "minLevel": 16 }] },
    { "id": 3, "name": "Venusaur", "from": 2, "conditions": [{ "trigger": "level-up", "minLevel": 32 }] }
  ]
}

// data/encounters.json  — { pokemonId: { versionSlug: [ ... ] } }
{
  "1": {
    "blue": [
      { "location": "Pallet Town", "method": "Gift", "minLevel": 5, "maxLevel": 5, "chance": 100 }
    ]
  }
}

// data/games.json  — abas do topo
[
  { "slug": "red-blue",  "label": "Red & Blue",  "generation": 1, "versions": ["red", "blue"] },
  { "slug": "yellow",    "label": "Yellow",       "generation": 1, "versions": ["yellow"] },
  { "slug": "gold-silver","label": "Gold & Silver","generation": 2, "versions": ["gold", "silver"] }
  // ...
]

// data/builds.json  (Fase 3)  — { pokemonId: { versionGroup: [ { role, moves[], item, nature, evs } ] } }
```

### Estado do usuário (`localStorage`)
```jsonc
"checkdex.caught": { "1": true, "4": true }          // ids capturados
"checkdex.prefs":  { "game": "all", "spriteMode": "artwork" }
```
Botão **Exportar** gera `checkdex-save.json`; **Importar** restaura. (Fase 4)

---

## 5. Estrutura de pastas

```
checkdex/
├─ index.html
├─ assets/
│  └─ sprites/               # geradas pelo script (001.png … )
├─ data/                     # JSONs gerados (versionados no repo)
│  ├─ pokedex.json
│  ├─ evolution-chains.json
│  ├─ encounters.json
│  ├─ games.json
│  └─ builds.json
├─ src/
│  ├─ main.js                # bootstrap, roteamento de estado
│  ├─ state.js               # store: caught, filtros, prefs + eventos
│  ├─ data.js                # carrega/join dos JSONs
│  ├─ search.js              # filtro por nome/número/tipo/jogo
│  ├─ ui/
│  │  ├─ header.js
│  │  ├─ gameTabs.js
│  │  ├─ searchBar.js
│  │  ├─ typeFilter.js
│  │  ├─ pokemonCard.js
│  │  ├─ tabEvolution.js
│  │  ├─ tabEncounters.js
│  │  └─ tabBuilds.js        # Fase 3
│  └─ styles/
│     ├─ tokens.css          # cores base, tipos, espaçamento, tipografia
│     ├─ layout.css          # header, grid, responsivo
│     └─ components.css      # card, chips, tabs, progress
└─ scripts/
   └─ build-data.mjs         # PokéAPI → data/*.json + assets/sprites
```

---

## 6. Interface (seguindo as prints)

### 6.1 Header
- Logo Pokébola + título **Pokédex** / subtítulo do jogo selecionado ("Todos os jogos", "Red & Blue"…).
- **Badge de contagem** — nas prints o número (541 / 59) é ambíguo. **Correção:** mostrar `capturados / total visível`, ex. **`59 / 386`**, com `title` explicativo. Assim o número faz sentido ao filtrar.

### 6.2 Abas de jogo
- Linha rolável horizontalmente (mobile: swipe). Aba ativa em vermelho.
- Trocar de jogo re-filtra a dex (Pokémon existentes naquele jogo) e ajusta condições de evolução / lista de "onde encontrar".

### 6.3 Barra de busca
- Um campo, placeholder "Buscar por nome ou número…".
- Busca por **nome** (parcial, sem acento) e **número** (`25`, `#25`, `025`).
- Debounce ~150 ms; resultado atualiza na hora.
- Estado vazio: ilustração + "Nenhum Pokémon encontrado".

### 6.4 Filtro de tipo (colorido)
- Chips: Todos, Normal, Fire, Water, … Rock (e demais tipos).
- **Inativo:** contorno cinza, fundo branco. **Ativo:** fundo **na cor do tipo** + texto com contraste garantido (ex.: Electric/amarelo → texto escuro).
- Correção da print: no estado normal os chips ficam neutros (não coloridos) para não poluir; a cor aparece **ao selecionar** e nos badges dos cards.

### 6.5 Card de Pokémon
**Recolhido:** sprite, `#0001`, nome, badges de tipo (cor do tipo), chevron, círculo de "capturado", barra de progresso da linha evolutiva.

**Expandido:** barra de progresso + `%`, abas **EVOLUÇÃO / ONDE ENCONTRAR / BUILDS**.

**Correções de layout das prints:**
1. **Espaço em branco no card vizinho** — quando um card expande, o vizinho da mesma linha estica junto e sobra vazão branca. → Grid com **colunas independentes** (masonry via CSS `columns` ou layout em 2 colunas com JS calculando a coluna mais curta). O card expande **sem afetar o vizinho**.
2. **Barra de progresso** — gradiente verde→cinza→roxo confunde. → Barra **verde sólida** preenchendo a fração capturada da linha; texto `%` na cor de status (cinza→verde). Deixar claro no `title`: "2 de 3 capturados nesta linha evolutiva".
3. **Círculo de captura** — vira botão claro com ✓ verde quando marcado; `aria-pressed`.

### 6.6 Aba Evolução
- Cadeia horizontal: sprite + nome + `#num` por estágio, seta com **condição** entre eles (`Lv. 16`, `Pedra da Água`, `Troca`, `Felicidade`).
- Cada estágio é clicável para marcar/desmarcar captura (reflete na barra).
- Condição depende do **jogo selecionado** (ex.: em Gen 2 algumas evoluções mudam). Em "Todos os jogos": mostrar a condição mais comum e um "*" com nota.

### 6.7 Aba Onde encontrar
- Seletor **Pokémon** (estágios da linha) + seletor **Jogo**.
- Tabela: **Local / Método**, **Nível**, **Chance** (badge colorido por faixa: verde alto, amarelo médio, vermelho raro).
- Se não há encontro selvagem (ex.: inicial, evolução, lendário por evento): mensagem "Só via evolução/troca/presente".

### 6.8 Aba Builds (Fase 3)
- Cartões de moveset: papel (ex.: "Sweeper físico"), 4 golpes, item, natureza, EVs; fonte citada.

---

## 7. Sistema de cores dos tipos

`tokens.css` com um par por tipo (fundo + texto de contraste):

| Tipo | Cor | | Tipo | Cor |
|------|-----|-|------|-----|
| Normal | `#9FA19F` | | Ground | `#E0C068` |
| Fire | `#E62829` | | Flying | `#8FA9DE` |
| Water | `#2980EF` | | Psychic | `#F366B9` |
| Grass | `#3FA129` | | Bug | `#91A119` |
| Electric | `#FAC000` *(texto escuro)* | | Rock | `#AFA981` |
| Ice | `#3DCEF3` | | Ghost | `#704170` |
| Fighting | `#FF8000` | | Dragon | `#5060E1` |
| Poison | `#9141CB` | | Dark | `#624D4E` |
| | | | Steel / Fairy | `#60A1B8` / `#EF70EF` |

Regra de acessibilidade: contraste mínimo AA; tipos claros (Electric, Ice) usam texto `#222`.

---

## 8. Correções gerais em relação às prints

1. **Consistência de sprites** — um único estilo (artwork oficial) em vez de pixel art + artwork + animado misturados.
2. **Contagem do header** — passa a ser `capturados / total` com tooltip.
3. **Chips de tipo** neutros quando inativos; cor só no ativo/badges.
4. **Layout masonry** — fim do espaço em branco ao expandir.
5. **Barra de progresso** legível e com rótulo.
6. **Responsivido** — 1 coluna no mobile, abas com scroll, área de toque ≥ 44px.
7. **Acessibilidade** — foco visível por teclado, `aria-expanded`/`aria-pressed`, navegação por Tab, `prefers-reduced-motion`.
8. **Performance** — 386+ cards: renderização incremental (IntersectionObserver / lista virtualizada) para scroll fluido.
9. **Tema claro/escuro** — tokens já preparam dark mode (Fase 4).
10. **Deep-link** — `?game=red-blue&type=grass&q=bulba&sel=1` para compartilhar/estado ao recarregar.

---

## 9. Script de build de dados (`scripts/build-data.mjs`)

1. Busca lista de espécies até o limite da geração alvo (Gen 3 = 386).
2. Para cada uma: `/pokemon`, `/pokemon-species`, `/evolution-chain`, `/pokemon/{id}/encounters`.
3. Normaliza para o **Modelo de dados** (seção 4).
4. Baixa a artwork oficial → `assets/sprites/{id}.png` (pula se já existe).
5. Rate limit gentil (lotes de ~20, pausa) e cache local para reexecução rápida.
6. Escreve `data/*.json`.

Rodar: `node scripts/build-data.mjs --gen 3`. Resultado versionado no repo → o site nunca chama a PokéAPI em produção.

---

## 10. Riscos / decisões em aberto

| Tema | Questão | Proposta |
|------|---------|----------|
| Nomes PT-BR | PokéAPI tem PT-BR incompleto | Usar nome EN (padrão da franquia nos jogos) + i18n de UI em PT-BR |
| Builds/Itens | Sem fonte estruturada | Dataset curado manual para Gen 1–3 (volume pequeno) |
| "Todos os jogos" | Condições de evolução/encontro variam | Mostrar caso mais comum + nota; detalhe ao escolher jogo |
| Peso das sprites | 386 PNGs de artwork | Redimensionar para ~256px e comprimir; lazy-load |
| Vite ou não | Build opcional | Começar 100% estático; adicionar Vite só se necessário |

---

## 11. Próximo passo

Após seu OK neste plano:
1. Montar `scripts/build-data.mjs` e gerar dados Gen 1–3.
2. Implementar Fase 1 (layout + busca + filtro colorido + checklist + aba Evolução).
3. Enviar preview para avaliação antes de seguir para Fase 2.

> **Pontos para você decidir:** (a) estilo de sprite padrão — artwork oficial ou pixel art do jogo?
> (b) nomes em EN ou tentar PT-BR? (c) começar já com dark mode ou deixar pra Fase 4?
