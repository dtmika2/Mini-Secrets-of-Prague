/* Bursa Kvíz — service worker.
   Bump CACHE whenever any precached file changes, or installed apps will keep
   serving the old questions from the previous cache. */
const CACHE = 'bursa-v1';

const PRECACHE = [
  './',
  'index.html',
  'scoreboard.html',
  'manifest.webmanifest',
  'fonts/archivo-var-latin.woff2',
  'fonts/archivo-var-latin-ext.woff2',
  'assets/bursa-logo-ink.svg',
  'assets/icon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-512.png',
  'assets/apple-touch-icon.png',
  'sounds/correct.mp3',
  'sounds/wrong.mp3',
  'sounds/result.mp3',
  'sounds/countdown.mp3',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll is all-or-nothing, so one bad path would leave the app with no
      // cache at all — cache each file on its own and tolerate misses instead.
      //
      // cache:'reload' is essential, not cosmetic: the page's <audio> elements
      // preload with Range requests, so the HTTP cache holds 206 Partial
      // Content for the mp3s, and Cache.put rejects a 206. Forcing a fresh
      // network round-trip gets a full 200 for every entry.
      .then(cache => Promise.all(
        PRECACHE.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => {}))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Score sync must never be served from cache.
  if (url.hostname.endsWith('script.google.com') ||
      url.hostname.endsWith('script.googleusercontent.com')) return;

  // Same-origin only; leave anything else to the network.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first so a fresh deploy is picked up when online,
  // falling back to the cached shell when it isn't.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
    );
    return;
  }

  // Everything else: cache first, then network (and cache what comes back).
  // Status must be exactly 200 — a 206 from a media Range request cannot be
  // stored, and Cache.put would reject on it.
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }))
  );
});
