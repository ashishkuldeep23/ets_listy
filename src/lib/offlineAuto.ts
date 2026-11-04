// "Keep all lists offline": with it on (the default), every list I own or
// that is shared with me gets an offline copy without pressing "Save
// offline". Browser only. refreshAllOffline() runs from OfflineStatus at
// most every few minutes: it reloads the home cards, and fetches the items
// of each list whose copy is missing, looks out of date (its counts differ)
// or is older than an hour. Copies it made are marked `auto`, so turning it
// off (or losing a list) removes them again; lists saved by hand stay.

import { ApiError, apiFetch } from "@/lib/apiClient";
import { saveCachedFolders, saveCachedSavedItems } from "@/lib/offlineHome";
import {
  browserStorage,
  getOfflineList,
  listOfflineLists,
  notifyChanged,
  pendingCount,
  removeOfflineList,
  saveOfflineList,
} from "@/lib/offlineLists";
import { whenOfflineReady } from "@/lib/offlineStore";
import type { FolderListResponse, FolderSummaryDTO, ItemListResponse, SavedItemListResponse } from "@/types";

const SETTING_KEY = "listy:offline:#auto";
const LAST_RUN_KEY = "listy:offline:#auto-at";
const RUN_EVERY_MS = 5 * 60_000;
const MAX_AGE_MS = 60 * 60_000;

export function isAutoSaveOn(storage = browserStorage()): boolean {
  return storage?.getItem(SETTING_KEY) !== "off";
}

/** Turning it off removes the copies it made (except ones with changes not sent yet). */
export function setAutoSave(on: boolean, storage = browserStorage()): void {
  try {
    storage?.setItem(SETTING_KEY, on ? "on" : "off");
    // Turned on: run at the next chance, not in five minutes.
    storage?.removeItem(LAST_RUN_KEY);
  } catch {}
  if (!on) {
    for (const list of listOfflineLists(storage)) {
      if (list.auto && pendingCount(list) === 0) removeOfflineList(list.path, storage);
    }
  }
  notifyChanged();
}

/** The copy is missing, older than an hour, or its counts don't match the card. */
function isStale(folder: FolderSummaryDTO, now: number): boolean {
  const copy = getOfflineList(`/folders/${folder.id}`);
  if (!copy) return true;
  const done = copy.items.filter((i) => i.done).length;
  return copy.items.length !== folder.itemCount || done !== folder.doneCount || now - Date.parse(copy.savedAt) > MAX_AGE_MS;
}

let running: Promise<void> | null = null;

/**
 * Brings every list's offline copy up to date (see the top of this file).
 * Never throws; a network failure just ends this run. Call only while
 * logged in, after claimOfflineData().
 */
export async function refreshAllOffline(now = new Date()): Promise<void> {
  // The setting and the last run time are stored too.
  await whenOfflineReady();
  const storage = browserStorage();
  if (!isAutoSaveOn(storage)) {
    // With the setting off, a copy only exists to carry queued changes: done once they are sent.
    for (const list of listOfflineLists(storage)) {
      if (list.auto && pendingCount(list) === 0) removeOfflineList(list.path, storage);
    }
    return;
  }
  if (running) return running;
  const last = Number(storage?.getItem(LAST_RUN_KEY) ?? 0);
  if (now.getTime() - last < RUN_EVERY_MS) return Promise.resolve();
  try {
    storage?.setItem(LAST_RUN_KEY, String(now.getTime()));
  } catch {}

  running = (async () => {
    const [mine, shared, saved] = await Promise.all([
      apiFetch<FolderListResponse>("/api/folders?scope=mine"),
      apiFetch<FolderListResponse>("/api/folders?scope=shared"),
      // For "Add from saved" offline.
      apiFetch<SavedItemListResponse>("/api/saved-items"),
    ]);
    saveCachedFolders("mine", mine.folders, now);
    saveCachedFolders("shared", shared.folders, now);
    saveCachedSavedItems(saved.savedItems);
    const folders = [...mine.folders, ...shared.folders];

    for (const folder of folders) {
      if (!isAutoSaveOn() || !isStale(folder, now.getTime())) continue;
      const base = `/api/folders/${folder.id}/items`;
      let list: ItemListResponse;
      try {
        list = await apiFetch<ItemListResponse>(base);
      } catch (err) {
        // Gone or no access any more: the next card reload drops it. Anything else: stop for now.
        if (err instanceof ApiError && err.status === 404) continue;
        throw err;
      }
      const path = `/folders/${folder.id}`;
      // A change queued while this was loading could be lost against older data; the next run gets it.
      const copy = getOfflineList(path);
      if (copy && pendingCount(copy) > 0) continue;
      saveOfflineList({
        path,
        name: folder.name,
        status: folder.status,
        items: list.items,
        toggleBase: folder.canCheck ? base : null,
        canEdit: folder.canEdit,
        // A copy saved by hand stays one.
        ...(!getOfflineList(path) && { auto: true }),
      });
    }

    // Lists I no longer have: drop the copies this made (unless changes still wait to be sent).
    const ids = new Set(folders.map((f) => f.id));
    for (const copy of listOfflineLists()) {
      const id = copy.path.startsWith("/folders/") ? copy.path.slice("/folders/".length) : null;
      if (id && copy.auto && !ids.has(id) && pendingCount(copy) === 0) removeOfflineList(copy.path);
    }
  })()
    .catch((err: unknown) => {
      if (err instanceof ApiError) console.error("Keeping lists offline failed", err.status);
    })
    .finally(() => {
      running = null;
    });
  return running;
}
