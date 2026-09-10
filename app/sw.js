// Carvoeiro Nav service worker.
// Bump VERSION whenever the app shell, routes, or manifest change.

const VERSION = 'v4';
const SHELL_CACHE = `carvoeiro-nav-shell-${VERSION}`;
const DATA_CACHE = `carvoeiro-nav-data-${VERSION}`;

const BASE = self.location.pathname.replace(/sw\.js$/, '');
const SHELL_ASSETS = [
  BASE || '/',
  `${BASE}manifest.webmanifest`,
  `${BASE}icons/icon-192.png`,
  `${BASE}icons/icon-512.png`,
];

const CACHEABLE_API_PREFIXES = ['/api/places', '/api/weather', '/api/search', '/api/events', '/api/home', '/api/flights'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        try {
          client.postMessage({ type: 'RELOAD_ONCE', reason: 'sw-upgrade', version: VERSION });
        } catch {
          /* ignore */
        }
      }
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isCacheableApi(url) {
  return CACHEABLE_API_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (!isCacheableApi(url)) return;
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  const isDocument =
    request.destination === 'document' ||
    url.pathname === BASE.replace(/\/$/, '') ||
    url.pathname === BASE ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html');
  if (isDocument) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    }),
  );
});
