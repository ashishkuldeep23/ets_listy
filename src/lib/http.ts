import { unstable_rethrow } from "next/navigation";

// Small helpers so every API route answers in the same shape:
//   success → the data itself
//   failure → { error: "message" }

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * Parse a JSON body without throwing; returns undefined if it is not valid
 * JSON. The result is `unknown`: always pass it through a validator.
 */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/**
 * Like readJson, but an empty body is allowed and returns null (for routes
 * where every field is optional). Invalid JSON still returns undefined.
 */
export async function readOptionalJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Last-resort handler for unexpected errors. Logs the real error on the
 * server but sends only a generic message — stack traces and DB details
 * must never reach the client.
 */
export function serverError(err: unknown): Response {
  // Next.js signals things like "this route can't be prerendered" by
  // throwing; let those through instead of logging them as failures.
  unstable_rethrow(err);
  console.error("[api]", err);
  return jsonError("Something went wrong", 500);
}

/** 429 with a Retry-After header (seconds), for rate-limited routes. */
export function tooManyRequests(retryAfter: number): Response {
  return Response.json(
    { error: "Too many attempts. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}
