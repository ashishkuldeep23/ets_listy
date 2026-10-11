// Lists saved with "Save offline": a copy of the list in localStorage, keyed
// by the page it was saved from (/folders/<id> or /share/<token>), so that
// page can still show it with no internet. Ticks made offline are kept as
// `pending` and sent to the server when back online (see offlineSync.ts).
// Storage is passed in so tests can use a fake; the browser's localStorage
// is the default.

import { isFolderStatus, type FolderStatus } from "@/lib/constants";
import type { ItemDTO } from "@/types";

const PREFIX = "listy:offline:";

export interface OfflineList {
  /** Page it was saved from: /folders/<id> or /share/<token>. */
  path: string;
  name: string;
  status: FolderStatus;
  /** Items as the server last sent them. */
  items: ItemDTO[];
  /** Tick URL base (…/items) for syncing offline ticks, or null when ticking isn't allowed. */
  toggleBase: string | null;
  savedAt: string;
  /** Ticks made while offline: item id → done. */
  pending: Record<string, boolean>;
}

export type OfflineSnapshot = Pick<OfflineList, "path" | "name" | "status" | "items" | "toggleBase">;

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/** localStorage, or null on the server / when the browser blocks it. */
function browserStorage(): KeyValueStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const isItem = (v: unknown): v is ItemDTO =>
  isRecord(v) && typeof v.id === "string" && typeof v.name === "string" && typeof v.done === "boolean";

/** Reads a stored copy; anything malformed (old format, edited by hand) is treated as missing. */
export function parseOfflineList(raw: string | null): OfflineList | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !isRecord(data) ||
    typeof data.path !== "string" ||
    typeof data.name !== "string" ||
    !isFolderStatus(data.status) ||
    !Array.isArray(data.items) ||
    !data.items.every(isItem) ||
    !(data.toggleBase === null || typeof data.toggleBase === "string") ||
    typeof data.savedAt !== "string" ||
    !isRecord(data.pending) ||
    !Object.values(data.pending).every((d) => typeof d === "boolean")
  ) {
    return null;
  }
  return data as unknown as OfflineList;
}

/** The items as they should look offline: server state with my offline ticks on top. */
export function itemsWithPending(list: OfflineList): ItemDTO[] {
  return list.items.map((item) => {
    const done = list.pending[item.id];
    // Someone else's name would be wrong on a tick I made, so drop it.
    return done === undefined || done === item.done ? item : { ...item, done, doneBy: null, doneAt: null };
  });
}

export function getOfflineList(path: string, storage = browserStorage()): OfflineList | null {
  return parseOfflineList(storage?.getItem(PREFIX + path) ?? null);
}

function write(list: OfflineList, storage: KeyValueStore | null): OfflineList {
  // A full storage quota throws; the copy just isn't updated then.
  try {
    storage?.setItem(PREFIX + list.path, JSON.stringify(list));
  } catch {}
  return list;
}

/**
 * Saves (or refreshes) a copy from fresh server data. Offline ticks that
 * still differ from the server are kept, so a list I can't tick on keeps
 * my own checklist; synced or now-matching ones are dropped.
 */
export function saveOfflineList(snapshot: OfflineSnapshot, now = new Date(), storage = browserStorage()): OfflineList {
  const previous = getOfflineList(snapshot.path, storage);
  const pending: Record<string, boolean> = {};
  for (const item of snapshot.items) {
    const done = previous?.pending[item.id];
    if (done !== undefined && done !== item.done) pending[item.id] = done;
  }
  return write({ ...snapshot, savedAt: now.toISOString(), pending }, storage);
}

/** Ticks / unticks an item in the offline copy. Returns the updated copy (null if none). */
export function setOfflineTick(path: string, itemId: string, done: boolean, storage = browserStorage()): OfflineList | null {
  const list = getOfflineList(path, storage);
  const item = list?.items.find((i) => i.id === itemId);
  if (!list || !item) return list;
  const pending = { ...list.pending };
  // Back to what the server has: nothing to send any more.
  if (done === item.done) delete pending[itemId];
  else pending[itemId] = done;
  return write({ ...list, pending }, storage);
}

/** Forgets one offline tick (after it was sent, or the server refused it for good). */
export function dropOfflineTick(path: string, itemId: string, storage = browserStorage()): void {
  const list = getOfflineList(path, storage);
  if (!list || !(itemId in list.pending)) return;
  const pending = { ...list.pending };
  delete pending[itemId];
  write({ ...list, pending }, storage);
}

export function removeOfflineList(path: string, storage = browserStorage()): void {
  storage?.removeItem(PREFIX + path);
}

/** Removes every offline copy (on logout, so the next person on this device can't read them). */
export function clearOfflineLists(storage = browserStorage()): void {
  if (!storage) return;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
}
