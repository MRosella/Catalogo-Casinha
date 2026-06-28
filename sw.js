/* Service Worker — cache do app para funcionar offline.
   Estratégia: network-first (online sempre pega a versão nova; cache é
   só fallback offline). Mantém o PWA sempre na última versão publicada. */
const CACHE = 'catalogo-casinha-v7';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './js/core.js',
  './js/idb.js',
  './js/photos.js',
  './js/suggest.js',
  './js/search.js',
  './js/boxes.js',
  './js/items.js',
  './js/history.js',
  './js/scan.js',
  './js/locate.js',
  './js/qr.js',
  './js/sync.js',
  './js/ui.js',
  './js/render.js',
  './js/main.js',
  './lib/qrcode.min.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
