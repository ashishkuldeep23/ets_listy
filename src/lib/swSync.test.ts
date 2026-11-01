// Tests for public/sw-sync.js, the service worker's background sync. It is
// plain JS for the browser, so it is loaded here with node:vm and given a
// fake store and fetch.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";
import type { ItemDTO } from "@/types";

interface Store {
  keys: () => Promise<string[]>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, text: string | null) => Promise<void>;
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

interface ListySync {
  syncAll: (deps: { store: Store; fetch: FetchFn }) => Promise<boolean>;
}

function loadSwSync(): ListySync {
  const code = readFileSync(join(process.cwd(), "public/sw-sync.js"), "utf8");
  const context: { self: { ListySync?: ListySync } } & Record<string, unknown> = {
    self: {},
    console,
    crypto,
    AbortSignal,
    Uint8Array,
  };
  runInNewContext(code, context);
  if (!context.self.ListySync) throw new Error("sw-sync.js didn't load");
  return context.self.ListySync;
}

const { syncAll } = loadSwSync();
const P = "listy:offline:";

class MemoryStore implements Store {
  data = new Map<string, string>();
  keys = async () => [...this.data.keys()];
  get = async (key: string) => this.data.get(key) ?? null;
  set = async (key: string, text: string | null) => {
    if (text === null) this.data.delete(key);
    else this.data.set(key, text);
  };
  json(key: string): unknown {
    const text = this.data.get(P + key);
    return text === undefined ? undefined : JSON.parse(text);
  }
}

interface Call {
  method: string;
  url: string;
  body: unknown;
}

/** A fake API; `/api/auth/me` answers as user u1 unless `reply` handles it. */
function server(reply: (call: Call) => [number, unknown] | undefined) {
  const calls: Call[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    const call = { method: init.method ?? "GET", url, body: init.body ? JSON.parse(String(init.body)) : undefined };
    const answer = reply(call) ?? (url === "/api/auth/me" ? [200, { id: "u1", name: "Asha" }] : [500, {}]);
    if (url !== "/api/auth/me") calls.push(call);
    if (answer[0] === 0) throw new TypeError("Failed to fetch");
    return new Response(answer[0] === 204 ? null : JSON.stringify(answer[1]), { status: answer[0] });
  };
  return { calls, fetchFn };
}

