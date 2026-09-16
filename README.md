# Checkdex

Pokédex web para **marcar Pokémon capturados** e pesquisar **evolução**, **onde encontrar**
e (em breve) **builds/itens**, organizada por **jogo** e **geração**.

Ver [PLANO.md](PLANO.md) para o plano completo e o roadmap.

## Rodar localmente

```bash
npm run serve         # http://localhost:5173  (servidor estático, sem build)
```

Abra `index.html` por um servidor (os módulos ES e os `fetch` de JSON não funcionam via `file://`).

## Regenerar os dados

Os dados ficam versionados em `data/` e as imagens em `assets/sprites/`.
Para atualizar a partir da [PokéAPI](https://pokeapi.co):

```bash
npm run build:data          # todas as 9 gerações (1025 Pokémon, ~130 MB de sprites)
npm run build:data:gen1     # só Gen 1, mais rápido para testar
```

As respostas da API ficam em cache em `scripts/.cache/` (ignorado no git) — reexecuções são rápidas.

## Estrutura

```
index.html            # casca da página
data/*.json           # pokedex, linhas evolutivas, encontros, jogos (gerados)
assets/sprites/*.png       # artwork oficial (gerado)
assets/sprites/shiny/*.png  # artwork shiny (gerado) — modo shiny troca por estes
assets/balls/*.png    # Ultra / Master / Cherish Ball (indicador de raridade no card)
assets/mega/          # artwork das Megas + pedras (aba Mega Evolução)
assets/regional/      # artwork das formas Alola/Galar/Hisui/Paldea
assets/items/         # ícones de itens de evolução (Pedra do Fogo, King's Rock…)
data/megas.json       # Megas por espécie: forma, tipos, pedra (gerado)
data/regionals.json   # formas regionais por espécie (gerado)
data/evo-items.json   # slugs de item de evolução que têm ícone (gerado)
src/
  main.js             # orquestração da UI
  state.js            # capturados + filtros (localStorage)
  data.js             # carga e índices dos JSONs (agrupa por linha evolutiva)
  search.js           # filtro geração + jogo + tipo + categoria + texto
  ui/                 # card, abas internas (evolução / mega / onde encontrar), helpers
  styles/
    tokens.css        # paleta (vermelho de Pokébola, azul da lente), cores de tipo, fonte Nunito
    layout.css        # topbar, grade responsiva
    components.css    # card, pokébola de progresso, chips, abas
scripts/
  build-data.mjs      # PokéAPI -> data/*.json + sprites
  serve.mjs           # servidor estático de desenvolvimento
```

## Status

**Fase 1 concluída:** todas as 9 gerações / 1025 Pokémon / 21 jogos. Grid resumido (1 card por
linha evolutiva — as evoluções aparecem no dropdown), busca, filtro por **geração**, por **jogo**
(dentro da geração), por **tipo** (colorido) e por **local** (rotas na ordem do jogo, cavernas,
florestas… — mostra quais Pokémon aparecem ali e como pegar), checklist com progresso por linha
evolutiva, aba Evolução, aba Mega Evolução (Megas da linha + pedra; marcadas à parte, fora do
total), aba Onde encontrar (acordeão por jogo, 1 linha por local com faixa de nível + melhor chance),
botão **Marcados** (mostra só os capturados), **modo shiny** (botão ao lado da busca — troca todos os sprites; nele o check
marca os shinies e fica dourado), formas regionais (Alola/Galar/Hisui/Paldea) como ramos extras
na árvore de evolução (com o método na seta e a região no card), 4 contadores no topo
(capturados · Megas · shinies · regionais), deep-links
(`?gen=&game=&type=&trait=&caught=&loc=&q=&sel=&tab=`).

**Fase 4 (parcial):** app instalável (PWA) com service worker — HTML/CSS/JS/JSON de dados ficam
disponíveis offline desde a primeira visita; os sprites/artes ficam disponíveis offline conforme
o usuário visita cada Pokémon (baixar tudo de uma vez passaria de 300 MB). Aviso de nova versão
disponível quando o app é atualizado. Exportar/importar progresso e dark mode já feitos.

**Próximo:** Fase 3 (builds/itens).

Dados: [PokéAPI](https://pokeapi.co). Símbolos de tipo (estilo Scarlet/Violet): [partywhale/pokemon-type-icons](https://github.com/partywhale/pokemon-type-icons) (MIT), em `assets/types/` — círculo de fundo removido e viewBox reenquadrado no glifo. Ícone de Mega Evolução (`assets/mega-dna.png`). Progresso salvo apenas no navegador do usuário.
