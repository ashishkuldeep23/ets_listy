// Listy service worker: lets lists saved with "Save offline" open with no
// internet. Plain JS because the browser loads it as-is from /sw.js.
//
// - Pages: network first. If the network fails, serve the copy that "Save
//   offline" put in the cache. A page already in the cache is refreshed on
//   every successful visit, so it keeps pointing at current JS files.
// - The page's data request (Next.js "RSC" fetch of the same path, which
//   fills the page's loading placeholder): network first, and the last full
//   answer for a saved page is kept for offline. Prefetches are partial, so
//   they are never stored.
// - /_next/static/*: file names change with content, so cache first.
// - Everything else (API calls, other sites) is left alone. List data
//   offline comes from localStorage, not from here.

const CACHE = "listy-offline-v1"; // must match OFFLINE_CACHE in src/lib/offlineSync.ts

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(page(request, url.pathname));
  } else if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    event.respondWith(pageData(request, url.pathname));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staticAsset(request));
  }
});

async function page(request, path) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    // Only refresh pages someone chose to save; never cache redirects (e.g. to /login).
    if (response.ok && !response.redirected && (await cache.match(path))) {
      await cache.put(path, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(path);
    if (cached) return cached;
    throw err;
  }
}

/** Cache key for a saved page's data (its RSC payload). */
const dataKey = (path) => `${path}?offline-data`;

async function pageData(request, path) {
  const cache = await caches.open(CACHE);
  const prefetch = request.headers.has("Next-Router-Prefetch") || request.headers.has("Next-Router-Segment-Prefetch");
  try {
    const response = await fetch(request);
    if (response.ok && !prefetch && (await cache.match(path))) {
      await cache.put(dataKey(path), response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(dataKey(path));
    if (cached) return cached;
    throw err;
  }
}

async function staticAsset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