const item = (id: string, extra: Partial<ItemDTO> = {}): ItemDTO => ({
  id,
  folderId: "f1",
  name: `Item ${id}`,
  category: null,
  price: null,
  priceUnit: null,
  quantity: null,
  description: null,
  group: null,
  done: false,
  doneBy: null,
  doneAt: null,
  notFound: false,
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

const emptyChanges = () => ({ ticks: {}, edits: {}, deleted: [] as string[], added: [] as ItemDTO[] });

function list(path: string, extra: Record<string, unknown> = {}) {
  return {
    path,
    name: "Groceries",
    status: "active",
    items: [] as ItemDTO[],
    toggleBase: `/api${path}/items`,
    canEdit: true,
    created: false,
    auto: false,
    savedAt: "2026-01-01T00:00:00.000Z",
    changes: emptyChanges(),
    syncError: null,
    ...extra,
  };
}

let store: MemoryStore;
const put = (value: { path: string }) => store.set(P + value.path, JSON.stringify(value));

beforeEach(async () => {
  store = new MemoryStore();
  await store.set(`${P}#owner`, "u1");
});

describe("sw-sync.js syncAll", () => {
  it("creates a list made offline with its items and ticks, under its new path", async () => {
    const milk = item("local-1", { name: "Milk", done: true });
    await put(list("new:abc", { name: "Market", status: "pending", toggleBase: null, created: true, changes: { ...emptyChanges(), added: [milk] } }));
    const { calls, fetchFn } = server(({ method, url }) => {
      if (url === "/api/folders") return [201, { id: "n1", name: "Market", status: "pending" }];
      if (method === "POST" && url === "/api/folders/n1/items") return [201, item("i1", { name: "Milk" })];
      if (url === "/api/folders/n1/items/i1/toggle") return [200, item("i1", { name: "Milk", done: true })];
      return undefined;
    });

    expect(await syncAll({ store, fetch: fetchFn })).toBe(true);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/folders",
      "POST /api/folders/n1/items",
      "POST /api/folders/n1/items/i1/toggle",
    ]);
    expect(calls[0]?.body).toEqual({ name: "Market", status: "pending" });
    expect(store.json("new:abc")).toBeUndefined();
    expect(store.json("/folders/n1")).toMatchObject({
      created: false,
      changes: { ticks: {}, edits: {}, deleted: [], added: [] },
      items: [{ id: "i1", done: true }],
    });
  });

  it("sends folder changes, edits, ticks and deletes", async () => {
    await store.set(`${P}#folders`, JSON.stringify({ f1: { name: "Market" } }));
    await put(
      list("/folders/f1", {
        items: [item("a"), item("b"), item("c")],
        changes: {
          ticks: { b: { done: true, notFound: true } },
          edits: { a: { ...item("a"), name: "Apples" } },
          deleted: ["c"],
          added: [],
        },
      })
    );
    const { calls, fetchFn } = server(({ method, url }) => {
      if (url === "/api/folders/f1") return [200, { id: "f1", name: "Market", status: "active" }];
      if (method === "PATCH") return [200, item("a", { name: "Apples" })];
      if (url.endsWith("/toggle")) return [200, item("b", { done: true, notFound: true })];
      if (method === "DELETE") return [204, null];
      return undefined;
    });

    expect(await syncAll({ store, fetch: fetchFn })).toBe(true);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "PATCH /api/folders/f1",
      "PATCH /api/folders/f1/items/a",
      "POST /api/folders/f1/items/b/toggle",
      "DELETE /api/folders/f1/items/c",
    ]);
    expect(calls[2]?.body).toEqual({ done: true, notFound: true });
    expect(store.json("#folders")).toEqual({});
    expect(store.json("/folders/f1")).toMatchObject({
      name: "Market",
      changes: { ticks: {}, edits: {}, deleted: [] },
      items: [{ name: "Apples" }, { notFound: true }],
    });
  });

  it("reports changes the server refuses and drops them", async () => {
    await put(list("/folders/f1", { items: [item("a")], changes: { ...emptyChanges(), edits: { a: item("a") }, deleted: ["a"] } }));
    const { fetchFn } = server(({ method }) =>
      method === "PATCH" ? [403, { error: "You can't edit items in this list" }] : method === "DELETE" ? [404, { error: "gone" }] : undefined
    );
    expect(await syncAll({ store, fetch: fetchFn })).toBe(true);
    expect(store.json("/folders/f1")).toMatchObject({ changes: { edits: {}, deleted: [] } });
    expect((store.json("#problems") as { message: string }[]).map((p) => p.message)).toEqual([
      `Couldn't save your edit of "Item a" in "Groceries": You can't edit items in this list`,
    ]);
  });

  it("keeps everything and asks to retry with no network", async () => {
    await put(list("/folders/f1", { items: [item("a")], changes: { ...emptyChanges(), ticks: { a: { done: true, notFound: false } } } }));
    const { fetchFn } = server(() => [0, null]);
    expect(await syncAll({ store, fetch: fetchFn })).toBe(false);
    expect(store.json("/folders/f1")).toMatchObject({ changes: { ticks: { a: { done: true } } } });
  });

  it("asks to retry when the server is down mid-way", async () => {
    await put(list("/folders/f1", { items: [item("a")], changes: { ...emptyChanges(), ticks: { a: { done: true, notFound: false } } } }));
    const { fetchFn } = server(({ url }) => (url.endsWith("/toggle") ? [503, {}] : undefined));
    expect(await syncAll({ store, fetch: fetchFn })).toBe(false);
  });

  it("sends only share-link ticks when someone else (or no one) is logged in", async () => {
    await put(list("/folders/f1", { items: [item("a")], changes: { ...emptyChanges(), ticks: { a: { done: true, notFound: false } } } }));
    await put(
      list("/share/tok", {
        toggleBase: "/api/share/tok/items",
        items: [item("s")],
        changes: { ...emptyChanges(), ticks: { s: { done: true, notFound: false } } },
      })
    );
    await put(list("new:x", { created: true, toggleBase: null }));
    const { calls, fetchFn } = server(({ url }) => {
      if (url === "/api/auth/me") return [200, { id: "someone-else" }];
      if (url === "/api/share/tok/items/s/toggle") return [200, item("s", { done: true })];
      return undefined;
    });
    expect(await syncAll({ store, fetch: fetchFn })).toBe(true);
    expect(calls.map((c) => c.url)).toEqual(["/api/share/tok/items/s/toggle"]);
    expect(store.json("new:x")).toBeDefined();
  });

  it("leaves lists in an older format alone", async () => {
    await store.set(`${P}/folders/old`, JSON.stringify({ path: "/folders/old", name: "Old", items: [], pending: { a: true } }));
    const { calls, fetchFn } = server(() => undefined);
    expect(await syncAll({ store, fetch: fetchFn })).toBe(true);
    expect(calls).toEqual([]);
  });
});
