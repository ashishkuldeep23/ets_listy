import { beforeEach, describe, expect, it } from "vitest";
import {
  addOfflineItem,
  addSyncProblem,
  claimOfflineData,
  clearOfflineLists,
  clearSyncProblems,
  createOfflineList,
  deleteOfflineItem,
  editOfflineItem,
  getOfflineList,
  getSyncProblems,
  isLocalItemId,
  isNewListPath,
  itemsWithPending,
  listOfflineLists,
  parseOfflineList,
  pendingCount,
  removeOfflineList,
  renameOfflineGroup,
  saveOfflineList,
  setOfflineTick,
  updateOfflineListInfo,
  type OfflineItemFields,
  type OfflineSnapshot,
} from "@/lib/offlineLists";
import { MemoryStorage } from "@/test/memoryStorage";
import type { ItemDTO } from "@/types";

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

const fields = (name: string, extra: Partial<OfflineItemFields> = {}): OfflineItemFields => ({
  name,
  category: null,
  price: null,
  priceUnit: null,
  quantity: null,
  description: null,
  group: null,
  ...extra,
});

const PATH = "/folders/f1";
const snapshot = (items: ItemDTO[], canEdit = true): OfflineSnapshot => ({
  path: PATH,
  name: "Groceries",
  status: "active",
  items,
  toggleBase: "/api/folders/f1/items",
  canEdit,
});

const DONE = { done: true, notFound: false };
const UNDONE = { done: false, notFound: false };
const NOT_FOUND = { done: true, notFound: true };

const NOW = new Date("2026-10-11T10:00:00.000Z");
let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
});

/** The stored copy, or a failed test. */
function stored(path = PATH) {
  const list = getOfflineList(path, storage);
  if (!list) throw new Error(`no copy at ${path}`);
  return list;
}

describe("saveOfflineList / getOfflineList", () => {
  it("saves a copy and reads it back by path", () => {
    saveOfflineList(snapshot([item("a")]), NOW, storage);
    const list = stored();
    expect(list.name).toBe("Groceries");
    expect(list.items.map((i) => i.id)).toEqual(["a"]);
    expect(list.savedAt).toBe(NOW.toISOString());
    expect(list.canEdit).toBe(true);
    expect(list.created).toBe(false);
    expect(pendingCount(list)).toBe(0);
  });

  it("returns null for a path that was never saved", () => {
    expect(getOfflineList("/folders/nope", storage)).toBeNull();
  });

  it("keeps offline ticks that still differ from the server, drops the rest", () => {
    saveOfflineList(snapshot([item("a"), item("b"), item("c")]), NOW, storage);
    setOfflineTick(PATH, "a", DONE, storage);
    setOfflineTick(PATH, "b", DONE, storage);
    setOfflineTick(PATH, "c", DONE, storage);
    // Server now: a ticked (synced), b not, c deleted.
    const list = saveOfflineList(snapshot([item("a", true), item("b")]), NOW, storage);
    expect(list.changes.ticks).toEqual({ b: DONE });
  });

  it("keeps added items, and edits / deletes of items the server still has", () => {
    saveOfflineList(snapshot([item("a"), item("b"), item("c")]), NOW, storage);
    addOfflineItem(PATH, fields("Milk"), NOW, storage);
    editOfflineItem(PATH, "a", fields("Apples"), storage);
    editOfflineItem(PATH, "c", fields("Carrots"), storage);
    deleteOfflineItem(PATH, "b", storage);
    // c is gone from the server: its edit means nothing any more.
    const list = saveOfflineList(snapshot([item("a"), item("b")]), NOW, storage);
    expect(Object.keys(list.changes.edits)).toEqual(["a"]);
    expect(list.changes.deleted).toEqual(["b"]);
    expect(list.changes.added.map((i) => i.name)).toEqual(["Milk"]);
  });
});

