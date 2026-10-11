import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUserAndCookie, json, makeRequest, routeCtx, setupTestDb, withPusherEnv } from "@/test/setup";
import { POST as createFolder } from "@/app/api/folders/route";
import { GET as listItems, POST as createItem } from "@/app/api/folders/[id]/items/route";
import { POST as toggleItem } from "@/app/api/folders/[id]/items/[itemId]/toggle/route";
import { POST as setLink } from "@/app/api/folders/[id]/share-link/route";
import { POST as resetLink } from "@/app/api/folders/[id]/share-link/reset/route";
import { GET as viewShare } from "@/app/api/share/[token]/route";
import { POST as guestToggle } from "@/app/api/share/[token]/items/[itemId]/toggle/route";
import { EVENTS, folderChannel, userChannel } from "@/lib/channels";
import type { FolderDTO, ItemDTO, ItemListResponse, PublicShareResponse, ShareLinkResponse } from "@/types";

const { trigger } = vi.hoisted(() => ({ trigger: vi.fn() }));
vi.mock("pusher", () => ({
  default: class {
    trigger = trigger;
  },
}));

setupTestDb();
withPusherEnv();
beforeEach(() => {
  trigger.mockReset();
  trigger.mockResolvedValue({});
});

// Ticking items through a share link with NO login, and the owner seeing it live.

type Call = [string[], string, unknown];
const tokenOf = (url: string | undefined) => url?.split("/share/")[1] ?? "";

const tick = (token: string, itemId: string, body: unknown, headers?: Record<string, string>) =>
  guestToggle(
    makeRequest(`/api/share/${token}/items/${itemId}/toggle`, { method: "POST", body, headers }),
    routeCtx({ token, itemId })
  );

async function setup(linkPerms: { canCheck?: boolean; canEdit?: boolean } = { canCheck: true }) {
  const a = await createUserAndCookie({ name: "Asha", email: "a@example.com" });
  const folder = await json<FolderDTO>(
    await createFolder(makeRequest("/api/folders", { method: "POST", body: { name: "Market" }, cookie: a.cookie }))
  );
  const ctx = routeCtx({ id: folder.id });
  const milk = await json<ItemDTO>(
    await createItem(makeRequest(`/api/folders/${folder.id}/items`, { method: "POST", body: { name: "Milk" }, cookie: a.cookie }), ctx)
  );
  const setLinkAs = (body?: unknown) =>
    setLink(makeRequest(`/api/folders/${folder.id}/share-link`, { method: "POST", body, cookie: a.cookie }), ctx);
  const { link } = await json<ShareLinkResponse>(await setLinkAs(linkPerms));
  const ownerItems = async () =>
    json<ItemListResponse>(await listItems(makeRequest(`/api/folders/${folder.id}/items`, { cookie: a.cookie }), ctx));
  trigger.mockClear();
  return { a, folder, ctx, milk, token: tokenOf(link?.url), setLinkAs, ownerItems };
}

