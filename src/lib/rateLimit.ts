// Simple fixed-window rate limiter kept in memory.
// NOTE: this is per server process only. With several instances (or
// serverless), each has its own counts, so move this to a shared store
// (e.g. Redis) before scaling out.

interface Bucket {
  count: number;
  resetAt: number;
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

const buckets = new Map<string, Bucket>();

/** Past this, the oldest counts go, so a flood of fake IPs can't use up the server's memory. */
const MAX_BUCKETS = 100_000;
const SWEEP_EVERY_MS = 60_000;
let lastSweep = 0;

/** At most once a minute: going through the whole map on every request would itself be slow. */
function sweep(now: number): void {
  if (buckets.size <= 10_000 || now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

/**
 * Counts one attempt for `key`. Returns { ok: true } while under the limit,
 * or { ok: false, retryAfter } (seconds) once it is reached.
 */
export function rateLimit(key: string, { limit = 10, windowMs = 15 * 60 * 1000 } = {}): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  sweep(now);
  // A Map keeps insertion order, so the first key is the oldest.
  while (buckets.size > MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }

  if (bucket.count > limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true };
}

/** Takes back one attempt that turned out fine, so only failures use up a limit. */
export function forgiveRateLimit(key: string): void {
  const bucket = buckets.get(key);
  if (bucket && bucket.count > 0) bucket.count -= 1;
}

/**
 * Best-effort client IP. x-forwarded-for can be faked by the client unless
 * a trusted proxy (e.g. Vercel) sets it, so this only slows abuse down.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** For tests only. */
export function resetRateLimits(): void {
  buckets.clear();
  lastSweep = 0;
}
