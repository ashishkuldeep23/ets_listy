import Pusher from "pusher";
import { SOCKET_ID_HEADER, folderChannel, userChannel } from "@/lib/channels";

// Server side of live updates. Routes call these AFTER a successful DB
// write to tell open screens that something changed; the database stays
// the source of truth.
//
// Rules:
// - Never throws. A Pusher outage or missing keys must not fail a request.
// - Without the Pusher env vars every publish is a no-op (logged once),
//   so the app works fully, just without live updates.
// - Payloads carry only what the UI shows: never emails or password hashes.

let client: Pusher | null | undefined; // undefined = not created yet, null = not configured
let warned = false;

function getClient(): Pusher | null {
  if (client !== undefined) return client;
  const { PUSHER_APP_ID, PUSHER_SECRET, NEXT_PUBLIC_PUSHER_KEY, NEXT_PUBLIC_PUSHER_CLUSTER } = process.env;
  if (!PUSHER_APP_ID || !PUSHER_SECRET || !NEXT_PUBLIC_PUSHER_KEY || !NEXT_PUBLIC_PUSHER_CLUSTER) {
    if (!warned) {
      console.warn("[realtime] Pusher env vars not set: live updates are off.");
      warned = true;
    }
    client = null;
    return null;
  }
  client = new Pusher({
    appId: PUSHER_APP_ID,
    key: NEXT_PUBLIC_PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: NEXT_PUBLIC_PUSHER_CLUSTER,
    useTLS: true,
  });
  return client;
}

/** The configured Pusher client, or null when live updates are off. */
export function getPusher(): Pusher | null {
  return getClient();
}

/**
 * The sender's Pusher socket id from the request header, if it looks valid
 * ("123.456"). Passed to Pusher so the sender's own tab skips the event.
 */
export function getSocketId(request: Request): string | undefined {
  const id = request.headers.get(SOCKET_ID_HEADER);
  return id && /^\d+\.\d+$/.test(id) ? id : undefined;
}

async function trigger(channels: string[], event: string, data: unknown, socketId?: string): Promise<void> {
  const pusher = getClient();
  if (!pusher || channels.length === 0) return;
  try {
    // Pusher accepts at most 100 channels per call.
    for (let i = 0; i < channels.length; i += 100) {
      await pusher.trigger(channels.slice(i, i + 100), event, data, socketId ? { socket_id: socketId } : undefined);
    }
  } catch (err) {
    console.error("[realtime] publish failed", event, err);
  }
}

/** Sends `event` to everyone watching a folder. */
export function publishFolderEvent(folderId: string, event: string, data: unknown, socketId?: string): Promise<void> {
  return trigger([folderChannel(folderId)], event, data, socketId);
}

/** Sends `event` to one or more users' personal channels. */
export function publishUserEvent(userIds: string | string[], event: string, data: unknown): Promise<void> {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  return trigger([...new Set(ids)].map(userChannel), event, data);
}

/** For tests: forget the cached client so env changes take effect. */
export function resetRealtimeForTests(): void {
  client = undefined;
  warned = false;
}
