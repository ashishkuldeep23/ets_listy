import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUserAndCookie, json, makeRequest, routeCtx, setupTestDb, withPusherEnv } from "@/test/setup";
import { PATCH as updateMe } from "@/app/api/auth/me/route";
import { GET as recent } from "@/app/api/chat/recent/route";
import { POST as createFolder } from "@/app/api/folders/route";
import { DELETE as deleteFolder } from "@/app/api/folders/[id]/route";
import { GET as listChat, POST as sendChat } from "@/app/api/folders/[id]/chat/route";
import { POST as presence } from "@/app/api/folders/[id]/presence/route";
import { POST as share } from "@/app/api/folders/[id]/shares/route";
import { POST as setLink } from "@/app/api/folders/[id]/share-link/route";
import { GET as guestListChat, POST as guestSendChat } from "@/app/api/share/[token]/chat/route";
import { POST as guestPresence } from "@/app/api/share/[token]/presence/route";
import { EVENTS, folderChannel, userChannel } from "@/lib/channels";
import { GUEST_ID_HEADER } from "@/lib/constants";
import { resetPresenceForTests } from "@/lib/presence";
import { ChatMessage } from "@/models/ChatMessage";
import type {
  ChatListResponse,
  ChatMessageDTO,
  ChatNoticeResponse,
  FolderDTO,
  PresenceResponse,
  SessionUser,
  ShareLinkResponse,
} from "@/types";

const { trigger } = vi.hoisted(() => ({ trigger: vi.fn() }));
vi.mock("pusher", () => ({
  default: class {
    trigger = trigger;
  },
}));

setupTestDb();
withPusherEnv();
beforeEach(() => {
  resetPresenceForTests();
  trigger.mockReset();
  trigger.mockResolvedValue({});
});

// List chat, "who is here" and the profile edit, for members and link guests.

type Call = [string[], string, unknown];
const GUEST_A = "guestAAAAAAAAAAAAAAAAAAA";
const GUEST_B = "guestBBBBBBBBBBBBBBBBBBB";

async function setup() {
  const owner = await createUserAndCookie({ name: "Asha", email: "a@example.com" });
  const friend = await createUserAndCookie({ name: "Ravi", email: "r@example.com" });
  const stranger = await createUserAndCookie({ name: "Zed", email: "z@example.com" });
  const folder = await json<FolderDTO>(
    await createFolder(makeRequest("/api/folders", { method: "POST", body: { name: "Market" }, cookie: owner.cookie }))
  );
  const ctx = routeCtx({ id: folder.id });
  await share(
    makeRequest(`/api/folders/${folder.id}/shares`, { method: "POST", body: { email: "r@example.com" }, cookie: owner.cookie }),
    ctx
  );
  const { link } = await json<ShareLinkResponse>(
    await setLink(makeRequest(`/api/folders/${folder.id}/share-link`, { method: "POST", body: {}, cookie: owner.cookie }), ctx)
  );
  const token = link?.url.split("/share/")[1] ?? "";
  const tctx = routeCtx({ token });

  const here = (cookie: string, body?: unknown) =>
    presence(makeRequest(`/api/folders/${folder.id}/presence`, { method: "POST", cookie, body }), ctx);
  const send = (cookie: string, text: unknown) =>
    sendChat(makeRequest(`/api/folders/${folder.id}/chat`, { method: "POST", cookie, body: { text } }), ctx);
  const read = (cookie: string, after = "") =>
    listChat(makeRequest(`/api/folders/${folder.id}/chat${after}`, { cookie }), ctx);
  const guestHere = (guestId?: string) =>
    guestPresence(
      makeRequest(`/api/share/${token}/presence`, { method: "POST", headers: guestId ? { [GUEST_ID_HEADER]: guestId } : {} }),
      tctx
    );
  const guestSend = (guestId: string, text: string) =>
    guestSendChat(
      makeRequest(`/api/share/${token}/chat`, { method: "POST", body: { text }, headers: { [GUEST_ID_HEADER]: guestId } }),
      tctx
    );
  const guestRead = (guestId: string) =>
    guestListChat(makeRequest(`/api/share/${token}/chat`, { headers: { [GUEST_ID_HEADER]: guestId } }), tctx);

  trigger.mockClear();
  return { owner, friend, stranger, folder, ctx, token, here, send, read, guestHere, guestSend, guestRead };
}

