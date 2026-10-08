import { describe, it, expect, vi, beforeEach } from "vitest";
import { withPusherEnv } from "@/test/setup";
import { getSocketId, publishFolderEvent, publishUserEvent, resetRealtimeForTests } from "@/lib/realtime";
import { SOCKET_ID_HEADER } from "@/lib/channels";

const { trigger } = vi.hoisted(() => ({ trigger: vi.fn() }));
vi.mock("pusher", () => ({
  default: class {
    trigger = trigger;
  },
}));

withPusherEnv();
beforeEach(() => {
  trigger.mockReset();
  trigger.mockResolvedValue({});
});

describe("realtime", () => {
  it("publishes to the folder channel with the sender's socket id", async () => {
    await publishFolderEvent("f1", "item.updated", { x: 1 }, "1.2");
    expect(trigger).toHaveBeenCalledWith(["private-folder-f1"], "item.updated", { x: 1 }, { socket_id: "1.2" });
  });

  it("publishes to each user once, in batches of 100", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `u${i}`);
    await publishUserEvent([...ids, "u0"], "folder.progress", {});
    expect(trigger).toHaveBeenCalledTimes(2);
    expect(trigger.mock.calls[0]?.[0]).toHaveLength(100);
    expect(trigger.mock.calls[1]?.[0]).toHaveLength(50);
  });

  it("never throws when Pusher fails", async () => {
    trigger.mockRejectedValue(new Error("Pusher down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(publishFolderEvent("f1", "x", {})).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("does nothing when the env vars are missing", async () => {
    delete process.env.PUSHER_APP_ID;
    resetRealtimeForTests();
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await publishFolderEvent("f1", "x", {});
    expect(trigger).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("only accepts well-formed socket ids from the header", () => {
    const req = (v: string) => new Request("http://x", { headers: { [SOCKET_ID_HEADER]: v } });
    expect(getSocketId(req("123.456"))).toBe("123.456");
    expect(getSocketId(req("abc"))).toBeUndefined();
    expect(getSocketId(req("1.2;evil"))).toBeUndefined();
    expect(getSocketId(new Request("http://x"))).toBeUndefined();
  });
});
