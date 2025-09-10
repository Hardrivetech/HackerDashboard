// Minimal service worker for offline shell caching
const CACHE = "hacker-dashboard-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/public/manifest.webmanifest",
  // Vue CDN and module are network; we don't cache them here to avoid CORS issues
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    caches
      .match(req)
      .then(
        (cached) =>
          cached || fetch(req).catch(() => caches.match("/index.html"))
      )
  );
});
