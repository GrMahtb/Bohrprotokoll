const CACHE  = 'htb-bohrz-v5';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.json'];

self.addEventListener('install',   e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate',  e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.map(k => k !== CACHE && caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch',     e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      const c = resp.clone();
      caches.open(CACHE).then(cache => cache.put(e.request, c)).catch(() => {});
      return resp;
    }).catch(() => r))
  );
});