describe("setOfflineTick", () => {
  it("records a tick and clears it when set back to the server value", () => {
    saveOfflineList(snapshot([item("a")]), NOW, storage);
    expect(setOfflineTick(PATH, "a", DONE, storage)?.changes.ticks).toEqual({ a: DONE });
    expect(setOfflineTick(PATH, "a", UNDONE, storage)?.changes.ticks).toEqual({});
  });

  it("records 'not found', which always counts as done", () => {
    saveOfflineList(snapshot([item("a")]), NOW, storage);
    setOfflineTick(PATH, "a", { done: false, notFound: true }, storage);
    expect(stored().changes.ticks).toEqual({ a: NOT_FOUND });
  });

  it("ticks an item added offline in place", () => {
    saveOfflineList(snapshot([]), NOW, storage);
    addOfflineItem(PATH, fields("Milk"), NOW, storage);
    const id = stored().changes.added[0]?.id ?? "";
    setOfflineTick(PATH, id, NOT_FOUND, storage);
    expect(stored().changes.added[0]).toMatchObject({ done: true, notFound: true });
    expect(stored().changes.ticks).toEqual({});
  });

  it("ignores unknown items and unsaved lists", () => {
    saveOfflineList(snapshot([item("a")]), NOW, storage);
    expect(setOfflineTick(PATH, "zzz", DONE, storage)?.changes.ticks).toEqual({});
    expect(setOfflineTick("/folders/other", "a", DONE, storage)).toBeNull();
  });
});

describe("addOfflineItem", () => {
  it("adds an item with a local id at the end", () => {
    saveOfflineList(snapshot([{ ...item("a"), position: 4 }]), NOW, storage);
    const result = addOfflineItem(PATH, fields("Milk", { price: 30, priceUnit: "litre" }), NOW, storage);
    expect(result.ok).toBe(true);
    const added = stored().changes.added[0];
    expect(added && isLocalItemId(added.id)).toBe(true);
    expect(added).toMatchObject({ name: "Milk", price: 30, priceUnit: "litre", done: false, position: 5, folderId: "f1" });
  });

  it("drops a unit without a price", () => {
    saveOfflineList(snapshot([]), NOW, storage);
    addOfflineItem(PATH, fields("Milk", { priceUnit: "litre" }), NOW, storage);
    expect(stored().changes.added[0]?.priceUnit).toBeNull();
  });

  it("rejects a name already in the list, in any case", () => {
    saveOfflineList(snapshot([item("a")]), NOW, storage);
    addOfflineItem(PATH, fields("Milk"), NOW, storage);
    expect(addOfflineItem(PATH, fields("item A"), NOW, storage)).toEqual({ ok: false, error: expect.stringContaining("already exists") });
    expect(addOfflineItem(PATH, fields(" MILK "), NOW, storage).ok).toBe(false);
  });

  it("rejects adding without edit rights, or to an unsaved list", () => {
    saveOfflineList(snapshot([], false), NOW, storage);
    expect(addOfflineItem(PATH, fields("Milk"), NOW, storage).ok).toBe(false);
    expect(addOfflineItem("/folders/other", fields("Milk"), NOW, storage).ok).toBe(false);
  });
});

describe("editOfflineItem", () => {
  it("records an edit of a server item and shows it", () => {
    saveOfflineList(snapshot([item("a", true)]), NOW, storage);
    expect(editOfflineItem(PATH, "a", fields("Apples", { group: "Fruit" }), storage).ok).toBe(true);
    expect(itemsWithPending(stored())[0]).toMatchObject({ name: "Apples", group: "Fruit", done: true });
    // The server copy itself is untouched until sync.
    expect(stored().items[0]?.name).toBe("Item a");
  });

  it("changes an item added offline in place", () => {
    saveOfflineList(snapshot([]), NOW, storage);
    addOfflineItem(PATH, fields("Milk"), NOW, storage);
    const id = stored().changes.added[0]?.id ?? "";
    editOfflineItem(PATH, id, fields("Oat milk"), storage);
    expect(stored().changes.added.map((i) => i.name)).toEqual(["Oat milk"]);
    expect(stored().changes.edits).toEqual({});
  });

  it("allows keeping its own name, rejects another item's", () => {
    saveOfflineList(snapshot([item("a"), item("b")]), NOW, storage);
    expect(editOfflineItem(PATH, "a", fields("ITEM A"), storage).ok).toBe(true);
    expect(editOfflineItem(PATH, "a", fields("Item b"), storage).ok).toBe(false);
  });

  it("rejects unknown items and lists without edit rights", () => {
    saveOfflineList(snapshot([item("a")]), NOW, storage);
    expect(editOfflineItem(PATH, "zzz", fields("X"), storage).ok).toBe(false);
    saveOfflineList(snapshot([item("a")], false), NOW, storage);
    expect(editOfflineItem(PATH, "a", fields("X"), storage).ok).toBe(false);
  });
});

