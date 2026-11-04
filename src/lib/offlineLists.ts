// Lists kept on this device for use with no internet (stored in IndexedDB,
// see offlineStore.ts; read and written here like localStorage).
// A copy is keyed by the page it was saved from (/folders/<id> or
// /share/<token>), or by new:<id> for a list made while offline. Changes
// made offline (new lists, items added / edited / deleted, ticks and "not
// found") are kept in `changes` on top of the server's items, and sent to
// the server when back online (see offlineSync.ts).
// Storage is passed in so tests can use a fake; the browser's offline
// store is the default.

import { DEFAULT_STATUS, isFolderStatus, type FolderStatus } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";
import { browserStorage, notifyChanged, type KeyValueStore } from "@/lib/offlineStore";

// Used by the other offline modules via this one.
export { browserStorage, notifyChanged, OFFLINE_CHANGED_EVENT, offlineVersion, type KeyValueStore } from "@/lib/offlineStore";
import type { ItemDTO, Result } from "@/types";

const PREFIX = "listy:offline:";
/** Keys under PREFIX that aren't lists. Paths never start with "#". */
const PROBLEMS_KEY = `${PREFIX}#problems`;
const OWNER_KEY = `${PREFIX}#owner`;
const NEW_LIST_PREFIX = "new:";
const LOCAL_ITEM_PREFIX = "local-";
const MAX_PROBLEMS = 20;

/** An item's own fields, as the item form sends them (null = empty). */
export type OfflineItemFields = Pick<
  ItemDTO,
  "name" | "category" | "price" | "priceUnit" | "quantity" | "description" | "group"
>;

export interface OfflineTick {
  done: boolean;
  notFound: boolean;
}

/** What changed offline. Server items are referred to by id; new items live in `added`. */
export interface OfflineChanges {
  /** Ticks / "not found" on server items: item id → new state. */
  ticks: Record<string, OfflineTick>;
  /** Edits of server items: item id → all of its fields. */
  edits: Record<string, OfflineItemFields>;
  /** Server items deleted offline. */
  deleted: string[];
  /** Items added offline (ids start with "local-"), already with their latest edits and ticks. */
  added: ItemDTO[];
}

export interface OfflineList {
  /** Page it was saved from (/folders/<id>, /share/<token>), or new:<id> for a list made offline. */
  path: string;
  name: string;
  status: FolderStatus;
  /** Items as the server last sent them. */
  items: ItemDTO[];
  /** Items URL (…/items) to sync changes to, or null when ticking isn't allowed (changes stay on this device). */
  toggleBase: string | null;
  /** Items may be added, edited and deleted (only ever true for logged-in members with edit rights). */
  canEdit: boolean;
  /** Made offline: the list itself isn't on the server yet. */
  created: boolean;
  /** Kept by "Keep all lists offline", not saved by hand: dropped when that is turned off or the list is gone. */
  auto: boolean;
  savedAt: string;
  changes: OfflineChanges;
  /** Why the last sync of this list failed for good, shown until a sync works. */
  syncError: string | null;
}

export type OfflineSnapshot = Pick<OfflineList, "path" | "name" | "status" | "items" | "toggleBase" | "canEdit"> & {
  /** Left out: keep what the stored copy says (false for a new one). */
  auto?: boolean;
};

/** A change the server refused while syncing, shown to the user once. */
export interface SyncProblem {
  id: string;
  message: string;
  at: string;
}

const emptyChanges = (): OfflineChanges => ({ ticks: {}, edits: {}, deleted: [], added: [] });

/** A random id for something made offline (no crypto.randomUUID: it needs https). */
function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const isLocalItemId = (id: string) => id.startsWith(LOCAL_ITEM_PREFIX);
export const isNewListPath = (path: string) => path.startsWith(NEW_LIST_PREFIX);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNullable = (v: unknown, type: "string" | "number") => v === null || typeof v === type;

