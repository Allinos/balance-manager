/*
 * DocGen Mobile service worker: keeps the app on the phone so it opens and works offline.
 *   - Pages: network first (new versions arrive when online), cached copy when offline.
 *   - Built assets (/app/assets/*, hashed names): cache first.
 *   - /api/*: always the network (license checks are never answered from a cache).
 */

const CACHE = 'docgen-mobile-v1';
const SHELL = ['/app/', '/app/manifest.webmanifest', '/app/icons/icon-192.png', '/app/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/app/', copy));
          return res;
        })
        .catch(() => caches.match('/app/')),
    );
    return;
  }

  if (url.pathname.startsWith('/app/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