describe("deleteOfflineItem", () => {
  it("records a delete of a server item and forgets its tick and edit", () => {
    saveOfflineList(snapshot([item("a"), item("b")]), NOW, storage);
    setOfflineTick(PATH, "a", DONE, storage);
    editOfflineItem(PATH, "a", fields("Apples"), storage);
    deleteOfflineItem(PATH, "a", storage);
    const list = stored();
    expect(list.changes).toMatchObject({ ticks: {}, edits: {}, deleted: ["a"] });
    expect(itemsWithPending(list).map((i) => i.id)).toEqual(["b"]);
    expect(pendingCount(list)).toBe(1);
  });

  it("removes an item added offline without leaving anything to send", () => {
    saveOfflineList(snapshot([]), NOW, storage);
    addOfflineItem(PATH, fields("Milk"), NOW, storage);
    deleteOfflineItem(PATH, stored().changes.added[0]?.id ?? "", storage);
    expect(pendingCount(stored())).toBe(0);
  });

  it("does nothing without edit rights", () => {
    saveOfflineList(snapshot([item("a")], false), NOW, storage);
    deleteOfflineItem(PATH, "a", storage);
    expect(stored().changes.deleted).toEqual([]);
  });
});

describe("saveOfflineList: auto", () => {
  it("is false unless asked, and kept when a refresh doesn't say", () => {
    expect(saveOfflineList(snapshot([]), NOW, storage).auto).toBe(false);
    expect(saveOfflineList({ ...snapshot([]), auto: true }, NOW, storage).auto).toBe(true);
    expect(saveOfflineList(snapshot([]), NOW, storage).auto).toBe(true);
    // Saved by hand afterwards.
    expect(saveOfflineList({ ...snapshot([]), auto: false }, NOW, storage).auto).toBe(false);
  });
});

describe("renameOfflineGroup", () => {
  const grouped = (id: string, group: string | null) => ({ ...item(id), group });

  it("renames a group as one edit per item, and shows it", () => {
    saveOfflineList(snapshot([grouped("a", "Veg"), grouped("b", "Veg"), grouped("c", "Fruit")]), NOW, storage);
    expect(renameOfflineGroup(PATH, "Veg", " Greens ", storage).ok).toBe(true);
    const list = stored();
    expect(Object.keys(list.changes.edits).sort()).toEqual(["a", "b"]);
    expect(itemsWithPending(list).map((i) => i.group)).toEqual(["Greens", "Greens", "Fruit"]);
  });

  it("keeps earlier edits of the moved items", () => {
    saveOfflineList(snapshot([grouped("a", "Veg")]), NOW, storage);
    editOfflineItem(PATH, "a", fields("Apples", { group: "Veg", price: 5 }), storage);
    renameOfflineGroup(PATH, "Veg", "Fruit", storage);
    expect(stored().changes.edits.a).toEqual(fields("Apples", { group: "Fruit", price: 5 }));
  });

  it("groups the ungrouped items, including ones added offline", () => {
    saveOfflineList(snapshot([grouped("a", null), grouped("b", "Veg")]), NOW, storage);
    addOfflineItem(PATH, fields("Milk"), NOW, storage);
    renameOfflineGroup(PATH, null, "Dairy", storage);
    expect(itemsWithPending(stored()).map((i) => i.group)).toEqual(["Dairy", "Veg", "Dairy"]);
  });

  it("merges into an existing group typed in another case", () => {
    saveOfflineList(snapshot([grouped("a", "Veg"), grouped("b", "Fruit")]), NOW, storage);
    renameOfflineGroup(PATH, "Fruit", "veg", storage);
    expect(itemsWithPending(stored()).map((i) => i.group)).toEqual(["Veg", "Veg"]);
  });

  it("ungroups a group with to: null", () => {
    saveOfflineList(snapshot([grouped("a", "Veg")]), NOW, storage);
    renameOfflineGroup(PATH, "Veg", null, storage);
    expect(itemsWithPending(stored())[0]?.group).toBeNull();
  });

  it.each([
    ["no name for the ungrouped items", null, ""],
    ["a name that is too long", "Veg", "x".repeat(41)],
  ])("rejects %s", (_label, from, to) => {
    saveOfflineList(snapshot([grouped("a", "Veg")]), NOW, storage);
    expect(renameOfflineGroup(PATH, from, to, storage).ok).toBe(false);
  });

  it("rejects without edit rights", () => {
    saveOfflineList(snapshot([grouped("a", "Veg")], false), NOW, storage);
    expect(renameOfflineGroup(PATH, "Veg", "Greens", storage).ok).toBe(false);
  });
});

