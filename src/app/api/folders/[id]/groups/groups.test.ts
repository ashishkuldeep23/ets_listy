import { describe, it, expect } from "vitest";
import { createUserAndCookie, json, makeRequest, routeCtx, setupTestDb } from "@/test/setup";
import { POST as createFolder } from "@/app/api/folders/route";
import { GET as listItems, POST as createItem } from "@/app/api/folders/[id]/items/route";
import { PATCH as updateItem } from "@/app/api/folders/[id]/items/[itemId]/route";
import { POST as renameGroup } from "@/app/api/folders/[id]/groups/rename/route";
import { Item } from "@/models/Item";
import type { FolderDTO, ItemDTO, ItemListResponse } from "@/types";

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
    expect((await Item.findOne().lean())?.group).toBe("Veg");
  });
});
