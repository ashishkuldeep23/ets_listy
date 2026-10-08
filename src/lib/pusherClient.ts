"use client";

// Browser side of live updates: one shared pusher-js connection, created
// on first use. Returns null when the public Pusher keys aren't set, and
// callers then simply skip live updates.

import Pusher from "pusher-js";

let client: Pusher | null | undefined;

export function getPusherClient(): Pusher | null {
  if (typeof window === "undefined") return null;
  if (client !== undefined) return client;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  client = key && cluster ? new Pusher(key, { cluster, channelAuthorization: { endpoint: "/api/pusher/auth", transport: "ajax" } }) : null;
  return client;
}

/** This tab's socket id, sent with writes so it doesn't get its own events back. */
export function getSocketId(): string | undefined {
  return getPusherClient()?.connection.socket_id || undefined;
}
