import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUserAndCookie, json, makeRequest, routeCtx, setupTestDb, withPusherEnv } from "@/test/setup";
import { POST as createFolder } from "@/app/api/folders/route";
import { PATCH as updateFolder, DELETE as deleteFolder } from "@/app/api/folders/[id]/route";
import { POST as createItem } from "@/app/api/folders/[id]/items/route";
import { PATCH as updateItem, DELETE as deleteItem } from "@/app/api/folders/[id]/items/[itemId]/route";
import { POST as toggleItem } from "@/app/api/folders/[id]/items/[itemId]/toggle/route";
import { POST as renameGroup } from "@/app/api/folders/[id]/groups/rename/route";
import { POST as shareFolder } from "@/app/api/folders/[id]/shares/route";
import { PATCH as updateShare, DELETE as removeShare } from "@/app/api/folders/[id]/shares/[userId]/route";
import { EVENTS, SOCKET_ID_HEADER, folderChannel } from "@/lib/channels";
import type { FolderDTO, ItemDTO } from "@/types";

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
const SOCKET = { [SOCKET_ID_HEADER]: "111.222" };

/** All [channel(s), event, data, params] calls made to Pusher so far. */
const published = () => trigger.mock.calls as [string[], string, unknown, { socket_id: string } | undefined][];
const eventsSent = () => published().map(([, event]) => event);

async function setup() {
  const a = await createUserAndCookie({ name: "Asha", email: "a@example.com" });
  const b = await createUserAndCookie({ name: "Bunty", email: "b@example.com" });
  const folder = await json<FolderDTO>(
    await createFolder(makeRequest("/api/folders", { method: "POST", body: { name: "Market" }, cookie: a.cookie }))
  );
  const item = await json<ItemDTO>(
    await createItem(
      makeRequest(`/api/folders/${folder.id}/items`, { method: "POST", body: { name: "Milk", group: "Dairy" }, cookie: a.cookie }),
      routeCtx({ id: folder.id })
    )
  );
  trigger.mockClear();
  return { a, b, folder, item };
}

function req(u: U, path: string, method: string, body?: unknown) {
  return makeRequest(path, { method, body, cookie: u.cookie, headers: SOCKET });
}

describe("live folder events", () => {
  it("item create / edit / tick / delete publish to the folder channel with the sender's socket id", async () => {
    const { a, folder, item } = await setup();
    const base = `/api/folders/${folder.id}/items`;
    const f = routeCtx({ id: folder.id });
    const i = routeCtx({ id: folder.id, itemId: item.id });

    await createItem(req(a, base, "POST", { name: "Bread" }), f);
    await updateItem(req(a, `${base}/${item.id}`, "PATCH", { price: 60 }), i);
    await toggleItem(req(a, `${base}/${item.id}/toggle`, "POST", { done: true }), i);
    await deleteItem(req(a, `${base}/${item.id}`, "DELETE"), i);

    expect(eventsSent()).toEqual([EVENTS.itemCreated, EVENTS.itemUpdated, EVENTS.itemUpdated, EVENTS.itemDeleted]);
    for (const [channels, , , params] of published()) {
      expect(channels).toEqual([folderChannel(folder.id)]);
      expect(params).toEqual({ socket_id: "111.222" });
    }
    expect(published()[0]?.[2]).toMatchObject({ item: { name: "Bread", folderId: folder.id } });
    expect(published()[3]?.[2]).toEqual({ itemId: item.id });
  });

  it("a tick by a shared user carries their name, never an email", async () => {
    const { a, b, folder, item } = await setup();
    await shareFolder(req(a, `/api/folders/${folder.id}/shares`, "POST", { email: "b@example.com", canCheck: true }), routeCtx({ id: folder.id }));
    trigger.mockClear();

    await toggleItem(
      req(b, `/api/folders/${folder.id}/items/${item.id}/toggle`, "POST", { done: true }),
      routeCtx({ id: folder.id, itemId: item.id })
    );
    const [, event, data] = published()[0]!;
    expect(event).toBe(EVENTS.itemUpdated);
    expect(data).toMatchObject({ item: { done: true, doneBy: { id: b.user.id, name: "Bunty" } } });
    expect(JSON.stringify(data)).not.toContain("@example.com");
  });

  it("group rename, folder rename and folder delete are published", async () => {
    const { a, folder } = await setup();
    const f = routeCtx({ id: folder.id });
    await renameGroup(req(a, `/api/folders/${folder.id}/groups/rename`, "POST", { from: "Dairy", to: "Milk stuff" }), f);
    await updateFolder(req(a, `/api/folders/${folder.id}`, "PATCH", { status: "completed" }), f);
    await deleteFolder(req(a, `/api/folders/${folder.id}`, "DELETE"), f);

    expect(eventsSent()).toEqual([EVENTS.groupRenamed, EVENTS.folderUpdated, EVENTS.folderDeleted]);
    expect(published()[0]?.[2]).toEqual({ from: "Dairy", to: "Milk stuff" });
    expect(published()[1]?.[2]).toMatchObject({ folder: { id: folder.id, status: "completed" } });
    expect(published()[2]?.[2]).toEqual({ folderId: folder.id });
  });

  it("permission changes and removals tell open screens to re-check access", async () => {
    const { a, b, folder } = await setup();
    const f = routeCtx({ id: folder.id });
    await shareFolder(req(a, `/api/folders/${folder.id}/shares`, "POST", { email: "b@example.com" }), f);
    expect(eventsSent()).toEqual([]); // a brand-new share: nobody is watching yet

    await shareFolder(req(a, `/api/folders/${folder.id}/shares`, "POST", { email: "b@example.com", canEdit: true }), f);
    const s = routeCtx({ id: folder.id, userId: b.user.id });
    await updateShare(req(a, `/api/folders/${folder.id}/shares/${b.user.id}`, "PATCH", { canEdit: false }), s);
    await removeShare(req(a, `/api/folders/${folder.id}/shares/${b.user.id}`, "DELETE"), s);

    expect(eventsSent()).toEqual([EVENTS.accessChanged, EVENTS.accessChanged, EVENTS.accessChanged]);
    for (const [, , data] of published()) expect(data).toEqual({ userId: b.user.id });
  });

  it("failed requests publish nothing", async () => {
    const { a, b, folder, item } = await setup();
    const base = `/api/folders/${folder.id}/items`;
    const i = routeCtx({ id: folder.id, itemId: item.id });
    await createItem(req(a, base, "POST", { name: "" }), routeCtx({ id: folder.id })); // 400
    await toggleItem(req(b, `${base}/${item.id}/toggle`, "POST", { done: true }), i); // 404, no access
    await deleteItem(req(a, `${base}/000000000000000000000000`, "DELETE"), routeCtx({ id: folder.id, itemId: "000000000000000000000000" })); // 404
    expect(trigger).not.toHaveBeenCalled();
  });

  it("a Pusher failure doesn't change the API response", async () => {
    const { a, folder, item } = await setup();
    trigger.mockRejectedValue(new Error("Pusher down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await toggleItem(
      req(a, `/api/folders/${folder.id}/items/${item.id}/toggle`, "POST", { done: true }),
      routeCtx({ id: folder.id, itemId: item.id })
    );
    expect(res.status).toBe(200);
    expect((await json<ItemDTO>(res)).done).toBe(true);
    spy.mockRestore();
  });
});
