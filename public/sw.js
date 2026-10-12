// Listy service worker: lets lists saved with "Save offline" open with no
// internet. Plain JS because the browser loads it as-is from /sw.js.
//
// - Pages: network first. If the network fails, serve the copy that "Save
//   offline" put in the cache. A page already in the cache is refreshed on
//   every successful visit, so it keeps pointing at current JS files.
// - The page's data requests (Next.js "RSC" fetches of the same path):
//   network first, and for a saved page the last answer of each kind is kept
//   for offline. The page HTML is only a shell; its own inline script
//   (__NEXT_CLIENT_RESUME) loads the list with a "/_full" segment prefetch,
//   so that answer is kept as "full". A navigation to the page is kept as
//   "nav". Other prefetches are partial: never stored, and offline they just
//   fail. Each request only ever gets an answer of its own kind: Next.js
//   can't read a different one and shows "This page couldn't load".
// - /_next/static/*: file names change with content, so cache first.
// - Everything else (API calls, other sites) is left alone. List data
//   offline comes from localStorage, not from here.
// - Cache Storage can fail (private mode, full disk, a broken profile). Then
//   the worker just passes requests through: it must never break the site.

const CACHE = "listy-offline-v1"; // must match OFFLINE_CACHE in src/lib/offlineSync.ts

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .catch(() => {})
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

/** The cached response for `key`, or null (also when Cache Storage fails). */
async function fromCache(key) {
  try {
    return (await (await caches.open(CACHE)).match(key)) ?? null;
  } catch {
    return null;
  }
}

/** Stores a response; a failure only means no offline copy. */
async function toCache(key, response) {
  try {
    await (await caches.open(CACHE)).put(key, response);
  } catch {}
}

async function page(request, path) {
  try {
    const response = await fetch(request);
    // Only refresh pages someone chose to save; never cache redirects (e.g. to /login).
    if (response.ok && !response.redirected && (await fromCache(path))) {
      await toCache(path, response.clone());
    }
    return response;
  } catch {
    return (await fromCache(path)) ?? Response.error();
  }
}

/** "full" (the page loading itself), "nav" (a navigation), or null for a partial prefetch. */
function dataKind(request) {
  const segment = request.headers.get("Next-Router-Segment-Prefetch");
  if (segment === "/_full") return "full";
  if (segment || request.headers.has("Next-Router-Prefetch")) return null;
  return "nav";
}

/** Cache key for a saved page's data (its RSC payload). Also used in src/lib/offlineSync.ts. */
const dataKey = (path, kind) => `${path}?offline-data=${kind}`;

async function pageData(request, path) {
  const kind = dataKind(request);
  try {
    const response = await fetch(request);
    if (kind && response.ok && (await fromCache(path))) {
      await toCache(dataKey(path, kind), response.clone());
    }
    return response;
  } catch {
    // A failed prefetch is harmless (Next.js just skips it); a wrong answer crashes the page.
    return (kind && (await fromCache(dataKey(path, kind)))) || Response.error();
  }
}

async function staticAsset(request) {
  const cached = await fromCache(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await toCache(request, response.clone());
  return response;
}
