import { describe, expect, it } from "vitest";
import { googleAuthUrl, parseGoogleIdToken } from "@/lib/google";

const NOW = Date.UTC(2026, 0, 1);
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
const token = (extra: Record<string, unknown> = {}) =>
  `${b64({ alg: "none" })}.${b64({
    iss: "https://accounts.google.com",
    aud: "client-1",
    exp: NOW / 1000 + 60,
    sub: "g-1",
    email: "Asha@Example.com",
    email_verified: true,
    name: "Asha",
    ...extra,
  })}.sig`;

describe("parseGoogleIdToken", () => {
  it("returns the profile, with the email lowercased", () => {
    expect(parseGoogleIdToken(token(), "client-1", NOW)).toEqual({
      ok: true,
      value: { sub: "g-1", email: "asha@example.com", name: "Asha" },
    });
  });

  it("falls back to the email's first part without a name", () => {
    const r = parseGoogleIdToken(token({ name: " " }), "client-1", NOW);
    expect(r.ok && r.value.name).toBe("asha");
  });

  it.each([
    ["another issuer", { iss: "https://evil.example" }],
    ["another app", { aud: "client-2" }],
    ["expired", { exp: NOW / 1000 - 1 }],
    ["no subject", { sub: "" }],
    ["no email", { email: undefined }],
    ["unverified email", { email_verified: false }],
    ["email_verified as a string", { email_verified: "true" }],
  ])("refuses %s", (_label, extra) => {
    expect(parseGoogleIdToken(token(extra), "client-1", NOW).ok).toBe(false);
  });

  it.each([[undefined], [123], ["not-a-jwt"]])("refuses bad input: %s", (bad) => {
    expect(parseGoogleIdToken(bad, "client-1", NOW).ok).toBe(false);
  });
});

describe("googleAuthUrl", () => {
  it("asks for the code flow, with the state and redirect", () => {
    const params = new URL(googleAuthUrl("client-1", "http://localhost:3000/cb", "s1")).searchParams;
    expect(params.get("client_id")).toBe("client-1");
    expect(params.get("redirect_uri")).toBe("http://localhost:3000/cb");
    expect(params.get("response_type")).toBe("code");
    expect(params.get("state")).toBe("s1");
  });
});
