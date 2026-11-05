import { beforeEach, describe, expect, it } from "vitest";
import { forgiveRateLimit, getClientIp, rateLimit, resetRateLimits } from "@/lib/rateLimit";

// The in-memory rate limiter.

beforeEach(resetRateLimits);

describe("rateLimit", () => {
  it("allows up to the limit, then refuses with a wait time", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("k", { limit: 3 }).ok).toBe(true);
    const blocked = rateLimit("k", { limit: 3 });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("counts each key on its own", () => {
    expect(rateLimit("a", { limit: 1 }).ok).toBe(true);
    expect(rateLimit("a", { limit: 1 }).ok).toBe(false);
    expect(rateLimit("b", { limit: 1 }).ok).toBe(true);
  });

  it("starts again after the window", () => {
    expect(rateLimit("k", { limit: 1, windowMs: -1 }).ok).toBe(true);
    expect(rateLimit("k", { limit: 1, windowMs: -1 }).ok).toBe(true);
  });

  it("stays bounded when flooded with new keys", { timeout: 60_000 }, () => {
    for (let i = 0; i < 100_050; i++) rateLimit(`flood:${i}`);
    // The oldest key was dropped, so it starts from zero again.
    expect(rateLimit("flood:0", { limit: 1 }).ok).toBe(true);
    expect(rateLimit("flood:0", { limit: 1 }).ok).toBe(false);
  });
});

describe("forgiveRateLimit", () => {
  it("takes back one attempt", () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("k", { limit: 1 }).ok).toBe(true);
      forgiveRateLimit("k");
    }
    expect(rateLimit("k", { limit: 1 }).ok).toBe(true);
    expect(rateLimit("k", { limit: 1 }).ok).toBe(false);
  });

  it("ignores unknown keys", () => {
    expect(() => forgiveRateLimit("nobody")).not.toThrow();
  });
});

describe("getClientIp", () => {
  const ip = (headers: Record<string, string>) => getClientIp(new Request("http://localhost", { headers }));

  it("uses the first forwarded address, then x-real-ip, then unknown", () => {
    expect(ip({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" })).toBe("1.1.1.1");
    expect(ip({ "x-real-ip": "3.3.3.3" })).toBe("3.3.3.3");
    expect(ip({})).toBe("unknown");
  });
});
