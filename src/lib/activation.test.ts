import { afterEach, describe, expect, it, vi } from "vitest";
import { activationExpiry, hashActivationToken, isActivationTokenShape, newActivationToken, resendWaitSeconds } from "@/lib/activation";
import { LIMITS } from "@/lib/limits";
import { activationMail, appBaseUrl } from "@/lib/mailer";
import { validateActivation } from "@/lib/validators";

// Activation tokens and the email's address and contents.

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("activation tokens", () => {
  it("are unique and pass their own shape check", () => {
    const tokens = new Set(Array.from({ length: 100 }, newActivationToken));
    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(isActivationTokenShape(token)).toBe(true);
  });

  it("refuse anything of the wrong shape", () => {
    for (const bad of ["", "short", "a".repeat(44), `${"a".repeat(42)}!`, null, 5, { $ne: null }]) {
      expect(isActivationTokenShape(bad)).toBe(false);
    }
  });

  it("hash the same way every time, and never to themselves", () => {
    const token = newActivationToken();
    expect(hashActivationToken(token)).toBe(hashActivationToken(token));
    expect(hashActivationToken(token)).not.toBe(token);
  });
});

describe("validateActivation", () => {
  it("copies only the token", () => {
    const token = newActivationToken();
    expect(validateActivation({ token, extra: 1 })).toEqual({ ok: true, value: { token } });
  });

  it("refuses bad input", () => {
    for (const bad of [null, [], {}, { token: "short" }, { token: { $ne: null } }]) {
      expect(validateActivation(bad).ok).toBe(false);
    }
  });
});

describe("timing", () => {
  const now = new Date("2026-11-05T10:00:00Z");

  it("expires after the set hours", () => {
    expect(activationExpiry(now).getTime() - now.getTime()).toBe(LIMITS.ACTIVATION_LINK_HOURS * 3_600_000);
  });

  it("asks to wait only during the cooldown", () => {
    expect(resendWaitSeconds(now, now)).toBe(LIMITS.ACTIVATION_RESEND_SECONDS);
    expect(resendWaitSeconds(new Date(now.getTime() - 10_500), now)).toBe(LIMITS.ACTIVATION_RESEND_SECONDS - 10);
    expect(resendWaitSeconds(new Date(now.getTime() - LIMITS.ACTIVATION_RESEND_SECONDS * 1000), now)).toBe(0);
  });
});

describe("appBaseUrl", () => {
  const request = new Request("http://localhost:3000/api/auth/signup");

  it("prefers APP_URL, without any path", () => {
    vi.stubEnv("APP_URL", "https://listy.example.com/some/path");
    expect(appBaseUrl(request)).toBe("https://listy.example.com");
  });

  it("uses the request's address in development only", () => {
    vi.stubEnv("APP_URL", "");
    expect(appBaseUrl(request)).toBe("http://localhost:3000");
    vi.stubEnv("NODE_ENV", "production");
    expect(appBaseUrl(request)).toBeNull();
  });

  it("refuses an invalid APP_URL", () => {
    vi.stubEnv("APP_URL", "not a url");
    expect(appBaseUrl(request)).toBeNull();
  });
});

describe("activationMail", () => {
  it("has the link in both forms and warns anyone who didn't sign up", () => {
    const url = "https://listy.example.com/activate/abc";
    const mail = activationMail("asha@example.com", url);
    expect(mail.to).toBe("asha@example.com");
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(`href="${url}"`);
    expect(mail.text).toContain("Didn't sign up");
  });
});
