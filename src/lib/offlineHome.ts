// Things kept in the offline store each time they load, so they still show with
// no internet: the home page's folder cards, and my saved items (for "Add
// from saved" offline). Same key prefix as the offline lists, so logout
// clears them too.

import { isFolderStatus } from "@/lib/constants";
import { browserStorage } from "@/lib/offlineLists";
import type { FolderScope, FolderSummaryDTO, SavedItemDTO } from "@/types";

const key = (scope: FolderScope) => `listy:offline:#home-${scope}`;
const SAVED_ITEMS_KEY = "listy:offline:#saved-items";

export interface CachedFolders {
  folders: FolderSummaryDTO[];
  savedAt: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const isSummary = (v: unknown): v is FolderSummaryDTO =>
  isRecord(v) &&
  typeof v.id === "string" &&
  typeof v.name === "string" &&
  isFolderStatus(v.status) &&
  typeof v.itemCount === "number" &&
  typeof v.doneCount === "number" &&
  typeof v.canCheck === "boolean" &&
  typeof v.canEdit === "boolean" &&
  typeof v.canManage === "boolean";

export function saveCachedFolders(scope: FolderScope, folders: FolderSummaryDTO[], now = new Date(), storage = browserStorage()): void {
  const data: CachedFolders = { folders, savedAt: now.toISOString() };
  // A full storage quota throws; the home page just won't show offline then.
  try {
    storage?.setItem(key(scope), JSON.stringify(data));
  } catch {}
}

/** The folders last seen online for `scope`, or null (never loaded, or malformed). */
export function getCachedFolders(scope: FolderScope, storage = browserStorage()): CachedFolders | null {
  try {
    const data: unknown = JSON.parse(storage?.getItem(key(scope)) ?? "null");
    if (!isRecord(data) || typeof data.savedAt !== "string" || !Array.isArray(data.folders) || !data.folders.every(isSummary)) {
      return null;
    }
    return { folders: data.folders, savedAt: data.savedAt };
  } catch {
    return null;
  }
}

const isSavedItem = (v: unknown): v is SavedItemDTO =>
  isRecord(v) &&
  typeof v.id === "string" &&
  typeof v.name === "string" &&
  (v.category === null || typeof v.category === "string") &&
  (v.price === null || typeof v.price === "number");

/** All my saved items (the unfiltered list, newest first). */
export function saveCachedSavedItems(items: SavedItemDTO[], storage = browserStorage()): void {
  try {
    storage?.setItem(SAVED_ITEMS_KEY, JSON.stringify(items));
  } catch {}
}

/** My saved items whose name contains `query` (any case), like the server's search; null if never loaded. */
export function getCachedSavedItems(query: string, storage = browserStorage()): SavedItemDTO[] | null {
  try {
    const data: unknown = JSON.parse(storage?.getItem(SAVED_ITEMS_KEY) ?? "null");
    if (!Array.isArray(data)) return null;
    const q = query.trim().toLowerCase();
    return data.filter(isSavedItem).filter((i) => i.name.toLowerCase().includes(q));
  } catch {
    return null;
  }
}