const isItem = (v: unknown): v is ItemDTO =>
  isRecord(v) && typeof v.id === "string" && typeof v.name === "string" && typeof v.done === "boolean";

const isFields = (v: unknown): v is OfflineItemFields =>
  isRecord(v) &&
  typeof v.name === "string" &&
  isNullable(v.category, "string") &&
  isNullable(v.price, "number") &&
  isNullable(v.priceUnit, "string") &&
  isNullable(v.quantity, "number") &&
  isNullable(v.description, "string") &&
  isNullable(v.group, "string");

const isTick = (v: unknown): v is OfflineTick =>
  isRecord(v) && typeof v.done === "boolean" && typeof v.notFound === "boolean";

function parseChanges(v: unknown): OfflineChanges | null {
  if (
    !isRecord(v) ||
    !isRecord(v.ticks) ||
    !Object.values(v.ticks).every(isTick) ||
    !isRecord(v.edits) ||
    !Object.values(v.edits).every(isFields) ||
    !Array.isArray(v.deleted) ||
    !v.deleted.every((id) => typeof id === "string") ||
    !Array.isArray(v.added) ||
    !v.added.every(isItem)
  ) {
    return null;
  }
  return v as unknown as OfflineChanges;
}

/**
 * Reads a stored copy; anything malformed (edited by hand) is treated as
 * missing. Copies saved by the older tick-only version (`pending`: id → done)
 * are upgraded, so ticks made before an update still get sent.
 */
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
    !isNullable(data.toggleBase, "string") ||
    typeof data.savedAt !== "string"
  ) {
    return null;
  }
  let changes: OfflineChanges | null;
  if (data.changes !== undefined) {
    changes = parseChanges(data.changes);
  } else if (isRecord(data.pending) && Object.values(data.pending).every((d) => typeof d === "boolean")) {
    changes = emptyChanges();
    for (const [id, done] of Object.entries(data.pending)) changes.ticks[id] = { done: done === true, notFound: false };
  } else {
    changes = null;
  }
  if (!changes) return null;
  return {
    path: data.path,
    name: data.name,
    status: data.status,
    items: data.items,
    toggleBase: data.toggleBase as string | null,
    canEdit: data.canEdit === true,
    created: data.created === true,
    auto: data.auto === true,
    savedAt: data.savedAt,
    changes,
    syncError: typeof data.syncError === "string" ? data.syncError : null,
  };
}

const withFields = (item: ItemDTO, fields: OfflineItemFields): ItemDTO => ({
  ...item,
  ...fields,
  // Same rule as the server: a unit without a price means nothing.
  priceUnit: fields.price === null ? null : fields.priceUnit,
});

const withTick = (item: ItemDTO, { done, notFound }: OfflineTick): ItemDTO =>
  // Someone else's name would be wrong on a tick I made, so drop it.
  done === item.done && notFound === item.notFound ? item : { ...item, done, notFound, doneBy: null, doneAt: null };

/** The items as they should look offline: server state with my offline changes on top. */
export function itemsWithPending(list: OfflineList): ItemDTO[] {
  const { ticks, edits, deleted, added } = list.changes;
  const gone = new Set(deleted);
  const items = list.items
    .filter((item) => !gone.has(item.id))
    .map((item) => {
      const fields = edits[item.id];
      const tick = ticks[item.id];
      const edited = fields ? withFields(item, fields) : item;
      return tick ? withTick(edited, tick) : edited;
    });
  return [...items, ...added];
}

/** How many changes are waiting to be sent (a list made offline counts as one more). */
export function pendingCount(list: OfflineList): number {
  const { ticks, edits, deleted, added } = list.changes;
  return Object.keys(ticks).length + Object.keys(edits).length + deleted.length + added.length + (list.created ? 1 : 0);
}

export function getOfflineList(path: string, storage = browserStorage()): OfflineList | null {
  return parseOfflineList(storage?.getItem(PREFIX + path) ?? null);
}

