// Offline support: app shell cache-first, backend/API network-first, photos cached as seen.
const VERSION = 'v12-2026-10-08';
const SHELL = `shell-${VERSION}`;
const RUNTIME = 'runtime-v1';
const SHELL_FILES = [
  './', 'index.html', 'app.js', 'data.js', 'places.js', 'maps-list.json', 'config.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png',
  ...['football', 'andes', 'aconcagua', 'vineyard_sunset', 'vineyard_road', 'vineyard_wine', 'grapes', 'ba', 'recoleta', 'san_telmo', 'iguazu']
    .map(k => `img/${k}.jpg`),
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Our own files: network first (so updates land), fall back to cache offline.
  if (url.origin === location.origin) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
      const copy = res.clone();
      caches.open(SHELL).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
    return;
  }

  // Photos, map tiles and Leaflet: cache-first.
  if (/drive\.google\.com\/thumbnail|googleusercontent\.com\/d\/|tile\.openstreetmap\.org|cdnjs\.cloudflare\.com/.test(req.url)) {
    e.respondWith(caches.open(RUNTIME).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
  }
  // Everything else (backend, weather, currency) goes straight to the network;
  // the app keeps its own last-good copy in localStorage.
});
