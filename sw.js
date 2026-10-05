const CACHE = "spider-tasks-pwa-v1";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./firebase-config.js", "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("spider-tasks-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const path = new URL(request.url).pathname;
  if (request.mode === "navigate" || path.endsWith("/firebase-config.js")) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) await (await caches.open(CACHE)).put(request.mode === "navigate" ? "./index.html" : request, response.clone());
        return response;
      } catch {
        return (await caches.match(request.mode === "navigate" ? "./index.html" : request)) || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await (await caches.open(CACHE)).put(request, response.clone());
      return response;
    } catch {
      return Response.error();
    }
  })());
});