/** Every list kept on this device. */
export function listOfflineLists(storage = browserStorage()): OfflineList[] {
  if (!storage) return [];
  const lists: OfflineList[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    const list = parseOfflineList(storage.getItem(key));
    if (list) lists.push(list);
  }
  return lists;
}


function write(list: OfflineList, storage: KeyValueStore | null): OfflineList {
  // A full storage quota throws; the copy just isn't updated then.
  try {
    storage?.setItem(PREFIX + list.path, JSON.stringify(list));
  } catch {}
  notifyChanged();
  return list;
}

/** Applies `fn` to the stored copy at `path` and saves the result. Returns it (null if no copy). */
function update(path: string, fn: (list: OfflineList) => OfflineList, storage: KeyValueStore | null): OfflineList | null {
  const list = getOfflineList(path, storage);
  return list ? write(fn(list), storage) : null;
}

/**
 * Saves (or refreshes) a copy from fresh server data. Offline changes are
 * kept until sync sends them, except those that no longer mean anything:
 * ticks that now match the server, and edits / deletes of items that are
 * gone from it.
 */
export function saveOfflineList(snapshot: OfflineSnapshot, now = new Date(), storage = browserStorage()): OfflineList {
  const previous = getOfflineList(snapshot.path, storage);
  const old = previous?.changes ?? emptyChanges();
  const byId = new Map(snapshot.items.map((item) => [item.id, item]));
  const changes = emptyChanges();
  for (const [id, tick] of Object.entries(old.ticks)) {
    const item = byId.get(id);
    if (item && (item.done !== tick.done || item.notFound !== tick.notFound)) changes.ticks[id] = tick;
  }
  for (const [id, fields] of Object.entries(old.edits)) if (byId.has(id)) changes.edits[id] = fields;
  changes.deleted = old.deleted.filter((id) => byId.has(id));
  changes.added = old.added;
  return write(
    {
      ...snapshot,
      created: false,
      auto: snapshot.auto ?? previous?.auto ?? false,
      savedAt: now.toISOString(),
      changes,
      syncError: previous?.syncError ?? null,
    },
    storage
  );
}

/** Starts a list made offline (empty, editable, synced later). */
export function createOfflineList(name: string, now = new Date(), storage = browserStorage()): OfflineList {
  return write(
    {
      path: NEW_LIST_PREFIX + randomId(),
      name: name.trim().slice(0, LIMITS.FOLDER_NAME_MAX),
      status: DEFAULT_STATUS,
      items: [],
      toggleBase: null,
      canEdit: true,
      created: true,
      auto: false,
      savedAt: now.toISOString(),
      changes: emptyChanges(),
      syncError: null,
    },
    storage
  );
}

/** Same wording as itemExistsMessage() on the server (that file needs the DB, so it can't be imported here). */
const nameTaken = (name: string) => `An item named "${name.trim()}" already exists in this list`;

/** True if another item (not `exceptId`) has this name, in any case. */
function hasName(list: OfflineList, name: string, exceptId?: string): boolean {
  const key = name.trim().toLowerCase();
  return itemsWithPending(list).some((i) => i.id !== exceptId && i.name.trim().toLowerCase() === key);
}

/** Adds an item offline. Fails on a duplicate name or a full list, like the server would. */
export function addOfflineItem(
  path: string,
  fields: OfflineItemFields,
  now = new Date(),
  storage = browserStorage()
): Result<OfflineList> {
  const list = getOfflineList(path, storage);
  if (!list?.canEdit) return { ok: false, error: "You can't add items to this list" };
  if (hasName(list, fields.name)) return { ok: false, error: nameTaken(fields.name) };
  const items = itemsWithPending(list);
  if (items.length >= LIMITS.ITEMS_PER_FOLDER) {
    return { ok: false, error: `A list can hold at most ${LIMITS.ITEMS_PER_FOLDER} items` };
  }
  const at = now.toISOString();
  const item: ItemDTO = withFields(
    {
      id: LOCAL_ITEM_PREFIX + randomId(),
      folderId: list.items[0]?.folderId ?? "",
      ...fields,
      done: false,
      doneBy: null,
      doneAt: null,
      notFound: false,
      position: Math.max(-1, ...items.map((i) => i.position)) + 1,
      createdAt: at,
      updatedAt: at,
    },
    fields
  );
  const value = write({ ...list, changes: { ...list.changes, added: [...list.changes.added, item] } }, storage);
  return { ok: true, value };
}

