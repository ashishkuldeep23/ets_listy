import { describe, it, expect } from "vitest";
import { createUserAndCookie, makeRequest, sessionCookieFrom, setupTestDb } from "@/test/setup";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { User } from "@/models/User";

setupTestDb();

const post = (handler: (req: Request) => Promise<Response>, path: string, body: unknown, headers?: Record<string, string>) =>
  handler(makeRequest(path, { method: "POST", body, headers }));

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

  it("rate-limits after 30 failures from one IP, whatever the email", { timeout: 120_000 }, async () => {
    const headers = { "x-forwarded-for": "1.2.3.4" };
    for (let i = 0; i < 30; i++) {
      const res = await post(login, "/api/auth/login", { email: `user${i}@b.com`, password: "x" }, headers);
      expect(res.status).toBe(401);
    }
    const blocked = await post(login, "/api/auth/login", { email: "next@b.com", password: "x" }, headers);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();

    // A different IP is not affected.
    const other = await post(login, "/api/auth/login", { email: "next@b.com", password: "x" }, { "x-forwarded-for": "5.6.7.8" });
    expect(other.status).toBe(401);
  });

  it("rate-limits guessing one account's password, even from many IPs", { timeout: 120_000 }, async () => {
    const attempt = (i: number) =>
      post(login, "/api/auth/login", { email: "asha@b.com", password: "x" }, { "x-forwarded-for": `1.1.1.${i}` });
    for (let i = 0; i < 10; i++) expect((await attempt(i)).status).toBe(401);
    expect((await attempt(99)).status).toBe(429);
  });

  it("doesn't count successful logins, so people sharing an IP aren't blocked", { timeout: 120_000 }, async () => {
    await createUserAndCookie({ email: "asha@example.com", password: "password123" });
    const headers = { "x-forwarded-for": "1.2.3.4" };
    for (let i = 0; i < 12; i++) {
      const res = await post(login, "/api/auth/login", { email: "asha@example.com", password: "password123" }, headers);
      expect(res.status).toBe(200);
    }
  });
});

describe("a broken session cookie", () => {
  it("counts as logged out, instead of failing the request", async () => {
    const res = await me(makeRequest("/api/auth/me", { cookie: "listy_session=%E0%A4%A" }));
    expect(res.status).toBe(401);
  });

  it("sets no cookie for someone who never had one", async () => {
    const res = await me(makeRequest("/api/auth/me"));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
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
