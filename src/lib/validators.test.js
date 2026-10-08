import { describe, it, expect } from "vitest";
import { validateCreateFolder, validateLogin, validateSignup, validateUpdateFolder } from "@/lib/validators";

const good = { name: "Asha", email: "Asha@Example.com", password: "password123" };

describe("validateSignup", () => {
  it("accepts good input, trims name and lowercases email", () => {
    const r = validateSignup({ ...good, name: "  Asha  " });
    expect(r).toEqual({ ok: true, value: { name: "Asha", email: "asha@example.com", password: "password123" } });
  });

  it("keeps only allowed fields", () => {
    const r = validateSignup({ ...good, _id: "x", passwordHash: "y", isAdmin: true });
    expect(Object.keys(r.value).sort()).toEqual(["email", "name", "password"]);
  });

  it("rejects missing or blank fields", () => {
    expect(validateSignup({ ...good, name: "  " }).ok).toBe(false);
    expect(validateSignup({ ...good, email: undefined }).ok).toBe(false);
    expect(validateSignup({ ...good, password: undefined }).ok).toBe(false);
  });

  it("rejects bad emails", () => {
    for (const email of ["nope", "a@b", "a b@c.com", `${"x".repeat(250)}@a.com`]) {
      expect(validateSignup({ ...good, email }).ok).toBe(false);
    }
  });

  it("enforces password length (8 chars to 72 bytes)", () => {
    expect(validateSignup({ ...good, password: "short" }).ok).toBe(false);
    expect(validateSignup({ ...good, password: "x".repeat(73) }).ok).toBe(false);
    // 25 three-byte characters = 75 bytes, over the bcrypt limit even though only 25 chars.
    expect(validateSignup({ ...good, password: "₹".repeat(25) }).ok).toBe(false);
    expect(validateSignup({ ...good, password: "x".repeat(72) }).ok).toBe(true);
  });

  it("rejects name over 60 characters", () => {
    expect(validateSignup({ ...good, name: "x".repeat(61) }).ok).toBe(false);
  });

  it("rejects non-object bodies and operator objects", () => {
    expect(validateSignup(null).ok).toBe(false);
    expect(validateSignup([]).ok).toBe(false);
    expect(validateSignup({ ...good, email: { $gt: "" } }).ok).toBe(false);
    expect(validateSignup({ ...good, password: { $ne: null } }).ok).toBe(false);
  });
});

describe("validateLogin", () => {
  it("accepts and lowercases email", () => {
    expect(validateLogin({ email: " A@B.com ", password: "x" })).toEqual({
      ok: true,
      value: { email: "a@b.com", password: "x" },
    });
  });

  it("rejects missing fields and operator objects", () => {
    expect(validateLogin({ password: "x" }).ok).toBe(false);
    expect(validateLogin({ email: "a@b.com" }).ok).toBe(false);
    expect(validateLogin({ email: { $gt: "" }, password: "x" }).ok).toBe(false);
    expect(validateLogin({ email: "a@b.com", password: { $ne: null } }).ok).toBe(false);
    expect(validateLogin("x").ok).toBe(false);
  });
});

describe("folder validators", () => {
  it("accepts and trims a name, dropping other fields", () => {
    expect(validateCreateFolder({ name: " Market ", owner: "x", _id: "y" })).toEqual({ ok: true, value: { name: "Market" } });
  });

  it("rejects bad names", () => {
    for (const name of [undefined, "", "   ", 5, "x".repeat(61), { $gt: "" }, ["a"]]) {
      expect(validateCreateFolder({ name }).ok).toBe(false);
    }
    expect(validateUpdateFolder({}).ok).toBe(false);
    expect(validateUpdateFolder({ name: "" }).ok).toBe(false);
    expect(validateUpdateFolder(null).ok).toBe(false);
  });
});
