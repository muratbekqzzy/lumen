// Cache the application shell for offline use; account data stays in its own store.
const CACHE = "lumen-site-v15";
const FILES = ["./", "index.html", "web/app.js", "web/import.js", "web/pdf.js", "web/pdfjs/pdf.mjs", "web/pdfjs/pdf.worker.mjs", "web/markdown.js", "web/aura.js", "web/force.js", "web/graph.js", "web/galaxy.js", "web/universe.js", "web/style.css", "web/icon.svg", "cloud/hosting.js", "cloud/cloud.js", "cloud/migrate.js", "manifest.webmanifest", "web/fonts/inter-cyrillic-ext.woff2", "web/fonts/inter-cyrillic.woff2", "web/fonts/inter-greek-ext.woff2", "web/fonts/inter-greek.woff2", "web/fonts/inter-latin-ext.woff2", "web/fonts/inter-latin.woff2", "web/fonts/inter-tight-cyrillic-ext.woff2", "web/fonts/inter-tight-cyrillic.woff2", "web/fonts/inter-tight-greek-ext.woff2", "web/fonts/inter-tight-greek.woff2", "web/fonts/inter-tight-latin-ext.woff2", "web/fonts/inter-tight-latin.woff2", "web/fonts/inter-tight-vietnamese.woff2", "web/fonts/inter-vietnamese.woff2", "web/fonts/jetbrains-mono-cyrillic-ext.woff2", "web/fonts/jetbrains-mono-cyrillic.woff2", "web/fonts/jetbrains-mono-greek.woff2", "web/fonts/jetbrains-mono-latin-ext.woff2", "web/fonts/jetbrains-mono-latin.woff2", "web/fonts/jetbrains-mono-vietnamese.woff2", "web/fonts/fonts.css"];
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
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/") || /\/(signin-with-chatgpt|signout-with-chatgpt|callback)(\/|$)/.test(url.pathname) || url.searchParams.has("lumen-transfer")) return;
  e.respondWith(fetch(req).then(async res => {
    if (res.ok && !res.redirected) {
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  }).catch(async () => await caches.match(req) || (req.mode === "navigate" ? await caches.match("./") : null) || Response.error()));
});