describe("presence (who is viewing)", () => {
  it("lists members with names and emails, marking me", async () => {
    const { owner, friend, here } = await setup();
    await here(friend.cookie);
    const res = await here(owner.cookie);
    expect(res.status).toBe(200);
    const { people } = await json<PresenceResponse>(res);
    expect(people).toEqual([
      { name: "Asha", email: "a@example.com", guest: false, me: true },
      { name: "Ravi", email: "r@example.com", guest: false, me: false },
    ]);
  });

  it("shows guests to members without any email, and never shows emails to guests", async () => {
    const { owner, here, guestHere } = await setup();
    await here(owner.cookie);
    const guestView = await json<PresenceResponse>(await guestHere(GUEST_A));
    expect(guestView.people.every((p) => p.email === null)).toBe(true);
    const me = guestView.people.find((p) => p.me);
    expect(me).toMatchObject({ guest: true });
    expect(me?.name).toMatch(/^Guest [0-9A-F]{4}$/);

    const ownerView = await json<PresenceResponse>(await here(owner.cookie));
    expect(ownerView.people.find((p) => p.guest)).toMatchObject({ email: null, me: false });
  });

  it("drops me at once when I leave", async () => {
    const { owner, friend, here } = await setup();
    await here(friend.cookie);
    expect((await here(friend.cookie, { leave: true })).status).toBe(204);
    const { people } = await json<PresenceResponse>(await here(owner.cookie));
    expect(people.map((p) => p.name)).toEqual(["Asha"]);
  });

  it("is a 404 for someone without access, and 401 when logged out", async () => {
    const { stranger, here, folder, ctx } = await setup();
    expect((await here(stranger.cookie)).status).toBe(404);
    expect((await presence(makeRequest(`/api/folders/${folder.id}/presence`, { method: "POST" }), ctx)).status).toBe(401);
  });

  it("needs a guest id from guests, and an enabled link", async () => {
    const { owner, folder, ctx, guestHere } = await setup();
    expect((await guestHere()).status).toBe(400);
    expect((await guestHere("bad id")).status).toBe(400);
    await setLink(
      makeRequest(`/api/folders/${folder.id}/share-link`, { method: "POST", body: { enabled: false }, cookie: owner.cookie }),
      ctx
    );
    expect((await guestHere(GUEST_A)).status).toBe(404);
  });
});

