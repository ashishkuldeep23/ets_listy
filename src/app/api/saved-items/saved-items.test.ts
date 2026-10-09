import { describe, it, expect } from "vitest";
import { createUserAndCookie, json, makeRequest, routeCtx, setupTestDb } from "@/test/setup";
import { POST as createFolder } from "@/app/api/folders/route";
import { POST as createItem } from "@/app/api/folders/[id]/items/route";
import { GET as listSaved, POST as createSaved } from "@/app/api/saved-items/route";
import { PATCH as updateSaved, DELETE as deleteSaved } from "@/app/api/saved-items/[id]/route";
import { LIMITS } from "@/lib/limits";
import { escapeRegex } from "@/lib/savedItems";
import { SavedItem, savedItemKeys } from "@/models/SavedItem";
import type { FolderDTO, ItemDTO, SavedItemDTO, SavedItemListResponse } from "@/types";

setupTestDb();

const saved = {
  list: async (cookie: string, q?: string) =>
    json<SavedItemListResponse>(
      await listSaved(makeRequest(`/api/saved-items${q !== undefined ? `?q=${encodeURIComponent(q)}` : ""}`, { cookie }))
    ),
  create: (cookie: string, body: unknown) => createSaved(makeRequest("/api/saved-items", { method: "POST", body, cookie })),
  update: (cookie: string, id: string, body: unknown) =>
    updateSaved(makeRequest(`/api/saved-items/${id}`, { method: "PATCH", body, cookie }), routeCtx({ id })),
  remove: (cookie: string, id: string) =>
    deleteSaved(makeRequest(`/api/saved-items/${id}`, { method: "DELETE", cookie }), routeCtx({ id })),
};

async function newFolder(cookie: string, name = "Market") {
  return json<FolderDTO>(await createFolder(makeRequest("/api/folders", { method: "POST", body: { name }, cookie })));
}
const addItem = (cookie: string, folderId: string, body: unknown) =>
  createItem(makeRequest(`/api/folders/${folderId}/items`, { method: "POST", body, cookie }), routeCtx({ id: folderId }));

describe("save to profile from a folder", () => {
  it("creates a saved item when saveToProfile is true, without the group", async () => {
    const { cookie } = await createUserAndCookie();
    const folder = await newFolder(cookie);

    const res = await addItem(cookie, folder.id, { name: "Milk", category: "Dairy", price: 60, group: "Morning", saveToProfile: true });
    expect(res.status).toBe(201);
    expect((await json<ItemDTO>(res)).group).toBe("Morning");

    const { savedItems } = await saved.list(cookie);
    expect(savedItems).toHaveLength(1);
    expect(savedItems[0]).toMatchObject({ name: "Milk", category: "Dairy", price: 60 });
    expect(savedItems[0]).not.toHaveProperty("group");
  });

  it("doesn't save when the flag is off", async () => {
    const { cookie } = await createUserAndCookie();
    const folder = await newFolder(cookie);
    await addItem(cookie, folder.id, { name: "Milk" });
    expect((await saved.list(cookie)).savedItems).toHaveLength(0);
  });

  it("saving the same name + category twice (any case) updates instead of duplicating", async () => {
    const { cookie } = await createUserAndCookie();
    // Separate folders: one folder can't hold two items with the same name.
    const [oct, nov, dec] = [await newFolder(cookie, "Oct"), await newFolder(cookie, "Nov"), await newFolder(cookie, "Dec")];
    await addItem(cookie, oct.id, { name: "Milk", category: "Dairy", price: 60, saveToProfile: true });
    await addItem(cookie, nov.id, { name: "MILK", category: "dairy", price: 65, saveToProfile: true });
    // Different category = different saved item.
    await addItem(cookie, dec.id, { name: "Milk", category: "Tea stall", saveToProfile: true });

    const { savedItems } = await saved.list(cookie);
    expect(savedItems).toHaveLength(2);
    expect(savedItems.find((s) => s.category?.toLowerCase() === "dairy")).toMatchObject({ name: "MILK", price: 65 });
  });

  it("fails cleanly (400, no item created) when the library is full", async () => {
    const { user, cookie } = await createUserAndCookie();
    const folder = await newFolder(cookie);
    await SavedItem.insertMany(
      Array.from({ length: LIMITS.SAVED_ITEMS_PER_USER }, (_, i) => ({ owner: user.id, name: `S${i}`, ...savedItemKeys(`S${i}`, null) }))
    );
    expect((await addItem(cookie, folder.id, { name: "New one", saveToProfile: true })).status).toBe(400);
    // An existing saved item can still be updated.
    expect((await addItem(cookie, folder.id, { name: "S1", saveToProfile: true })).status).toBe(201);
  });
});

