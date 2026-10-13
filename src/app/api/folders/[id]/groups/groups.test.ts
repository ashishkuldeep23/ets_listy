import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { createUserAndCookie, json, makeRequest, routeCtx, setupTestDb } from "@/test/setup";
import { POST as createFolder } from "@/app/api/folders/route";
import { GET as listItems, POST as createItem } from "@/app/api/folders/[id]/items/route";
import { PATCH as updateItem } from "@/app/api/folders/[id]/items/[itemId]/route";
import { POST as renameGroup } from "@/app/api/folders/[id]/groups/rename/route";
import { Item } from "@/models/Item";
import { POST as shareFolder } from "@/app/api/folders/[id]/shares/route";
import type { FolderDTO, ItemDTO, ItemListResponse, RenameGroupResponse } from "@/types";

setupTestDb();

async function newFolder(cookie: string, name = "Market") {
  return json<FolderDTO>(await createFolder(makeRequest("/api/folders", { method: "POST", body: { name }, cookie })));
}
const add = async (cookie: string, folderId: string, body: unknown) =>
  json<ItemDTO>(
    await createItem(makeRequest(`/api/folders/${folderId}/items`, { method: "POST", body, cookie }), routeCtx({ id: folderId }))
  );
const list = async (cookie: string, folderId: string) =>
  json<ItemListResponse>(await listItems(makeRequest(`/api/folders/${folderId}/items`, { cookie }), routeCtx({ id: folderId })));
const rename = (cookie: string, folderId: string, body: unknown) =>
  renameGroup(
    makeRequest(`/api/folders/${folderId}/groups/rename`, { method: "POST", body, cookie }),
    routeCtx({ id: folderId })
  );

