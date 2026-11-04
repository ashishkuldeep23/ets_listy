import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, sessionCookieFrom, setupTestDb } from "@/test/setup";
import { GET as start } from "@/app/api/auth/google/route";
import { GET as callback } from "@/app/api/auth/google/callback/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as signup } from "@/app/api/auth/signup/route";
import { hashPassword } from "@/lib/auth";
import { User } from "@/models/User";

setupTestDb();

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
const idToken = (sub = "g-1", email = "asha@example.com") =>
  `${b64({ alg: "RS256" })}.${b64({
    iss: "https://accounts.google.com",
    aud: "client-1",
    exp: Date.now() / 1000 + 60,
    sub,
    email,
    email_verified: true,
    name: "Asha G",
  })}.sig`;

const googleAnswers = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

const callbackWith = (state: string, cookieValue: string | null, code = "code-1") =>
  callback(
    makeRequest(`/api/auth/google/callback?code=${code}&state=${state}`, {
      headers: cookieValue ? { cookie: `listy_google_state=${cookieValue}` } : {},
    })
  );

const failed = (res: Response) => res.headers.get("location")?.endsWith("/login?error=google");

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-1");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret-1");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/auth/google", () => {
  it("redirects to Google with a state that matches its cookie", async () => {
    const res = await start(makeRequest("/api/auth/google?next=/folders/1"));
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.hostname).toBe("accounts.google.com");
    const state = location.searchParams.get("state");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`listy_google_state=${state}.`);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it("never sends the client secret to the browser", async () => {
    const res = await start(makeRequest("/api/auth/google"));
    expect(res.headers.get("location")).not.toContain("secret-1");
  });

  it("goes back to login when Google isn't set up", async () => {
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect(failed(await start(makeRequest("/api/auth/google")))).toBe(true);
  });
});

describe("GET /api/auth/google/callback", () => {
  it("creates the account the first time, logs in and goes to next", async () => {
    googleAnswers(200, { id_token: idToken() });
    const res = await callbackWith("s1", `s1.${encodeURIComponent("/folders/1")}`);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/folders/1");
    expect(sessionCookieFrom(res)).toBeTruthy();
    const user = await User.findOne({ email: "asha@example.com" }).select("+googleId").lean();
    expect(user).toMatchObject({ name: "Asha G", googleId: "g-1" });
  });

  it("logs into the same account the next time", async () => {
    googleAnswers(200, { id_token: idToken() });
    await callbackWith("s1", "s1.%2F");
    await callbackWith("s1", "s1.%2F");
    expect(await User.countDocuments({ email: "asha@example.com" })).toBe(1);
  });

  it("links an existing password account and removes its password", async () => {
    await User.create({ name: "Early", email: "asha@example.com", passwordHash: await hashPassword("attacker-pass") });
    googleAnswers(200, { id_token: idToken() });
    expect(sessionCookieFrom(await callbackWith("s1", "s1.%2F"))).toBeTruthy();
    const user = await User.findOne({ email: "asha@example.com" }).select("+googleId +passwordHash").lean();
    expect(user?.googleId).toBe("g-1");
    expect(user?.passwordHash).toBeUndefined();
    const res = await login(makeRequest("/api/auth/login", { method: "POST", body: { email: "asha@example.com", password: "attacker-pass" } }));
    expect(res.status).toBe(401);
  });

  it("refuses an email that belongs to another Google account", async () => {
    await User.create({ name: "Other", email: "asha@example.com", googleId: "g-other" });
    googleAnswers(200, { id_token: idToken("g-1") });
    expect(failed(await callbackWith("s1", "s1.%2F"))).toBe(true);
  });

  it.each([
    ["a state that doesn't match", "wrong", "s1.%2F"],
    ["no state cookie", "s1", null],
  ])("refuses %s without asking Google", async (_label, state, cookie) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await callbackWith(state, cookie);
    expect(failed(res)).toBe(true);
    expect(sessionCookieFrom(res)).toBeFalsy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails when Google refuses the code", async () => {
    googleAnswers(400, { error: "invalid_grant" });
    expect(failed(await callbackWith("s1", "s1.%2F"))).toBe(true);
  });

  it("never redirects to another site through the cookie", async () => {
    googleAnswers(200, { id_token: idToken() });
    const res = await callbackWith("s1", `s1.${encodeURIComponent("//evil.example")}`);
    expect(new URL(res.headers.get("location") ?? "").hostname).toBe("localhost");
  });
});

describe("password routes", () => {
  const creds = { email: "asha@example.com", password: "password123" };

  it("a Google account can't log in with the dummy password", async () => {
    await User.create({ name: "G", email: creds.email, googleId: "g-1" });
    const res = await login(makeRequest("/api/auth/login", { method: "POST", body: { ...creds, password: "listy-dummy-password" } }));
    expect(res.status).toBe(401);
  });

  it("refuses login and signup with ONLY_LOGIN_WITH_GOOGLE=true", async () => {
    vi.stubEnv("ONLY_LOGIN_WITH_GOOGLE", "true");
    await User.create({ name: "A", email: creds.email, passwordHash: await hashPassword(creds.password) });
    expect((await login(makeRequest("/api/auth/login", { method: "POST", body: creds }))).status).toBe(403);
    expect((await signup(makeRequest("/api/auth/signup", { method: "POST", body: { ...creds, name: "B" } }))).status).toBe(403);
  });

  it("allows them when it is false", async () => {
    vi.stubEnv("ONLY_LOGIN_WITH_GOOGLE", "false");
    await User.create({ name: "A", email: creds.email, passwordHash: await hashPassword(creds.password) });
    expect((await login(makeRequest("/api/auth/login", { method: "POST", body: creds }))).status).toBe(200);
  });
});
