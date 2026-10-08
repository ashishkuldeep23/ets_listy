import { describe, it, expect } from "vitest";
import { createUserAndCookie, json, makeRequest, routeCtx, setupTestDb } from "@/test/setup";
import { POST as createFolder } from "@/app/api/folders/route";
import { GET as getFolder, DELETE as deleteFolder } from "@/app/api/folders/[id]/route";
import { GET as getLink, POST as setLink } from "@/app/api/folders/[id]/share-link/route";
import { POST as resetLink } from "@/app/api/folders/[id]/share-link/reset/route";
import { POST as acceptLink } from "@/app/api/share/[token]/accept/route";
import { POST as shareByEmail } from "@/app/api/folders/[id]/shares/route";
import { Share } from "@/models/Share";
import { ShareLink, isShareTokenShape, newShareToken } from "@/models/ShareLink";
import type { AcceptShareResponse, FolderDTO, FolderDetailDTO, ShareLinkResponse } from "@/types";

setupTestDb();

type U = Awaited<ReturnType<typeof createUserAndCookie>>;

async function setup() {
  const a = await createUserAndCookie({ name: "Asha", email: "a@example.com" });
  const b = await createUserAndCookie({ name: "Bunty", email: "b@example.com" });
  const c = await createUserAndCookie({ name: "Chand", email: "c@example.com" });
  const folder = await json<FolderDTO>(
    await createFolder(makeRequest("/api/folders", { method: "POST", body: { name: "Market" }, cookie: a.cookie }))
  );
  return { a, b, c, folder };
}

const link = {
  set: (u: U, folderId: string, body?: unknown) =>
    setLink(makeRequest(`/api/folders/${folderId}/share-link`, { method: "POST", body, cookie: u.cookie }), routeCtx({ id: folderId })),
  get: (u: U, folderId: string) =>
    getLink(makeRequest(`/api/folders/${folderId}/share-link`, { cookie: u.cookie }), routeCtx({ id: folderId })),
  reset: (u: U, folderId: string) =>
    resetLink(makeRequest(`/api/folders/${folderId}/share-link/reset`, { method: "POST", cookie: u.cookie }), routeCtx({ id: folderId })),
  accept: (u: U | null, token: string) =>
    acceptLink(makeRequest(`/api/share/${token}/accept`, { method: "POST", cookie: u?.cookie }), routeCtx({ token })),
};

const tokenOf = (url: string) => url.split("/share/")[1] ?? "";

async function detail(u: U, folderId: string) {
  return getFolder(makeRequest(`/api/folders/${folderId}`, { cookie: u.cookie }), routeCtx({ id: folderId }));
}

