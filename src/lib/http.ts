import { unstable_rethrow } from "next/navigation";
import { LIMITS } from "@/lib/limits";

// Small helpers so every API route answers in the same shape:
//   success → the data itself
//   failure → { error: "message" }

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * The body as text, or undefined if it is over LIMITS.REQUEST_BODY_MAX_BYTES.
 * Reads piece by piece and stops early: the Content-Length header can be left
 * out or be a lie, and a huge body must not fill the server's memory.
 */
async function readBodyText(request: Request): Promise<string | undefined> {
  if (Number(request.headers.get("content-length") ?? 0) > LIMITS.REQUEST_BODY_MAX_BYTES) return undefined;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > LIMITS.REQUEST_BODY_MAX_BYTES) {
      await reader.cancel();
      return undefined;
    }
    text += decoder.decode(value, { stream: true });
  }
}

/**
 * Parse a JSON body without throwing; returns undefined if it is not valid
 * JSON or is too big. The result is `unknown`: always pass it through a validator.
 */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return JSON.parse((await readBodyText(request)) ?? "") as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Like readJson, but an empty body is allowed and returns null (for routes
 * where every field is optional). Invalid or too big JSON still returns undefined.
 */
export async function readOptionalJson(request: Request): Promise<unknown> {
  const text = await readBodyText(request);
  if (text === undefined) return undefined;
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

/** A MongoDB unique index refused the write. */
export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === 11000;
}

/** 429 with a Retry-After header (seconds), for rate-limited routes. */
export function tooManyRequests(retryAfter: number): Response {
  return Response.json(
    { error: "Too many attempts. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}
