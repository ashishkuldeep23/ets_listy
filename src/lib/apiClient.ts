// Browser-side fetch wrapper for our own API: sends JSON, and turns
// { error } responses into thrown ApiErrors with that message.
// All UI writes should go through this (Phase 4 adds a Pusher header here).

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

/** Fetches `path` and returns the parsed JSON as `T` (null for 204). */
export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
  });
  const data: unknown = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : "Something went wrong";
    throw new ApiError(message, res.status);
  }
  return data as T;
}
