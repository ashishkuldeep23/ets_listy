import { describe, it, expect } from "vitest";
import { createUserAndCookie, json, makeRequest, routeCtx, setupTestDb } from "@/test/setup";
import { POST as createFolder } from "@/app/api/folders/route";
import { GET as listItems, POST as createItem } from "@/app/api/folders/[id]/items/route";
import { PATCH as updateItem } from "@/app/api/folders/[id]/items/[itemId]/route";
import { POST as renameGroup } from "@/app/api/folders/[id]/groups/rename/route";
import { POST as shareFolder } from "@/app/api/folders/[id]/shares/route";
import { GET as listSaved, POST as createSaved } from "@/app/api/saved-items/route";
import { PATCH as updateSaved } from "@/app/api/saved-items/[id]/route";
import { validateCreateItem, validateUpdateItem } from "@/lib/validators";
import { formatPrice } from "@/lib/format";
import type { FolderDTO, ItemDTO, ItemListResponse, SavedItemDTO, SavedItemListResponse } from "@/types";

setupTestDb();

// Price "per" unit, group names matched by case, and saving items from a shared list.

async function setup() {
  const a = await createUserAndCookie({ name: "Asha", email: "a@example.com" });
  const folder = await json<FolderDTO>(
    await createFolder(makeRequest("/api/folders", { method: "POST", body: { name: "Market" }, cookie: a.cookie }))
  );
  const ctx = routeCtx({ id: folder.id });
  const add = (body: unknown, cookie = a.cookie) =>
    createItem(makeRequest(`/api/folders/${folder.id}/items`, { method: "POST", body, cookie }), ctx);
  const edit = (itemId: string, body: unknown) =>
    updateItem(
      makeRequest(`/api/folders/${folder.id}/items/${itemId}`, { method: "PATCH", body, cookie: a.cookie }),
      routeCtx({ id: folder.id, itemId })
    );
  const list = async (cookie = a.cookie) =>
    json<ItemListResponse>(await listItems(makeRequest(`/api/folders/${folder.id}/items`, { cookie }), ctx));
  return { a, folder, ctx, add, edit, list };
}

