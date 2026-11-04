import { describe, expect, it } from "vitest";
import { createUserAndCookie, json, makeRequest, routeCtx, setupTestDb } from "@/test/setup";
import { DELETE as remove, PATCH as patch } from "@/app/api/feedback/[id]/route";
import { GET as list, POST as post } from "@/app/api/feedback/route";
import { Feedback } from "@/models/Feedback";
import type { FeedbackDTO, FeedbackListResponse } from "@/types";

setupTestDb();

const create = (cookie: string | null, body: unknown) => post(makeRequest("/api/feedback", { method: "POST", cookie, body }));
const getAll = async (cookie: string) => (await json<FeedbackListResponse>(await list(makeRequest("/api/feedback", { cookie })))).feedback;
const update = (cookie: string | null, id: string, body: unknown) =>
  patch(makeRequest(`/api/feedback/${id}`, { method: "PATCH", cookie, body }), routeCtx({ id }));
const del = (cookie: string | null, id: string) => remove(makeRequest(`/api/feedback/${id}`, { method: "DELETE", cookie }), routeCtx({ id }));

async function twoUsers() {
  const a = await createUserAndCookie({ email: "a@example.com" });
  const b = await createUserAndCookie({ email: "b@example.com" });
  const made = await json<FeedbackDTO>(await create(a.cookie, { message: "Nice app" }));
  return { a, b, made };
}

describe("POST /api/feedback", () => {
  it("creates it with the defaults", async () => {
    const { cookie } = await createUserAndCookie();
    const res = await create(cookie, { message: " Nice " });
    expect(res.status).toBe(201);
    expect(await json<FeedbackDTO>(res)).toMatchObject({ name: "User", rating: 5, message: "Nice", mine: true });
  });

  it("needs a login", async () => {
    expect((await create(null, { message: "x" })).status).toBe(401);
    expect((await list(makeRequest("/api/feedback"))).status).toBe(401);
  });

  it("refuses bad input and can't set other fields", async () => {
    const { user, cookie } = await createUserAndCookie();
    expect((await create(cookie, { message: "" })).status).toBe(400);
    expect((await create(cookie, { message: "x", rating: 6 })).status).toBe(400);
    expect((await create(cookie, "{not json")).status).toBe(400);
    await create(cookie, { message: "x", user: "65f0a1b2c3d4e5f6a7b8c9d0", deletedAt: new Date() });
    const stored = await Feedback.findOne().lean();
    expect(String(stored?.user)).toBe(user.id);
    expect(stored?.deletedAt).toBeNull();
  });

  it("limits how much one account can post", async () => {
    const { cookie } = await createUserAndCookie({ email: "flood@example.com" });
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await create(cookie, { message: `m${i}` })).status;
    expect(last).toBe(429);
  });
});

describe("GET /api/feedback", () => {
  it("shows everyone's, newest first, marking only mine and never the author's id", async () => {
    const { a, b, made } = await twoUsers();
    const second = await json<FeedbackDTO>(await create(b.cookie, { message: "Second", name: "Bea" }));
    const seen = await getAll(b.cookie);
    expect(seen.map((f) => f.id)).toEqual([second.id, made.id]);
    expect(seen.map((f) => f.mine)).toEqual([true, false]);
    expect(JSON.stringify(seen)).not.toContain(a.user.id);
    expect(seen[1]).not.toHaveProperty("user");
    expect(seen[1]).not.toHaveProperty("deletedAt");
  });
});

describe("PATCH /api/feedback/:id", () => {
  it("lets the author update it", async () => {
    const { a, made } = await twoUsers();
    const res = await update(a.cookie, made.id, { message: "Better", rating: 3, name: "Asha" });
    expect(res.status).toBe(200);
    expect(await json<FeedbackDTO>(res)).toMatchObject({ message: "Better", rating: 3, name: "Asha", mine: true });
  });

  it("another user can't update it (404), and it stays as it was", async () => {
    const { b, made } = await twoUsers();
    expect((await update(b.cookie, made.id, { message: "Hacked" })).status).toBe(404);
    expect((await Feedback.findById(made.id).lean())?.message).toBe("Nice app");
  });

  it("answers 404 for a bad id, 401 logged out, 400 for bad input", async () => {
    const { a, made } = await twoUsers();
    expect((await update(a.cookie, "not-an-id", { message: "x" })).status).toBe(404);
    expect((await update(null, made.id, { message: "x" })).status).toBe(401);
    expect((await update(a.cookie, made.id, { message: "" })).status).toBe(400);
  });

  it("can't bring back a deleted one", async () => {
    const { a, made } = await twoUsers();
    await del(a.cookie, made.id);
    expect((await update(a.cookie, made.id, { message: "Back" })).status).toBe(404);
  });
});

describe("DELETE /api/feedback/:id", () => {
  it("hides it from everyone but keeps the row", async () => {
    const { a, b, made } = await twoUsers();
    expect((await del(a.cookie, made.id)).status).toBe(204);
    expect(await getAll(a.cookie)).toEqual([]);
    expect(await getAll(b.cookie)).toEqual([]);
    const row = await Feedback.findById(made.id).lean();
    expect(row?.message).toBe("Nice app");
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });

  it("another user can't delete it (404)", async () => {
    const { a, b, made } = await twoUsers();
    expect((await del(b.cookie, made.id)).status).toBe(404);
    expect((await getAll(a.cookie)).length).toBe(1);
    expect((await Feedback.findById(made.id).lean())?.deletedAt).toBeNull();
  });

  it("answers 404 when deleted twice or for a bad id, 401 logged out", async () => {
    const { a, made } = await twoUsers();
    expect((await del(null, made.id)).status).toBe(401);
    expect((await del(a.cookie, "not-an-id")).status).toBe(404);
    await del(a.cookie, made.id);
    expect((await del(a.cookie, made.id)).status).toBe(404);
  });
});
