// Browser-side fetch wrapper for our own API: sends JSON, and turns
// { error } responses into thrown ApiErrors with that message.
// All UI calls go through this. Writes also send this tab's Pusher socket
// id, so the server can skip echoing our own change back to us.

import { SOCKET_ID_HEADER } from "@/lib/channels";
import { getSocketId } from "@/lib/pusherClient";

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
  const isWrite = (options.method ?? "GET").toUpperCase() !== "GET";
  const socketId = isWrite ? getSocketId() : undefined;
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(socketId && { [SOCKET_ID_HEADER]: socketId }),
      ...options.headers,
    },
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
