// Offline support for the scorebook and the stats viewer.
//
// - The app opens straight from the copy saved on the device (instant, even
//   with weak or no signal), while a fresh copy is fetched in the background.
//   The fresh copy is used the next time the app is opened.
// - Bump CACHE_VERSION on every release: devices then download the whole new
//   version at once and the app shows a "new version ready - Reload" bar.
// - Requests to other sites (the Google Apps Script) are never touched.
const CACHE_VERSION = 'lax-scorebook-v42';
const ASSETS = [
  './', './index.html', './viewer.html',
  './coach.html', './manifest.json', './logo.png',
  './css/app.css', './css/viewer.css',
  './css/coach.css',
  './js/config.js',
  './js/boot.js',
  './js/state.js',
  './js/game.js',
  './js/active-penalties.js',
  './js/stat-entry.js',
  './js/actions.js',
  './js/event-log.js',
  './js/penalties.js',
  './js/roster.js',
  './js/sync.js',
  './js/settings.js',
  './js/exports.js',
  './js/history.js',
  './js/main.js',
  './js/viewer.js',
  './js/coach.js',
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

  // Every app file (pages, styles, scripts, images): saved copy first (instant,
  // works offline), refreshed from the server in the background for next time.
  // All files refresh together, so a page never runs with out-of-date scripts.
  e.respondWith(caches.open(CACHE_VERSION).then((cache) =>
    cache.match(req, { ignoreSearch: true }).then((cached) => {
      const fresh = fetch(req.url, { cache: 'no-cache' }).then((resp) => { // ask the server, not the HTTP cache
        if (resp && resp.ok) cache.put(req, resp.clone());
        return resp;
      }).catch(() => cached || (req.mode === 'navigate' ? cache.match('./index.html') : undefined));
      if (cached) { e.waitUntil(fresh.catch(() => {})); return cached; }
      return fresh;
    })
  ));
});
