import { beforeEach, describe, expect, it } from "vitest";
import {
  clearOfflineLists,
  dropOfflineTick,
  getOfflineList,
  itemsWithPending,
  parseOfflineList,
  removeOfflineList,
  saveOfflineList,
  setOfflineTick,
  type OfflineSnapshot,
} from "@/lib/offlineLists";
import type { ItemDTO } from "@/types";

// Minimal in-memory stand-in for localStorage.
class MemoryStorage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const item = (id: string, done = false): ItemDTO => ({
  id,
  folderId: "f1",
  name: `Item ${id}`,
  category: null,
  price: null,
  priceUnit: null,
  quantity: null,
  description: null,
  group: null,
  done,
  doneBy: done ? { id: "u1", name: "Asha" } : null,
  doneAt: null,
  notFound: false,
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const snapshot = (items: ItemDTO[]): OfflineSnapshot => ({
  path: "/folders/f1",
  name: "Groceries",
  status: "active",
  items,
  toggleBase: "/api/folders/f1/items",
});

const NOW = new Date("2026-10-11T10:00:00.000Z");
let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
});

describe("saveOfflineList / getOfflineList", () => {
  it("saves a copy and reads it back by path", () => {
    saveOfflineList(snapshot([item("a")]), NOW, storage);
    const list = getOfflineList("/folders/f1", storage);
    expect(list?.name).toBe("Groceries");
    expect(list?.items.map((i) => i.id)).toEqual(["a"]);
    expect(list?.savedAt).toBe(NOW.toISOString());
    expect(list?.pending).toEqual({});
  });

  it("returns null for a path that was never saved", () => {
    expect(getOfflineList("/folders/nope", storage)).toBeNull();
  });

  it("keeps offline ticks that still differ from the server, drops the rest", () => {
    saveOfflineList(snapshot([item("a"), item("b"), item("c")]), NOW, storage);
    setOfflineTick("/folders/f1", "a", true, storage);
    setOfflineTick("/folders/f1", "b", true, storage);
    setOfflineTick("/folders/f1", "c", true, storage);
    // Server now: a ticked (synced), b not, c deleted.
    const list = saveOfflineList(snapshot([item("a", true), item("b")]), NOW, storage);
    expect(list.pending).toEqual({ b: true });
  });
});

describe("setOfflineTick / dropOfflineTick", () => {
  it("records a tick and clears it when set back to the server value", () => {
    saveOfflineList(snapshot([item("a")]), NOW, storage);
    expect(setOfflineTick("/folders/f1", "a", true, storage)?.pending).toEqual({ a: true });
    expect(setOfflineTick("/folders/f1", "a", false, storage)?.pending).toEqual({});
  });

  it("ignores unknown items and unsaved lists", () => {
    saveOfflineList(snapshot([item("a")]), NOW, storage);
    expect(setOfflineTick("/folders/f1", "zzz", true, storage)?.pending).toEqual({});
    expect(setOfflineTick("/folders/other", "a", true, storage)).toBeNull();
  });

  it("drops one pending tick", () => {
    saveOfflineList(snapshot([item("a"), item("b")]), NOW, storage);
    setOfflineTick("/folders/f1", "a", true, storage);
    setOfflineTick("/folders/f1", "b", true, storage);
    dropOfflineTick("/folders/f1", "a", storage);
    expect(getOfflineList("/folders/f1", storage)?.pending).toEqual({ b: true });
  });
});

describe("itemsWithPending", () => {
  it("applies offline ticks and hides the old 'done by' name", () => {
    saveOfflineList(snapshot([item("a", true), item("b")]), NOW, storage);
    setOfflineTick("/folders/f1", "a", false, storage);
    const list = getOfflineList("/folders/f1", storage);
    if (!list) throw new Error("missing");
    const [a, b] = itemsWithPending(list);
    expect(a).toMatchObject({ done: false, doneBy: null });
    expect(b).toEqual(list.items[1]);
  });
});

describe("removeOfflineList / clearOfflineLists", () => {
  it("removes one list", () => {
    saveOfflineList(snapshot([item("a")]), NOW, storage);
    removeOfflineList("/folders/f1", storage);
    expect(getOfflineList("/folders/f1", storage)).toBeNull();
  });

  it("clears only offline lists", () => {
    saveOfflineList(snapshot([item("a")]), NOW, storage);
    saveOfflineList({ ...snapshot([]), path: "/share/tok" }, NOW, storage);
    storage.setItem("something-else", "keep");
    clearOfflineLists(storage);
    expect(storage.length).toBe(1);
    expect(storage.getItem("something-else")).toBe("keep");
  });

  it("does nothing without storage (server / blocked)", () => {
    expect(() => clearOfflineLists(null)).not.toThrow();
    expect(getOfflineList("/folders/f1", null)).toBeNull();
  });
});

describe("parseOfflineList", () => {
  const valid = () => ({ ...snapshot([item("a")]), savedAt: NOW.toISOString(), pending: { a: true } });

  it("accepts a valid copy", () => {
    expect(parseOfflineList(JSON.stringify(valid()))?.pending).toEqual({ a: true });
  });

  it.each([
    ["null", null],
    ["empty", ""],
    ["bad JSON", "{"],
    ["an array", "[]"],
    ["unknown status", JSON.stringify({ ...valid(), status: "lost" })],
    ["items not an array", JSON.stringify({ ...valid(), items: {} })],
    ["item without id", JSON.stringify({ ...valid(), items: [{ name: "x", done: false }] })],
    ["toggleBase a number", JSON.stringify({ ...valid(), toggleBase: 3 })],
    ["pending with a non-boolean", JSON.stringify({ ...valid(), pending: { a: "yes" } })],
    ["missing savedAt", JSON.stringify({ ...valid(), savedAt: undefined })],
  ])("rejects %s", (_label, raw) => {
    expect(parseOfflineList(raw)).toBeNull();
  });
});
