import { beforeEach, describe, expect, it } from "vitest";
import { getCachedFolders, getCachedSavedItems, saveCachedFolders, saveCachedSavedItems } from "@/lib/offlineHome";
import { clearOfflineLists } from "@/lib/offlineLists";
import { MemoryStorage } from "@/test/memoryStorage";
import type { FolderSummaryDTO } from "@/types";

const folder = (id: string): FolderSummaryDTO => ({
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
  itemCount: 3,
  doneCount: 1,
});

const NOW = new Date("2026-10-11T10:00:00.000Z");
let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
});

describe("saveCachedFolders / getCachedFolders", () => {
  it("keeps each tab separately", () => {
    saveCachedFolders("mine", [folder("a")], NOW, storage);
    saveCachedFolders("shared", [folder("b")], NOW, storage);
    expect(getCachedFolders("mine", storage)).toEqual({ folders: [folder("a")], savedAt: NOW.toISOString() });
    expect(getCachedFolders("shared", storage)?.folders.map((f) => f.id)).toEqual(["b"]);
  });

  it("returns null when nothing was saved, or without storage", () => {
    expect(getCachedFolders("mine", storage)).toBeNull();
    expect(getCachedFolders("mine", null)).toBeNull();
    expect(() => saveCachedFolders("mine", [], NOW, null)).not.toThrow();
  });

  it.each([
    ["bad JSON", "{"],
    ["no folders", JSON.stringify({ savedAt: "x" })],
    ["a folder without counts", JSON.stringify({ savedAt: "x", folders: [{ ...folder("a"), itemCount: "3" }] })],
    ["an unknown status", JSON.stringify({ savedAt: "x", folders: [{ ...folder("a"), status: "lost" }] })],
  ])("treats %s as nothing saved", (_label, raw) => {
    storage.setItem("listy:offline:#home-mine", raw);
    expect(getCachedFolders("mine", storage)).toBeNull();
  });

  it("is cleared on logout with the offline lists", () => {
    saveCachedFolders("mine", [folder("a")], NOW, storage);
    clearOfflineLists(storage);
    expect(getCachedFolders("mine", storage)).toBeNull();
  });
});

describe("saveCachedSavedItems / getCachedSavedItems", () => {
  const saved = (id: string, name: string) => ({
    id,
    name,
    category: null,
    price: null,
    priceUnit: null,
    quantity: null,
    description: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  it("searches names like the server does (contains, any case)", () => {
    saveCachedSavedItems([saved("1", "Milk"), saved("2", "Oat milk"), saved("3", "Bread")], storage);
    expect(getCachedSavedItems(" MILK ", storage)?.map((s) => s.id)).toEqual(["1", "2"]);
    expect(getCachedSavedItems("", storage)).toHaveLength(3);
  });

  it("returns null when never loaded or malformed, and skips bad entries", () => {
    expect(getCachedSavedItems("", storage)).toBeNull();
    storage.setItem("listy:offline:#saved-items", "{");
    expect(getCachedSavedItems("", storage)).toBeNull();
    storage.setItem("listy:offline:#saved-items", JSON.stringify([{ id: 1 }, saved("1", "Milk")]));
    expect(getCachedSavedItems("", storage)?.map((s) => s.name)).toEqual(["Milk"]);
  });
});
