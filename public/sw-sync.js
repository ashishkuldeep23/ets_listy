// Listy background sync: sends changes made offline after every Listy tab
// was closed (public/sw.js runs it on the browser's "sync" event; Chrome,
// Edge, Android). Plain JS, loaded with importScripts, so it can't share
// code with the app: it does what syncAllOffline() in src/lib/offlineSync.ts
// does, on the same data (IndexedDB, written by src/lib/offlineStore.ts).
// Keep the two in step.
//
// Only data of the user who is logged in (the session cookie) is sent: the
// owner stored by the page (claimOfflineData) must match /api/auth/me.
// Without that, only share-link ticks go (they need no login).
//
// Exposes self.ListySync = { syncAll, idbStore }. syncAll() takes the store
// and fetch as arguments, so tests can pass fakes.

(function (root) {
  "use strict";

  const PREFIX = "listy:offline:";
  const PROBLEMS_KEY = PREFIX + "#problems";
  const FOLDERS_KEY = PREFIX + "#folders";
  const OWNER_KEY = PREFIX + "#owner";
  const MAX_PROBLEMS = 20;
  const FOLDER_NAME_MAX = 60;
  const DEFAULT_STATUS = "active";
  const TIMEOUT_MS = 10000;

  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }

  /** No network, login expired, server busy: keep the change and try again later. */
  const isTemporary = (err) => !(err instanceof ApiError) || err.status === 401 || err.status === 429 || err.status >= 500;
  const reason = (err) => (err instanceof Error ? err.message : "Something went wrong");
  const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function parse(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /** Only lists in the current format; anything else is left for the page. */
  const isList = (v) =>
    v !== null &&
    typeof v === "object" &&
    typeof v.path === "string" &&
    typeof v.name === "string" &&
    Array.isArray(v.items) &&
    v.changes !== null &&
    typeof v.changes === "object" &&
    Array.isArray(v.changes.added) &&
    Array.isArray(v.changes.deleted);

  const pendingCount = (l) =>
    Object.keys(l.changes.ticks || {}).length +
    Object.keys(l.changes.edits || {}).length +
    l.changes.deleted.length +
    l.changes.added.length +
    (l.created ? 1 : 0);

  const fieldsOf = (i) => ({
    name: i.name,
    category: i.category,
    price: i.price,
    priceUnit: i.priceUnit,
    quantity: i.quantity,
    description: i.description,
    group: i.group,
  });

  function randomId() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  const withNumber = (name, n) => `${name.slice(0, FOLDER_NAME_MAX - ` (${n})`.length)} (${n})`;

  /** The app's apiFetch: JSON in and out, `{ error }` answers become ApiErrors. */
  function makeSend(fetchFn) {
    return async (url, method, body) => {
      const res = await fetchFn(url, {
        method,
        credentials: "same-origin",
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const data = res.status === 204 ? null : await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new ApiError(data && typeof data.error === "string" ? data.error : "Something went wrong", res.status);
      }
      return data;
    };
  }

  /**
   * Sends every offline change it may (see the top of this file). Never
   * throws. Returns true when nothing is left that a later try could send
   * (the browser then stops retrying), false to be tried again.
   * `store`: { keys(), get(key), set(key, text | null) }, all async.
   */
  async function syncAll({ store, fetch: fetchFn }) {
    const send = makeSend(fetchFn);
    let complete = true;

    const getList = async (path) => {
      const list = parse(await store.get(PREFIX + path));
      return isList(list) ? list : null;
    };
    const putList = (list) => store.set(PREFIX + list.path, JSON.stringify(list));
    const mutate = async (path, fn) => {
      const list = await getList(path);
      if (list) await putList(fn(list));
      return list;
    };
    const addProblem = async (message) => {
      const old = parse(await store.get(PROBLEMS_KEY));
      const problems = [{ id: randomId(), message, at: new Date().toISOString() }, ...(Array.isArray(old) ? old : [])];
      await store.set(PROBLEMS_KEY, JSON.stringify(problems.slice(0, MAX_PROBLEMS)));
    };
    /** Runs one request; a temporary failure marks the run incomplete. Returns { ok, err }. */
    const attempt = async (fn) => {
      try {
        return { ok: true, value: await fn() };
      } catch (err) {
        if (isTemporary(err)) complete = false;
        return { ok: false, err };
      }
    };

    try {
      // Whose data is this, and is that who is logged in?
      let loggedIn = false;
      const me = await attempt(() => send("/api/auth/me", "GET"));
      if (me.ok) loggedIn = Boolean(me.value && me.value.id) && me.value.id === (await store.get(OWNER_KEY));
      else if (!(me.err instanceof ApiError)) return false; // No network: try again later.

      if (loggedIn) {
        // Folder renames / status changes / deletes made on the home page.
        const folders = parse(await store.get(FOLDERS_KEY)) || {};
        for (const [id, change] of Object.entries(folders)) {
          const path = `/folders/${id}`;
          const res = await attempt(() =>
            change.deleted
              ? send(`/api/folders/${encodeURIComponent(id)}`, "DELETE")
              : send(`/api/folders/${encodeURIComponent(id)}`, "PATCH", { name: change.name, status: change.status })
          );
          if (!res.ok && isTemporary(res.err)) return false;
          if (res.ok && change.deleted) await store.set(PREFIX + path, null);
          if (res.ok && !change.deleted) await mutate(path, (l) => ({ ...l, name: res.value.name, status: res.value.status }));
          if (!res.ok && !(change.deleted && res.err.status === 404)) {
            const name = (await getList(path))?.name ?? change.name ?? "a list";
            await addProblem(`Couldn't ${change.deleted ? "delete" : "change"} "${name}": ${reason(res.err)}`);
          }
          const now = parse(await store.get(FOLDERS_KEY)) || {};
          if (sameJson(now[id], change)) {
            delete now[id];
            await store.set(FOLDERS_KEY, JSON.stringify(now));
          }
        }
      }

      const lists = [];
      for (const key of await store.keys()) {
        if (!key.startsWith(PREFIX) || key.startsWith(PREFIX + "#")) continue;
        const list = parse(await store.get(key));
        if (!isList(list) || pendingCount(list) === 0) continue;
        if (list.created ? loggedIn : list.toggleBase && (loggedIn || list.path.startsWith("/share/"))) lists.push(list);
      }
      for (const list of lists) {
        if (!(await syncList(list))) return false;
      }
      return complete;
    } catch (err) {
      console.error("Background sync failed", err);
      return false;
    }

    /** Creates a list made offline on the server; returns its new path, or null. */
    async function createOnServer(list) {
      let folder = null;
      for (let n = 1; !folder && n <= 5; n++) {
        const body = { name: n === 1 ? list.name : withNumber(list.name, n) };
        if (list.status !== DEFAULT_STATUS) body.status = list.status;
        const res = await attempt(() => send("/api/folders", "POST", body));
        if (res.ok) folder = res.value;
        else if (!(res.err instanceof ApiError && res.err.status === 409)) {
          if (!isTemporary(res.err)) await mutate(list.path, (l) => ({ ...l, syncError: reason(res.err) }));
          return null;
        }
      }
      if (!folder) {
        await mutate(list.path, (l) => ({ ...l, syncError: `A list named "${list.name}" already exists` }));
        return null;
      }
      if (folder.name !== list.name) {
        await addProblem(`Your offline list "${list.name}" was saved as "${folder.name}": a list with that name already exists.`);
      }
      const latest = (await getList(list.path)) || list;
      const path = `/folders/${folder.id}`;
      await putList({
        ...latest,
        path,
        name: folder.name,
        created: false,
        toggleBase: `/api/folders/${folder.id}/items`,
        syncError: null,
        changes: { ...latest.changes, added: latest.changes.added.map((i) => ({ ...i, folderId: folder.id })) },
      });
      await store.set(PREFIX + list.path, null);
      return path;
    }

    /** One list's changes, in the app's order. Returns false to stop (try again later). */
    async function syncList(start) {
      let path = start.path;
      if (start.created) {
        path = await createOnServer(start);
        if (!path) return complete;
      }
      const list = await getList(path);
      const base = list && list.toggleBase;
      if (!base) return true;
      const label = list.name;

      for (const { id } of list.changes.added) {
        const item = (await getList(path))?.changes.added.find((i) => i.id === id);
        if (!item) continue;
        const sent = fieldsOf(item);
        const res = await attempt(() => send(base, "POST", sent));
        if (!res.ok) {
          if (isTemporary(res.err)) return false;
          await addProblem(`Couldn't add "${item.name}" to "${label}": ${reason(res.err)}`);
          await mutate(path, (l) => ({ ...l, changes: { ...l.changes, added: l.changes.added.filter((i) => i.id !== id) } }));
          continue;
        }
        const created = res.value;
        await mutate(path, (l) => {
          const ticks = { ...l.changes.ticks };
          if (item.done) ticks[created.id] = { done: true, notFound: item.notFound };
          return {
            ...l,
            items: [...l.items, created],
            changes: { ...l.changes, ticks, added: l.changes.added.filter((i) => i.id !== id) },
          };
        });
      }

      const replace = (items, next) => items.map((i) => (i.id === next.id ? next : i));

      for (const id of Object.keys((await getList(path))?.changes.edits || {})) {
        const fields = (await getList(path))?.changes.edits[id];
        if (!fields) continue;
        const res = await attempt(() => send(`${base}/${encodeURIComponent(id)}`, "PATCH", fields));
        if (!res.ok && isTemporary(res.err)) return false;
        if (!res.ok) await addProblem(`Couldn't save your edit of "${fields.name}" in "${label}": ${reason(res.err)}`);
        await mutate(path, (l) => {
          const edits = { ...l.changes.edits };
          if (sameJson(edits[id], fields)) delete edits[id];
          return { ...l, items: res.ok ? replace(l.items, res.value) : l.items, changes: { ...l.changes, edits } };
        });
      }

      for (const id of Object.keys((await getList(path))?.changes.ticks || {})) {
        const current = await getList(path);
        const tick = current?.changes.ticks[id];
        if (!tick) continue;
        const body = tick.notFound ? tick : { done: tick.done };
        const res = await attempt(() => send(`${base}/${encodeURIComponent(id)}/toggle`, "POST", body));
        if (!res.ok && isTemporary(res.err)) return false;
        if (!res.ok) {
          const name = current.items.find((i) => i.id === id)?.name ?? "an item";
          await addProblem(`Couldn't tick "${name}" in "${label}": ${reason(res.err)}`);
        }
        await mutate(path, (l) => {
          const ticks = { ...l.changes.ticks };
          if (sameJson(ticks[id], tick)) delete ticks[id];
          return { ...l, items: res.ok ? replace(l.items, res.value) : l.items, changes: { ...l.changes, ticks } };
        });
      }

      for (const id of (await getList(path))?.changes.deleted || []) {
        const name = (await getList(path))?.items.find((i) => i.id === id)?.name ?? "an item";
        const res = await attempt(() => send(`${base}/${encodeURIComponent(id)}`, "DELETE"));
        if (!res.ok && isTemporary(res.err)) return false;
        // 404: someone deleted it already, which is what I wanted.
        if (!res.ok && res.err.status !== 404) {
          await addProblem(`Couldn't delete "${name}" from "${label}": ${reason(res.err)}`);
        }
        await mutate(path, (l) => ({
          ...l,
          items: l.items.filter((i) => i.id !== id),
          changes: { ...l.changes, deleted: l.changes.deleted.filter((d) => d !== id) },
        }));
      }
      return true;
    }
  }

  /** The app's offline data in IndexedDB (same database and store as src/lib/offlineStore.ts). */
  function idbStore() {
    const DB_NAME = "listy-offline";
    const STORE = "kv";
    const done = (req) =>
      new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    let db = null;
    const open = async () => {
      if (!db) {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        db = await done(req);
      }
      return db;
    };
    const run = async (mode, fn) => {
      const tx = (await open()).transaction(STORE, mode);
      const result = await done(fn(tx.objectStore(STORE)));
      // Writes count once the transaction is committed.
      if (mode === "readwrite") {
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      }
      return result;
    };
    // Pages opened meanwhile hear about the change, like from another tab.
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("listy-offline");
    return {
      keys: () => run("readonly", (s) => s.getAllKeys()),
      get: async (key) => {
        const value = await run("readonly", (s) => s.get(key));
        return typeof value === "string" ? value : null;
      },
      set: async (key, text) => {
        await run("readwrite", (s) => (text === null ? s.delete(key) : s.put(text, key)));
        channel?.postMessage(key);
      },
    };
  }

  root.ListySync = { syncAll, idbStore };
})(typeof self !== "undefined" ? self : globalThis);
