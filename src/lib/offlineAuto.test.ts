import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAutoSaveOn, refreshAllOffline, setAutoSave } from "@/lib/offlineAuto";
import { getCachedFolders, getCachedSavedItems } from "@/lib/offlineHome";
import { getOfflineList, saveOfflineList, setOfflineTick } from "@/lib/offlineLists";
import { fakeServer, noNetwork, stubBrowser, type FakeCall } from "@/test/fakeBrowser";
import type { FolderSummaryDTO, ItemDTO } from "@/types";

vi.mock("@/lib/pusherClient", () => ({ getSocketId: () => undefined }));

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
  doneBy: null,
  doneAt: null,
  notFound: false,
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const card = (id: string, extra: Partial<FolderSummaryDTO> = {}): FolderSummaryDTO => ({
  id,
  name: `List ${id}`,
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  role: "owner",
  canCheck: true,
  canEdit: true,
  canManage: true,
  sharedBy: null,
  itemCount: 1,
  doneCount: 0,
  ...extra,
});

const NOW = new Date("2026-10-11T10:00:00.000Z");
const counts = { all: 0, active: 0, pending: 0, completed: 0 };

/** A server with my lists `mine`, shared lists `shared`, each holding one item. */
function server(mine: FolderSummaryDTO[], shared: FolderSummaryDTO[] = []): FakeCall[] {
  return fakeServer(({ url }) => {
    if (url === "/api/folders?scope=mine") return [200, { folders: mine, counts }];
    if (url === "/api/folders?scope=shared") return [200, { folders: shared, counts }];
    if (url === "/api/saved-items") return [200, { savedItems: [{ id: "s1", name: "Milk", category: null, price: null }] }];
    const id = /^\/api\/folders\/([^/]+)\/items$/.exec(url)?.[1];
    if (id) return [200, { items: [item("a")], total: 1, done: 0, groups: [] }];
    return [500, {}];
  });
}

const itemFetches = (calls: FakeCall[]) => calls.filter((c) => c.url.endsWith("/items")).map((c) => c.url);

beforeEach(() => {
  stubBrowser();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("refreshAllOffline", () => {
  it("saves a copy of every list, plus the home cards and saved items", async () => {
    const calls = server([card("f1")], [card("f2", { role: "shared", canEdit: false, canCheck: false, canManage: false })]);
    await refreshAllOffline(NOW);

    expect(itemFetches(calls)).toEqual(["/api/folders/f1/items", "/api/folders/f2/items"]);
    expect(getOfflineList("/folders/f1")).toMatchObject({ auto: true, canEdit: true, toggleBase: "/api/folders/f1/items" });
    // A view-only list: ticks stay on this device.
    expect(getOfflineList("/folders/f2")).toMatchObject({ auto: true, canEdit: false, toggleBase: null });
    expect(getCachedFolders("mine")?.folders.map((f) => f.id)).toEqual(["f1"]);
    expect(getCachedSavedItems("mi")?.map((s) => s.name)).toEqual(["Milk"]);
  });

  it("runs at most every five minutes", async () => {
    const calls = server([card("f1")]);
    await refreshAllOffline(NOW);
    const before = calls.length;
    await refreshAllOffline(new Date(NOW.getTime() + 60_000));
    expect(calls.length).toBe(before);
  });

  it("skips copies that look up to date, refreshes ones whose counts changed", async () => {
    saveOfflineList({ path: "/folders/f1", name: "List f1", status: "active", items: [item("a")], toggleBase: null, canEdit: true }, NOW);
    saveOfflineList({ path: "/folders/f2", name: "List f2", status: "active", items: [item("a")], toggleBase: null, canEdit: true }, NOW);
    const calls = server([card("f1"), card("f2", { doneCount: 1 })]);
    await refreshAllOffline(NOW);
    expect(itemFetches(calls)).toEqual(["/api/folders/f2/items"]);
    // Saved by hand: stays that way.
    expect(getOfflineList("/folders/f2")?.auto).toBe(false);
  });

  it("drops automatic copies of lists I no longer have, unless changes still wait", async () => {
    saveOfflineList({ path: "/folders/gone", name: "Gone", status: "active", items: [], toggleBase: "x", canEdit: true, auto: true }, NOW);
    saveOfflineList({ path: "/folders/busy", name: "Busy", status: "active", items: [item("a")], toggleBase: "x", canEdit: true, auto: true }, NOW);
    setOfflineTick("/folders/busy", "a", { done: true, notFound: false });
    saveOfflineList({ path: "/folders/mine", name: "Mine", status: "active", items: [], toggleBase: "x", canEdit: true }, NOW);
    server([]);
    await refreshAllOffline(NOW);
    expect(getOfflineList("/folders/gone")).toBeNull();
    expect(getOfflineList("/folders/busy")).not.toBeNull();
    expect(getOfflineList("/folders/mine")).not.toBeNull();
  });

  it("does nothing when turned off", async () => {
    setAutoSave(false);
    const calls = server([card("f1")]);
    await refreshAllOffline(NOW);
    expect(calls).toEqual([]);
  });

  it("when turned off, drops an automatic copy once its queued changes are sent", async () => {
    setAutoSave(false);
    const snapshot = { name: "B", status: "active", items: [item("i")], toggleBase: "x", canEdit: true, auto: true } as const;
    saveOfflineList({ ...snapshot, path: "/folders/b", items: [item("i")] }, NOW);
    setOfflineTick("/folders/b", "i", { done: true, notFound: false });
    await refreshAllOffline(NOW);
    expect(getOfflineList("/folders/b")).not.toBeNull();

    setOfflineTick("/folders/b", "i", { done: false, notFound: false });
    await refreshAllOffline(NOW);
    expect(getOfflineList("/folders/b")).toBeNull();
  });

  it("doesn't overwrite a copy with changes still queued", async () => {
    saveOfflineList({ path: "/folders/f1", name: "A", status: "active", items: [item("a")], toggleBase: "x", canEdit: true }, new Date(0));
    setOfflineTick("/folders/f1", "a", { done: true, notFound: false });
    server([card("f1")]);
    await refreshAllOffline(NOW);
    expect(getOfflineList("/folders/f1")?.savedAt).toBe(new Date(0).toISOString());
    expect(getOfflineList("/folders/f1")?.changes.ticks.a).toEqual({ done: true, notFound: false });
  });

  it("never throws with no network", async () => {
    fakeServer(noNetwork);
    await expect(refreshAllOffline(NOW)).resolves.toBeUndefined();
  });
});

describe("setAutoSave", () => {
  it("is on by default", () => {
    expect(isAutoSaveOn()).toBe(true);
  });

  it("turning off removes automatic copies without pending changes, keeps the rest", () => {
    saveOfflineList({ path: "/folders/a", name: "A", status: "active", items: [], toggleBase: "x", canEdit: true, auto: true }, NOW);
    saveOfflineList({ path: "/folders/b", name: "B", status: "active", items: [item("i")], toggleBase: "x", canEdit: true, auto: true }, NOW);
    setOfflineTick("/folders/b", "i", { done: true, notFound: false });
    saveOfflineList({ path: "/folders/c", name: "C", status: "active", items: [], toggleBase: "x", canEdit: true }, NOW);
    setAutoSave(false);
    expect(isAutoSaveOn()).toBe(false);
    expect(getOfflineList("/folders/a")).toBeNull();
    expect(getOfflineList("/folders/b")).not.toBeNull();
    expect(getOfflineList("/folders/c")).not.toBeNull();
  });
});
