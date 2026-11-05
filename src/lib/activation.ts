import { createHash, randomBytes } from "node:crypto";
import { LIMITS } from "@/lib/limits";

// The one-time token in a signup's activation link.

/** 32 random bytes → 43 URL-safe characters: not guessable. */
export function newActivationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database keeps. A fast hash is fine: the token is long and random, not a password. */
export function hashActivationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Shape check before any DB lookup, so junk is rejected cheaply. */
export function isActivationTokenShape(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function activationExpiry(now = new Date()): Date {
  return new Date(now.getTime() + LIMITS.ACTIVATION_LINK_HOURS * 60 * 60_000);
}

/** Seconds until another email may go to this address, or 0 if it may go now. */
export function resendWaitSeconds(lastSentAt: Date, now = new Date()): number {
  const waitMs = lastSentAt.getTime() + LIMITS.ACTIVATION_RESEND_SECONDS * 1000 - now.getTime();
  return waitMs > 0 ? Math.ceil(waitMs / 1000) : 0;
}
