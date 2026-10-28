/*
 * DocGen Mobile service worker: keeps the app on the phone so it opens and works offline.
 *   - Pages, installed app (home-screen icon): opened from the copy on the phone, with no request to the
 *     server. A new version is fetched only when asked: Settings → About → Update app (message 'update').
 *   - Pages in the browser: network first (new versions arrive when online), cached copy when offline.
 *   - Built assets (/app/assets/*, hashed names): cache first.
 *   - /api/*: always the network (license checks are never answered from a cache).
 */

const CACHE = 'docgen-mobile-v1';
const SHELL = ['/app/', '/app/manifest.webmanifest', '/app/icons/icon-192.png', '/app/icons/icon-512.png'];
/** Set once the app has been opened as an installed app (start_url carries ?source=pwa, older installs tell us). */
const INSTALLED = '/app/__installed';

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

async function markInstalled() {
  const c = await caches.open(CACHE);
  await c.put(INSTALLED, new Response('1'));
}

/** Open a page: the installed app uses the copy on the phone; the browser asks the server first. */
async function page(req, url) {
  const c = await caches.open(CACHE);
  const cached = await c.match('/app/');
  const installed = url.searchParams.get('source') === 'pwa' || !!(await c.match(INSTALLED));
  if (url.searchParams.get('source') === 'pwa') markInstalled().catch(() => {});
  if (installed && cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) await c.put('/app/', res.clone());
    return res;
  } catch (e) {
    if (cached) return cached;
    throw e;
  }
}

/** Settings → About → Update app: fetch the newest app from the server and drop old built files. */
async function update() {
  const c = await caches.open(CACHE);
  const res = await fetch('/app/', { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.clone().text();
  await c.put('/app/', res);
  await Promise.all(SHELL.slice(1).map((u) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? c.put(u, r) : null)).catch(() => null)));
  const keep = new Set([...html.matchAll(/\/app\/assets\/[^"'\s)]+/g)].map((m) => m[0]));
  for (const req of await c.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith('/app/assets/') && !keep.has(path)) await c.delete(req);
  }
}

self.addEventListener('message', (event) => {
  const type = event.data?.type;
  const reply = (msg) => event.ports?.[0]?.postMessage(msg);
  if (type === 'installed') event.waitUntil(markInstalled().then(() => reply({ ok: true })));
  if (type === 'update') event.waitUntil(update().then(() => reply({ ok: true }), (e) => reply({ ok: false, error: String(e.message || e) })));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(page(req, url));
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
