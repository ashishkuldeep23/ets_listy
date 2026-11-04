import { describe, expect, it } from "vitest";
import { feedbackTone } from "@/lib/feedback";
import { LIMITS } from "@/lib/limits";
import { validateFeedback } from "@/lib/validators";

describe("feedbackTone", () => {
  it("always gives one id the same colours", () => {
    expect(feedbackTone("65f0a1b2c3d4e5f6a7b8c9d0")).toBe(feedbackTone("65f0a1b2c3d4e5f6a7b8c9d0"));
  });

  it("spreads ids over the colours, with a border and a background", () => {
    const tones = new Set(Array.from({ length: 200 }, (_, i) => feedbackTone(`65f0a1b2c3d4e5f6a7b8${String(i).padStart(4, "0")}`)));
    expect(tones.size).toBeGreaterThan(3);
    for (const tone of tones) expect(tone).toMatch(/border-tone-\d\/50 bg-tone-\d\/10/);
  });

  it("copes with an empty id", () => {
    expect(feedbackTone("")).toMatch(/^border-tone-/);
  });
});

describe("validateFeedback", () => {
  it("fills in the default name and rating", () => {
    expect(validateFeedback({ message: "Nice" })).toEqual({ ok: true, value: { name: "User", rating: 5, message: "Nice" } });
  });

  it.each([[""], ["   "], [null]])("treats a name of %j as the default", (name) => {
    const r = validateFeedback({ name, message: "Nice" });
    expect(r.ok && r.value.name).toBe("User");
  });

  it("trims and returns only the allowed fields", () => {
    const r = validateFeedback({ name: " Asha ", rating: 1, message: " Good ", user: "x", deletedAt: null, mine: true });
    expect(r).toEqual({ ok: true, value: { name: "Asha", rating: 1, message: "Good" } });
  });

  it.each([[1], [5]])("accepts a rating of %i", (rating) => {
    expect(validateFeedback({ rating, message: "x" }).ok).toBe(true);
  });

  it.each([[0], [6], [-1], [2.5], ["5"], [true], [{ $gt: 0 }], [Number.NaN]])("refuses a rating of %j", (rating) => {
    expect(validateFeedback({ rating, message: "x" }).ok).toBe(false);
  });

  it.each([[undefined], [null], [""], ["   "], [5], [{ $gt: "" }], ["x".repeat(LIMITS.FEEDBACK_MESSAGE_MAX + 1)]])(
    "refuses a message of %j",
    (message) => {
      expect(validateFeedback({ message }).ok).toBe(false);
    }
  );

  it.each([[5], [{ $gt: "" }], ["x".repeat(LIMITS.FEEDBACK_NAME_MAX + 1)]])("refuses a name of %j", (name) => {
    expect(validateFeedback({ name, message: "x" }).ok).toBe(false);
  });

  it.each([[null], ["x"], [[]], [1]])("refuses a body of %j", (body) => {
    expect(validateFeedback(body).ok).toBe(false);
  });
});
