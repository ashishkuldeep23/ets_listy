import { beforeEach, describe, expect, it } from "vitest";
import { dropFolderChange, getFolderChanges, queueFolderChange, withFolderChange } from "@/lib/offlineFolders";
import { clearOfflineLists } from "@/lib/offlineLists";
import { MemoryStorage } from "@/test/memoryStorage";

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
});

describe("queueFolderChange / getFolderChanges", () => {
  it("merges changes to the same folder", () => {
    queueFolderChange("f1", { name: "Market" }, storage);
    queueFolderChange("f1", { status: "completed" }, storage);
    queueFolderChange("f2", { status: "pending" }, storage);
    expect(getFolderChanges(storage)).toEqual({
      f1: { name: "Market", status: "completed" },
      f2: { status: "pending" },
    });
  });

  it("lets a delete replace everything", () => {
    queueFolderChange("f1", { name: "Market" }, storage);
    queueFolderChange("f1", { deleted: true }, storage);
    expect(getFolderChanges(storage)).toEqual({ f1: { deleted: true } });
  });

  it("skips malformed entries and bad JSON", () => {
    storage.setItem("listy:offline:#folders", JSON.stringify({ a: { status: "lost" }, b: { name: 3 }, c: { name: "ok" } }));
    expect(getFolderChanges(storage)).toEqual({ c: { name: "ok" } });
    storage.setItem("listy:offline:#folders", "{");
    expect(getFolderChanges(storage)).toEqual({});
    expect(getFolderChanges(null)).toEqual({});
  });

  it("is cleared on logout with the offline lists", () => {
    queueFolderChange("f1", { name: "Market" }, storage);
    clearOfflineLists(storage);
    expect(getFolderChanges(storage)).toEqual({});
  });
});

describe("dropFolderChange", () => {
  it("drops the change that was sent", () => {
    queueFolderChange("f1", { name: "Market" }, storage);
    dropFolderChange("f1", { name: "Market" }, storage);
    expect(getFolderChanges(storage)).toEqual({});
  });

  it("keeps a newer change made while it was sent", () => {
    queueFolderChange("f1", { name: "Market" }, storage);
    queueFolderChange("f1", { name: "Bazaar" }, storage);
    dropFolderChange("f1", { name: "Market" }, storage);
    expect(getFolderChanges(storage)).toEqual({ f1: { name: "Bazaar" } });
  });
});

describe("withFolderChange", () => {
  const folder = { id: "f1", name: "Old", status: "active" as const };

  it("applies name and status", () => {
    expect(withFolderChange(folder, { name: "New", status: "pending" })).toEqual({ id: "f1", name: "New", status: "pending" });
  });

  it("returns the folder as is without a change", () => {
    expect(withFolderChange(folder, undefined)).toBe(folder);
  });
});
