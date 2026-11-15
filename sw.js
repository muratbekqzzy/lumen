// Lumen: offline cache for the GitHub Pages project-root deployment.
const CACHE = "lumen-site-v3";
const FILES = ["./", "index.html", "web/app.js", "web/spss.html", "web/graph.js", "web/style.css", "web/icon.svg", "cloud/cloud.js", "manifest.webmanifest"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const key of await caches.keys())
      if ((key.startsWith("lumen-") || key.startsWith("lumen-cloud-")) && key !== CACHE)
        await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/")) return;
  e.respondWith(fetch(req).then(async res => {
    if (res.ok) {
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  }).catch(async () => await caches.match(req) || await caches.match("./") || Response.error()));
});