describe("saved items API", () => {
  it("creates, lists newest first, edits and deletes", async () => {
    const { cookie } = await createUserAndCookie();
    const milk = await json<SavedItemDTO>(await saved.create(cookie, { name: "Milk", price: 60 }));
    await new Promise((r) => setTimeout(r, 5));
    await saved.create(cookie, { name: "Bread" });

    expect((await saved.list(cookie)).savedItems.map((s) => s.name)).toEqual(["Bread", "Milk"]);

    const edited = await saved.update(cookie, milk.id, { price: null, description: "Toned" });
    expect(await json<SavedItemDTO>(edited)).toMatchObject({ name: "Milk", price: null, description: "Toned" });

    expect((await saved.remove(cookie, milk.id)).status).toBe(204);
    expect((await saved.list(cookie)).savedItems.map((s) => s.name)).toEqual(["Bread"]);
  });

  it("renaming into an existing name + category is a 409", async () => {
    const { cookie } = await createUserAndCookie();
    const milk = await json<SavedItemDTO>(await saved.create(cookie, { name: "Milk" }));
    await saved.create(cookie, { name: "Bread" });
    expect((await saved.update(cookie, milk.id, { name: "bread" })).status).toBe(409);
  });

  it("searches by name, case-insensitive, treating special characters literally", async () => {
    const { cookie } = await createUserAndCookie();
    await saved.create(cookie, { name: "Toned Milk" });
    await saved.create(cookie, { name: "Bread" });
    await saved.create(cookie, { name: "Odd (item) .*" });

    expect((await saved.list(cookie, "MILK")).savedItems.map((s) => s.name)).toEqual(["Toned Milk"]);
    expect((await saved.list(cookie, ".*(")).savedItems).toEqual([]);
    expect((await saved.list(cookie, "(item) .*")).savedItems.map((s) => s.name)).toEqual(["Odd (item) .*"]);
    expect((await saved.list(cookie, "   ")).savedItems).toHaveLength(3);
  });

  it("keeps saved items private (404 for other users, never listed)", async () => {
    const a = await createUserAndCookie({ email: "a@example.com" });
    const b = await createUserAndCookie({ email: "b@example.com" });
    const milk = await json<SavedItemDTO>(await saved.create(a.cookie, { name: "Milk" }));

    expect((await saved.list(b.cookie)).savedItems).toEqual([]);
    expect((await saved.update(b.cookie, milk.id, { name: "Hacked" })).status).toBe(404);
    expect((await saved.remove(b.cookie, milk.id)).status).toBe(404);
    expect((await SavedItem.findById(milk.id).lean())?.name).toBe("Milk");
  });

  it("validates input and requires login", async () => {
    const { cookie } = await createUserAndCookie();
    expect((await saved.create(cookie, { name: "" })).status).toBe(400);
    expect((await saved.create(cookie, { name: "A", price: "10" })).status).toBe(400);
    expect((await saved.update(cookie, "bad-id", { name: "X" })).status).toBe(404);
    expect((await listSaved(makeRequest("/api/saved-items"))).status).toBe(401);
  });

  it("enforces the per-user limit on direct creates", async () => {
    const { user, cookie } = await createUserAndCookie();
    await SavedItem.insertMany(
      Array.from({ length: LIMITS.SAVED_ITEMS_PER_USER }, (_, i) => ({ owner: user.id, name: `S${i}`, ...savedItemKeys(`S${i}`, null) }))
    );
    expect((await saved.create(cookie, { name: "New" })).status).toBe(400);
  });
});

describe("escapeRegex", () => {
  it("escapes every special character", () => {
    const special = ".*+?^${}()|[]\\";
    expect(new RegExp(escapeRegex(special)).test(special)).toBe(true);
    expect(new RegExp(`^${escapeRegex(".*")}$`).test("anything")).toBe(false);
  });
});