describe("guest ticking via share link", () => {
  it("lets a logged-out visitor tick when the link allows it, hiding names in the answer", async () => {
    const { token, milk, ownerItems } = await setup();
    const res = await tick(token, milk.id, { done: true });
    expect(res.status).toBe(200);
    const body = await json<ItemDTO>(res);
    expect(body).toMatchObject({ id: milk.id, done: true, doneBy: null });

    // The owner sees it ticked, "by Guest".
    const [item] = (await ownerItems()).items;
    expect(item).toMatchObject({ done: true, doneBy: { id: "guest", name: "Guest" } });
    expect(item?.doneAt).not.toBeNull();
  });

  it("publishes the change on the folder channel and the progress to the owner (Pusher)", async () => {
    const { token, milk, folder, a } = await setup();
    await tick(token, milk.id, { done: true });

    const calls = trigger.mock.calls as Call[];
    const itemEvent = calls.find(([ch, ev]) => ch.includes(folderChannel(folder.id)) && ev === EVENTS.itemUpdated);
    expect(itemEvent?.[2]).toMatchObject({ item: { id: milk.id, done: true, doneBy: { name: "Guest" } } });

    const progress = calls.find(([ch, ev]) => ch.includes(userChannel(a.user.id)) && ev === EVENTS.folderProgress);
    expect(progress?.[2]).toEqual({ folderId: folder.id, itemCount: 1, doneCount: 1 });
  });

  it("unticks and clears the guest mark", async () => {
    const { token, milk, ownerItems } = await setup();
    await tick(token, milk.id, { done: true });
    const res = await tick(token, milk.id, { done: false });
    expect(res.status).toBe(200);
    expect((await ownerItems()).items[0]).toMatchObject({ done: false, doneBy: null, doneAt: null });
  });

  it("a logged-in tick after a guest tick shows the user's name, not Guest", async () => {
    const { token, milk, folder, a, ownerItems } = await setup();
    await tick(token, milk.id, { done: true });
    await toggleItem(
      makeRequest(`/api/folders/${folder.id}/items/${milk.id}/toggle`, { method: "POST", body: { done: true }, cookie: a.cookie }),
      routeCtx({ id: folder.id, itemId: milk.id })
    );
    expect((await ownerItems()).items[0]?.doneBy).toMatchObject({ name: "Asha" });
  });

  it("refuses when the link is view-only (403), and the public view says so", async () => {
    const { token, milk, ownerItems } = await setup({ canCheck: false, canEdit: false });
    const view = await json<PublicShareResponse>(await viewShare(makeRequest(`/api/share/${token}`), routeCtx({ token })));
    expect(view.canCheck).toBe(false);

    expect((await tick(token, milk.id, { done: true })).status).toBe(403);
    expect((await ownerItems()).items[0]?.done).toBe(false);
    expect(trigger).not.toHaveBeenCalled();
  });

  it("allows ticking when the link only says canEdit (edit includes tick)", async () => {
    const { token, milk } = await setup({ canEdit: true });
    const view = await json<PublicShareResponse>(await viewShare(makeRequest(`/api/share/${token}`), routeCtx({ token })));
    expect(view.canCheck).toBe(true);
    expect((await tick(token, milk.id, { done: true })).status).toBe(200);
  });

  it("stops working when the link is turned off or reset", async () => {
    const { token, milk, folder, a, setLinkAs } = await setup();
    await setLinkAs({ enabled: false });
    expect((await tick(token, milk.id, { done: true })).status).toBe(404);

    await setLinkAs({ enabled: true });
    await resetLink(
      makeRequest(`/api/folders/${folder.id}/share-link/reset`, { method: "POST", cookie: a.cookie }),
      routeCtx({ id: folder.id })
    );
    expect((await tick(token, milk.id, { done: true })).status).toBe(404);
  });

  it("can't tick items of another list, or junk ids / tokens", async () => {
    const { token, a } = await setup();
    const other = await json<FolderDTO>(
      await createFolder(makeRequest("/api/folders", { method: "POST", body: { name: "Other" }, cookie: a.cookie }))
    );
    const foreign = await json<ItemDTO>(
      await createItem(
        makeRequest(`/api/folders/${other.id}/items`, { method: "POST", body: { name: "Secret" }, cookie: a.cookie }),
        routeCtx({ id: other.id })
      )
    );
    expect((await tick(token, foreign.id, { done: true })).status).toBe(404);
    expect((await tick(token, "not-an-id", { done: true })).status).toBe(404);
    expect((await tick("short", foreign.id, { done: true })).status).toBe(404);
  });

  it("validates the body", async () => {
    const { token, milk } = await setup();
    expect((await tick(token, milk.id, { done: "yes" })).status).toBe(400);
    expect((await tick(token, milk.id, "{bad json")).status).toBe(400);
  });

  it("rate-limits per IP", async () => {
    const { token, milk } = await setup();
    const ip = { "x-forwarded-for": "9.9.9.9" };
    let last = 200;
    for (let i = 0; i < 201; i++) last = (await tick(token, milk.id, { done: i % 2 === 0 }, ip)).status;
    expect(last).toBe(429);
  });
});
