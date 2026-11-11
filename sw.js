/* Punta Exacta · Catéteres Neo — service worker
   Cambie VERSION cada vez que suba un index.html nuevo para forzar la actualización. */
const VERSION = 'punta-exacta-v1.0.0';
const CORE = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(CORE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1) Página: red primero (máx. 3 s) para recibir actualizaciones; si no hay red, la copia guardada.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await Promise.race([fetch(req), timeout(3000)]);
        if (fresh && fresh.ok) {
          const cache = await caches.open(VERSION);
          cache.put('./index.html', fresh.clone());
        }
        return fresh;
      } catch (e) {
        const cache = await caches.open(VERSION);
        return (await cache.match('./index.html')) || (await cache.match('./')) ||
          new Response('<h1>Sin conexión</h1><p>Abra la app una vez con internet para guardarla.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // 2) Tipografías de Google: usar la copia y refrescarla en segundo plano.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; })
        .catch(() => hit);
      return hit || net;
    })());
    return;
  }

  // 3) Resto del mismo origen: caché primero.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
  }
});
