import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addOfflineItem,
  createOfflineList,
  deleteOfflineItem,
  editOfflineItem,
  getOfflineList,
  getSyncProblems,
  listOfflineLists,
  pendingCount,
  saveOfflineList,
  setOfflineTick,
  updateOfflineListInfo,
  type OfflineItemFields,
} from "@/lib/offlineLists";
import { getFolderChanges, queueFolderChange } from "@/lib/offlineFolders";
import { hasChangesToSync, pendingChangeCount, syncAllOffline } from "@/lib/offlineSync";
import { fakeServer, noNetwork, stubBrowser } from "@/test/fakeBrowser";
import type { ItemDTO } from "@/types";

// No live updates in these tests.
vi.mock("@/lib/pusherClient", () => ({ getSocketId: () => undefined }));

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

const fields = (name: string): OfflineItemFields => ({
  name,
  category: null,
  price: null,
  priceUnit: null,
  quantity: null,
  description: null,
  group: null,
});

const PATH = "/folders/f1";
const BASE = "/api/folders/f1/items";
let synced: unknown[];

beforeEach(() => {
  synced = stubBrowser().events;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const saved = (items: ItemDTO[], canEdit = true) =>
  saveOfflineList({ path: PATH, name: "Groceries", status: "active", items, toggleBase: BASE, canEdit });

describe("syncAllOffline: a list made offline", () => {
  it("creates the list, then its items and ticks, and moves the copy to its real path", async () => {
    const list = createOfflineList("Market");
    addOfflineItem(list.path, fields("Milk"));
    const localId = getOfflineList(list.path)?.changes.added[0]?.id ?? "";
    setOfflineTick(list.path, localId, { done: true, notFound: false });

    const calls = fakeServer(({ method, url }) => {
      if (method === "POST" && url === "/api/folders") return [201, { id: "new1", name: "Market", status: "active" }];
      if (method === "POST" && url === "/api/folders/new1/items") return [201, item("i1", { folderId: "new1", name: "Milk" })];
      if (url === "/api/folders/new1/items/i1/toggle") return [200, item("i1", { folderId: "new1", name: "Milk", done: true })];
      return [500, {}];
    });
    await syncAllOffline(true);

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/folders",
      "POST /api/folders/new1/items",
      "POST /api/folders/new1/items/i1/toggle",
    ]);
    expect(calls[0]?.body).toEqual({ name: "Market" });
    expect(calls[2]?.body).toEqual({ done: true });
    expect(getOfflineList(list.path)).toBeNull();
    const moved = getOfflineList("/folders/new1");
    expect(moved).toMatchObject({ created: false, toggleBase: "/api/folders/new1/items" });
    expect(moved && pendingCount(moved)).toBe(0);
    expect(moved?.items.map((i) => i.id)).toEqual(["i1"]);
    expect(synced).toContainEqual({ path: "/folders/new1", from: list.path });
  });

  it("sends a status picked offline along", async () => {
    const list = createOfflineList("Market");
    updateOfflineListInfo(list.path, { status: "pending" });
    const calls = fakeServer(() => [201, { id: "new1", name: "Market", status: "pending" }]);
    await syncAllOffline(true);
    expect(calls[0]?.body).toEqual({ name: "Market", status: "pending" });
  });

  it("adds a number when the name was taken meanwhile, and says so", async () => {
    createOfflineList("Market");
    const calls = fakeServer(({ body }) =>
      (body as { name: string }).name === "Market" ? [409, { error: "taken" }] : [201, { id: "new1", name: "Market (2)" }]
    );
    await syncAllOffline(true);
    expect(calls.map((c) => c.body)).toEqual([{ name: "Market" }, { name: "Market (2)" }]);
    expect(getOfflineList("/folders/new1")?.name).toBe("Market (2)");
    expect(getSyncProblems()[0]?.message).toContain('saved as "Market (2)"');
  });

  it("keeps the list with the reason when the server refuses it", async () => {
    const list = createOfflineList("Market");
    fakeServer(() => [400, { error: "You can have at most 200 lists" }]);
    await syncAllOffline(true);
    expect(getOfflineList(list.path)).toMatchObject({ created: true, syncError: "You can have at most 200 lists" });
  });

  it("waits for a login", async () => {
    createOfflineList("Market");
    const calls = fakeServer(() => [500, {}]);
    expect(hasChangesToSync(false)).toBe(false);
    await syncAllOffline(false);
    expect(calls).toEqual([]);
  });
});