describe("price unit", () => {
  it("validator cleans 'per kg' and '/kg' to 'kg', and limits length", () => {
    expect(validateCreateItem({ name: "Rice", price: 40, priceUnit: "per kg" })).toMatchObject({
      ok: true,
      value: { fields: { priceUnit: "kg" } },
    });
    expect(validateCreateItem({ name: "Rice", price: 40, priceUnit: " /kg " })).toMatchObject({
      ok: true,
      value: { fields: { priceUnit: "kg" } },
    });
    expect(validateCreateItem({ name: "Rice", priceUnit: "x".repeat(21) }).ok).toBe(false);
    expect(validateCreateItem({ name: "Rice", priceUnit: 5 }).ok).toBe(false);
    expect(validateUpdateItem({ priceUnit: null })).toEqual({ ok: true, value: { priceUnit: null } });
  });

  it("formats as ₹40 / kg", () => {
    expect(formatPrice(40, "kg")).toBe("₹40 / kg");
    expect(formatPrice(40, null)).toBe("₹40");
  });

  it("is saved with the price and returned", async () => {
    const { add } = await setup();
    const item = await json<ItemDTO>(await add({ name: "Rice", price: 40, priceUnit: "kg" }));
    expect(item).toMatchObject({ price: 40, priceUnit: "kg" });
  });

  it("is dropped when there is no price", async () => {
    const { add } = await setup();
    const item = await json<ItemDTO>(await add({ name: "Rice", priceUnit: "kg" }));
    expect(item).toMatchObject({ price: null, priceUnit: null });
  });

  it("is cleared when the price is cleared, and a unit alone can't be set without a price", async () => {
    const { add, edit } = await setup();
    const item = await json<ItemDTO>(await add({ name: "Rice", price: 40, priceUnit: "kg" }));

    const cleared = await json<ItemDTO>(await edit(item.id, { price: null }));
    expect(cleared).toMatchObject({ price: null, priceUnit: null });

    const unitOnly = await json<ItemDTO>(await edit(item.id, { priceUnit: "kg" }));
    expect(unitOnly.priceUnit).toBeNull();
    // Adding a price later does not bring back a stray unit.
    const priced = await json<ItemDTO>(await edit(item.id, { price: 50 }));
    expect(priced).toMatchObject({ price: 50, priceUnit: null });
  });

  it("can be changed and cleared on its own while there is a price", async () => {
    const { add, edit } = await setup();
    const item = await json<ItemDTO>(await add({ name: "Eggs", price: 80, priceUnit: "dozen" }));
    expect(await json<ItemDTO>(await edit(item.id, { priceUnit: "piece" }))).toMatchObject({ price: 80, priceUnit: "piece" });
    expect(await json<ItemDTO>(await edit(item.id, { priceUnit: null }))).toMatchObject({ price: 80, priceUnit: null });
  });

  it("is kept on saved items too", async () => {
    const { a } = await setup();
    const res = await createSaved(
      makeRequest("/api/saved-items", { method: "POST", body: { name: "Rice", price: 40, priceUnit: "per kg" }, cookie: a.cookie })
    );
    const saved = await json<SavedItemDTO>(res);
    expect(saved).toMatchObject({ price: 40, priceUnit: "kg" });

    const edited = await json<SavedItemDTO>(
      await updateSaved(
        makeRequest(`/api/saved-items/${saved.id}`, { method: "PATCH", body: { price: null }, cookie: a.cookie }),
        routeCtx({ id: saved.id })
      )
    );
    expect(edited).toMatchObject({ price: null, priceUnit: null });
  });
});

describe("quantity", () => {
  it("is saved, changed and cleared on an item, with or without a price", async () => {
    const { add, edit } = await setup();
    const rice = await json<ItemDTO>(await add({ name: "Rice", price: 40, priceUnit: "kg", quantity: 2.5 }));
    expect(rice).toMatchObject({ price: 40, priceUnit: "kg", quantity: 2.5 });

    expect((await json<ItemDTO>(await edit(rice.id, { quantity: 3 }))).quantity).toBe(3);
    expect((await json<ItemDTO>(await edit(rice.id, { quantity: null }))).quantity).toBeNull();
    // Clearing the price keeps the quantity (it still means "how many").
    await edit(rice.id, { quantity: 2 });
    expect(await json<ItemDTO>(await edit(rice.id, { price: null }))).toMatchObject({ price: null, quantity: 2 });

    const eggs = await json<ItemDTO>(await add({ name: "Eggs", quantity: 12 }));
    expect(eggs).toMatchObject({ price: null, quantity: 12 });
  });

  it("rejects a bad quantity", async () => {
    const { add } = await setup();
    expect((await add({ name: "Rice", quantity: 0 })).status).toBe(400);
    expect((await add({ name: "Rice", quantity: "2" })).status).toBe(400);
  });

  it("is kept on saved items", async () => {
    const { a } = await setup();
    const saved = await json<SavedItemDTO>(
      await createSaved(
        makeRequest("/api/saved-items", { method: "POST", body: { name: "Rice", price: 40, quantity: 2 }, cookie: a.cookie })
      )
    );
    expect(saved).toMatchObject({ price: 40, quantity: 2 });
  });
});

