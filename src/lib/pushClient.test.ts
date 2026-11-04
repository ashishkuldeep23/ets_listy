// The key check that decides whether this device must subscribe again.

import { describe, expect, it } from "vitest";
import { isSameKey, vapidKeyBytes } from "@/lib/pushClient";

describe("isSameKey", () => {
  const key = new Uint8Array([1, 2, 3]);

  it("matches the same bytes", () => {
    expect(isSameKey(new Uint8Array([1, 2, 3]).buffer, key)).toBe(true);
  });

  it("refuses other bytes, another length and no key", () => {
    expect(isSameKey(new Uint8Array([1, 2, 4]).buffer, key)).toBe(false);
    expect(isSameKey(new Uint8Array([1, 2]).buffer, key)).toBe(false);
    expect(isSameKey(null, key)).toBe(false);
  });

  it("compares against a decoded VAPID key", () => {
    const decoded = vapidKeyBytes("AQID");
    expect(isSameKey(new Uint8Array([1, 2, 3]).buffer, decoded)).toBe(true);
  });
});
