// Browser-only side of "Save offline": puts the list page (and the JS/CSS
// it needs) into the service worker's cache so it opens with no internet,
// and sends ticks made offline to the server once we are back online.

import { ApiError, apiFetch } from "@/lib/apiClient";
import { dropOfflineTick, getOfflineList } from "@/lib/offlineLists";

/** Must match CACHE in public/sw.js. */
const OFFLINE_CACHE = "listy-offline-v1";

// A weak signal can leave a request hanging; give up and retry later instead.
const SYNC_TIMEOUT_MS = 10_000;

const hasCacheApi = () => typeof window !== "undefined" && "caches" in window;

/**
 * Caches the page HTML plus every script, style and font this page loaded.
 * The service worker serves them when a reload fails. The assets are listed
 * here because the first visit loads them before the worker is running.
 */
export async function cachePageForOffline(path: string): Promise<void> {
  if (!hasCacheApi()) return;
  const cache = await caches.open(OFFLINE_CACHE);
  const assets = performance
    .getEntriesByType("resource")
    .map((entry) => new URL(entry.name))
    .filter((url) => url.origin === location.origin && url.pathname.startsWith("/_next/static/"))
    .map((url) => url.href);
  await cache.add(path);
  // One asset failing (e.g. an old chunk) shouldn't stop the rest.
  await Promise.all(assets.map((href) => cache.add(href).catch(() => {})));
}

export async function uncachePage(path: string): Promise<void> {
  if (hasCacheApi()) await (await caches.open(OFFLINE_CACHE)).delete(path);
}

/** Drops all cached pages (on logout). */
export async function clearOfflineCache(): Promise<void> {
  if (hasCacheApi()) await caches.delete(OFFLINE_CACHE);
}

/** True when the list saved at `path` has offline ticks waiting to be sent. */
export function hasTicksToSync(path: string): boolean {
  const list = getOfflineList(path);
  return Boolean(list?.toggleBase) && Object.keys(list?.pending ?? {}).length > 0;
}

/**
 * Sends the offline ticks of the list saved at `path`, one by one. A tick
 * the server refuses (no longer allowed, item deleted) is dropped; a network
 * failure stops early and keeps the rest for next time. Never throws.
 * Returns true if the server state may have changed (reload the list).
 */
export async function syncOfflineTicks(path: string): Promise<boolean> {
  const list = getOfflineList(path);
  if (!list?.toggleBase) return false;
  let changed = false;
  for (const [itemId, done] of Object.entries(list.pending)) {
    try {
      await apiFetch(`${list.toggleBase}/${encodeURIComponent(itemId)}/toggle`, {
        method: "POST",
        body: JSON.stringify({ done }),
        signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
      });
      changed = true;
    } catch (err) {
      if (!(err instanceof ApiError)) return changed;
    }
    dropOfflineTick(path, itemId);
  }
  return changed;
}
