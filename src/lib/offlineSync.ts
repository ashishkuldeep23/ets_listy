// Browser-only side of offline use: puts pages (and the JS/CSS they need)
// into the service worker's cache so they open with no internet, and sends
// queued changes (new lists, folder renames / status / deletes, items, edits,
// ticks, deletes) to the server. Online pages queue their changes here too:
// the UI updates at once and the request runs in the background, so a failed
// call simply stays queued and is retried.

import { ApiError, apiFetch } from "@/lib/apiClient";
import { DEFAULT_STATUS } from "@/lib/constants";
import { dropFolderChange, getFolderChanges, type FolderChange } from "@/lib/offlineFolders";
import { LIMITS } from "@/lib/limits";
import {
  addSyncProblem,
  getOfflineList,
  listOfflineLists,
  pendingCount,
  putOfflineList,
  removeOfflineList,
  type OfflineItemFields,
  type OfflineList,
} from "@/lib/offlineLists";
import { reloadOfflineStore, whenOfflineReady } from "@/lib/offlineStore";
import type { FolderDTO, ItemDTO } from "@/types";

/** Held while syncing, by this page or by the service worker (public/sw.js): never both at once. */
const SYNC_LOCK = "listy-sync";
/** Background sync tag; must match public/sw.js. */
const SYNC_TAG = "listy-sync";

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
  // Not cache.add(): it follows redirects, and a logged-out visit would save the login page as the list.
  const page = await fetch(path, { credentials: "same-origin" });
  if (!page.ok || page.redirected) return;
  await cache.put(path, page);
  await loadPageDataOnce(cache, path);
  // One asset failing (e.g. an old chunk) shouldn't stop the rest.
  await Promise.all(assets.map((href) => cache.add(href).catch(() => {})));
}

/**
 * The cached HTML is only a shell: its inline `__NEXT_CLIENT_RESUME` script
 * fetches the list itself. Makes that same request now (URL and headers read
 * from the HTML), so the service worker keeps its answer and the page loads
 * offline straight after saving. Does nothing if the script isn't there.
 */
async function loadPageDataOnce(cache: Cache, path: string): Promise<void> {
  const html = await (await cache.match(path))?.text();
  const resume = html?.match(/__NEXT_CLIENT_RESUME=fetch\(location\.pathname\+'(\?_rsc=[^']*)',\{[^}]*headers:\{([^}]*)\}/);
  const [, query, headerList] = resume ?? [];
  if (!query || !headerList) return;
  const headers = Object.fromEntries([...headerList.matchAll(/'([^']+)':\s*'([^']*)'/g)].map((m) => [m[1] ?? "", m[2] ?? ""]));
  await fetch(path + query, { credentials: "same-origin", headers });
}

export async function uncachePage(path: string): Promise<void> {
  if (!hasCacheApi()) return;
  const cache = await caches.open(OFFLINE_CACHE);
  // The page and its data requests (see dataKey in public/sw.js; the last one is the old format).
  const keys = [path, `${path}?offline-data=full`, `${path}?offline-data=nav`, `${path}?offline-data`];
  await Promise.all(keys.map((key) => cache.delete(key)));
}

/** Drops all cached pages (on logout). */
export async function clearOfflineCache(): Promise<void> {
  if (hasCacheApi()) await caches.delete(OFFLINE_CACHE);
}

/** True if `path` is already saved in the page cache. */
export async function isPageCached(path: string): Promise<boolean> {
  if (!hasCacheApi()) return false;
  return Boolean(await (await caches.open(OFFLINE_CACHE)).match(path));
}

/** Fired on window after a list's offline changes reached the server. */
export const OFFLINE_SYNCED_EVENT = "listy:offline-synced";

export interface OfflineSyncedDetail {
  /** The list's page now. */
  path: string;
  /** Set when a list made offline was just created on the server: its old new:<id> path. */
  from?: string;
}

function notifySynced(detail: OfflineSyncedDetail): void {
  window.dispatchEvent(new CustomEvent<OfflineSyncedDetail>(OFFLINE_SYNCED_EVENT, { detail }));
}

/** No network, login expired, server busy: keep the change and try again later. */
const isTemporary = (err: unknown): boolean =>
  !(err instanceof ApiError) || err.status === 401 || err.status === 429 || err.status >= 500;