describe("chat", () => {
  it("refuses to send while I'm alone on the list", async () => {
    const { owner, here, send } = await setup();
    await here(owner.cookie);
    expect((await send(owner.cookie, "hello?")).status).toBe(409);
    expect(await ChatMessage.countDocuments()).toBe(0);
  });

  it("sends when 2+ people are here; each reader sees which messages are theirs", async () => {
    const { owner, friend, folder, here, send, read } = await setup();
    await here(owner.cookie);
    await here(friend.cookie);
    const res = await send(owner.cookie, "  Milk or curd?  ");
    expect(res.status).toBe(201);
    const sent = await json<ChatMessageDTO>(res);
    expect(sent).toMatchObject({ text: "Milk or curd?", authorName: "Asha", mine: true, folderId: folder.id });

    const asFriend = await json<ChatListResponse>(await read(friend.cookie));
    expect(asFriend.messages).toHaveLength(1);
    expect(asFriend.messages[0]).toMatchObject({ authorName: "Asha", mine: false });
    expect(JSON.stringify(asFriend)).not.toContain("a@example.com");
  });

  it("publishes the message to the list and a notice to everyone but the author", async () => {
    const { owner, friend, folder, here, send } = await setup();
    await here(owner.cookie);
    await here(friend.cookie);
    await send(owner.cookie, "On my way");
    const calls = trigger.mock.calls as Call[];
    const msg = calls.find(([, event]) => event === EVENTS.chatMessage);
    expect(msg?.[0]).toEqual([folderChannel(folder.id)]);
    expect(msg?.[2]).toMatchObject({ text: "On my way", mine: false });
    const notice = calls.find(([, event]) => event === EVENTS.chatNotice);
    expect(notice?.[0]).toEqual([userChannel(friend.user.id)]);
    expect(notice?.[2]).toMatchObject({ folderName: "Market", authorName: "Asha", text: "On my way" });
  });

  it("returns only newer messages with ?after and rejects a bad date", async () => {
    const { owner, friend, here, send, read } = await setup();
    await here(owner.cookie);
    await here(friend.cookie);
    const first = await json<ChatMessageDTO>(await send(owner.cookie, "one"));
    await new Promise((r) => setTimeout(r, 5));
    await send(friend.cookie, "two");
    const after = `?after=${encodeURIComponent(new Date(new Date(first.createdAt).getTime() + 1).toISOString())}`;
    const { messages } = await json<ChatListResponse>(await read(owner.cookie, after));
    expect(messages.map((m) => m.text)).toEqual(["two"]);
    expect((await read(owner.cookie, "?after=soon")).status).toBe(400);
  });

  it("rejects empty and over-long messages", async () => {
    const { owner, friend, here, send } = await setup();
    await here(owner.cookie);
    await here(friend.cookie);
    expect((await send(owner.cookie, "   ")).status).toBe(400);
    expect((await send(owner.cookie, "x".repeat(1001))).status).toBe(400);
    expect((await send(owner.cookie, { $gt: "" })).status).toBe(400);
  });

  it("is a 404 for someone without access", async () => {
    const { stranger, read, send } = await setup();
    expect((await read(stranger.cookie)).status).toBe(404);
    expect((await send(stranger.cookie, "hi")).status).toBe(404);
  });

  it("lets link guests chat as 'Guest XXXX' with members, and marks their own messages", async () => {
    const { owner, here, read, guestHere, guestSend, guestRead } = await setup();
    await here(owner.cookie);
    await guestHere(GUEST_A);
    const res = await guestSend(GUEST_A, "Hi from the link");
    expect(res.status).toBe(201);
    const sent = await json<ChatMessageDTO>(res);
    expect(sent.authorName).toMatch(/^Guest [0-9A-F]{4}$/);
    expect(sent).toMatchObject({ authorId: null, mine: true });

    expect((await json<ChatListResponse>(await guestRead(GUEST_A))).messages[0]?.mine).toBe(true);
    expect((await json<ChatListResponse>(await guestRead(GUEST_B))).messages[0]?.mine).toBe(false);
    expect((await json<ChatListResponse>(await read(owner.cookie))).messages[0]?.mine).toBe(false);
    // The raw guest id is never stored.
    expect(JSON.stringify(await ChatMessage.find().lean())).not.toContain(GUEST_A);
  });

  it("counts two guests as two people, but one guest in two tabs as one", async () => {
    const { guestHere, guestSend } = await setup();
    await guestHere(GUEST_A);
    await guestHere(GUEST_A);
    expect((await guestSend(GUEST_A, "anyone?")).status).toBe(409);
    await guestHere(GUEST_B);
    expect((await guestSend(GUEST_A, "hi B")).status).toBe(201);
  });

  it("deletes the chat with the list", async () => {
    const { owner, friend, folder, ctx, here, send } = await setup();
    await here(owner.cookie);
    await here(friend.cookie);
    await send(owner.cookie, "bye");
    await deleteFolder(makeRequest(`/api/folders/${folder.id}`, { method: "DELETE", cookie: owner.cookie }), ctx);
    expect(await ChatMessage.countDocuments()).toBe(0);
  });
});

describe("GET /api/chat/recent (toast fallback)", () => {
  it("returns others' messages in my lists, not my own, not other lists", async () => {
    const { owner, friend, stranger, here, send } = await setup();
    const since = new Date(Date.now() - 1000).toISOString();
    await here(owner.cookie);
    await here(friend.cookie);
    await send(owner.cookie, "from Asha");
    await send(friend.cookie, "from Ravi");

    const get = (cookie: string, after = since) =>
      recent(makeRequest(`/api/chat/recent?after=${encodeURIComponent(after)}`, { cookie }));
    const forOwner = await json<ChatNoticeResponse>(await get(owner.cookie));
    expect(forOwner.notices.map((n) => n.text)).toEqual(["from Ravi"]);
    expect(forOwner.notices[0]).toMatchObject({ folderName: "Market", authorName: "Ravi" });
    expect((await json<ChatNoticeResponse>(await get(stranger.cookie))).notices).toEqual([]);
    expect((await get(owner.cookie, "nope")).status).toBe(400);
  });
});

describe("PATCH /api/auth/me", () => {
  const patch = (cookie: string | undefined, body: unknown) =>
    updateMe(makeRequest("/api/auth/me", { method: "PATCH", cookie, body }));

  it("changes my name and keeps my email", async () => {
    const { owner } = await setup();
    const res = await patch(owner.cookie, { name: "  Asha Kumari " });
    expect(res.status).toBe(200);
    expect(await json<SessionUser>(res)).toEqual({ id: owner.user.id, name: "Asha Kumari", email: "a@example.com" });
  });

  it("refuses an email change, a blank name, and logged-out callers", async () => {
    const { owner } = await setup();
    expect((await patch(owner.cookie, { name: "Asha", email: "x@example.com" })).status).toBe(400);
    expect((await patch(owner.cookie, { name: " " })).status).toBe(400);
    expect((await patch(undefined, { name: "Hacker" })).status).toBe(401);
  });
});