describe("share link", () => {
  it("tokens are long, URL-safe and unique", () => {
    const tokens = new Set(Array.from({ length: 200 }, newShareToken));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(isShareTokenShape(t)).toBe(true);
    expect(isShareTokenShape("short")).toBe(false);
    expect(isShareTokenShape({ $ne: null })).toBe(false);
  });

  it("owner creates a link (view-only by default, empty body ok) and gets a full URL", async () => {
    const { a, folder } = await setup();
    const res = await link.set(a, folder.id);
    expect(res.status).toBe(201);
    const { link: l } = await json<ShareLinkResponse>(res);
    expect(l).toMatchObject({ canCheck: false, canEdit: false, enabled: true });
    expect(l?.url).toMatch(/^http:\/\/localhost\/share\/[A-Za-z0-9_-]{32}$/);
    expect((await json<ShareLinkResponse>(await link.get(a, folder.id))).link?.url).toBe(l?.url);
  });

  it("opening the link gives that user the link's permissions", async () => {
    const { a, c, folder } = await setup();
    const { link: l } = await json<ShareLinkResponse>(await link.set(a, folder.id, { canCheck: true }));
    const res = await link.accept(c, tokenOf(l!.url));
    expect(res.status).toBe(201);
    expect(await json<AcceptShareResponse>(res)).toEqual({ folderId: folder.id });

    const d = await json<FolderDetailDTO>(await detail(c, folder.id));
    expect(d).toMatchObject({ role: "shared", canCheck: true, canEdit: false, sharedBy: { name: "Asha" } });
    expect(await Share.findOne({ sharedWith: c.user.id }).lean()).toMatchObject({ via: "link" });
  });

  it("opening it again, or the owner opening it, changes nothing", async () => {
    const { a, c, folder } = await setup();
    const { link: l } = await json<ShareLinkResponse>(await link.set(a, folder.id));
    const token = tokenOf(l!.url);
    await link.accept(c, token);
    expect((await link.accept(c, token)).status).toBe(200);
    expect((await link.accept(a, token)).status).toBe(200);
    expect(await Share.countDocuments()).toBe(1);
  });

  it("never lowers permissions someone already has by email", async () => {
    const { a, b, folder } = await setup();
    await shareByEmail(
      makeRequest(`/api/folders/${folder.id}/shares`, { method: "POST", body: { email: "b@example.com", canEdit: true }, cookie: a.cookie }),
      routeCtx({ id: folder.id })
    );
    const { link: l } = await json<ShareLinkResponse>(await link.set(a, folder.id)); // view-only link
    await link.accept(b, tokenOf(l!.url));
    expect(await Share.findOne({ sharedWith: b.user.id }).lean()).toMatchObject({ canEdit: true, canCheck: true, via: "email" });
  });

  it("turned-off links, reset links and junk tokens are 404", async () => {
    const { a, b, c, folder } = await setup();
    const { link: l } = await json<ShareLinkResponse>(await link.set(a, folder.id));
    const oldToken = tokenOf(l!.url);

    await link.set(a, folder.id, { enabled: false });
    expect((await link.accept(c, oldToken)).status).toBe(404);
    await link.set(a, folder.id, { enabled: true });

    const { link: fresh } = await json<ShareLinkResponse>(await link.reset(a, folder.id));
    expect(tokenOf(fresh!.url)).not.toBe(oldToken);
    expect((await link.accept(c, oldToken)).status).toBe(404);
    expect((await link.accept(c, tokenOf(fresh!.url))).status).toBe(201);

    expect((await link.accept(b, "x".repeat(32))).status).toBe(404);
    expect((await link.accept(b, "../../etc")).status).toBe(404);
  });

  it("people who joined keep access after a reset", async () => {
    const { a, c, folder } = await setup();
    const { link: l } = await json<ShareLinkResponse>(await link.set(a, folder.id));
    await link.accept(c, tokenOf(l!.url));
    await link.reset(a, folder.id);
    expect((await detail(c, folder.id)).status).toBe(200);
  });

  it("requires login to accept", async () => {
    const { a, folder } = await setup();
    const { link: l } = await json<ShareLinkResponse>(await link.set(a, folder.id));
    expect((await link.accept(null, tokenOf(l!.url))).status).toBe(401);
  });

  it("only the owner manages the link (shared user 403, stranger 404)", async () => {
    const { a, b, c, folder } = await setup();
    const { link: l } = await json<ShareLinkResponse>(await link.set(a, folder.id, { canEdit: true }));
    await link.accept(b, tokenOf(l!.url));

    expect((await link.get(b, folder.id)).status).toBe(403);
    expect((await link.set(b, folder.id, { enabled: false })).status).toBe(403);
    expect((await link.reset(b, folder.id)).status).toBe(403);
    expect((await link.get(c, folder.id)).status).toBe(404);
    expect((await link.set(c, folder.id, {})).status).toBe(404);
  });

  it("validates settings", async () => {
    const { a, folder } = await setup();
    expect((await link.set(a, folder.id, { enabled: "no" })).status).toBe(400);
    expect((await link.set(a, folder.id, "{bad json")).status).toBe(400);
  });

  it("deleting the folder deletes its link", async () => {
    const { a, folder } = await setup();
    await link.set(a, folder.id);
    await deleteFolder(makeRequest(`/api/folders/${folder.id}`, { method: "DELETE", cookie: a.cookie }), routeCtx({ id: folder.id }));
    expect(await ShareLink.countDocuments()).toBe(0);
  });
});
