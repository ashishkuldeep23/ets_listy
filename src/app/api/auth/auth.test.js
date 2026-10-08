import { describe, it, expect } from "vitest";
import { createUserAndCookie, makeRequest, sessionCookieFrom, setupTestDb } from "@/test/setup";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { User } from "@/models/User";

setupTestDb();

const post = (handler, path, body, headers) => handler(makeRequest(path, { method: "POST", body, headers }));

describe("POST /api/auth/signup", () => {
  it("creates the user, sets an httpOnly cookie and never returns the hash", async () => {
    const res = await post(signup, "/api/auth/signup", { name: "Asha", email: "asha@example.com", password: "password123" });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body).toEqual({ id: expect.any(String), name: "Asha", email: "asha@example.com" });

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toMatch(/listy_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);

    const stored = await User.findOne({ email: "asha@example.com" }).select("+passwordHash").lean();
    expect(stored.passwordHash).not.toBe("password123");
  });

  it("returns 409 for an email that is already used (any case)", async () => {
    await createUserAndCookie({ email: "asha@example.com" });
    const res = await post(signup, "/api/auth/signup", { name: "X", email: "ASHA@example.com", password: "password123" });
    expect(res.status).toBe(409);
  });

  it("returns 400 for bad input and bad JSON", async () => {
    expect((await post(signup, "/api/auth/signup", { name: "X", email: "bad", password: "password123" })).status).toBe(400);
    expect((await post(signup, "/api/auth/signup", "{not json")).status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with the right password and sets a cookie", async () => {
    await createUserAndCookie({ email: "asha@example.com", password: "password123" });
    const res = await post(login, "/api/auth/login", { email: "Asha@Example.com", password: "password123" });
    expect(res.status).toBe(200);
    expect(sessionCookieFrom(res)).toBeTruthy();
  });

  it("gives the same 401 message for a wrong password and an unknown email", async () => {
    await createUserAndCookie({ email: "asha@example.com", password: "password123" });
    const wrongPw = await post(login, "/api/auth/login", { email: "asha@example.com", password: "nope-nope" });
    const noUser = await post(login, "/api/auth/login", { email: "ghost@example.com", password: "nope-nope" });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(await wrongPw.json()).toEqual(await noUser.json());
  });

  it("rejects operator-object injection", async () => {
    await createUserAndCookie({ email: "asha@example.com" });
    const res = await post(login, "/api/auth/login", { email: { $gt: "" }, password: { $gt: "" } });
    expect(res.status).toBe(400);
  });

  it("rate-limits after 10 attempts from one IP", async () => {
    const headers = { "x-forwarded-for": "1.2.3.4" };
    for (let i = 0; i < 10; i++) {
      expect((await post(login, "/api/auth/login", { email: "a@b.com", password: "x" }, headers)).status).toBe(401);
    }
    const blocked = await post(login, "/api/auth/login", { email: "a@b.com", password: "x" }, headers);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();

    // A different IP is not affected.
    const other = await post(login, "/api/auth/login", { email: "a@b.com", password: "x" }, { "x-forwarded-for": "5.6.7.8" });
    expect(other.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the user for a valid cookie", async () => {
    const { user, cookie } = await createUserAndCookie({ name: "Asha", email: "asha@example.com" });
    const res = await me(makeRequest("/api/auth/me", { cookie }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(user);
  });

  it("returns 401 without a cookie or with a forged one", async () => {
    expect((await me(makeRequest("/api/auth/me"))).status).toBe(401);
    expect((await me(makeRequest("/api/auth/me", { cookie: "listy_session=forged.token.here" }))).status).toBe(401);
  });

  it("returns 401 once the user is deleted", async () => {
    const { user, cookie } = await createUserAndCookie();
    await User.deleteOne({ _id: user.id });
    expect((await me(makeRequest("/api/auth/me", { cookie }))).status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the cookie", async () => {
    const res = await logout();
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/listy_session=;.*Max-Age=0/i);
  });
});
