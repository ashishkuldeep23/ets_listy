// Where offline data lives: IndexedDB, so the service worker can read it
// too (background sync, public/sw-sync.js). The page keeps a copy of all
// of it in memory, so the rest of the offline code can read and write it
// synchronously, like localStorage; every write also goes to IndexedDB, and
// other tabs (BroadcastChannel) reload the keys that changed.
// Data saved in localStorage by older versions is moved over once.
// No IndexedDB (or it fails, e.g. some private modes): localStorage is used
// as before, and background sync just doesn't happen.

const DB_NAME = "listy-offline";
const DB_STORE = "kv"; // must match public/sw-sync.js
const PREFIX = "listy:offline:";
const CHANNEL = "listy-offline";

export type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/** Fired on window whenever offline data changes, so what's on screen stays right. */
export const OFFLINE_CHANGED_EVENT = "listy:offline-changed";

// Bumped on every change, as the snapshot for useOfflineVersion().
let version = 0;
// True once the stored data has been read (until then nothing is shown).
let loaded = false;

export function notifyChanged(): void {
  version += 1;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OFFLINE_CHANGED_EVENT));
}

/** -1 until the stored data has been read; then changes with every write. */
export function offlineVersion(): number {
  browserStorage();
  return loaded ? version : -1;
}

/** Runs an IndexedDB request as a promise. */
function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
  return done(request);
}

async function readAll(db: IDBDatabase): Promise<Map<string, string>> {
  const store = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE);
  // Both come back in key order, so they line up.
  const [keys, values] = await Promise.all([done(store.getAllKeys()), done(store.getAll())]);
  const data = new Map<string, string>();
  keys.forEach((key, i) => {
    const value: unknown = values[i];
    if (typeof key === "string" && typeof value === "string") data.set(key, value);
  });
  return data;
}

/** The in-memory copy, written through to IndexedDB (or localStorage as a fallback). */
class MirrorStorage implements KeyValueStore {
  private data = new Map<string, string>();
  private db: IDBDatabase | null = null;
  private fallback: Storage | null = null;
  // Written before the stored data was read: these win over what is read.
  private early = new Set<string>();
  private channel = new BroadcastChannel(CHANNEL);
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.load().finally(() => {
      loaded = true;
      notifyChanged();
    });
  }

  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
    this.persist(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
    this.persist(key, null);
  }

  private persist(key: string, value: string | null): void {
    if (!loaded) this.early.add(key);
    if (this.fallback) {
      try {
        if (value === null) this.fallback.removeItem(key);
        else this.fallback.setItem(key, value);
      } catch {}
      return;
    }
    if (!this.db) return; // Written once the database is open (see load).
    // Writes are put in order: IndexedDB runs read-write transactions on one store one after another.
    const tx = this.db.transaction(DB_STORE, "readwrite");
    const store = tx.objectStore(DB_STORE);
    if (value === null) store.delete(key);
    else store.put(value, key);
    tx.oncomplete = () => this.channel.postMessage(key);
    tx.onerror = () => console.error("Offline data not saved", tx.error);
  }

  private async load(): Promise<void> {
    let stored: Map<string, string>;
    let old: Storage | null = null;
    try {
      old = window.localStorage;
    } catch {}
    try {
      this.db = await openDb();
      stored = await readAll(this.db);
      // Move data from older versions out of localStorage.
      for (let i = (old?.length ?? 0) - 1; i >= 0; i--) {
        const key = old?.key(i);
        const value = key ? old?.getItem(key) : null;
        if (!key?.startsWith(PREFIX) || value == null) continue;
        if (!stored.has(key) && !this.early.has(key)) {
          this.data.set(key, value);
          this.early.add(key);
        }
        old?.removeItem(key);
      }
    } catch (err) {
      console.error("IndexedDB unavailable, using localStorage", err);
      this.db = null;
      this.fallback = old;
      stored = new Map();
      for (let i = 0; i < (old?.length ?? 0); i++) {
        const key = old?.key(i);
        const value = key ? old?.getItem(key) : null;
        if (key?.startsWith(PREFIX) && value != null) stored.set(key, value);
      }
    }
    for (const [key, value] of stored) if (!this.early.has(key)) this.data.set(key, value);
    // Now that there is somewhere to write to, save what was written early.
    for (const key of this.early) this.persist(key, this.data.get(key) ?? null);
    this.early.clear();
    // Another tab (or the service worker) changed something: read it again.
    this.channel.onmessage = (e: MessageEvent) => {
      if (typeof e.data === "string") void this.reload(e.data);
    };
  }

  /** Reads one key (or everything) from IndexedDB again. */
  async reload(key?: string): Promise<void> {
    if (!this.db) return;
    if (key === undefined) {
      this.data = await readAll(this.db);
    } else {
      const value: unknown = await done(this.db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key));
      if (typeof value === "string") this.data.set(key, value);
      else this.data.delete(key);
    }
    notifyChanged();
  }
}

let mirror: MirrorStorage | null = null;

/** The offline data store, or null on the server / when the browser blocks storage. */
export function browserStorage(): KeyValueStore | null {
  if (typeof window === "undefined") return null;
  if (mirror) return mirror;
  if (typeof indexedDB !== "undefined" && typeof BroadcastChannel !== "undefined") {
    mirror = new MirrorStorage();
    return mirror;
  }
  // Read on each call (not kept), so tests can swap the window.
  loaded = true;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Resolves once the stored data has been read (at once without IndexedDB). */
export async function whenOfflineReady(): Promise<void> {
  browserStorage();
  await mirror?.ready;
}

/** Reads everything from IndexedDB again (before syncing: the service worker may have changed it). */
export async function reloadOfflineStore(): Promise<void> {
  await mirror?.reload();
}
