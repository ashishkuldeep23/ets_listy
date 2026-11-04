import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUserAndCookie, json, makeRequest, routeCtx, setupTestDb } from "@/test/setup";
import { GET as cron } from "@/app/api/cron/reminders/route";
import { GET as listFolders } from "@/app/api/folders/route";
import { DELETE as removeFolder } from "@/app/api/folders/[id]/route";
import { DELETE as removeReminder, GET as getReminder, PUT as putReminder } from "@/app/api/folders/[id]/reminder/route";
import { DELETE as removeDevice, POST as addDevice } from "@/app/api/push/subscription/route";
import { LIMITS } from "@/lib/limits";
import { Folder } from "@/models/Folder";
import { PushSubscription } from "@/models/PushSubscription";
import { Reminder } from "@/models/Reminder";
import { Share } from "@/models/Share";
import type { FolderListResponse, ReminderResponse } from "@/types";

const sendNotification = vi.hoisted(() => vi.fn());
vi.mock("web-push", () => ({ default: { sendNotification } }));

setupTestDb();

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/device-1";
const device = (endpoint = ENDPOINT) => ({ endpoint, keys: { p256dh: "p", auth: "a" } });

const put = (cookie: string, id: string, remindAt: unknown = FUTURE) =>
  putReminder(makeRequest(`/api/folders/${id}/reminder`, { method: "PUT", cookie, body: { remindAt } }), routeCtx({ id }));
const get = (cookie: string, id: string) => getReminder(makeRequest(`/api/folders/${id}/reminder`, { cookie }), routeCtx({ id }));
const runCron = (secret = "cron-secret") =>
  cron(makeRequest("/api/cron/reminders", { headers: { authorization: `Bearer ${secret}` } }));
const subscribe = (cookie: string, endpoint?: string) =>
  addDevice(makeRequest("/api/push/subscription", { method: "POST", cookie, body: device(endpoint) }));

async function setup() {
  const owner = await createUserAndCookie({ email: "owner@example.com" });
  const folder = await Folder.create({ name: "Market", owner: owner.user.id });
  return { owner, id: String(folder._id) };
}

/** A reminder that came due a minute ago (the API refuses past dates). */
const makeDue = (id: string, userId: string) =>
  Reminder.create({ user: userId, folder: id, remindAt: new Date(Date.now() - 60_000) });

