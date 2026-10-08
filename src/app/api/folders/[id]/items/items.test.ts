import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { createUserAndCookie, json, makeRequest, routeCtx, setupTestDb } from "@/test/setup";
import { GET as listFolders, POST as createFolder } from "@/app/api/folders/route";
import { DELETE as deleteFolder } from "@/app/api/folders/[id]/route";
import { GET as listItems, POST as createItem } from "@/app/api/folders/[id]/items/route";
import { PATCH as updateItem, DELETE as deleteItem } from "@/app/api/folders/[id]/items/[itemId]/route";
import { POST as toggleItem } from "@/app/api/folders/[id]/items/[itemId]/toggle/route";
import { LIMITS } from "@/lib/limits";
import { Item } from "@/models/Item";
import type { FolderDTO, FolderListResponse, ItemDTO, ItemListResponse } from "@/types";

setupTestDb();

async function newFolder(cookie: string, name = "Market") {
  return json<FolderDTO>(await createFolder(makeRequest("/api/folders", { method: "POST", body: { name }, cookie })));
}

const items = {
  list: (cookie: string, folderId: string) =>
    listItems(makeRequest(`/api/folders/${folderId}/items`, { cookie }), routeCtx({ id: folderId })),
  create: (cookie: string, folderId: string, body: unknown) =>
    createItem(makeRequest(`/api/folders/${folderId}/items`, { method: "POST", body, cookie }), routeCtx({ id: folderId })),
  update: (cookie: string, folderId: string, itemId: string, body: unknown) =>
    updateItem(
      makeRequest(`/api/folders/${folderId}/items/${itemId}`, { method: "PATCH", body, cookie }),
      routeCtx({ id: folderId, itemId })
    ),
  toggle: (cookie: string, folderId: string, itemId: string, done: unknown) =>
    toggleItem(
      makeRequest(`/api/folders/${folderId}/items/${itemId}/toggle`, { method: "POST", body: { done }, cookie }),
      routeCtx({ id: folderId, itemId })
    ),
  remove: (cookie: string, folderId: string, itemId: string) =>
    deleteItem(
      makeRequest(`/api/folders/${folderId}/items/${itemId}`, { method: "DELETE", cookie }),
      routeCtx({ id: folderId, itemId })
    ),
};

