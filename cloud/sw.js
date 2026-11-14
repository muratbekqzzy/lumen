// Static shell only: API responses belong to IndexedDB/local storage, never the cache.
const NAME = "lumen-cloud-v1";
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(NAME).then(c => c.addAll(["./","index.html","app.js","graph.js","style.css","cloud.js","icon.svg","manifest.webmanifest"]))); });
self.addEventListener("activate", e => { e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith("lumen-cloud-") && k !== NAME) await caches.delete(k); await self.clients.claim(); })()); });
self.addEventListener("fetch", e => { const u = new URL(e.request.url); if (e.request.method !== "GET" || u.origin !== self.location.origin || u.pathname.includes("/api/")) return; e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy=r.clone(); caches.open(NAME).then(c=>c.put(e.request,copy)).catch(()=>{}); } return r; }).catch(async () => (await caches.match(e.request)) || (await caches.match("./")) || Response.error())); });