describe("item groups", () => {
  it("stores the group and lists distinct groups for this folder only, sorted", async () => {
    const { cookie } = await createUserAndCookie();
    const market = await newFolder(cookie, "Market");
    const other = await newFolder(cookie, "Other");
    await add(cookie, market.id, { name: "Tomato", group: "Veg" });
    await add(cookie, market.id, { name: "Milk", group: "Dairy" });
    await add(cookie, market.id, { name: "Onion", group: "Veg" });
    await add(cookie, market.id, { name: "Soap" });
    await add(cookie, other.id, { name: "X", group: "Elsewhere" });

    const res = await list(cookie, market.id);
    expect(res.groups).toEqual(["Dairy", "Veg"]);
    expect(res.items.find((i) => i.name === "Soap")?.group).toBeNull();
  });

  it("moves an item to another group, or out of any group with null", async () => {
    const { cookie } = await createUserAndCookie();
    const folder = await newFolder(cookie);
    const milk = await add(cookie, folder.id, { name: "Milk", group: "Dairy" });
    const patch = (body: unknown) =>
      updateItem(
        makeRequest(`/api/folders/${folder.id}/items/${milk.id}`, { method: "PATCH", body, cookie }),
        routeCtx({ id: folder.id, itemId: milk.id })
      );

    expect((await json<ItemDTO>(await patch({ group: "Breakfast" }))).group).toBe("Breakfast");
    expect((await json<ItemDTO>(await patch({ group: null }))).group).toBeNull();
  });

  it("renames a group for this folder's items only", async () => {
    const { cookie } = await createUserAndCookie();
    const market = await newFolder(cookie, "Market");
    const other = await newFolder(cookie, "Other");
    await add(cookie, market.id, { name: "Tomato", group: "Veg" });
    await add(cookie, market.id, { name: "Onion", group: "Veg" });
    await add(cookie, other.id, { name: "Carrot", group: "Veg" });

    const res = await rename(cookie, market.id, { from: "Veg", to: "Vegetables" });
    expect(await res.json()).toEqual({ updated: 2 });
    expect((await list(cookie, market.id)).groups).toEqual(["Vegetables"]);
    expect((await list(cookie, other.id)).groups).toEqual(["Veg"]);
  });

  it("ungroups items when renamed to null or empty", async () => {
    const { cookie } = await createUserAndCookie();
    const folder = await newFolder(cookie);
    await add(cookie, folder.id, { name: "Tomato", group: "Veg" });
    await rename(cookie, folder.id, { from: "Veg", to: "" });
    const after = await list(cookie, folder.id);
    expect(after.groups).toEqual([]);
    expect(after.items[0]?.group).toBeNull();
  });

  it("names the ungrouped items: all of them (done or not) join the group, other groups untouched", async () => {
    const { cookie } = await createUserAndCookie();
    const market = await newFolder(cookie, "Market");
    const other = await newFolder(cookie, "Other");
    const soap = await add(cookie, market.id, { name: "Soap" });
    const salt = await add(cookie, market.id, { name: "Salt" });
    await Item.updateOne({ _id: salt.id }, { $set: { done: true } });
    await add(cookie, market.id, { name: "Tomato", group: "Veg" });
    await add(cookie, other.id, { name: "Brush" });

    const res = await json<RenameGroupResponse>(await rename(cookie, market.id, { from: null, to: "Home" }));
    expect(res.updated).toBe(2);
    expect(res.itemIds?.sort()).toEqual([soap.id, salt.id].sort());

    const after = await list(cookie, market.id);
    expect(after.groups).toEqual(["Home", "Veg"]);
    expect(after.items.every((i) => i.group !== null)).toBe(true);
    expect(after.items.find((i) => i.name === "Salt")?.done).toBe(true);
    // Another folder's ungrouped items are not touched.
    expect((await list(cookie, other.id)).items[0]?.group).toBeNull();
  });

  it("naming the ungrouped items after an existing group merges into that group's spelling", async () => {
    const { cookie } = await createUserAndCookie();
    const folder = await newFolder(cookie);
    await add(cookie, folder.id, { name: "Tomato", group: "Veg" });
    await add(cookie, folder.id, { name: "Onion" });

    await rename(cookie, folder.id, { from: null, to: "  vEG " });
    const after = await list(cookie, folder.id);
    expect(after.groups).toEqual(["Veg"]);
    expect(after.items.map((i) => i.group)).toEqual(["Veg", "Veg"]);
  });

  it("also picks up older ungrouped items stored as null or empty", async () => {
    const { cookie } = await createUserAndCookie();
    const folder = await newFolder(cookie);
    const a = await add(cookie, folder.id, { name: "A" });
    const b = await add(cookie, folder.id, { name: "B" });
    await Item.collection.updateOne({ _id: new mongoose.Types.ObjectId(a.id) }, { $set: { group: null } });
    await Item.collection.updateOne({ _id: new mongoose.Types.ObjectId(b.id) }, { $set: { group: "" } });

    const res = await json<RenameGroupResponse>(await rename(cookie, folder.id, { from: null, to: "Misc" }));
    expect(res.updated).toBe(2);
    expect((await list(cookie, folder.id)).groups).toEqual(["Misc"]);
  });

  it("naming the ungrouped items when there are none changes nothing", async () => {
    const { cookie } = await createUserAndCookie();
    const folder = await newFolder(cookie);
    await add(cookie, folder.id, { name: "Tomato", group: "Veg" });
    const res = await rename(cookie, folder.id, { from: null, to: "Misc" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 0, itemIds: [] });
    expect((await list(cookie, folder.id)).groups).toEqual(["Veg"]);
  });

  it("naming the ungrouped items needs a name", async () => {
    const { cookie } = await createUserAndCookie();
    const folder = await newFolder(cookie);
    await add(cookie, folder.id, { name: "Soap" });
    for (const body of [{ from: null }, { from: null, to: "" }, { from: null, to: "  " }, { from: null, to: null }]) {
      expect((await rename(cookie, folder.id, body)).status).toBe(400);
    }
    expect((await Item.findOne().lean())?.group).toBeUndefined();
  });

  it("tick-only members can't group the ungrouped items (403)", async () => {
    const a = await createUserAndCookie({ email: "a@example.com" });
    const b = await createUserAndCookie({ email: "b@example.com" });
    const folder = await newFolder(a.cookie);
    await add(a.cookie, folder.id, { name: "Soap" });
    await shareFolder(
      makeRequest(`/api/folders/${folder.id}/shares`, {
        method: "POST",
        body: { email: "b@example.com", canCheck: true },
        cookie: a.cookie,
      }),
      routeCtx({ id: folder.id })
    );

    expect((await rename(b.cookie, folder.id, { from: null, to: "Hacked" })).status).toBe(403);
    expect((await Item.findOne().lean())?.group).toBeUndefined();
  });

  it("validates the rename body", async () => {
    const { cookie } = await createUserAndCookie();
    const folder = await newFolder(cookie);
    for (const body of [{}, { from: "" }, { from: { $ne: null }, to: "X" }, { from: "A", to: 5 }, { from: "A", to: "x".repeat(41) }]) {
      expect((await rename(cookie, folder.id, body)).status).toBe(400);
    }
  });

  it("other users can't rename groups in my folder (404)", async () => {
    const a = await createUserAndCookie({ email: "a@example.com" });
    const b = await createUserAndCookie({ email: "b@example.com" });
    const folder = await newFolder(a.cookie);
    await add(a.cookie, folder.id, { name: "Tomato", group: "Veg" });

    expect((await rename(b.cookie, folder.id, { from: "Veg", to: "Hacked" })).status).toBe(404);
    expect((await rename(b.cookie, folder.id, { from: null, to: "Hacked" })).status).toBe(404);
    expect((await Item.findOne().lean())?.group).toBe("Veg");
  });
});
