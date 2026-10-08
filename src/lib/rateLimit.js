// Simple fixed-window rate limiter kept in memory.
// NOTE: this is per server process only. With several instances (or
// serverless), each has its own counts, so move this to a shared store
// (e.g. Redis) before scaling out.

const buckets = new Map(); // key -> { count, resetAt }

/**
 * Counts one attempt for `key`. Returns { ok: true } while under the limit,
 * or { ok: false, retryAfter } (seconds) once it is reached.
 */
export function rateLimit(key, { limit = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  // Drop expired buckets now and then so the map can't grow forever.
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  if (bucket.count > limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true };
}

/**
 * Best-effort client IP. x-forwarded-for can be faked by the client unless
 * a trusted proxy (e.g. Vercel) sets it, so this only slows abuse down.
 */
export function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** For tests only. */
export function resetRateLimits() {
  buckets.clear();
}