/** The server's reason for refusing a change (only called for ApiErrors). */
const reason = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong");

const send = <T>(url: string, method: string, body?: unknown) =>
  apiFetch<T>(url, {
    method,
    ...(body !== undefined && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
  });

const fieldsOf = ({ name, category, price, priceUnit, quantity, description, group }: ItemDTO): OfflineItemFields => ({
  name,
  category,
  price,
  priceUnit,
  quantity,
  description,
  group,
});

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Reads the copy at `path` fresh, changes it, saves it. Null if it is gone (removed, logged out). */
function mutate(path: string, fn: (list: OfflineList) => OfflineList): OfflineList | null {
  const list = getOfflineList(path);
  return list ? putOfflineList(fn(list)) : null;
}

const replaceItem = (items: ItemDTO[], next: ItemDTO) => items.map((i) => (i.id === next.id ? next : i));

/** "Market (2)", shortened so it still fits the name limit. */
const withNumber = (name: string, n: number) => `${name.slice(0, LIMITS.FOLDER_NAME_MAX - ` (${n})`.length)} (${n})`;

/**
 * Creates a list made offline on the server and moves its copy to the new
 * /folders/<id> path. A name that is taken by now gets a number ("Market
 * (2)"). Returns the new path, or null if it can't be created yet.
 */
async function createOnServer(list: OfflineList): Promise<string | null> {
  let folder: FolderDTO | null = null;
  for (let n = 1; !folder && n <= 5; n++) {
    try {
      folder = await send<FolderDTO>("/api/folders", "POST", {
        name: n === 1 ? list.name : withNumber(list.name, n),
        // A status picked offline goes along; the default needn't be sent.
        ...(list.status !== DEFAULT_STATUS && { status: list.status }),
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) continue;
      if (!isTemporary(err)) mutate(list.path, (l) => ({ ...l, syncError: reason(err) }));
      return null;
    }
  }
  if (!folder) {
    mutate(list.path, (l) => ({ ...l, syncError: `A list named "${list.name}" already exists` }));
    return null;
  }
  const { id, name } = folder;
  if (name !== list.name) {
    addSyncProblem(`Your offline list "${list.name}" was saved as "${name}": a list with that name already exists.`);
  }
  // Read, remove and write with no await between, so nothing added meanwhile is lost.
  const latest = getOfflineList(list.path) ?? list;
  removeOfflineList(list.path);
  const path = `/folders/${id}`;
  putOfflineList({
    ...latest,
    path,
    name,
    created: false,
    toggleBase: `/api/folders/${id}/items`,
    syncError: null,
    changes: { ...latest.changes, added: latest.changes.added.map((i) => ({ ...i, folderId: id })) },
  });
  notifySynced({ path, from: list.path });
  return path;
}

/**
 * Sends one list's offline changes in order: new items, edits, ticks,
 * deletes. A change the server refuses for good (no longer allowed, item
 * gone, name taken) is dropped and reported via addSyncProblem; a temporary
 * failure stops early and keeps the rest for next time.
 * Each step re-reads the stored copy, because the list can change on screen
 * while a request is on its way.
 */
async function syncList(start: OfflineList, loggedIn: boolean): Promise<void> {
  let path = start.path;
  if (start.created) {
    if (!loggedIn) return;
    const moved = await createOnServer(start);
    if (!moved) return;
    path = moved;
  }
  const list = getOfflineList(path);
  const base = list?.toggleBase;
  // A list I may not tick keeps its changes on this device only. Member lists need a login.
  if (!list || !base || (!loggedIn && !path.startsWith("/share/"))) return;
  const label = list.name;
  let changed = false;

  for (const { id } of list.changes.added) {
    const item = getOfflineList(path)?.changes.added.find((i) => i.id === id);
    if (!item) continue;
    const sent = fieldsOf(item);
    let created: ItemDTO;
    try {
      created = await send<ItemDTO>(base, "POST", sent);
    } catch (err) {
      if (isTemporary(err)) break;
      addSyncProblem(`Couldn't add "${item.name}" to "${label}": ${reason(err)}`);
      mutate(path, (l) => ({ ...l, changes: { ...l.changes, added: l.changes.added.filter((i) => i.id !== id) } }));
      continue;
    }
    changed = true;
    // From now on it is a server item; a tick or an edit made while it was being sent still needs sending.
    mutate(path, (l) => {
      const latest = l.changes.added.find((i) => i.id === id) ?? item;
      const ticks = { ...l.changes.ticks };
      const edits = { ...l.changes.edits };
      if (latest.done) ticks[created.id] = { done: true, notFound: latest.notFound };
      if (!sameJson(fieldsOf(latest), sent)) edits[created.id] = fieldsOf(latest);
      return {
        ...l,
        items: [...l.items, created],
        changes: { ...l.changes, ticks, edits, added: l.changes.added.filter((i) => i.id !== id) },
      };
    });
  }
  // Items not sent yet would make later steps refer to things the server doesn't have.
  if ((getOfflineList(path)?.changes.added.length ?? 0) > 0) return finish(path, changed);

  for (const id of Object.keys(getOfflineList(path)?.changes.edits ?? {})) {
    const fields = getOfflineList(path)?.changes.edits[id];
    if (!fields) continue;
    const dropEdit = (l: OfflineList) => {
      const edits = { ...l.changes.edits };
      // Edited again while this one was sent: keep the newer one for next time.
      if (sameJson(edits[id], fields)) delete edits[id];
      return { ...l, changes: { ...l.changes, edits } };
    };
    try {
      const updated = await send<ItemDTO>(`${base}/${encodeURIComponent(id)}`, "PATCH", fields);
      changed = true;
      mutate(path, (l) => dropEdit({ ...l, items: replaceItem(l.items, updated) }));
    } catch (err) {
      if (isTemporary(err)) return finish(path, changed);
      addSyncProblem(`Couldn't save your edit of "${fields.name}" in "${label}": ${reason(err)}`);
      mutate(path, dropEdit);
    }
  }

  for (const id of Object.keys(getOfflineList(path)?.changes.ticks ?? {})) {
    const tick = getOfflineList(path)?.changes.ticks[id];
    if (!tick) continue;
    const dropTick = (l: OfflineList) => {
      const ticks = { ...l.changes.ticks };
      if (sameJson(ticks[id], tick)) delete ticks[id];
      return { ...l, changes: { ...l.changes, ticks } };
    };
    try {
      const body = tick.notFound ? tick : { done: tick.done };
      const updated = await send<ItemDTO>(`${base}/${encodeURIComponent(id)}/toggle`, "POST", body);
      changed = true;
      mutate(path, (l) => dropTick({ ...l, items: replaceItem(l.items, updated) }));
    } catch (err) {
      if (isTemporary(err)) return finish(path, changed);
      const name = getOfflineList(path)?.items.find((i) => i.id === id)?.name ?? "an item";
      addSyncProblem(`Couldn't tick "${name}" in "${label}": ${reason(err)}`);
      mutate(path, dropTick);
    }
  }

  for (const id of getOfflineList(path)?.changes.deleted ?? []) {
    const name = getOfflineList(path)?.items.find((i) => i.id === id)?.name ?? "an item";
    try {
      await send(`${base}/${encodeURIComponent(id)}`, "DELETE");
      changed = true;
    } catch (err) {
      if (isTemporary(err)) return finish(path, changed);
      // 404: someone deleted it already, which is what I wanted.
      if (!(err instanceof ApiError && err.status === 404)) {
        addSyncProblem(`Couldn't delete "${name}" from "${label}": ${reason(err)}`);
      }
    }
    mutate(path, (l) => ({
      ...l,
      items: l.items.filter((i) => i.id !== id),
      changes: { ...l.changes, deleted: l.changes.deleted.filter((d) => d !== id) },
    }));
  }
  finish(path, changed);
}

/** Tells open pages to reload the list from the server, if anything reached it. */
function finish(path: string, changed: boolean): void {
  if (changed) notifySynced({ path });
}

/**
 * Sends one folder's offline rename / status change / delete. Refused for
 * good (name taken, not mine any more) → dropped and reported; deleting a
 * folder that is gone already is fine. Returns false to stop (try later).
 */
async function syncFolder(id: string, change: FolderChange): Promise<boolean> {
  const url = `/api/folders/${encodeURIComponent(id)}`;
  const path = `/folders/${id}`;
  try {
    if (change.deleted) {
      await send(url, "DELETE");
      removeOfflineList(path);
    } else {
      const updated = await send<FolderDTO>(url, "PATCH", { name: change.name, status: change.status });
      mutate(path, (l) => ({ ...l, name: updated.name, status: updated.status }));
    }
  } catch (err) {
    if (isTemporary(err)) return false;
    if (!(change.deleted && err instanceof ApiError && err.status === 404)) {
      const name = getOfflineList(path)?.name ?? change.name ?? "a list";
      addSyncProblem(`Couldn't ${change.deleted ? "delete" : "change"} "${name}": ${reason(err)}`);
    }
  }
  dropFolderChange(id, change);
  notifySynced({ path });
  return true;
}

/** Everything waiting to be sent: list changes plus folder changes. */
export function pendingChangeCount(): number {
  return listOfflineLists().reduce((n, list) => n + pendingCount(list), 0) + Object.keys(getFolderChanges()).length;
}

/** Lists with changes that can be sent now (logged out: only share-link ticks). */
function listsToSync(loggedIn: boolean): OfflineList[] {
  return listOfflineLists().filter(
    (l) =>
      pendingCount(l) > 0 &&
      (l.created ? loggedIn : l.toggleBase !== null && (loggedIn || l.path.startsWith("/share/")))
  );
}

/** True if some offline change is waiting and could be sent now. */
export const hasChangesToSync = (loggedIn: boolean) =>
  listsToSync(loggedIn).length > 0 || (loggedIn && Object.keys(getFolderChanges()).length > 0);

let running: Promise<void> | null = null;
/** A change came in during a sync that may have passed it already: how to run once more (null: no need). */
let rerunAs: boolean | null = null;

/** Fired on window to send waiting changes now; OfflineStatus knows who is logged in, so it runs the sync. */
export const SYNC_NOW_EVENT = "listy:sync-now";

/** Call right after queueing a change, so it goes out at once instead of on the next timer. */
export function requestSyncNow(): void {
  window.dispatchEvent(new Event(SYNC_NOW_EVENT));
}

/** Sends what is waiting now; during a running sync, runs once more after it so nothing waits for the timer. */
export function syncLatest(loggedIn: boolean): void {
  if (running) rerunAs = loggedIn;
  else void syncAllOffline(loggedIn);
}

/**
 * Sends the offline changes of every list on this device, one list at a
 * time. Calls made while a sync runs share it. Never throws.
 * `loggedIn` must be true only once the current user is known (see
 * claimOfflineData), so changes are never sent as someone else.
 */
export function syncAllOffline(loggedIn: boolean): Promise<void> {
  running ??= withSyncLock(async () => {
    await whenOfflineReady();
    // The service worker may have synced (and changed the data) while this page wasn't looking.
    await reloadOfflineStore();
    // Folder changes first: a deleted folder's item changes then needn't be sent.
    if (loggedIn) {
      for (const [id, change] of Object.entries(getFolderChanges())) if (!(await syncFolder(id, change))) return;
    }
    for (const list of listsToSync(loggedIn)) await syncList(list, loggedIn);
  })
    .catch((err: unknown) => console.error("Offline sync failed", err))
    // Cleared after the assignment above (an async body with nothing to do finishes at once).
    .finally(() => {
      running = null;
      if (rerunAs !== null) {
        const again = rerunAs;
        rerunAs = null;
        void syncAllOffline(again);
      }
    });
  return running;
}


/** Runs `fn` holding the sync lock (Web Locks), shared with the service worker. Without Web Locks, just runs it. */
function withSyncLock(fn: () => Promise<void>): Promise<void> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  return locks ? locks.request(SYNC_LOCK, fn) : fn();
}

/** Background Sync isn't in TypeScript's DOM types yet. */
interface SyncCapableRegistration {
  sync?: { register: (tag: string) => Promise<void> };
}

/**
 * Asks the browser to wake the service worker once the connection is back,
 * even if every Listy tab is closed by then, to send offline changes
 * (Background Sync: Chrome, Edge, Android; elsewhere this does nothing).
 */
export async function requestBackgroundSync(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = (await navigator.serviceWorker.getRegistration()) as
    | (ServiceWorkerRegistration & SyncCapableRegistration)
    | undefined;
  await registration?.sync?.register(SYNC_TAG).catch(() => {});
}

/** Message from public/sw.js: the connection is back and this page is open, so it syncs. */
export const SYNC_MESSAGE = "listy-sync";
