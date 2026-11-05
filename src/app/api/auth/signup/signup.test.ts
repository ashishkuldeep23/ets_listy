import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUserAndCookie, json, makeRequest, sessionCookieFrom, setupTestDb } from "@/test/setup";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as activate } from "@/app/api/auth/activate/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as me } from "@/app/api/auth/me/route";
import { hashActivationToken } from "@/lib/activation";
import { LIMITS } from "@/lib/limits";
import { resetMailerForTests } from "@/lib/mailer";
import { PendingSignup } from "@/models/PendingSignup";
import { User } from "@/models/User";
import type { ActivationResponse } from "@/types";

// Signup by email link: no account until the link is opened.

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));

setupTestDb();

const EMAIL = "asha@example.com";
const form = { name: "Asha", email: EMAIL, password: "password123", confirmPassword: "password123" };

const postSignup = (body: unknown = form, headers?: Record<string, string>) =>
  signup(makeRequest("/api/auth/signup", { method: "POST", body, headers }));
const postActivate = (token: unknown, cookie?: string | null) =>
  activate(makeRequest("/api/auth/activate", { method: "POST", body: { token }, cookie }));

/** The token inside the newest email sent. */
function tokenFromMail(): string {
  const mail = sendMail.mock.lastCall?.[0] as { text: string } | undefined;
  const token = mail?.text.match(/\/activate\/([\w-]+)/)?.[1];
  if (!token) throw new Error("no activation link in the email");
  return token;
}

/** Lets another email go to this address without waiting. */
const skipCooldown = () => PendingSignup.updateOne({ email: EMAIL }, { $set: { lastSentAt: new Date(0) } });

beforeEach(() => {
  sendMail.mockReset();
  sendMail.mockResolvedValue({});
  resetMailerForTests();
  vi.stubEnv("USER_EMAIL", "listy@example.com");
  vi.stubEnv("USER_PASS", "app-password");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/auth/signup", () => {
  it("emails a link, and makes neither an account nor a session", async () => {
    const res = await postSignup();
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ email: EMAIL });
    expect(sessionCookieFrom(res)).toBeNull();
    expect(await User.exists({ email: EMAIL })).toBeNull();
    expect(sendMail).toHaveBeenCalledOnce();
    expect(sendMail.mock.lastCall?.[0]).toMatchObject({ to: EMAIL });
  });

  it("stores only hashes, never the token or the password", async () => {
    await postSignup();
    const token = tokenFromMail();
    const stored = await PendingSignup.findOne({ email: EMAIL }).select("+passwordHash").lean();
    expect(stored?.tokenHash).toBe(hashActivationToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored?.passwordHash).toMatch(/^\$2/);
  });

  it("refuses passwords that don't match, and missing confirmation", async () => {
    const wrong = await postSignup({ ...form, confirmPassword: "password124" });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: "Passwords don't match" });
    expect((await postSignup({ name: form.name, email: EMAIL, password: form.password })).status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("answers 400 for bad input, injection and bad JSON", async () => {
    expect((await postSignup({ ...form, email: "bad" })).status).toBe(400);
    expect((await postSignup({ ...form, email: { $gt: "" } })).status).toBe(400);
    expect((await postSignup("{not json")).status).toBe(400);
  });

  it("answers 409 for an email already in use (any case), and sends nothing", async () => {
    await createUserAndCookie({ email: EMAIL });
    expect((await postSignup({ ...form, email: "ASHA@example.com" })).status).toBe(409);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("waits between emails to one address, from any IP", async () => {
    await postSignup(form, { "x-forwarded-for": "1.1.1.1" });
    const res = await postSignup(form, { "x-forwarded-for": "2.2.2.2" });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeLessThanOrEqual(LIMITS.ACTIVATION_RESEND_SECONDS);
    expect(sendMail).toHaveBeenCalledOnce();
  });

  it("limits how many emails one address gets, even after the wait", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await postSignup()).status).toBe(202);
      await skipCooldown();
    }
    expect((await postSignup()).status).toBe(429);
    expect(sendMail).toHaveBeenCalledTimes(5);
  });

  it("removes the signup when the email can't be sent, so they can retry at once", async () => {
    sendMail.mockRejectedValueOnce(Object.assign(new Error("secret details"), { code: "EAUTH" }));
    const res = await postSignup();
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("secret details");
    expect(await PendingSignup.exists({ email: EMAIL })).toBeNull();
    expect((await postSignup()).status).toBe(202);
  });

  it("answers 503 when email isn't set up, without making anything", async () => {
    vi.stubEnv("USER_PASS", "");
    expect((await postSignup()).status).toBe(503);
    expect(await PendingSignup.exists({ email: EMAIL })).toBeNull();
  });

  it("builds the link from APP_URL, not from a faked Host", async () => {
    vi.stubEnv("APP_URL", "https://listy.example.com");
    await signup(new Request("https://evil.example/api/auth/signup", { method: "POST", body: JSON.stringify(form) }));
    const { text } = sendMail.mock.lastCall?.[0] as { text: string };
    expect(text).toContain("https://listy.example.com/activate/");
    expect(text).not.toContain("evil.example");
  });

  it("is off in production until APP_URL is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "");
    expect((await postSignup()).status).toBe(503);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("doesn't accept extra fields", async () => {
    await postSignup({ ...form, isAdmin: true, tokenHash: "mine", expiresAt: "2099-01-01" });
    const stored = await PendingSignup.findOne({ email: EMAIL }).lean();
    expect(stored?.tokenHash).not.toBe("mine");
    expect(stored?.expiresAt.getFullYear()).toBeLessThan(2099);
  });
});

