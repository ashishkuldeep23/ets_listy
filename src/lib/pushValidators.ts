// Validators for reminders and push subscriptions. Same shape as
// validators.ts: they take `unknown` and return only the allowed fields.

import { LIMITS } from "@/lib/limits";
import type { Result } from "@/types";

const DAY_MS = 24 * 60 * 60_000;

// Browser push services. The server POSTs to whatever endpoint is stored, so
// any other host is refused: otherwise a logged-in user could point our server
// at internal addresses (SSRF).
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.services\.mozilla\.com$/];

const isPlainObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

export function validateReminder(body: unknown, now = new Date()): Result<{ remindAt: Date }> {
  if (!isPlainObject(body) || typeof body.remindAt !== "string") return { ok: false, error: "remindAt must be a date" };
  const remindAt = new Date(body.remindAt);
  if (Number.isNaN(remindAt.getTime())) return { ok: false, error: "remindAt must be a date" };
  if (remindAt <= now) return { ok: false, error: "Pick a time in the future" };
  if (remindAt.getTime() - now.getTime() > LIMITS.REMINDER_MAX_DAYS * DAY_MS) {
    return { ok: false, error: `A reminder can be at most ${LIMITS.REMINDER_MAX_DAYS} days ahead` };
  }
  return { ok: true, value: { remindAt } };
}

/**
 * VAPID_SUBJECT in the form web-push accepts, or null if it can't be used. A bare
 * email is the easy mistake: web-push throws on it for every send, so no
 * notification ever goes out. Normalized here so it works on any host's settings.
 */
export function vapidSubject(raw: string | undefined): string | null {
  const subject = raw?.trim() ?? "";
  if (/^[^\s@:/]+@[^\s@/]+$/.test(subject)) return `mailto:${subject}`;
  return /^mailto:[^\s@]+@[^\s@]+$/.test(subject) || /^https:\/\/[^\s/]+/.test(subject) ? subject : null;
}

function cleanEndpoint(endpoint: unknown): string | null {
  if (typeof endpoint !== "string" || endpoint.length > LIMITS.PUSH_ENDPOINT_MAX) return null;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.some((host) => host.test(url.hostname)) ? endpoint : null;
  } catch {
    return null;
  }
}

const isKey = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= LIMITS.PUSH_KEY_MAX;

export function validatePushSubscription(body: unknown): Result<{ endpoint: string; p256dh: string; auth: string }> {
  const invalid = { ok: false, error: "Invalid push subscription" } as const;
  if (!isPlainObject(body) || !isPlainObject(body.keys)) return invalid;
  const endpoint = cleanEndpoint(body.endpoint);
  const { p256dh, auth } = body.keys;
  if (!endpoint || !isKey(p256dh) || !isKey(auth)) return invalid;
  return { ok: true, value: { endpoint, p256dh, auth } };
}

export function validatePushEndpoint(body: unknown): Result<{ endpoint: string }> {
  const endpoint = isPlainObject(body) ? cleanEndpoint(body.endpoint) : null;
  return endpoint ? { ok: true, value: { endpoint } } : { ok: false, error: "Invalid push subscription" };
}
