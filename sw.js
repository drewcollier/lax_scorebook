// Bump CACHE_VERSION on every deploy so devices pick up the new app.
const CACHE_VERSION = 'lax-scorebook-v6';
const ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const isAppShell =
    req.mode === 'navigate' ||
    req.url.endsWith('/index.html') ||
    req.url.endsWith('/');

  if (isAppShell) {
    // Network-first for the app itself: get updates when online, fall back to cache offline.
    e.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return resp;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
  } else {
    // Cache-first for everything else.
    e.respondWith(
      caches.match(req).then((response) => response || fetch(req))
    );
  }
});
