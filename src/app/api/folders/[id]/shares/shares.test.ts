import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { createUserAndCookie, json, makeRequest, routeCtx, setupTestDb } from "@/test/setup";
import { POST as createFolder } from "@/app/api/folders/route";
import {
  GET as getFolder,
  PATCH as updateFolder,
  DELETE as deleteFolder,
} from "@/app/api/folders/[id]/route";
import { GET as listItems, POST as createItem } from "@/app/api/folders/[id]/items/route";
import { PATCH as updateItem, DELETE as deleteItem } from "@/app/api/folders/[id]/items/[itemId]/route";
import { POST as toggleItem } from "@/app/api/folders/[id]/items/[itemId]/toggle/route";
import { POST as renameGroup } from "@/app/api/folders/[id]/groups/rename/route";
import { GET as listShares, POST as shareFolder } from "@/app/api/folders/[id]/shares/route";
import { PATCH as updateShare, DELETE as removeShare } from "@/app/api/folders/[id]/shares/[userId]/route";
import { getFolderAccess } from "@/lib/access";
import { LIMITS } from "@/lib/limits";
import { Share } from "@/models/Share";
import type { FolderDTO, FolderDetailDTO, ItemDTO, ShareListResponse } from "@/types";

setupTestDb();

type U = Awaited<ReturnType<typeof createUserAndCookie>>;

/** Owner A with a folder and one item, plus users B and C. */
async function setup() {
  const a = await createUserAndCookie({ name: "Asha", email: "a@example.com" });
  const b = await createUserAndCookie({ name: "Bunty", email: "b@example.com" });
  const c = await createUserAndCookie({ name: "Chand", email: "c@example.com" });
  const folder = await json<FolderDTO>(
    await createFolder(makeRequest("/api/folders", { method: "POST", body: { name: "Market" }, cookie: a.cookie }))
  );
  const item = await json<ItemDTO>(
    await createItem(
      makeRequest(`/api/folders/${folder.id}/items`, { method: "POST", body: { name: "Milk" }, cookie: a.cookie }),
      routeCtx({ id: folder.id })
    )
  );
  return { a, b, c, folder, item };
}

const share = (owner: U, folderId: string, body: unknown) =>
  shareFolder(makeRequest(`/api/folders/${folderId}/shares`, { method: "POST", body, cookie: owner.cookie }), routeCtx({ id: folderId }));

/** Every item/folder action as user `u`, returning just the status code. */
function as(u: U, folderId: string, itemId: string) {
  const f = routeCtx({ id: folderId });
  const i = routeCtx({ id: folderId, itemId });
  const req = (path: string, method = "GET", body?: unknown) => makeRequest(path, { method, body, cookie: u.cookie });
  const base = `/api/folders/${folderId}`;
  return {
    getFolder: async () => (await getFolder(req(base), f)).status,
    listItems: async () => (await listItems(req(`${base}/items`), f)).status,
    toggle: async () => (await toggleItem(req(`${base}/items/${itemId}/toggle`, "POST", { done: true }), i)).status,
    add: async () => (await createItem(req(`${base}/items`, "POST", { name: "New" }), f)).status,
    edit: async () => (await updateItem(req(`${base}/items/${itemId}`, "PATCH", { name: "Edited" }), i)).status,
    remove: async () => (await deleteItem(req(`${base}/items/${itemId}`, "DELETE"), i)).status,
    renameGroup: async () => (await renameGroup(req(`${base}/groups/rename`, "POST", { from: "A", to: "B" }), f)).status,
    renameFolder: async () => (await updateFolder(req(base, "PATCH", { name: "Hacked" }), f)).status,
    deleteFolder: async () => (await deleteFolder(req(base, "DELETE"), f)).status,
    listShares: async () => (await listShares(req(`${base}/shares`), f)).status,
    share: async () => (await shareFolder(req(`${base}/shares`, "POST", { email: "c@example.com" }), f)).status,
  };
}