/** Edits an item offline (all fields, null = empty). Fails on a duplicate name. */
export function editOfflineItem(
  path: string,
  itemId: string,
  fields: OfflineItemFields,
  storage = browserStorage()
): Result<OfflineList> {
  const list = getOfflineList(path, storage);
  if (!list?.canEdit) return { ok: false, error: "You can't edit items in this list" };
  if (hasName(list, fields.name, itemId)) return { ok: false, error: nameTaken(fields.name) };
  const { changes } = list;
  let next: OfflineChanges;
  if (isLocalItemId(itemId)) {
    next = { ...changes, added: changes.added.map((i) => (i.id === itemId ? withFields(i, fields) : i)) };
  } else if (list.items.some((i) => i.id === itemId)) {
    next = { ...changes, edits: { ...changes.edits, [itemId]: fields } };
  } else {
    return { ok: false, error: "Item not found" };
  }
  return { ok: true, value: write({ ...list, changes: next }, storage) };
}

/** Deletes an item offline. An item added offline just disappears; nothing needs sending. */
export function deleteOfflineItem(path: string, itemId: string, storage = browserStorage()): OfflineList | null {
  return update(
    path,
    (list) => {
      if (!list.canEdit) return list;
      const { changes } = list;
      if (isLocalItemId(itemId)) return { ...list, changes: { ...changes, added: changes.added.filter((i) => i.id !== itemId) } };
      if (!list.items.some((i) => i.id === itemId) || changes.deleted.includes(itemId)) return list;
      // Its tick and edit won't be needed any more.
      const ticks = { ...changes.ticks };
      const edits = { ...changes.edits };
      delete ticks[itemId];
      delete edits[itemId];
      return { ...list, changes: { ...changes, ticks, edits, deleted: [...changes.deleted, itemId] } };
    },
    storage
  );
}

/**
 * Ticks / unticks an item (or marks it "not found") in the offline copy.
 * Returns the updated copy (null if none).
 */
export function setOfflineTick(path: string, itemId: string, tick: OfflineTick, storage = browserStorage()): OfflineList | null {
  // A not-found item is done too (same rule as the server).
  const state: OfflineTick = { done: tick.done || tick.notFound, notFound: tick.notFound };
  return update(
    path,
    (list) => {
      const { changes } = list;
      if (isLocalItemId(itemId)) {
        const added = changes.added.map((i) => (i.id === itemId ? { ...i, ...state } : i));
        return { ...list, changes: { ...changes, added } };
      }
      const item = list.items.find((i) => i.id === itemId);
      if (!item) return list;
      const ticks = { ...changes.ticks };
      // Back to what the server has: nothing to send any more.
      if (item.done === state.done && item.notFound === state.notFound) delete ticks[itemId];
      else ticks[itemId] = state;
      return { ...list, changes: { ...changes, ticks } };
    },
    storage
  );
}

/** Only an item's own fields, from an item or the item form (drops e.g. "save to my profile"). */
export const itemFields = ({ name, category, price, priceUnit, quantity, description, group }: OfflineItemFields): OfflineItemFields => ({
  name: name.trim(),
  category,
  price,
  priceUnit,
  quantity,
  description,
  group,
});

/**
 * Renames a group offline, like POST …/groups/rename: `from: null` puts the
 * ungrouped items into group `to`; `to: null` ungroups them. Renaming onto
 * another group in a different case merges into it. Sent as one edit per
 * item, so it syncs like any other edit.
 */
