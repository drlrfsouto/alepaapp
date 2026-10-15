/* sw.js — Service Worker: o app funciona offline depois do primeiro acesso.
 * Estratégia:
 *  - navegação (HTML): network-first com fallback para o cache;
 *  - app shell (CSS/JS/manifest/ícones): cache-first, atualizado em segundo plano;
 *  - dados (data/**.json): stale-while-revalidate — mostra o cache e busca atualização.
 */

const VERSAO = 'alepa-2026-v1.0.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/styles.css',
  './src/app.js',
  './src/util.js',
  './src/store.js',
  './src/data.js',
  './src/srs.js',
  './src/planner.js',
  './src/ai.js',
  './src/router.js',
  './src/components.js',
  './src/views/dashboard.js',
  './src/views/questoes.js',
  './src/views/resolver.js',
  './src/views/simulados.js',
  './src/views/resumos.js',
  './src/views/flashcards.js',
  './src/views/curriculo.js',
  './src/views/plano.js',
  './src/views/stats.js',
  './src/views/tutor.js',
  './src/views/config.js',
  './icons/icon.svg',
];

const DADOS = [
  './data/concurso.json',
  './data/curriculo.json',
  './data/resumos.json',
  './data/flashcards.json',
  './data/simulados.json',
  './data/questoes/index.json',
  './data/questoes/lp.json',
  './data/questoes/leg.json',
  './data/questoes/inf.json',
  './data/questoes/rl.json',
  './data/questoes/dir-adm.json',
  './data/questoes/dir-const.json',
  './data/questoes/proc-leg.json',
  './data/questoes/dir-civil.json',
  './data/questoes/dir-proc-civ.json',
  './data/questoes/complementares.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSAO);
    // adiciona em lotes para um arquivo ausente não derrubar tudo
    await Promise.allSettled([...SHELL, ...DADOS].map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const chaves = await caches.keys();
    await Promise.all(chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // chamadas a provedores de IA nunca passam pelo cache
  if (url.origin !== self.location.origin) return;

  // navegação → network-first
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresca = await fetch(req);
        const cache = await caches.open(VERSAO);
        cache.put('./index.html', fresca.clone());
        return fresca;
      } catch {
        const cache = await caches.open(VERSAO);
        return (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // dados → stale-while-revalidate
  if (url.pathname.includes('/data/')) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSAO);
      const guardada = await cache.match(req, { ignoreSearch: true });
      const rede = fetch(req).then((resp) => {
        if (resp && resp.status === 200) cache.put(req, resp.clone());
        return resp;
      }).catch(() => null);
      return guardada || (await rede) || Response.json({ erro: 'offline e sem cache' }, { status: 503 });
    })());
    return;
  }

  // demais assets → cache-first com atualização em segundo plano
  event.respondWith((async () => {
    const cache = await caches.open(VERSAO);
    const guardada = await cache.match(req);
    const rede = fetch(req).then((resp) => {
      if (resp && resp.status === 200 && resp.type === 'basic') cache.put(req, resp.clone());
      return resp;
    }).catch(() => null);
    return guardada || (await rede) || Response.error();
  })());
});

// permite atualizar o conteúdo sem recarregar a aba
self.addEventListener('message', (event) => {
  if (event.data === 'pular-espera') self.skipWaiting();
});