describe("POST /api/auth/activate", () => {
  it("makes the account, logs in, and the password then works", async () => {
    await postSignup();
    const res = await postActivate(tokenFromMail());
    expect(res.status).toBe(201);

    const data = await json<ActivationResponse>(res);
    expect(data).toEqual({ id: expect.any(String), name: "Asha", email: EMAIL, next: "/" });
    expect(JSON.stringify(data)).not.toContain("$2");

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect((await me(makeRequest("/api/auth/me", { cookie: sessionCookieFrom(res) }))).status).toBe(200);

    expect(await PendingSignup.exists({ email: EMAIL })).toBeNull();
    const again = await login(makeRequest("/api/auth/login", { method: "POST", body: { email: EMAIL, password: form.password } }));
    expect(again.status).toBe(200);
  });

  it("can't log in before activating", async () => {
    await postSignup();
    const res = await login(makeRequest("/api/auth/login", { method: "POST", body: { email: EMAIL, password: form.password } }));
    expect(res.status).toBe(401);
  });

  it("works once only", async () => {
    await postSignup();
    const token = tokenFromMail();
    expect((await postActivate(token)).status).toBe(201);
    const res = await postActivate(token);
    expect(res.status).toBe(400);
    expect(sessionCookieFrom(res)).toBeNull();
  });

  it("makes one account when the link is opened twice at once", async () => {
    await postSignup();
    const token = tokenFromMail();
    const answers = await Promise.all([postActivate(token), postActivate(token)]);
    expect(answers.map((r) => r.status).filter((s) => s === 201)).toHaveLength(1);
    expect(await User.countDocuments({ email: EMAIL })).toBe(1);
  });

  it("refuses an expired link, even before MongoDB's clean-up removes it", async () => {
    await postSignup();
    await PendingSignup.updateOne({ email: EMAIL }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await postActivate(tokenFromMail())).status).toBe(400);
    expect(await User.exists({ email: EMAIL })).toBeNull();
  });

  it("uses the newest signup: the older link is dead, the newer details win", async () => {
    await postSignup();
    const older = tokenFromMail();
    await skipCooldown();
    await postSignup({ ...form, name: "Asha K" });
    const newer = tokenFromMail();

    expect((await postActivate(older)).status).toBe(400);
    const res = await postActivate(newer);
    expect(res.status).toBe(201);
    expect((await json<ActivationResponse>(res)).name).toBe("Asha K");
  });

  it("refuses when the email got an account meanwhile (Google), without touching it", async () => {
    await postSignup();
    const token = tokenFromMail();
    const { user } = await createUserAndCookie({ name: "Via Google", email: EMAIL });

    const res = await postActivate(token);
    expect(res.status).toBe(409);
    expect(sessionCookieFrom(res)).toBeNull();
    expect((await User.findById(user.id).lean())?.name).toBe("Via Google");
    expect(await PendingSignup.exists({ email: EMAIL })).toBeNull();
  });

  it("doesn't swap accounts for someone already logged in, and keeps the link usable", async () => {
    await postSignup();
    const token = tokenFromMail();
    const other = await createUserAndCookie({ email: "other@example.com" });

    const res = await postActivate(token, other.cookie);
    expect(res.status).toBe(409);
    expect(await User.exists({ email: EMAIL })).toBeNull();
    expect((await postActivate(token)).status).toBe(201);
  });

  it("goes to the page asked for at signup, and never to another site", async () => {
    await postSignup({ ...form, next: "/share/abc" });
    expect((await json<ActivationResponse>(await postActivate(tokenFromMail()))).next).toBe("/share/abc");

    await postSignup({ ...form, email: "ravi@example.com", next: "https://evil.example" });
    expect((await json<ActivationResponse>(await postActivate(tokenFromMail()))).next).toBe("/");
  });

  it("answers 400 for junk tokens, injection and bad JSON", async () => {
    expect((await postActivate("short")).status).toBe(400);
    expect((await postActivate("A".repeat(43))).status).toBe(400);
    expect((await postActivate({ $ne: null })).status).toBe(400);
    const bad = await activate(makeRequest("/api/auth/activate", { method: "POST", body: "{not json" }));
    expect(bad.status).toBe(400);
  });

  it("is refused when only Google login is on", async () => {
    await postSignup();
    vi.stubEnv("ONLY_LOGIN_WITH_GOOGLE", "true");
    expect((await postActivate(tokenFromMail())).status).toBe(403);
    expect(await User.exists({ email: EMAIL })).toBeNull();
  });
});