describe("sharing by email: permissions", () => {
  it("view-only: can read, can't tick, edit or manage", async () => {
    const { a, b, folder, item } = await setup();
    expect((await share(a, folder.id, { email: "b@example.com" })).status).toBe(201);

    const B = as(b, folder.id, item.id);
    expect(await B.getFolder()).toBe(200);
    expect(await B.listItems()).toBe(200);
    expect(await B.toggle()).toBe(403);
    expect(await B.add()).toBe(403);
    expect(await B.edit()).toBe(403);
    expect(await B.remove()).toBe(403);
    expect(await B.renameGroup()).toBe(403);
    expect(await B.renameFolder()).toBe(403);
    expect(await B.deleteFolder()).toBe(403);
    expect(await B.listShares()).toBe(403);
    expect(await B.share()).toBe(403);
  });

  it("tick permission: can tick, still can't add/edit/delete", async () => {
    const { a, b, folder, item } = await setup();
    await share(a, folder.id, { email: "b@example.com", canCheck: true });

    const B = as(b, folder.id, item.id);
    expect(await B.toggle()).toBe(200);
    expect(await B.add()).toBe(403);
    expect(await B.edit()).toBe(403);
    expect(await B.remove()).toBe(403);
  });

  it("edit permission: can add/edit/delete, and tick is forced on", async () => {
    const { a, b, folder, item } = await setup();
    await share(a, folder.id, { email: "b@example.com", canEdit: true, canCheck: false });
    expect(await Share.findOne().lean()).toMatchObject({ canEdit: true, canCheck: true });

    const B = as(b, folder.id, item.id);
    expect(await B.toggle()).toBe(200);
    expect(await B.add()).toBe(201);
    expect(await B.edit()).toBe(200);
    expect(await B.renameGroup()).toBe(200);
    expect(await B.remove()).toBe(204);
    // Still never manage.
    expect(await B.renameFolder()).toBe(403);
    expect(await B.deleteFolder()).toBe(403);
    expect(await B.share()).toBe(403);
  });

  it("a stranger gets 404 everywhere", async () => {
    const { a, c, folder, item } = await setup();
    await share(a, folder.id, { email: "b@example.com", canEdit: true });
    const C = as(c, folder.id, item.id);
    for (const action of Object.values(C)) expect(await action()).toBe(404);
  });

  it("folder detail tells a shared user who shared it and what they may do", async () => {
    const { a, b, folder } = await setup();
    await share(a, folder.id, { email: "b@example.com", canCheck: true });
    const detail = await json<FolderDetailDTO>(
      await getFolder(makeRequest(`/api/folders/${folder.id}`, { cookie: b.cookie }), routeCtx({ id: folder.id }))
    );
    expect(detail).toMatchObject({
      role: "shared",
      canCheck: true,
      canEdit: false,
      canManage: false,
      sharedBy: { id: a.user.id, name: "Asha" },
    });
    expect(detail.sharedBy).not.toHaveProperty("email");
  });

  it("ticks by a shared user are recorded with their name", async () => {
    const { a, b, folder, item } = await setup();
    await share(a, folder.id, { email: "b@example.com", canCheck: true });
    const res = await toggleItem(
      makeRequest(`/api/folders/${folder.id}/items/${item.id}/toggle`, { method: "POST", body: { done: true }, cookie: b.cookie }),
      routeCtx({ id: folder.id, itemId: item.id })
    );
    expect((await json<ItemDTO>(res)).doneBy).toEqual({ id: b.user.id, name: "Bunty" });
  });
});

