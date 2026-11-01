// Changes to my own folders made offline on the home page: rename, status
// and delete, keyed by folder id, in the offline store (same prefix as the
// offline lists, so logout clears them too). offlineSync.ts sends them when
// back online; the home page shows the cards with them applied meanwhile.
// Lists made offline are changed on their own copy instead (offlineLists.ts).

import { isFolderStatus, type FolderStatus } from "@/lib/constants";
import { browserStorage, notifyChanged } from "@/lib/offlineLists";

const KEY = "listy:offline:#folders";

export interface FolderChange {
  name?: string;
  status?: FolderStatus;
  /** Deleted offline: nothing else about it matters any more. */
  deleted?: true;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const isChange = (v: unknown): v is FolderChange =>
  isRecord(v) &&
  (v.name === undefined || typeof v.name === "string") &&
  (v.status === undefined || isFolderStatus(v.status)) &&
  (v.deleted === undefined || v.deleted === true);

/** Folder id → its offline change. Malformed entries are skipped. */
export function getFolderChanges(storage = browserStorage()): Record<string, FolderChange> {
  try {
    const data: unknown = JSON.parse(storage?.getItem(KEY) ?? "{}");
    if (!isRecord(data)) return {};
    return Object.fromEntries(Object.entries(data).filter((entry): entry is [string, FolderChange] => isChange(entry[1])));
  } catch {
    return {};
  }
}

function write(changes: Record<string, FolderChange>, storage: ReturnType<typeof browserStorage>): void {
  try {
    storage?.setItem(KEY, JSON.stringify(changes));
  } catch {}
  notifyChanged();
}

/** Queues a change, merged into any earlier one for that folder (a delete replaces everything). */
export function queueFolderChange(folderId: string, change: FolderChange, storage = browserStorage()): void {
  const all = getFolderChanges(storage);
  all[folderId] = change.deleted ? { deleted: true } : { ...all[folderId], ...change };
  write(all, storage);
}

/** Forgets a folder's change once sent, unless it was changed again meanwhile. */
export function dropFolderChange(folderId: string, sent: FolderChange, storage = browserStorage()): void {
  const all = getFolderChanges(storage);
  if (JSON.stringify(all[folderId]) !== JSON.stringify(sent)) return;
  delete all[folderId];
  write(all, storage);
}

/** A folder as it should look offline (callers drop deleted ones themselves). */
export function withFolderChange<T extends { name: string; status: FolderStatus }>(folder: T, change: FolderChange | undefined): T {
  if (!change) return folder;
  return { ...folder, ...(change.name !== undefined && { name: change.name }), ...(change.status && { status: change.status }) };
}
