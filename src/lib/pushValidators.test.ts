import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/limits";
import { vapidKeyBytes } from "@/lib/pushClient";
import { validatePushEndpoint, validatePushSubscription, validateReminder } from "@/lib/pushValidators";

const NOW = new Date("2026-11-04T10:00:00.000Z");

describe("validateReminder", () => {
  it("accepts a future date and returns only that", () => {
    const r = validateReminder({ remindAt: "2026-11-05T10:00:00.000Z", sentAt: null, user: "x" }, NOW);
    expect(r).toEqual({ ok: true, value: { remindAt: new Date("2026-11-05T10:00:00.000Z") } });
  });

  it("refuses the past and now", () => {
    expect(validateReminder({ remindAt: "2026-11-03T10:00:00.000Z" }, NOW).ok).toBe(false);
    expect(validateReminder({ remindAt: NOW.toISOString() }, NOW).ok).toBe(false);
  });

  it("refuses dates too far ahead", () => {
    const far = new Date(NOW.getTime() + (LIMITS.REMINDER_MAX_DAYS + 1) * 86_400_000).toISOString();
    expect(validateReminder({ remindAt: far }, NOW).ok).toBe(false);
  });

  it.each([[null], ["x"], [[]], [{}], [{ remindAt: 123 }], [{ remindAt: "soon" }], [{ remindAt: { $gt: "" } }]])(
    "refuses bad input: %j",
    (bad) => {
      expect(validateReminder(bad, NOW).ok).toBe(false);
    }
  );
});

describe("validatePushSubscription", () => {
  const good = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p", auth: "a" } };

  it("accepts it and returns only the allowed fields", () => {
    const r = validatePushSubscription({ ...good, user: "someone", expirationTime: null });
    expect(r).toEqual({ ok: true, value: { endpoint: good.endpoint, p256dh: "p", auth: "a" } });
  });

  it.each([
    "https://fcm.googleapis.com/x",
    "https://web.push.apple.com/x",
    "https://wns2-par02p.notify.windows.com/x",
    "https://updates.push.services.mozilla.com/x",
  ])("accepts the push service %s", (endpoint) => {
    expect(validatePushEndpoint({ endpoint }).ok).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/x",
    "https://169.254.169.254/latest/meta-data",
    "http://localhost:27017/",
    "https://evil.example/x",
    "https://fcm.googleapis.com.evil.example/x",
    "https://evilpush.apple.com.evil.example/x",
    "https://notpush.apple.com/x",
    `https://fcm.googleapis.com/${"x".repeat(LIMITS.PUSH_ENDPOINT_MAX)}`,
    "not a url",
  ])("refuses the endpoint %s", (endpoint) => {
    expect(validatePushSubscription({ ...good, endpoint }).ok).toBe(false);
    expect(validatePushEndpoint({ endpoint }).ok).toBe(false);
  });

  it.each([[null], [[]], [{}], [{ ...good, keys: null }], [{ ...good, keys: { p256dh: "p" } }], [{ ...good, keys: { p256dh: { $gt: "" }, auth: "a" } }], [{ ...good, keys: { p256dh: "x".repeat(LIMITS.PUSH_KEY_MAX + 1), auth: "a" } }]])(
    "refuses bad input: %j",
    (bad) => {
      expect(validatePushSubscription(bad).ok).toBe(false);
    }
  );
});

describe("vapidKeyBytes", () => {
  it("decodes base64url, with or without padding", () => {
    expect([...vapidKeyBytes("-_8")]).toEqual([251, 255]);
    expect([...vapidKeyBytes("AQID")]).toEqual([1, 2, 3]);
  });
});