export function renameOfflineGroup(
  path: string,
  from: string | null,
  typed: string | null,
  storage = browserStorage()
): Result<OfflineList> {
  const list = getOfflineList(path, storage);
  if (!list?.canEdit) return { ok: false, error: "You can't edit items in this list" };
  const clean = typed?.trim() || null;
  if (from === null && !clean) return { ok: false, error: "Enter a group name" };
  if (clean && clean.length > LIMITS.ITEM_GROUP_MAX) {
    return { ok: false, error: `group must be at most ${LIMITS.ITEM_GROUP_MAX} characters` };
  }
  const items = itemsWithPending(list);
  const groups = [...new Set(items.flatMap((i) => (i.group ? [i.group] : [])))];
  const to = clean && (groups.find((g) => g !== from && g.toLowerCase() === clean.toLowerCase()) ?? clean);
  const moved = items.filter((i) => (from === null ? !i.group : i.group === from));
  const changes = { ...list.changes, edits: { ...list.changes.edits } };
  for (const item of moved) {
    if (isLocalItemId(item.id)) {
      changes.added = changes.added.map((i) => (i.id === item.id ? { ...i, group: to } : i));
    } else {
      changes.edits[item.id] = { ...itemFields(item), group: to };
    }
  }
  return { ok: true, value: write({ ...list, changes }, storage) };
}

/**
 * Changes the list's own name / status on the copy. For a list made offline
 * that is the change itself (sent when it is created); for a server list it
 * only mirrors a change queued in offlineFolders.ts, so this view shows it.
 */
export function updateOfflineListInfo(
  path: string,
  info: { name?: string; status?: FolderStatus },
  storage = browserStorage()
): OfflineList | null {
  return update(
    path,
    (list) => ({
      ...list,
      ...(info.name !== undefined && { name: info.name.trim().slice(0, LIMITS.FOLDER_NAME_MAX) }),
      ...(info.status !== undefined && { status: info.status }),
    }),
    storage
  );
}

/** Replaces a stored copy as a whole (used by sync after each step). */
export function putOfflineList(list: OfflineList, storage = browserStorage()): OfflineList {
  return write(list, storage);
}

export function removeOfflineList(path: string, storage = browserStorage()): void {
  storage?.removeItem(PREFIX + path);
  notifyChanged();
}

/** Problems from the last syncs, newest first. */
export function getSyncProblems(storage = browserStorage()): SyncProblem[] {
  try {
    const data: unknown = JSON.parse(storage?.getItem(PROBLEMS_KEY) ?? "[]");
    return Array.isArray(data)
      ? data.filter((p): p is SyncProblem => isRecord(p) && typeof p.id === "string" && typeof p.message === "string" && typeof p.at === "string")
      : [];
  } catch {
    return [];
  }
}

export function addSyncProblem(message: string, now = new Date(), storage = browserStorage()): void {
  const problems = [{ id: randomId(), message, at: now.toISOString() }, ...getSyncProblems(storage)].slice(0, MAX_PROBLEMS);
  try {
    storage?.setItem(PROBLEMS_KEY, JSON.stringify(problems));
  } catch {}
  notifyChanged();
}

export function clearSyncProblems(storage = browserStorage()): void {
  storage?.removeItem(PROBLEMS_KEY);
  notifyChanged();
}

/**
 * Remembers whose offline data this is. If someone else logs in on this
 * device (without logging out first), the old copies are wiped, so their
 * lists aren't shown, and their offline changes aren't sent as this user.
 */
export function claimOfflineData(userId: string, storage = browserStorage()): void {
  const owner = storage?.getItem(OWNER_KEY);
  if (owner && owner !== userId) clearOfflineLists(storage);
  try {
    storage?.setItem(OWNER_KEY, userId);
  } catch {}
}

/** Removes every offline copy, problem and cached home list (on logout, so the next person here can't read them). */
export function clearOfflineLists(storage = browserStorage()): void {
  if (!storage) return;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
  notifyChanged();
}
