import { afterEach, describe, expect, it, vi } from "vitest";
import { createUserAndCookie, json, makeRequest, setupTestDb } from "@/test/setup";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as status, POST as change } from "@/app/api/auth/password/route";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";
import { User } from "@/models/User";
import type { PasswordStatus } from "@/types";

setupTestDb();

const OLD = "password123";
const NEW = "brand-new-pass";
const EMAIL = "asha@example.com";

const post = (cookie: string | null, body: unknown) => change(makeRequest("/api/auth/password", { method: "POST", cookie, body }));
const canLogin = async (password: string, email = EMAIL) =>
  (await login(makeRequest("/api/auth/login", { method: "POST", body: { email, password } }))).status === 200;
const hashOf = async (email = EMAIL) => (await User.findOne({ email }).select("+passwordHash").lean())?.passwordHash;

async function googleUser() {
  const user = await User.create({ name: "G", email: "g@example.com", googleId: "g-1" });
  return `${SESSION_COOKIE}=${await createSessionToken(String(user._id))}`;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/auth/password", () => {
  it("changes the password: the new one works, the old one doesn't", async () => {
    const { cookie } = await createUserAndCookie({ email: EMAIL, password: OLD });
    expect((await post(cookie, { currentPassword: OLD, newPassword: NEW })).status).toBe(204);
    expect(await canLogin(NEW)).toBe(true);
    expect(await canLogin(OLD)).toBe(false);
  });

  it("stores a hash and never returns it", async () => {
    const { cookie } = await createUserAndCookie({ email: EMAIL, password: OLD });
    const res = await post(cookie, { currentPassword: OLD, newPassword: NEW });
    expect(await res.text()).toBe("");
    expect(await hashOf()).not.toBe(NEW);
  });

  it.each([
    ["a wrong current password", { currentPassword: "wrong-password", newPassword: NEW }],
    ["no current password", { newPassword: NEW }],
    ["an empty current password", { currentPassword: "", newPassword: NEW }],
  ])("refuses %s and changes nothing", async (_label, body) => {
    const { cookie } = await createUserAndCookie({ email: EMAIL, password: OLD });
    const before = await hashOf();
    expect((await post(cookie, body)).status).toBe(400);
    expect(await hashOf()).toBe(before);
  });

  it("needs a login", async () => {
    expect((await post(null, { newPassword: NEW })).status).toBe(401);
  });

  it("only changes my own password, whatever the body says", async () => {
    const { user, cookie } = await createUserAndCookie({ email: EMAIL, password: OLD });
    await createUserAndCookie({ email: "other@example.com", password: OLD });
    const res = await post(cookie, { currentPassword: OLD, newPassword: NEW, email: "other@example.com", id: user.id });
    expect(res.status).toBe(204);
    expect(await canLogin(OLD, "other@example.com")).toBe(true);
    expect(await canLogin(NEW, "other@example.com")).toBe(false);
  });

  it("lets a Google account set its first password, then asks for it", async () => {
    const cookie = await googleUser();
    expect((await post(cookie, { newPassword: NEW })).status).toBe(204);
    expect(await canLogin(NEW, "g@example.com")).toBe(true);
    expect((await post(cookie, { newPassword: "another-new-pass" })).status).toBe(400);
  });

  it("is refused when only Google login is on", async () => {
    const { cookie } = await createUserAndCookie({ email: EMAIL, password: OLD });
    vi.stubEnv("ONLY_LOGIN_WITH_GOOGLE", "true");
    const before = await hashOf();
    expect((await post(cookie, { currentPassword: OLD, newPassword: NEW })).status).toBe(403);
    expect(await hashOf()).toBe(before);
  });

  it("limits guessing of the current password", async () => {
    const { cookie } = await createUserAndCookie({ email: "limit@example.com", password: OLD });
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await post(cookie, { currentPassword: "wrong-password", newPassword: NEW })).status;
    expect(last).toBe(429);
  });

  it("answers 400 for bad JSON and a too short password", async () => {
    const { cookie } = await createUserAndCookie({ email: EMAIL, password: OLD });
    expect((await post(cookie, "{not json")).status).toBe(400);
    expect((await post(cookie, { currentPassword: OLD, newPassword: "short" })).status).toBe(400);
  });
});

describe("GET /api/auth/password", () => {
  const get = (cookie: string | null) => status(makeRequest("/api/auth/password", { cookie }));

  it("says what this account can do, without the hash", async () => {
    const { cookie } = await createUserAndCookie({ email: EMAIL, password: OLD });
    expect(await json<PasswordStatus>(await get(cookie))).toEqual({ allowed: true, hasPassword: true });
    expect(await json<PasswordStatus>(await get(await googleUser()))).toEqual({ allowed: true, hasPassword: false });
  });

  it("says not allowed when only Google login is on, and needs a login", async () => {
    const { cookie } = await createUserAndCookie({ email: EMAIL, password: OLD });
    vi.stubEnv("ONLY_LOGIN_WITH_GOOGLE", "true");
    expect((await json<PasswordStatus>(await get(cookie))).allowed).toBe(false);
    expect((await get(null)).status).toBe(401);
  });
});