beforeEach(() => {
  sendNotification.mockReset();
  sendNotification.mockResolvedValue({});
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private");
  vi.stubEnv("VAPID_SUBJECT", "mailto:a@example.com");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("/api/folders/:id/reminder", () => {
  it("sets, reads, replaces and removes my reminder", async () => {
    const { owner, id } = await setup();
    expect((await json<ReminderResponse>(await get(owner.cookie, id))).reminder).toBeNull();

    expect((await put(owner.cookie, id)).status).toBe(200);
    const later = new Date(Date.now() + 2 * 86_400_000).toISOString();
    await put(owner.cookie, id, later);
    const { reminder } = await json<ReminderResponse>(await get(owner.cookie, id));
    expect(reminder?.remindAt).toBe(later);
    expect(reminder?.sent).toBe(false);
    expect(await Reminder.countDocuments()).toBe(1);

    const res = await removeReminder(makeRequest(`/api/folders/${id}/reminder`, { method: "DELETE", cookie: owner.cookie }), routeCtx({ id }));
    expect(res.status).toBe(204);
    expect(await Reminder.countDocuments()).toBe(0);
  });

  it("another user can't see or set one (404), and needs a login (401)", async () => {
    const { id } = await setup();
    const other = await createUserAndCookie({ email: "other@example.com" });
    expect((await get(other.cookie, id)).status).toBe(404);
    expect((await put(other.cookie, id)).status).toBe(404);
    expect((await get("", id)).status).toBe(401);
  });

  it("a view-only member has their own reminder, private from the owner", async () => {
    const { owner, id } = await setup();
    const member = await createUserAndCookie({ email: "member@example.com" });
    await Share.create({ folder: id, owner: owner.user.id, sharedWith: member.user.id, via: "email" });
    expect((await put(member.cookie, id)).status).toBe(200);
    expect((await json<ReminderResponse>(await get(owner.cookie, id))).reminder).toBeNull();
  });

  it("refuses a date in the past and a bad id", async () => {
    const { owner, id } = await setup();
    expect((await put(owner.cookie, id, "2020-01-01T00:00:00.000Z")).status).toBe(400);
    expect((await put(owner.cookie, id, { $gt: "" })).status).toBe(400);
    expect((await get(owner.cookie, "not-an-id")).status).toBe(404);
  });

  it("is deleted with the list", async () => {
    const { owner, id } = await setup();
    await put(owner.cookie, id);
    await removeFolder(makeRequest(`/api/folders/${id}`, { method: "DELETE", cookie: owner.cookie }), routeCtx({ id }));
    expect(await Reminder.countDocuments()).toBe(0);
  });
});

describe("GET /api/folders: my reminder on each card", () => {
  const cards = async (cookie: string, scope: string) => {
    const res = await listFolders(makeRequest(`/api/folders?scope=${scope}`, { cookie }));
    return (await json<FolderListResponse>(res)).folders;
  };

  it("has my reminder and nobody else's", async () => {
    const { owner, id } = await setup();
    const member = await createUserAndCookie({ email: "member@example.com" });
    await Share.create({ folder: id, owner: owner.user.id, sharedWith: member.user.id, via: "email" });
    expect((await cards(owner.cookie, "mine"))[0]?.reminder).toBeNull();

    await put(member.cookie, id);
    expect((await cards(member.cookie, "shared"))[0]?.reminder).toEqual({ remindAt: FUTURE, sent: false });
    expect((await cards(owner.cookie, "mine"))[0]?.reminder).toBeNull();
  });
});

describe("/api/push/subscription", () => {
  it("needs a login and a known push service", async () => {
    const { owner } = await setup();
    expect((await subscribe("")).status).toBe(401);
    expect((await subscribe(owner.cookie, "https://169.254.169.254/x")).status).toBe(400);
    expect(await PushSubscription.countDocuments()).toBe(0);
  });

  it("a device moves to whoever subscribes on it last", async () => {
    const { owner } = await setup();
    const other = await createUserAndCookie({ email: "other@example.com" });
    await subscribe(owner.cookie);
    await subscribe(other.cookie);
    const subs = await PushSubscription.find().lean();
    expect(subs.map((s) => String(s.user))).toEqual([other.user.id]);
  });

  it("keeps only my most recent devices", async () => {
    const { owner } = await setup();
    for (let i = 0; i <= LIMITS.PUSH_DEVICES_PER_USER; i++) await subscribe(owner.cookie, `${ENDPOINT}-${i}`);
    expect(await PushSubscription.countDocuments()).toBe(LIMITS.PUSH_DEVICES_PER_USER);
  });

  it("another user can't remove my device", async () => {
    const { owner } = await setup();
    const other = await createUserAndCookie({ email: "other@example.com" });
    await subscribe(owner.cookie);
    const remove = (cookie: string) =>
      removeDevice(makeRequest("/api/push/subscription", { method: "DELETE", cookie, body: { endpoint: ENDPOINT } }));
    await remove(other.cookie);
    expect(await PushSubscription.countDocuments()).toBe(1);
    await remove(owner.cookie);
    expect(await PushSubscription.countDocuments()).toBe(0);
  });
});

describe("GET /api/cron/reminders", () => {
  it("refuses a wrong secret, and everyone when no secret is set", async () => {
    expect((await runCron("wrong")).status).toBe(401);
    expect((await cron(makeRequest("/api/cron/reminders"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await runCron("")).status).toBe(401);
  });

  it("answers 503 when push isn't set up", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect((await runCron()).status).toBe(503);
  });

  it("answers 503 when the VAPID subject can't be used", async () => {
    vi.stubEnv("VAPID_SUBJECT", "not an address");
    expect((await runCron()).status).toBe(503);
  });

  it("sends with a mailto: subject when VAPID_SUBJECT is a bare email", async () => {
    vi.stubEnv("VAPID_SUBJECT", "a@example.com");
    const { owner, id } = await setup();
    await subscribe(owner.cookie);
    await makeDue(id, owner.user.id);

    expect(await json(await runCron())).toEqual({ sent: 1 });
    expect(sendNotification.mock.calls[0]?.[2]).toMatchObject({ vapidDetails: { subject: "mailto:a@example.com" } });
  });

  it("sends a due reminder once, with the list's name and link", async () => {
    const { owner, id } = await setup();
    await subscribe(owner.cookie);
    await makeDue(id, owner.user.id);

    expect(await json(await runCron())).toEqual({ sent: 1 });
    expect(await json(await runCron())).toEqual({ sent: 0 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [target, payload] = sendNotification.mock.calls[0] ?? [];
    expect(target).toEqual({ endpoint: ENDPOINT, keys: { p256dh: "p", auth: "a" } });
    expect(JSON.parse(String(payload))).toEqual({ title: "Listy reminder", body: "Market", url: `/folders/${id}` });
    expect((await json<ReminderResponse>(await get(owner.cookie, id))).reminder?.sent).toBe(true);
  });

  it("leaves future reminders alone", async () => {
    const { owner, id } = await setup();
    await subscribe(owner.cookie);
    await put(owner.cookie, id);
    expect(await json(await runCron())).toEqual({ sent: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("drops the reminder of someone who lost access, without notifying them", async () => {
    const { id } = await setup();
    const other = await createUserAndCookie({ email: "other@example.com" });
    await subscribe(other.cookie);
    await makeDue(id, other.user.id);
    await runCron();
    expect(sendNotification).not.toHaveBeenCalled();
    expect(await Reminder.countDocuments()).toBe(0);
  });

  it("forgets a device the push service says is gone", async () => {
    const { owner, id } = await setup();
    await subscribe(owner.cookie);
    await makeDue(id, owner.user.id);
    sendNotification.mockRejectedValue(Object.assign(new Error("gone"), { statusCode: 410 }));
    await runCron();
    expect(await PushSubscription.countDocuments()).toBe(0);
  });

  it("retries next run after a temporary failure, while the reminder is recent", async () => {
    const { owner, id } = await setup();
    await subscribe(owner.cookie);
    await makeDue(id, owner.user.id);
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("busy"), { statusCode: 503 }));
    expect(await json(await runCron())).toEqual({ sent: 0 });
    // One attempt per run, not a tight loop against a failing service.
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(await json(await runCron())).toEqual({ sent: 1 });
  });

  it("gives up on a failure once the reminder is old", async () => {
    const { owner, id } = await setup();
    await subscribe(owner.cookie);
    await Reminder.create({ user: owner.user.id, folder: id, remindAt: new Date(Date.now() - 2 * 60 * 60_000) });
    sendNotification.mockRejectedValue(Object.assign(new Error("busy"), { statusCode: 503 }));
    await runCron();
    await runCron();
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("never logs the device's endpoint when a push fails", async () => {
    const { owner, id } = await setup();
    await subscribe(owner.cookie);
    await makeDue(id, owner.user.id);
    sendNotification.mockRejectedValue(Object.assign(new Error(`failed for ${ENDPOINT}`), { statusCode: 500, endpoint: ENDPOINT }));
    await runCron();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(ENDPOINT);
  });
});
