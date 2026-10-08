import { describe, it, expect, afterEach } from "vitest";
import { SignJWT } from "jose";
import { createSessionToken, verifySessionToken } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/auth";

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET);

describe("session tokens", () => {
  const original = process.env.SESSION_SECRET;
  afterEach(() => {
    process.env.SESSION_SECRET = original;
  });

  it("round-trips the user id", async () => {
    const token = await createSessionToken("652f1c2b9d3e4a0012345678");
    expect(await verifySessionToken(token)).toBe("652f1c2b9d3e4a0012345678");
  });

  it("returns null for missing, garbage and tampered tokens", async () => {
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
    expect(await verifySessionToken("not.a.jwt")).toBeNull();
    const token = await createSessionToken("abc");
    expect(await verifySessionToken(token.slice(0, -2) + "xx")).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("abc")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secret());
    expect(await verifySessionToken(expired)).toBeNull();
  });

  it("returns null for a token signed with another secret", async () => {
    const other = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("abc")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-completely-different-secret-of-32+chars"));
    expect(await verifySessionToken(other)).toBeNull();
  });

  it("refuses to run with a missing or short secret", async () => {
    process.env.SESSION_SECRET = "short";
    await expect(createSessionToken("abc")).rejects.toThrow(/SESSION_SECRET/);
  });
});

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("password123");
    expect(hash).not.toContain("password123");
    expect(await verifyPassword("password123", hash)).toBe(true);
    expect(await verifyPassword("password124", hash)).toBe(false);
  });
});
