import { describe, it, expect } from "vitest";
import { createUserAndCookie, json, makeRequest, routeCtx, setupTestDb } from "@/test/setup";
import type { FolderDTO, FolderListResponse } from "@/types";
import { GET as listFolders, POST as createFolder } from "@/app/api/folders/route";
import { GET as getFolder, PATCH as updateFolder, DELETE as deleteFolder } from "@/app/api/folders/[id]/route";
import { getFolderAccess } from "@/lib/access";
import { LIMITS } from "@/lib/limits";
import { Folder } from "@/models/Folder";

setupTestDb();

const ctx = (id: string) => routeCtx({ id });

async function create(cookie: string | undefined, body: unknown) {
  return createFolder(makeRequest("/api/folders", { method: "POST", body, cookie }));
}

describe("folders API", () => {
  it("requires login everywhere", async () => {
    expect((await listFolders(makeRequest("/api/folders"))).status).toBe(401);
    expect((await create(undefined, { name: "X" })).status).toBe(401);
    const id = "652f1c2b9d3e4a0012345678";
    expect((await getFolder(makeRequest(`/api/folders/${id}`), ctx(id))).status).toBe(401);
  });

  it("creates, lists (newest first), renames and deletes my folders", async () => {
    const { cookie } = await createUserAndCookie();

    const r1 = await create(cookie, { name: "  Market  " });
    expect(r1.status).toBe(201);
    const market = await json<FolderDTO>(r1);
    expect(market).toMatchObject({ id: expect.any(String), name: "Market" });
    expect(market).not.toHaveProperty("owner");

    // Make sure "Oct" is strictly newer.
    await new Promise((r) => setTimeout(r, 5));
    const oct = await json<FolderDTO>(await create(cookie, { name: "Oct" }));

    const list = await json<FolderListResponse>(await listFolders(makeRequest("/api/folders", { cookie })));
    expect(list.folders.map((f) => f.name)).toEqual(["Oct", "Market"]);

    const got = await getFolder(makeRequest(`/api/folders/${market.id}`, { cookie }), ctx(market.id));
    expect(await got.json()).toMatchObject({ name: "Market", role: "owner" });

    const renamed = await updateFolder(
      makeRequest(`/api/folders/${market.id}`, { method: "PATCH", body: { name: "Home" }, cookie }),
      ctx(market.id)
    );
    expect(renamed.status).toBe(200);
    expect((await json<FolderDTO>(renamed)).name).toBe("Home");

    const del = await deleteFolder(makeRequest(`/api/folders/${oct.id}`, { method: "DELETE", cookie }), ctx(oct.id));
    expect(del.status).toBe(204);
    expect(await Folder.countDocuments()).toBe(1);
  });

  it("hides other users' folders (404 on GET, PATCH and DELETE)", async () => {
    const a = await createUserAndCookie({ email: "a@example.com" });
    const b = await createUserAndCookie({ email: "b@example.com" });
    const folder = await json<FolderDTO>(await create(a.cookie, { name: "A's folder" }));

    const asB = (method: string, body?: unknown) => makeRequest(`/api/folders/${folder.id}`, { method, body, cookie: b.cookie });
    expect((await getFolder(asB("GET"), ctx(folder.id))).status).toBe(404);
    expect((await updateFolder(asB("PATCH", { name: "Hacked" }), ctx(folder.id))).status).toBe(404);
    expect((await deleteFolder(asB("DELETE"), ctx(folder.id))).status).toBe(404);

    // B's list doesn't include it, and it is unchanged.
    const bList = await json<FolderListResponse>(await listFolders(makeRequest("/api/folders", { cookie: b.cookie })));
    expect(bList.folders).toEqual([]);
    expect((await Folder.findById(folder.id).lean())?.name).toBe("A's folder");
  });

  it("returns 404 for invalid or unknown ids", async () => {
    const { cookie } = await createUserAndCookie();
    for (const id of ["not-an-id", "652f1c2b9d3e4a0012345678"]) {
      expect((await getFolder(makeRequest(`/api/folders/${id}`, { cookie }), ctx(id))).status).toBe(404);
    }
  });

  it("validates input", async () => {
    const { cookie } = await createUserAndCookie();
    expect((await create(cookie, { name: "" })).status).toBe(400);
    expect((await create(cookie, { name: "x".repeat(61) })).status).toBe(400);
    expect((await create(cookie, { name: { $gt: "" } })).status).toBe(400);
    expect((await create(cookie, "{bad json")).status).toBe(400);

    const folder = await json<FolderDTO>(await create(cookie, { name: "Ok" }));
    const empty = await updateFolder(
      makeRequest(`/api/folders/${folder.id}`, { method: "PATCH", body: { owner: "someone" }, cookie }),
      ctx(folder.id)
    );
    expect(empty.status).toBe(400);
  });

  it("ignores an `owner` field sent by the client", async () => {
    const a = await createUserAndCookie({ email: "a@example.com" });
    const b = await createUserAndCookie({ email: "b@example.com" });
    const folder = await json<FolderDTO>(await create(a.cookie, { name: "Mine", owner: b.user.id }));
    const stored = await Folder.findById(folder.id).lean();
    expect(String(stored?.owner)).toBe(a.user.id);
  });

  it("enforces the per-user folder limit", async () => {
    const { user, cookie } = await createUserAndCookie();
    await Folder.insertMany(
      Array.from({ length: LIMITS.FOLDERS_PER_USER }, (_, i) => ({ owner: user.id, name: `F${i}` }))
    );
    expect((await create(cookie, { name: "One too many" })).status).toBe(400);
  });
});

describe("getFolderAccess", () => {
  it("gives the owner full access and everyone else nothing", async () => {
    const a = await createUserAndCookie({ email: "a@example.com" });
    const b = await createUserAndCookie({ email: "b@example.com" });
    const folder = await Folder.create({ owner: a.user.id, name: "F" });

    expect(await getFolderAccess(a.user.id, String(folder._id))).toMatchObject({
      role: "owner",
      canCheck: true,
      canEdit: true,
      canManage: true,
    });
    expect(await getFolderAccess(b.user.id, String(folder._id))).toBeNull();
    expect(await getFolderAccess(a.user.id, "bad-id")).toBeNull();
    expect(await getFolderAccess(a.user.id, { $ne: null })).toBeNull();
  });
});
