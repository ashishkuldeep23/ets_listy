import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import { createUserAndCookie, json, makeRequest, routeCtx, setupTestDb, withPusherEnv } from "@/test/setup";
import { POST as createFolder } from "@/app/api/folders/route";
import { POST as shareFolder } from "@/app/api/folders/[id]/shares/route";
import { POST as pusherAuth } from "@/app/api/pusher/auth/route";
import { folderChannel, userChannel } from "@/lib/channels";
import { resetRealtimeForTests } from "@/lib/realtime";
import type { FolderDTO } from "@/types";

// Fake Pusher: never talks to the real service.
const { authorizeChannel } = vi.hoisted(() => ({
  authorizeChannel: vi.fn((socketId: string, channel: string) => ({ auth: `test-key:${socketId}:${channel}` })),
}));
vi.mock("pusher", () => ({
  default: class {
    authorizeChannel = authorizeChannel;
    trigger = vi.fn();
  },
}));

setupTestDb();
withPusherEnv();
beforeEach(() => authorizeChannel.mockClear());

type U = Awaited<ReturnType<typeof createUserAndCookie>>;

const auth = (u: U | null, channel: string, socketId = "123.456") =>
  pusherAuth(
    makeRequest("/api/pusher/auth", {
      method: "POST",
      body: new URLSearchParams({ socket_id: socketId, channel_name: channel }).toString(),
      cookie: u?.cookie,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })
  );

async function setup() {
  const a = await createUserAndCookie({ name: "Asha", email: "a@example.com" });
  const b = await createUserAndCookie({ name: "Bunty", email: "b@example.com" });
  const c = await createUserAndCookie({ name: "Chand", email: "c@example.com" });
  const folder = await json<FolderDTO>(
    await createFolder(makeRequest("/api/folders", { method: "POST", body: { name: "Market" }, cookie: a.cookie }))
  );
  await shareFolder(
    makeRequest(`/api/folders/${folder.id}/shares`, { method: "POST", body: { email: "b@example.com" }, cookie: a.cookie }),
    routeCtx({ id: folder.id })
  );
  return { a, b, c, folder };
}

describe("POST /api/pusher/auth", () => {
  it("requires login", async () => {
    expect((await auth(null, userChannel(String(new mongoose.Types.ObjectId())))).status).toBe(401);
  });

  it("lets the owner and a shared user listen to a folder, not a stranger", async () => {
    const { a, b, c, folder } = await setup();
    const res = await auth(a, folderChannel(folder.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ auth: `test-key:123.456:${folderChannel(folder.id)}` });
    expect((await auth(b, folderChannel(folder.id))).status).toBe(200);
    expect((await auth(c, folderChannel(folder.id))).status).toBe(403);
  });

  it("lets a user listen only to their own user channel", async () => {
    const { a, b } = await setup();
    expect((await auth(a, userChannel(a.user.id))).status).toBe(200);
    expect((await auth(a, userChannel(b.user.id))).status).toBe(403);
  });

  it("refuses anything that isn't an exact private channel name", async () => {
    const { a, folder } = await setup();
    for (const channel of [
      "private-folder-xyz",
      `presence-folder-${folder.id}`,
      `folder-${folder.id}`,
      `private-folder-${folder.id}-extra`,
      `private-user-${a.user.id.toUpperCase()}`,
      "",
    ]) {
      expect((await auth(a, channel)).status).toBe(403);
    }
    expect(authorizeChannel).not.toHaveBeenCalled();
  });

  it("rejects a malformed socket id", async () => {
    const { a } = await setup();
    expect((await auth(a, userChannel(a.user.id), "abc")).status).toBe(400);
  });

  it("answers 503 when Pusher isn't configured", async () => {
    const { a } = await setup();
    delete process.env.PUSHER_SECRET;
    resetRealtimeForTests();
    expect((await auth(a, userChannel(a.user.id))).status).toBe(503);
  });
});