describe("managing shares", () => {
  it("lists shares with name + email, and re-sharing updates instead of duplicating", async () => {
    const { a, folder } = await setup();
    await share(a, folder.id, { email: "b@example.com" });
    const again = await share(a, folder.id, { email: "B@Example.com", canCheck: true });
    expect(again.status).toBe(200);

    const { shares } = await json<ShareListResponse>(
      await listShares(makeRequest(`/api/folders/${folder.id}/shares`, { cookie: a.cookie }), routeCtx({ id: folder.id }))
    );
    expect(shares).toEqual([
      { user: { id: expect.any(String), name: "Bunty", email: "b@example.com" }, canCheck: true, canEdit: false, via: "email" },
    ]);
  });

  it("rejects unknown emails, sharing with yourself and bad input", async () => {
    const { a, folder } = await setup();
    const unknown = await share(a, folder.id, { email: "ghost@example.com" });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "No Listy user with this email" });
    expect((await share(a, folder.id, { email: "a@example.com" })).status).toBe(400);
    expect((await share(a, folder.id, { email: { $ne: null } })).status).toBe(400);
    expect((await share(a, folder.id, { email: "b@example.com", canEdit: "yes" })).status).toBe(400);
  });

  it("changes permissions; turning tick off also turns edit off", async () => {
    const { a, b, folder } = await setup();
    await share(a, folder.id, { email: "b@example.com", canEdit: true });
    const patch = (body: unknown) =>
      updateShare(
        makeRequest(`/api/folders/${folder.id}/shares/${b.user.id}`, { method: "PATCH", body, cookie: a.cookie }),
        routeCtx({ id: folder.id, userId: b.user.id })
      );

    await patch({ canCheck: false });
    expect(await Share.findOne().lean()).toMatchObject({ canCheck: false, canEdit: false });
    await patch({ canEdit: true });
    expect(await Share.findOne().lean()).toMatchObject({ canCheck: true, canEdit: true });
    expect((await patch({})).status).toBe(400);
  });

  it("removing someone takes their access away at once", async () => {
    const { a, b, folder, item } = await setup();
    await share(a, folder.id, { email: "b@example.com", canEdit: true });
    const res = await removeShare(
      makeRequest(`/api/folders/${folder.id}/shares/${b.user.id}`, { method: "DELETE", cookie: a.cookie }),
      routeCtx({ id: folder.id, userId: b.user.id })
    );
    expect(res.status).toBe(204);
    expect(await as(b, folder.id, item.id).getFolder()).toBe(404);
  });

  it("a shared user can't change others' permissions or remove them", async () => {
    const { a, b, c, folder } = await setup();
    await share(a, folder.id, { email: "b@example.com", canEdit: true });
    await share(a, folder.id, { email: "c@example.com" });
    const asB = (method: string, body?: unknown) =>
      makeRequest(`/api/folders/${folder.id}/shares/${c.user.id}`, { method, body, cookie: b.cookie });
    const ctx = routeCtx({ id: folder.id, userId: c.user.id });
    expect((await updateShare(asB("PATCH", { canEdit: true }), ctx)).status).toBe(403);
    expect((await removeShare(asB("DELETE"), ctx)).status).toBe(403);
  });

  it("deleting the folder deletes its shares", async () => {
    const { a, folder } = await setup();
    await share(a, folder.id, { email: "b@example.com" });
    await deleteFolder(makeRequest(`/api/folders/${folder.id}`, { method: "DELETE", cookie: a.cookie }), routeCtx({ id: folder.id }));
    expect(await Share.countDocuments()).toBe(0);
  });

  it("caps shares per folder", async () => {
    const { a, b, folder } = await setup();
    await Share.insertMany(
      Array.from({ length: LIMITS.SHARES_PER_FOLDER }, () => ({
        folder: folder.id,
        owner: a.user.id,
        sharedWith: new mongoose.Types.ObjectId(),
        via: "email",
      }))
    );
    expect((await share(a, folder.id, { email: b.user.email })).status).toBe(400);
  });
});

describe("getFolderAccess", () => {
  it("owner / tick-only / edit / stranger", async () => {
    const { a, b, c, folder } = await setup();
    await share(a, folder.id, { email: "b@example.com", canCheck: true });

    expect(await getFolderAccess(a.user.id, folder.id)).toMatchObject({ role: "owner", canManage: true, sharedBy: null });
    expect(await getFolderAccess(b.user.id, folder.id)).toMatchObject({
      role: "shared",
      canCheck: true,
      canEdit: false,
      canManage: false,
    });
    expect(await getFolderAccess(c.user.id, folder.id)).toBeNull();
  });
});
