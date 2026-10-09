import { describe, it, expect } from "vitest";
import { createUserAndCookie, json, makeRequest, routeCtx, setupTestDb } from "@/test/setup";
import { POST as createFolder } from "@/app/api/folders/route";
import { DELETE as deleteFolder } from "@/app/api/folders/[id]/route";
import { POST as createItem } from "@/app/api/folders/[id]/items/route";
import { POST as toggleItem } from "@/app/api/folders/[id]/items/[itemId]/toggle/route";
import { POST as setLink } from "@/app/api/folders/[id]/share-link/route";
import { POST as resetLink } from "@/app/api/folders/[id]/share-link/reset/route";
import { GET as viewShare } from "@/app/api/share/[token]/route";
import type { FolderDTO, ItemDTO, PublicShareResponse, ShareLinkResponse } from "@/types";

setupTestDb();

// The public, read-only view behind a share link: no login needed.

const view = (token: string, headers?: Record<string, string>) =>
  viewShare(makeRequest(`/api/share/${token}`, { headers }), routeCtx({ token }));

const tokenOf = (url: string | undefined) => url?.split("/share/")[1] ?? "";

async function setup() {
  const a = await createUserAndCookie({ name: "Asha", email: "a@example.com" });
  const folder = await json<FolderDTO>(
    await createFolder(makeRequest("/api/folders", { method: "POST", body: { name: "Market" }, cookie: a.cookie }))
  );
  const ctx = routeCtx({ id: folder.id });
  const milk = await json<ItemDTO>(
    await createItem(
      makeRequest(`/api/folders/${folder.id}/items`, { method: "POST", body: { name: "Milk", price: 60 }, cookie: a.cookie }),
      ctx
    )
  );
  await toggleItem(
    makeRequest(`/api/folders/${folder.id}/items/${milk.id}/toggle`, { method: "POST", body: { done: true }, cookie: a.cookie }),
    routeCtx({ id: folder.id, itemId: milk.id })
  );
  const setLinkAs = (body?: unknown) =>
    setLink(makeRequest(`/api/folders/${folder.id}/share-link`, { method: "POST", body, cookie: a.cookie }), ctx);
  const { link } = await json<ShareLinkResponse>(await setLinkAs());
  return { a, folder, ctx, token: tokenOf(link?.url), setLinkAs };
}

describe("public share view", () => {
  it("shows the list and its items to a visitor with no login", async () => {
    const { token } = await setup();
    const res = await view(token);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");

    const body = await json<PublicShareResponse>(res);
    expect(body.list).toEqual({ name: "Market", status: "active" });
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ name: "Milk", price: 60, done: true });
  });

  it("never reveals who ticked an item, or the owner", async () => {
    const { token } = await setup();
    const text = await (await view(token)).text();
    const body = JSON.parse(text) as PublicShareResponse;
    expect(body.items[0]?.doneBy).toBeNull();
    expect(text).not.toContain("Asha");
    expect(text).not.toContain("a@example.com");
    expect(body.list).not.toHaveProperty("owner");
  });

  it("is 404 for malformed, unknown, turned-off and reset links, and for deleted lists", async () => {
    const { a, folder, ctx, token, setLinkAs } = await setup();
    expect((await view("short")).status).toBe(404);
    expect((await view("A".repeat(32))).status).toBe(404);

    await setLinkAs({ enabled: false });
    expect((await view(token)).status).toBe(404);
    await setLinkAs({ enabled: true });
    expect((await view(token)).status).toBe(200);

    await resetLink(makeRequest(`/api/folders/${folder.id}/share-link/reset`, { method: "POST", cookie: a.cookie }), ctx);
    expect((await view(token)).status).toBe(404);

    const { link } = await json<ShareLinkResponse>(await setLinkAs());
    const fresh = tokenOf(link?.url);
    expect((await view(fresh)).status).toBe(200);
    await deleteFolder(makeRequest(`/api/folders/${folder.id}`, { method: "DELETE", cookie: a.cookie }), ctx);
    expect((await view(fresh)).status).toBe(404);
  });

  it("rate-limits guessing per IP", async () => {
    const headers = { "x-forwarded-for": "203.0.113.9" };
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await view("B".repeat(32), headers)).status;
    expect(last).toBe(429);
  });
});