describe("updateOfflineListInfo", () => {
  it("changes name and status of the copy", () => {
    const list = createOfflineList("Market", NOW, storage);
    updateOfflineListInfo(list.path, { name: "  Bazaar ", status: "pending" }, storage);
    expect(stored(list.path)).toMatchObject({ name: "Bazaar", status: "pending" });
  });

  it("returns null without a copy", () => {
    expect(updateOfflineListInfo("/folders/none", { name: "x" }, storage)).toBeNull();
  });
});

describe("createOfflineList", () => {
  it("makes an empty editable list under a new: path, counted as one change", () => {
    const list = createOfflineList("  Market  ", NOW, storage);
    expect(isNewListPath(list.path)).toBe(true);
    expect(stored(list.path)).toMatchObject({ name: "Market", created: true, canEdit: true, toggleBase: null, items: [] });
    expect(pendingCount(list)).toBe(1);
    expect(addOfflineItem(list.path, fields("Milk"), NOW, storage).ok).toBe(true);
  });

  it("gives every list its own path", () => {
    expect(createOfflineList("A", NOW, storage).path).not.toBe(createOfflineList("B", NOW, storage).path);
  });
});

describe("itemsWithPending", () => {
  it("applies offline ticks and hides the old 'done by' name", () => {
    saveOfflineList(snapshot([item("a", true), item("b")]), NOW, storage);
    setOfflineTick(PATH, "a", UNDONE, storage);
    const list = stored();
    const [a, b] = itemsWithPending(list);
    expect(a).toMatchObject({ done: false, doneBy: null });
    expect(b).toEqual(list.items[1]);
  });

  it("lists server items first, then items added offline", () => {
    saveOfflineList(snapshot([item("a")]), NOW, storage);
    addOfflineItem(PATH, fields("Milk"), NOW, storage);
    expect(itemsWithPending(stored()).map((i) => i.name)).toEqual(["Item a", "Milk"]);
  });
});

describe("listOfflineLists / removeOfflineList / clearOfflineLists", () => {
  it("lists every saved copy, skipping other keys", () => {
    saveOfflineList(snapshot([item("a")]), NOW, storage);
    createOfflineList("Market", NOW, storage);
    addSyncProblem("oops", NOW, storage);
    expect(listOfflineLists(storage).map((l) => l.name).sort()).toEqual(["Groceries", "Market"]);
  });

  it("removes one list", () => {
    saveOfflineList(snapshot([item("a")]), NOW, storage);
    removeOfflineList(PATH, storage);
    expect(getOfflineList(PATH, storage)).toBeNull();
  });

  it("clears only offline data", () => {
    saveOfflineList(snapshot([item("a")]), NOW, storage);
    saveOfflineList({ ...snapshot([]), path: "/share/tok" }, NOW, storage);
    addSyncProblem("oops", NOW, storage);
    storage.setItem("something-else", "keep");
    clearOfflineLists(storage);
    expect(storage.length).toBe(1);
    expect(storage.getItem("something-else")).toBe("keep");
  });

  it("does nothing without storage (server / blocked)", () => {
    expect(() => clearOfflineLists(null)).not.toThrow();
    expect(getOfflineList(PATH, null)).toBeNull();
    expect(listOfflineLists(null)).toEqual([]);
  });
});

