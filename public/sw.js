/*
 * Offline support for the Home Screen app.
 *
 *  - Pages: network first (fresh when online), falling back to the last copy
 *    when there is no signal, so the app still opens on a plane.
 *  - Build files under /_next/static: cache first; their names change with
 *    every deploy, so a cached file is never stale.
 *  - Icons, fonts, manifest: served from cache, refreshed in the background.
 *
 * Data never lives here: the app keeps its own saved copy and offline queue
 * (lib/offline.ts), and Supabase requests are cross-origin, so untouched.
 */
const VERSION = "v1";
const PAGES = `ft-pages-${VERSION}`;
const ASSETS = `ft-assets-${VERSION}`;
const WARM = ["/", "/activity", "/login"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGES).then((cache) =>
      Promise.all(
        WARM.map((path) =>
          fetch(path, { credentials: "same-origin" })
            .then((response) => (response.ok && !response.redirected ? cache.put(path, response) : undefined))
            .catch(() => undefined),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ft-") && !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      Promise.race([fetch(request), timeout(6000)])
        .then((response) => {
          if (response.ok && !response.redirected) {
            const copy = response.clone();
            caches.open(PAGES).then((cache) => cache.put(url.pathname, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(url.pathname)) || (await caches.match("/")) || Response.error()),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (/\.(png|ico|svg|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
  }
});
