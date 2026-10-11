import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/limits";
import { cleanAfter, cleanGuestId, validateChatMessage, validatePresence, validateProfileUpdate } from "@/lib/validators";

describe("validateProfileUpdate", () => {
  it("accepts and trims a name", () => {
    expect(validateProfileUpdate({ name: "  Asha  " })).toEqual({ ok: true, value: { name: "Asha" } });
  });
  it.each([
    ["no body", null],
    ["array", []],
    ["missing name", {}],
    ["empty name", { name: "   " }],
    ["number name", { name: 5 }],
    ["operator object", { name: { $gt: "" } }],
    ["too long", { name: "x".repeat(LIMITS.USER_NAME_MAX + 1) }],
    ["email change", { name: "Asha", email: "new@example.com" }],
  ])("rejects %s", (_label, body) => {
    expect(validateProfileUpdate(body).ok).toBe(false);
  });
});

describe("validateChatMessage", () => {
  it("trims and keeps inner newlines", () => {
    expect(validateChatMessage({ text: "  hi\nthere " })).toEqual({ ok: true, value: { text: "hi\nthere" } });
  });
  it.each([
    ["no body", null],
    ["missing text", {}],
    ["blank", { text: " \n " }],
    ["number", { text: 1 }],
    ["too long", { text: "x".repeat(LIMITS.CHAT_MESSAGE_MAX + 1) }],
  ])("rejects %s", (_label, body) => {
    expect(validateChatMessage(body).ok).toBe(false);
  });
});

describe("validatePresence", () => {
  it("treats an empty body as a heartbeat", () => {
    expect(validatePresence(null)).toEqual({ ok: true, value: { leave: false } });
  });
  it("reads leave", () => {
    expect(validatePresence({ leave: true })).toEqual({ ok: true, value: { leave: true } });
  });
  it.each([["array", []], ["string leave", { leave: "yes" }]])("rejects %s", (_label, body) => {
    expect(validatePresence(body).ok).toBe(false);
  });
});

describe("cleanGuestId", () => {
  it("accepts a random url-safe id", () => {
    expect(cleanGuestId("AbC_-1234567890xyzQW")).toBe("AbC_-1234567890xyzQW");
  });
  it.each([null, "", "short", "has space in it 12345", "x".repeat(65), "bad/char/123456789"])("rejects %j", (v) => {
    expect(cleanGuestId(v)).toBeNull();
  });
});

describe("cleanAfter", () => {
  it("reads an ISO date, null when missing", () => {
    expect(cleanAfter("2026-10-11T10:00:00.000Z")?.toISOString()).toBe("2026-10-11T10:00:00.000Z");
    expect(cleanAfter(null)).toBeNull();
    expect(cleanAfter("")).toBeNull();
  });
  it("is undefined for junk", () => {
    expect(cleanAfter("yesterday")).toBeUndefined();
    expect(cleanAfter("2026-10-11T10:00:00.000Z".repeat(3))).toBeUndefined();
  });
});