describe("sync problems", () => {
  it("keeps the newest first and clears them", () => {
    addSyncProblem("first", NOW, storage);
    addSyncProblem("second", NOW, storage);
    expect(getSyncProblems(storage).map((p) => p.message)).toEqual(["second", "first"]);
    clearSyncProblems(storage);
    expect(getSyncProblems(storage)).toEqual([]);
  });

  it("keeps at most 20", () => {
    for (let i = 0; i < 25; i++) addSyncProblem(`p${i}`, NOW, storage);
    expect(getSyncProblems(storage)).toHaveLength(20);
  });

  it("treats malformed data as none", () => {
    storage.setItem("listy:offline:#problems", "{");
    expect(getSyncProblems(storage)).toEqual([]);
    storage.setItem("listy:offline:#problems", JSON.stringify([{ id: 1 }, { id: "a", message: "ok", at: "x" }]));
    expect(getSyncProblems(storage).map((p) => p.message)).toEqual(["ok"]);
  });
});

describe("claimOfflineData", () => {
  it("keeps the same user's data", () => {
    claimOfflineData("u1", storage);
    saveOfflineList(snapshot([item("a")]), NOW, storage);
    claimOfflineData("u1", storage);
    expect(getOfflineList(PATH, storage)).not.toBeNull();
  });

  it("wipes another user's data", () => {
    claimOfflineData("u1", storage);
    saveOfflineList(snapshot([item("a")]), NOW, storage);
    claimOfflineData("u2", storage);
    expect(getOfflineList(PATH, storage)).toBeNull();
  });

  it("keeps data saved before anyone claimed it (e.g. a guest's share-link list)", () => {
    saveOfflineList({ ...snapshot([]), path: "/share/tok" }, NOW, storage);
    claimOfflineData("u1", storage);
    expect(getOfflineList("/share/tok", storage)).not.toBeNull();
  });
});

describe("parseOfflineList", () => {
  const valid = () => ({
    ...snapshot([item("a")]),
    savedAt: NOW.toISOString(),
    created: false,
    syncError: null,
    changes: { ticks: { a: DONE }, edits: {}, deleted: [], added: [] },
  });

  it("accepts a valid copy", () => {
    expect(parseOfflineList(JSON.stringify(valid()))?.changes.ticks).toEqual({ a: DONE });
  });

  it("upgrades a copy from the tick-only version", () => {
    // The old format had no changes, canEdit, created or syncError.
    const old = { ...snapshot([item("a")]), canEdit: undefined, savedAt: NOW.toISOString(), pending: { a: true } };
    const list = parseOfflineList(JSON.stringify(old));
    expect(list?.changes).toEqual({ ticks: { a: DONE }, edits: {}, deleted: [], added: [] });
    expect(list?.canEdit).toBe(false);
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
    ["old pending with a non-boolean", JSON.stringify({ ...valid(), changes: undefined, pending: { a: "yes" } })],
    ["no changes at all", JSON.stringify({ ...valid(), changes: undefined })],
    ["a tick that isn't an object", JSON.stringify({ ...valid(), changes: { ...valid().changes, ticks: { a: true } } })],
    ["an edit with a bad field", JSON.stringify({ ...valid(), changes: { ...valid().changes, edits: { a: fields("x", { price: "5" as unknown as number }) } } })],
    ["deleted ids not strings", JSON.stringify({ ...valid(), changes: { ...valid().changes, deleted: [1] } })],
    ["missing savedAt", JSON.stringify({ ...valid(), savedAt: undefined })],
  ])("rejects %s", (_label, raw) => {
    expect(parseOfflineList(raw)).toBeNull();
  });
});
