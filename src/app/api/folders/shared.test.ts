import { describe, it, expect } from "vitest";
import { createUserAndCookie, json, makeRequest, routeCtx, setupTestDb } from "@/test/setup";
import { GET as listFolders, POST as createFolder } from "@/app/api/folders/route";
import { GET as getFolder } from "@/app/api/folders/[id]/route";
import { POST as createItem } from "@/app/api/folders/[id]/items/route";
import { POST as shareFolder } from "@/app/api/folders/[id]/shares/route";
import { DELETE as removeShare } from "@/app/api/folders/[id]/shares/[userId]/route";
import type { FolderDTO, FolderListResponse } from "@/types";

setupTestDb();

type U = Awaited<ReturnType<typeof createUserAndCookie>>;

const newFolder = async (u: U, name: string, status?: string) =>
  json<FolderDTO>(
    await createFolder(makeRequest("/api/folders", { method: "POST", body: { name, ...(status && { status }) }, cookie: u.cookie }))
  );
const share = (owner: U, folderId: string, body: unknown) =>
  shareFolder(makeRequest(`/api/folders/${folderId}/shares`, { method: "POST", body, cookie: owner.cookie }), routeCtx({ id: folderId }));
const list = (u: U, query = "") => listFolders(makeRequest(`/api/folders${query}`, { cookie: u.cookie }));

async function setup() {
  const a = await createUserAndCookie({ name: "Asha", email: "a@example.com" });
  const b = await createUserAndCookie({ name: "Bunty", email: "b@example.com" });
  const c = await createUserAndCookie({ name: "Chand", email: "c@example.com" });
  return { a, b, c };
}

describe("Shared with me", () => {
  it("lists only folders shared with me, with who shared them and my permissions", async () => {
    const { a, b, c } = await setup();
    const market = await newFolder(a, "Market");
    await newFolder(a, "A private");
    const cFolder = await newFolder(c, "Chand trip", "pending");
    await newFolder(b, "B own");
    await share(a, market.id, { email: "b@example.com", canCheck: true });
    await share(c, cFolder.id, { email: "b@example.com", canEdit: true });
    await createItem(
      makeRequest(`/api/folders/${market.id}/items`, { method: "POST", body: { name: "Milk" }, cookie: a.cookie }),
      routeCtx({ id: market.id })
    );

    const res = await json<FolderListResponse>(await list(b, "?scope=shared"));
    const byName = Object.fromEntries(res.folders.map((f) => [f.name, f]));
    expect(Object.keys(byName).sort()).toEqual(["Chand trip", "Market"]);
    expect(byName.Market).toMatchObject({
      role: "shared",
      sharedBy: { id: a.user.id, name: "Asha" },
      canCheck: true,
      canEdit: false,
      canManage: false,
      itemCount: 1,
    });
    expect(byName["Chand trip"]).toMatchObject({ sharedBy: { name: "Chand" }, canCheck: true, canEdit: true });
    expect(res.counts).toEqual({ all: 2, active: 1, pending: 1, completed: 0 });
  });

  it("status filter works with scope=shared", async () => {
    const { a, b } = await setup();
    const one = await newFolder(a, "One", "pending");
    const two = await newFolder(a, "Two");
    await share(a, one.id, { email: "b@example.com" });
    await share(a, two.id, { email: "b@example.com" });
    const res = await json<FolderListResponse>(await list(b, "?scope=shared&status=pending"));
    expect(res.folders.map((f) => f.name)).toEqual(["One"]);
  });

  it("my own list never includes folders shared with me, and carries owner permissions", async () => {
    const { a, b } = await setup();
    const market = await newFolder(a, "Market");
    await newFolder(b, "B own");
    await share(a, market.id, { email: "b@example.com" });

    const mine = await json<FolderListResponse>(await list(b));
    expect(mine.folders.map((f) => f.name)).toEqual(["B own"]);
    expect(mine.folders[0]).toMatchObject({ role: "owner", canManage: true, sharedBy: null });

    // The owner's shared tab is empty: sharing doesn't put it there.
    expect((await json<FolderListResponse>(await list(a, "?scope=shared"))).folders).toEqual([]);
  });

  it("rejects an unknown scope", async () => {
    const { a } = await setup();
    expect((await list(a, "?scope=everyone")).status).toBe(400);
  });

  it("a shared user can leave; then the folder is gone for them", async () => {
    const { a, b } = await setup();
    const market = await newFolder(a, "Market");
    await share(a, market.id, { email: "b@example.com", canEdit: true });

    const res = await removeShare(
      makeRequest(`/api/folders/${market.id}/shares/${b.user.id}`, { method: "DELETE", cookie: b.cookie }),
      routeCtx({ id: market.id, userId: b.user.id })
    );
    expect(res.status).toBe(204);
    expect((await getFolder(makeRequest(`/api/folders/${market.id}`, { cookie: b.cookie }), routeCtx({ id: market.id }))).status).toBe(404);
    expect((await json<FolderListResponse>(await list(b, "?scope=shared"))).folders).toEqual([]);
  });

  it("a shared user can't remove someone else", async () => {
    const { a, b, c } = await setup();
    const market = await newFolder(a, "Market");
    await share(a, market.id, { email: "b@example.com", canEdit: true });
    await share(a, market.id, { email: "c@example.com" });
    const res = await removeShare(
      makeRequest(`/api/folders/${market.id}/shares/${c.user.id}`, { method: "DELETE", cookie: b.cookie }),
      routeCtx({ id: market.id, userId: c.user.id })
    );
    expect(res.status).toBe(403);
  });

  it("never sends other people's emails in folder lists", async () => {
    const { a, b } = await setup();
    const market = await newFolder(a, "Market");
    await share(a, market.id, { email: "b@example.com" });
    const raw = await (await list(b, "?scope=shared")).text();
    expect(raw).not.toContain("a@example.com");
  });
});