describe("items API", () => {
  it("creates items in order with optional fields, and lists them with counts", async () => {
    const { cookie } = await createUserAndCookie();
    const folder = await newFolder(cookie);

    const r1 = await items.create(cookie, folder.id, {
      name: " Milk ",
      category: "Dairy",
      price: 60,
      description: "Toned, 1L",
    });
    expect(r1.status).toBe(201);
    expect(await json<ItemDTO>(r1)).toMatchObject({
      name: "Milk",
      category: "Dairy",
      price: 60,
      description: "Toned, 1L",
      done: false,
      doneBy: null,
      position: 0,
      folderId: folder.id,
    });

    const bread = await json<ItemDTO>(await items.create(cookie, folder.id, { name: "Bread", category: "" }));
    expect(bread).toMatchObject({ position: 1, category: null, price: null, description: null });

    const list = await json<ItemListResponse>(await items.list(cookie, folder.id));
    expect(list.items.map((i) => i.name)).toEqual(["Milk", "Bread"]);
    expect(list).toMatchObject({ total: 2, done: 0 });
  });

  it("edits fields and clears them with null", async () => {
    const { cookie } = await createUserAndCookie();
    const folder = await newFolder(cookie);
    const milk = await json<ItemDTO>(await items.create(cookie, folder.id, { name: "Milk", price: 60, category: "Dairy" }));

    const res = await items.update(cookie, folder.id, milk.id, { name: "Curd", price: null, description: "Fresh" });
    expect(res.status).toBe(200);
    expect(await json<ItemDTO>(res)).toMatchObject({ name: "Curd", price: null, category: "Dairy", description: "Fresh" });
  });

  it("ticks and unticks, recording who and when", async () => {
    const { user, cookie } = await createUserAndCookie({ name: "Asha" });
    const folder = await newFolder(cookie);
    const milk = await json<ItemDTO>(await items.create(cookie, folder.id, { name: "Milk" }));

    const ticked = await json<ItemDTO>(await items.toggle(cookie, folder.id, milk.id, true));
    expect(ticked.done).toBe(true);
    expect(ticked.doneBy).toEqual({ id: user.id, name: "Asha" });
    expect(ticked.doneAt).toBeTruthy();

    const counts = await json<ItemListResponse>(await items.list(cookie, folder.id));
    expect(counts).toMatchObject({ total: 1, done: 1 });

    const unticked = await json<ItemDTO>(await items.toggle(cookie, folder.id, milk.id, false));
    expect(unticked).toMatchObject({ done: false, doneBy: null, doneAt: null });

    expect((await items.toggle(cookie, folder.id, milk.id, "yes")).status).toBe(400);
  });

  it("deletes an item", async () => {
    const { cookie } = await createUserAndCookie();
    const folder = await newFolder(cookie);
    const milk = await json<ItemDTO>(await items.create(cookie, folder.id, { name: "Milk" }));

    expect((await items.remove(cookie, folder.id, milk.id)).status).toBe(204);
    expect((await items.remove(cookie, folder.id, milk.id)).status).toBe(404);
    expect(await Item.countDocuments()).toBe(0);
  });

  it("blocks other users from every item route (404)", async () => {
    const a = await createUserAndCookie({ email: "a@example.com" });
    const b = await createUserAndCookie({ email: "b@example.com" });
    const folder = await newFolder(a.cookie);
    const milk = await json<ItemDTO>(await items.create(a.cookie, folder.id, { name: "Milk" }));

    expect((await items.list(b.cookie, folder.id)).status).toBe(404);
    expect((await items.create(b.cookie, folder.id, { name: "Hack" })).status).toBe(404);
    expect((await items.update(b.cookie, folder.id, milk.id, { name: "Hack" })).status).toBe(404);
    expect((await items.toggle(b.cookie, folder.id, milk.id, true)).status).toBe(404);
    expect((await items.remove(b.cookie, folder.id, milk.id)).status).toBe(404);

    const stored = await Item.findById(milk.id).lean();
    expect(stored).toMatchObject({ name: "Milk", done: false });
  });

  it("won't touch an item through another folder's URL", async () => {
    const { cookie } = await createUserAndCookie();
    const folderA = await newFolder(cookie, "A");
    const folderB = await newFolder(cookie, "B");
    const milk = await json<ItemDTO>(await items.create(cookie, folderA.id, { name: "Milk" }));

    expect((await items.update(cookie, folderB.id, milk.id, { name: "X" })).status).toBe(404);
    expect((await items.toggle(cookie, folderB.id, milk.id, true)).status).toBe(404);
    expect((await items.remove(cookie, folderB.id, milk.id)).status).toBe(404);
    expect((await Item.findById(milk.id).lean())?.name).toBe("Milk");
  });

  it("returns 404 for bad item ids and 401 when logged out", async () => {
    const { cookie } = await createUserAndCookie();
    const folder = await newFolder(cookie);
    expect((await items.update(cookie, folder.id, "nope", { name: "X" })).status).toBe(404);
    expect((await items.toggle(cookie, folder.id, String(new mongoose.Types.ObjectId()), true)).status).toBe(404);
    expect(
      (await listItems(makeRequest(`/api/folders/${folder.id}/items`), routeCtx({ id: folder.id }))).status
    ).toBe(401);
  });

  it("validates input", async () => {
    const { cookie } = await createUserAndCookie();
    const folder = await newFolder(cookie);
    for (const body of [
      {},
      { name: "" },
      { name: "x".repeat(LIMITS.ITEM_NAME_MAX + 1) },
      { name: { $gt: "" } },
      { name: "A", price: "12" },
      { name: "A", price: -1 },
      { name: "A", category: 5 },
    ]) {
      expect((await items.create(cookie, folder.id, body)).status).toBe(400);
    }
  });

  it("ignores fields the client must not set", async () => {
    const a = await createUserAndCookie({ email: "a@example.com" });
    const b = await createUserAndCookie({ email: "b@example.com" });
    const folder = await newFolder(a.cookie);
    const other = await newFolder(b.cookie);
    const res = await items.create(a.cookie, folder.id, {
      name: "Milk",
      done: true,
      folder: other.id,
      createdBy: b.user.id,
      position: 99,
    });
    const stored = await Item.findById((await json<ItemDTO>(res)).id).lean();
    expect(stored).toMatchObject({ done: false, position: 0 });
    expect(String(stored?.folder)).toBe(folder.id);
    expect(String(stored?.createdBy)).toBe(a.user.id);
  });

  it("enforces the per-folder item limit", async () => {
    const { user, cookie } = await createUserAndCookie();
    const folder = await newFolder(cookie);
    await Item.insertMany(
      Array.from({ length: LIMITS.ITEMS_PER_FOLDER }, (_, i) => ({
        folder: folder.id,
        name: `I${i}`,
        position: i,
        createdBy: user.id,
      }))
    );
    expect((await items.create(cookie, folder.id, { name: "One too many" })).status).toBe(400);
  });
});

describe("folders + items", () => {
  it("deleting a folder deletes its items", async () => {
    const { cookie } = await createUserAndCookie();
    const keep = await newFolder(cookie, "Keep");
    const drop = await newFolder(cookie, "Drop");
    await items.create(cookie, keep.id, { name: "Stay" });
    await items.create(cookie, drop.id, { name: "Go 1" });
    await items.create(cookie, drop.id, { name: "Go 2" });

    await deleteFolder(makeRequest(`/api/folders/${drop.id}`, { method: "DELETE", cookie }), routeCtx({ id: drop.id }));
    const left = await Item.find().lean();
    expect(left.map((i) => i.name)).toEqual(["Stay"]);
  });

  it("folder list shows item and done counts per folder", async () => {
    const { cookie } = await createUserAndCookie();
    const market = await newFolder(cookie, "Market");
    await newFolder(cookie, "Empty");
    const milk = await json<ItemDTO>(await items.create(cookie, market.id, { name: "Milk" }));
    await items.create(cookie, market.id, { name: "Bread" });
    await items.toggle(cookie, market.id, milk.id, true);

    const list = await json<FolderListResponse>(await listFolders(makeRequest("/api/folders", { cookie })));
    const byName = Object.fromEntries(list.folders.map((f) => [f.name, f]));
    expect(byName.Market).toMatchObject({ itemCount: 2, doneCount: 1 });
    expect(byName.Empty).toMatchObject({ itemCount: 0, doneCount: 0 });
  });
});
