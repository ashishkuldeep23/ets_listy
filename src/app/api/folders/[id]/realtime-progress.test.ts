import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUserAndCookie, json, makeRequest, routeCtx, setupTestDb, withPusherEnv } from "@/test/setup";
import { POST as createFolder } from "@/app/api/folders/route";
import { DELETE as deleteFolder } from "@/app/api/folders/[id]/route";
import { POST as createItem } from "@/app/api/folders/[id]/items/route";
import { PATCH as updateItem, DELETE as deleteItem } from "@/app/api/folders/[id]/items/[itemId]/route";
import { POST as toggleItem } from "@/app/api/folders/[id]/items/[itemId]/toggle/route";
import { POST as shareFolder } from "@/app/api/folders/[id]/shares/route";
import { DELETE as removeShare } from "@/app/api/folders/[id]/shares/[userId]/route";
import { POST as setLink } from "@/app/api/folders/[id]/share-link/route";
import { POST as acceptLink } from "@/app/api/share/[token]/accept/route";
import { EVENTS, userChannel } from "@/lib/channels";
import type { FolderDTO, ItemDTO, ShareLinkResponse } from "@/types";

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

type U = Awaited<ReturnType<typeof createUserAndCookie>>;
type Call = [string[], string, unknown];

/** Events sent on USER channels: [sorted channels, event, data]. */
const userEvents = () =>
  (trigger.mock.calls as Call[])
    .filter(([channels]) => channels.every((c) => c.startsWith("private-user-")))
    .map(([channels, event, data]) => [[...channels].sort(), event, data] as const);

const post = (u: U, path: string, body?: unknown) => makeRequest(path, { method: "POST", body, cookie: u.cookie });

async function setup() {
  const a = await createUserAndCookie({ name: "Asha", email: "a@example.com" });
  const b = await createUserAndCookie({ name: "Bunty", email: "b@example.com" });
  const c = await createUserAndCookie({ name: "Chand", email: "c@example.com" });
  const stranger = await createUserAndCookie({ name: "Dev", email: "d@example.com" });
  const folder = await json<FolderDTO>(await createFolder(post(a, "/api/folders", { name: "Market" })));
  const f = routeCtx({ id: folder.id });
  for (const email of ["b@example.com", "c@example.com"]) {
    await shareFolder(post(a, `/api/folders/${folder.id}/shares`, { email, canEdit: true }), f);
  }
  const milk = await json<ItemDTO>(await createItem(post(a, `/api/folders/${folder.id}/items`, { name: "Milk" }), f));
  await createItem(post(a, `/api/folders/${folder.id}/items`, { name: "Bread" }), f);
  trigger.mockClear();
  return { a, b, c, stranger, folder, milk };
}

describe("live progress on home pages", () => {
  it("a tick by a shared user sends new counts to the owner and every shared user, never a stranger", async () => {
    const { a, b, c, stranger, folder, milk } = await setup();
    await toggleItem(
      post(b, `/api/folders/${folder.id}/items/${milk.id}/toggle`, { done: true }),
      routeCtx({ id: folder.id, itemId: milk.id })
    );

    const audience = [a, b, c].map((u) => userChannel(u.user.id)).sort();
    expect(userEvents()).toEqual([
      [audience, EVENTS.folderProgress, { folderId: folder.id, itemCount: 2, doneCount: 1 }],
    ]);
    expect(JSON.stringify(trigger.mock.calls)).not.toContain(stranger.user.id);
  });

  it("adding and deleting items send progress; editing doesn't", async () => {
    const { a, folder, milk } = await setup();
    const f = routeCtx({ id: folder.id });
    const i = routeCtx({ id: folder.id, itemId: milk.id });
    await createItem(post(a, `/api/folders/${folder.id}/items`, { name: "Eggs" }), f);
    await updateItem(makeRequest(`/api/folders/${folder.id}/items/${milk.id}`, { method: "PATCH", body: { price: 5 }, cookie: a.cookie }), i);
    await deleteItem(makeRequest(`/api/folders/${folder.id}/items/${milk.id}`, { method: "DELETE", cookie: a.cookie }), i);

    expect(userEvents().map(([, event, data]) => [event, data])).toEqual([
      [EVENTS.folderProgress, { folderId: folder.id, itemCount: 3, doneCount: 0 }],
      [EVENTS.folderProgress, { folderId: folder.id, itemCount: 2, doneCount: 0 }],
    ]);
  });

  it("deleting a folder tells everyone who had it to remove the card", async () => {
    const { a, b, c, folder } = await setup();
    await deleteFolder(makeRequest(`/api/folders/${folder.id}`, { method: "DELETE", cookie: a.cookie }), routeCtx({ id: folder.id }));
    const audience = [a, b, c].map((u) => userChannel(u.user.id)).sort();
    expect(userEvents()).toEqual([
      [audience, EVENTS.folderProgress, { folderId: folder.id, itemCount: 0, doneCount: 0, deleted: true }],
    ]);
  });

  it("sharing, removing and joining by link tell only that user", async () => {
    const { a, b, stranger, folder } = await setup();
    const f = routeCtx({ id: folder.id });

    await removeShare(
      makeRequest(`/api/folders/${folder.id}/shares/${b.user.id}`, { method: "DELETE", cookie: a.cookie }),
      routeCtx({ id: folder.id, userId: b.user.id })
    );
    await shareFolder(post(a, `/api/folders/${folder.id}/shares`, { email: "b@example.com" }), f);
    const { link } = await json<ShareLinkResponse>(await setLink(post(a, `/api/folders/${folder.id}/share-link`), f));
    const token = link!.url.split("/share/")[1]!;
    await acceptLink(post(stranger, `/api/share/${token}/accept`), routeCtx({ token }));

    expect(userEvents()).toEqual([
      [[userChannel(b.user.id)], EVENTS.folderAccess, { folderId: folder.id, removed: true }],
      [[userChannel(b.user.id)], EVENTS.folderAccess, { folderId: folder.id }],
      [[userChannel(stranger.user.id)], EVENTS.folderAccess, { folderId: folder.id }],
    ]);
  });
});
