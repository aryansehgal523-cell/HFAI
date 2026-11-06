/*
 * HireFlow AI service worker.
 * Static assets: cache first (they are content hashed).
 * Public pages: network first, falling back to the last cached copy.
 * Signed in pages and the API are never cached, so personal data never
 * lands in the cache. With no network and no copy, the offline page shows.
 */
const VERSION = "hf-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icon.svg", "/icons/icon-192.png", "/manifest.webmanifest"];
const PUBLIC_PAGES = [/^\/$/, /^\/jobs(\/[^/]+)?$/, /^\/pricing$/, /^\/about$/, /^\/privacy$/, /^\/terms$/, /^\/refund$/, /^\/contact$/];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Hashed build assets and icons: cache first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(STATIC).then((c) => c.put(req, copy));
        return res;
      })),
    );
    return;
  }

  // Page navigations
  if (req.mode === "navigate") {
    const cacheable = PUBLIC_PAGES.some((re) => re.test(url.pathname));
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (cacheable && res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (cacheable && (await caches.match(req))) || (await caches.match(OFFLINE_URL))),
    );
  }
});