describe("syncAllOffline: folder changes made on the home page", () => {
  it("sends a rename / status change and mirrors it on the copy", async () => {
    saved([item("a")]);
    queueFolderChange("f1", { name: "Market", status: "pending" });
    expect(pendingChangeCount()).toBe(1);
    const calls = fakeServer(() => [200, { id: "f1", name: "Market", status: "pending" }]);
    await syncAllOffline(true);
    expect(calls).toEqual([{ method: "PATCH", url: "/api/folders/f1", body: { name: "Market", status: "pending" } }]);
    expect(getOfflineList(PATH)).toMatchObject({ name: "Market", status: "pending" });
    expect(getFolderChanges()).toEqual({});
    expect(synced).toContainEqual({ path: PATH });
  });

  it("deletes a folder first, then has nothing left to send for it", async () => {
    saved([item("a")]);
    setOfflineTick(PATH, "a", { done: true, notFound: false });
    queueFolderChange("f1", { deleted: true });
    const calls = fakeServer(() => [204, null]);
    await syncAllOffline(true);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["DELETE /api/folders/f1"]);
    expect(getOfflineList(PATH)).toBeNull();
    expect(pendingChangeCount()).toBe(0);
  });

  it("reports a rename the server refuses, and is fine with deleting a folder that is gone", async () => {
    queueFolderChange("f1", { name: "Taken" });
    queueFolderChange("f2", { deleted: true });
    fakeServer(({ method }) => (method === "PATCH" ? [409, { error: 'A list named "Taken" already exists' }] : [404, { error: "Folder not found" }]));
    await syncAllOffline(true);
    expect(getFolderChanges()).toEqual({});
    expect(getSyncProblems().map((p) => p.message)).toEqual([`Couldn't change "Taken": A list named "Taken" already exists`]);
  });

  it("keeps them for later with no network, and needs a login", async () => {
    queueFolderChange("f1", { name: "Market" });
    expect(hasChangesToSync(false)).toBe(false);
    fakeServer(noNetwork);
    await syncAllOffline(true);
    expect(getFolderChanges()).toEqual({ f1: { name: "Market" } });
  });
});

describe("syncAllOffline: changes to a saved list", () => {
  it("sends edits, ticks and deletes, and updates the copy", async () => {
    saved([item("a"), item("b"), item("c")]);
    editOfflineItem(PATH, "a", fields("Apples"));
    setOfflineTick(PATH, "b", { done: true, notFound: true });
    deleteOfflineItem(PATH, "c");

    const calls = fakeServer(({ method, url }) => {
      if (method === "PATCH") return [200, item("a", { name: "Apples" })];
      if (url.endsWith("/toggle")) return [200, item("b", { done: true, notFound: true })];
      if (method === "DELETE") return [204, null];
      return [500, {}];
    });
    await syncAllOffline(true);

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `PATCH ${BASE}/a`,
      `POST ${BASE}/b/toggle`,
      `DELETE ${BASE}/c`,
    ]);
    expect(calls[0]?.body).toEqual(fields("Apples"));
    expect(calls[1]?.body).toEqual({ done: true, notFound: true });
    const list = getOfflineList(PATH);
    expect(list && pendingCount(list)).toBe(0);
    expect(list?.items.map((i) => i.name)).toEqual(["Apples", "Item b"]);
    expect(synced).toEqual([{ path: PATH }]);
  });

  it("drops a change the server refuses for good and reports it", async () => {
    saved([item("a"), item("b")]);
    editOfflineItem(PATH, "a", fields("Apples"));
    deleteOfflineItem(PATH, "b");
    fakeServer(({ method }) => (method === "PATCH" ? [403, { error: "You can't edit items in this list" }] : [404, { error: "Item not found" }]));
    await syncAllOffline(true);

    const list = getOfflineList(PATH);
    expect(list && pendingCount(list)).toBe(0);
    // The delete of an item someone else already deleted is no problem.
    expect(getSyncProblems().map((p) => p.message)).toEqual([
      `Couldn't save your edit of "Apples" in "Groceries": You can't edit items in this list`,
    ]);
  });

  it("reports an item that couldn't be added (e.g. its name is taken by now)", async () => {
    saved([]);
    addOfflineItem(PATH, fields("Milk"));
    fakeServer(() => [409, { error: 'An item named "Milk" already exists in this list' }]);
    await syncAllOffline(true);
    expect(getOfflineList(PATH)?.changes.added).toEqual([]);
    expect(getSyncProblems()[0]?.message).toContain(`Couldn't add "Milk"`);
  });

  it("keeps everything for later when the network or login fails", async () => {
    saved([item("a")]);
    setOfflineTick(PATH, "a", { done: true, notFound: false });
    addOfflineItem(PATH, fields("Milk"));
    fakeServer(noNetwork);
    await syncAllOffline(true);
    fakeServer(() => [401, { error: "Please log in" }]);
    await syncAllOffline(true);

    const list = getOfflineList(PATH);
    expect(list && pendingCount(list)).toBe(2);
    expect(getSyncProblems()).toEqual([]);
    expect(synced).toEqual([]);
  });

  it("logged out: sends share-link ticks only", async () => {
    saved([item("a")]);
    setOfflineTick(PATH, "a", { done: true, notFound: false });
    saveOfflineList({ path: "/share/tok", name: "Shared", status: "active", items: [item("s")], toggleBase: "/api/share/tok/items", canEdit: false });
    setOfflineTick("/share/tok", "s", { done: true, notFound: false });

    const calls = fakeServer(() => [200, item("s", { done: true })]);
    await syncAllOffline(false);
    expect(calls.map((c) => c.url)).toEqual(["/api/share/tok/items/s/toggle"]);
    expect(listOfflineLists().map((l) => [l.path, pendingCount(l)])).toEqual(
      expect.arrayContaining([
        [PATH, 1],
        ["/share/tok", 0],
      ])
    );
  });

  it("keeps ticks of a list I may not tick on this device only", async () => {
    saveOfflineList({ path: PATH, name: "View only", status: "active", items: [item("a")], toggleBase: null, canEdit: false });
    setOfflineTick(PATH, "a", { done: true, notFound: false });
    const calls = fakeServer(() => [500, {}]);
    expect(hasChangesToSync(true)).toBe(false);
    await syncAllOffline(true);
    expect(calls).toEqual([]);
  });
});
