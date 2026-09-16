// Service worker do Checkdex — cache do app shell + cache progressivo dos sprites.
//
// Estratégia:
//  - Shell (HTML/CSS/JS/JSON de dados + ícones pequenos usados em toda tela): pré-cacheado
//    no install, servido com stale-while-revalidate (rápido offline, atualiza em segundo plano).
//  - Imagens grandes (sprites/mega/regional/altforms/items): cache-first, entram no cache
//    conforme o usuário visita cada Pokémon — não são baixadas de uma vez (ficariam ~300 MB).
//  - Fontes do Google Fonts: stale-while-revalidate num cache à parte.
//
// Bump SHELL_VERSION sempre que a LISTA de arquivos do shell mudar (arquivo novo/removido).
// Não precisa bumpar por causa de edição de conteúdo — o stale-while-revalidate já atualiza isso.
const SHELL_VERSION = "v1";
const SHELL_CACHE = `checkdex-shell-${SHELL_VERSION}`;
const IMAGE_CACHE = "checkdex-images";
const FONT_CACHE = "checkdex-fonts";
const CURRENT_CACHES = new Set([SHELL_CACHE, IMAGE_CACHE, FONT_CACHE]);

const SHELL_URLS = [
  "./",
  "./index.html",
  "./manifest.json",

  "./src/main.js",
  "./src/data.js",
  "./src/state.js",
  "./src/search.js",
  "./src/teams.js",
  "./src/favorites.js",
  "./src/ui/dom.js",
  "./src/ui/pokemonCard.js",
  "./src/ui/locationPicker.js",
  "./src/ui/typePicker.js",
  "./src/ui/traitPicker.js",
  "./src/ui/teamBuilder.js",
  "./src/ui/backupMenu.js",
  "./src/ui/encounterText.js",
  "./src/ui/evoText.js",
  "./src/ui/regionalText.js",
  "./src/ui/tabMega.js",
  "./src/ui/tabEncounters.js",
  "./src/ui/tabBuilds.js",
  "./src/ui/tabEvolution.js",
  "./src/ui/tabStats.js",
  "./src/ui/typechart.js",
  "./src/ui/types.js",
  "./src/ui/ball.js",
  "./src/ui/sprite.js",

  "./src/styles/tokens.css",
  "./src/styles/layout.css",
  "./src/styles/components.css",
  "./src/styles/theme-kanto.css",
  "./src/styles/teamBuilder.css",

  "./data/pokedex.json",
  "./data/evolution-chains.json",
  "./data/encounters.json",
  "./data/megas.json",
  "./data/regionals.json",
  "./data/altforms.json",
  "./data/evo-items.json",
  "./data/games.json",
  "./data/meta.json",
  "./data/moves.json",
  "./data/movesets.json",
  "./data/movesets-forms.json",
  "./data/abilities.json",
  "./data/sets.json",
  "./data/items.json",
  "./data/metavgc.json",

  "./assets/favicon.ico",
  "./assets/favicon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/geodude.png",
  "./assets/icons/lapras.png",
  "./assets/icons/lunatone.png",
  "./assets/icons/magikarp.png",
  "./assets/icons/pokedex-mark.png",
  "./assets/icons/solrock.png",
  "./assets/mega-dna.png",
  "./assets/shiny.png",
  "./assets/pokerus.png",
  "./assets/snorlax.png",

  "./assets/balls/ultra-ball.png",
  "./assets/balls/master-ball.png",
  "./assets/balls/cherish-ball.png",
  "./assets/balls/luxury-ball.png",

  "./assets/types/bug.svg",
  "./assets/types/dark.svg",
  "./assets/types/dragon.svg",
  "./assets/types/electric.svg",
  "./assets/types/fairy.svg",
  "./assets/types/fighting.svg",
  "./assets/types/fire.svg",
  "./assets/types/flying.svg",
  "./assets/types/ghost.svg",
  "./assets/types/grass.svg",
  "./assets/types/ground.svg",
  "./assets/types/ice.svg",
  "./assets/types/normal.svg",
  "./assets/types/poison.svg",
  "./assets/types/psychic.svg",
  "./assets/types/rock.svg",
  "./assets/types/steel.svg",
  "./assets/types/water.svg",
];

// pastas com sprites/artes que só entram no cache quando o usuário realmente as visita
// (evita baixar ~300 MB de uma vez — ver escolha do usuário no chat que gerou este arquivo)
const LAZY_IMAGE_PREFIXES = [
  "/assets/sprites/",
  "/assets/mega/",
  "/assets/regional/",
  "/assets/altforms/",
  "/assets/items/",
];

self.addEventListener("install", (event) => {
  // não chama skipWaiting aqui de propósito: o SW novo fica "waiting" até o usuário
  // confirmar a atualização (aviso mostrado pela página) — evita trocar o app debaixo
  // do usuário no meio de uma sessão.
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => !CURRENT_CACHES.has(name)).map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // navegação (inclusive deep-links com query, ex. "/?gen=1&sel=25") sempre serve o mesmo
  // index.html — o servidor já faz isso online; offline, cacheamos só a versão sem query
  // pra não acumular uma cópia idêntica no cache pra cada combinação de filtro visitada.
  if (request.mode === "navigate") {
    event.respondWith(staleWhileRevalidate(event, "./index.html", SHELL_CACHE));
    return;
  }

  const url = new URL(request.url);

  if (url.origin === self.location.origin && LAZY_IMAGE_PREFIXES.some((p) => url.pathname.includes(p))) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event, request, SHELL_CACHE));
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(event, request, FONT_CACHE));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

// serve do cache na hora (se existir) e atualiza em segundo plano; sem cache, espera a rede.
async function staleWhileRevalidate(event, requestOrUrl, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(requestOrUrl);
  const network = fetch(requestOrUrl)
    .then((response) => {
      if (response.ok) cache.put(requestOrUrl, response.clone());
      return response;
    })
    .catch(() => null);

  event.waitUntil(network);
  if (cached) return cached;
  const fresh = await network;
  return fresh || Response.error();
}
