import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/limits";
import { validatePasswordChange } from "@/lib/validators";

describe("validatePasswordChange", () => {
  it("returns only the allowed fields", () => {
    const r = validatePasswordChange({ newPassword: "password123", currentPassword: "old", isAdmin: true });
    expect(r).toEqual({ ok: true, value: { newPassword: "password123", currentPassword: "old" } });
  });

  it.each([[undefined], [null], [""]])("treats a current password of %j as none", (currentPassword) => {
    const r = validatePasswordChange({ newPassword: "password123", currentPassword });
    expect(r).toEqual({ ok: true, value: { newPassword: "password123", currentPassword: null } });
  });

  it("doesn't apply new-password rules to the current one", () => {
    expect(validatePasswordChange({ newPassword: "password123", currentPassword: "abc" }).ok).toBe(true);
  });

  it.each([
    ["too short", { newPassword: "x".repeat(LIMITS.PASSWORD_MIN - 1) }],
    ["too long", { newPassword: "x".repeat(LIMITS.PASSWORD_MAX_BYTES + 1) }],
    ["missing", {}],
    ["an operator", { newPassword: { $gt: "" } }],
    ["a bad current type", { newPassword: "password123", currentPassword: { $gt: "" } }],
    ["a current one that is too long", { newPassword: "password123", currentPassword: "x".repeat(LIMITS.PASSWORD_MAX_BYTES + 1) }],
  ])("refuses %s", (_label, body) => {
    expect(validatePasswordChange(body).ok).toBe(false);
  });

  it.each([[null], ["x"], [[]], [1]])("refuses a body of %j", (body) => {
    expect(validatePasswordChange(body).ok).toBe(false);
  });
});
