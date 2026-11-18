// Offline support for the scorebook and the stats viewer.
//
// - The app opens straight from the copy saved on the device (instant, even
//   with weak or no signal), while a fresh copy is fetched in the background.
//   The fresh copy is used the next time the app is opened.
// - Bump CACHE_VERSION on every release: devices then download the whole new
//   version at once and the app shows a "new version ready - Reload" bar.
// - Requests to other sites (the Google Apps Script) are never touched.
const CACHE_VERSION = 'lax-scorebook-v30';
const ASSETS = [
  './', './index.html', './viewer.html', './manifest.json', './logo.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  // cache: 'reload' = get each file from the server, never from the browser's
  // short-term HTTP cache (GitHub Pages lets browsers reuse files for ~10 min,
  // which could otherwise install the previous version's page).
  e.waitUntil(caches.open(CACHE_VERSION).then((cache) =>
    cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                                  // saves etc. go straight to the network
  if (new URL(req.url).origin !== self.location.origin) return;      // Apps Script & other sites: hands off

  const isPage = req.mode === 'navigate' || /\/(index|viewer)\.html$/.test(new URL(req.url).pathname) ||
                 new URL(req.url).pathname.endsWith('/');
  if (isPage) {
    // Saved copy first (instant), refresh it in the background for next time.
    e.respondWith(caches.open(CACHE_VERSION).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((cached) => {
        const fresh = fetch(req.url, { cache: 'no-cache' }).then((resp) => { // ask the server, not the HTTP cache
          if (resp && resp.ok) cache.put(req, resp.clone());
          return resp;
        }).catch(() => cached || cache.match('./index.html'));
        if (cached) { e.waitUntil(fresh.catch(() => {})); return cached; }
        return fresh;
      })
    ));
    return;
  }
  // Logo, icons, manifest: saved copy, else network.
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
