// Service worker do SBOT Codifica.
// Cache-first para o app shell (HTML/CSS/JS/ícones); network-first para o
// banco de dados JSON, para sempre tentar buscar a versão mais nova quando
// há conexão, caindo para a cópia em cache quando não há.

const VERSAO = 'sbot-codifica-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/js/app.js',
  './assets/js/data.js',
  './assets/js/format.js',
  './assets/js/store.js',
  './assets/js/solicitacao.js',
  './assets/js/print.js',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(VERSAO).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  if (ev.request.method !== 'GET') return;

  const url = new URL(ev.request.url);
  if (url.origin !== self.location.origin) return;

  const ehDados = url.pathname.endsWith('/sbot_cbhpm_tuss_v1.json');

  if (ehDados) {
    ev.respondWith(
      fetch(ev.request)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(VERSAO).then((cache) => cache.put(ev.request, copia));
          return resp;
        })
        .catch(() => caches.match(ev.request))
    );
    return;
  }

  ev.respondWith(
    caches.match(ev.request).then((cached) => cached || fetch(ev.request))
  );
});