describe("group names reuse the folder's spelling", () => {
  it("adding to 'vegetables' joins the existing 'Vegetables' group", async () => {
    const { add, list } = await setup();
    await add({ name: "Tomato", group: "Vegetables" });
    const onion = await json<ItemDTO>(await add({ name: "Onion", group: "  vegetables " }));
    expect(onion.group).toBe("Vegetables");
    expect((await list()).groups).toEqual(["Vegetables"]);
  });

  it("editing an item into another case of an existing group joins it", async () => {
    const { add, edit } = await setup();
    await add({ name: "Tomato", group: "Vegetables" });
    const apple = await json<ItemDTO>(await add({ name: "Apple", group: "Fruits" }));
    expect((await json<ItemDTO>(await edit(apple.id, { group: "VEGETABLES" }))).group).toBe("Vegetables");
  });

  it("keeps a case-only change when the item is the only one in its group", async () => {
    const { add, edit } = await setup();
    const apple = await json<ItemDTO>(await add({ name: "Apple", group: "fruits" }));
    expect((await json<ItemDTO>(await edit(apple.id, { group: "Fruits" }))).group).toBe("Fruits");
  });

  it("renaming a group onto another case of an existing group merges them", async () => {
    const { add, list, folder, a } = await setup();
    await add({ name: "Tomato", group: "Vegetables" });
    await add({ name: "Onion", group: "Veg" });
    const res = await renameGroup(
      makeRequest(`/api/folders/${folder.id}/groups/rename`, { method: "POST", body: { from: "Veg", to: "vegetables" }, cookie: a.cookie }),
      routeCtx({ id: folder.id })
    );
    expect(res.status).toBe(200);
    expect((await list()).groups).toEqual(["Vegetables"]);
  });

  it("renaming a group to a new case of itself just changes its case", async () => {
    const { add, list, folder, a } = await setup();
    await add({ name: "Tomato", group: "veg" });
    await renameGroup(
      makeRequest(`/api/folders/${folder.id}/groups/rename`, { method: "POST", body: { from: "veg", to: "Veg" }, cookie: a.cookie }),
      routeCtx({ id: folder.id })
    );
    expect((await list()).groups).toEqual(["Veg"]);
  });
});

describe("saving an item from a list shared with me", () => {
  it("a view-only user can copy an item into their own saved items", async () => {
    const { add, folder, a, list } = await setup();
    await add({ name: "Rice", category: "Grains", price: 40, priceUnit: "kg", group: "Dry" });
    const b = await createUserAndCookie({ name: "Bunty", email: "b@example.com" });
    await shareFolder(
      makeRequest(`/api/folders/${folder.id}/shares`, { method: "POST", body: { email: "b@example.com" }, cookie: a.cookie }),
      routeCtx({ id: folder.id })
    );

    // b sees the item, then bookmarks it (what the UI sends: no group).
    const [rice] = (await list(b.cookie)).items;
    const { name, category, price, priceUnit, description } = rice as ItemDTO;
    const res = await createSaved(
      makeRequest("/api/saved-items", { method: "POST", body: { name, category, price, priceUnit, description }, cookie: b.cookie })
    );
    expect(res.status).toBe(201);

    const bSaved = await json<SavedItemListResponse>(await listSaved(makeRequest("/api/saved-items", { cookie: b.cookie })));
    expect(bSaved.savedItems).toHaveLength(1);
    expect(bSaved.savedItems[0]).toMatchObject({ name: "Rice", category: "Grains", price: 40, priceUnit: "kg" });
    // Saved to b's profile only, not the owner's.
    const aSaved = await json<SavedItemListResponse>(await listSaved(makeRequest("/api/saved-items", { cookie: a.cookie })));
    expect(aSaved.savedItems).toHaveLength(0);
  });

  it("saving the same item twice doesn't create a duplicate", async () => {
    const { a } = await setup();
    const body = { name: "Rice", category: "Grains", price: 40 };
    await createSaved(makeRequest("/api/saved-items", { method: "POST", body, cookie: a.cookie }));
    await createSaved(makeRequest("/api/saved-items", { method: "POST", body: { ...body, name: "rice" }, cookie: a.cookie }));
    const mine = await json<SavedItemListResponse>(await listSaved(makeRequest("/api/saved-items", { cookie: a.cookie })));
    expect(mine.savedItems).toHaveLength(1);
  });
});
