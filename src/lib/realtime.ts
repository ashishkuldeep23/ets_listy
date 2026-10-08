import Pusher from "pusher";
import mongoose, { type Types } from "mongoose";
import { EVENTS, SOCKET_ID_HEADER, folderChannel, userChannel } from "@/lib/channels";
import { countItems } from "@/lib/items";
import { Folder } from "@/models/Folder";
import { Share } from "@/models/Share";
import type { FolderAccessEvent, FolderProgressEvent } from "@/types";

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

/** Owner + everyone the folder is shared with: who should hear about its progress. */
export async function folderAudience(folderId: Types.ObjectId | string): Promise<string[]> {
  const [folder, shares] = await Promise.all([
    Folder.findById(folderId).select("owner").lean(),
    Share.find({ folder: folderId }).select("sharedWith").lean(),
  ]);
  if (!folder) return [];
  return [String(folder.owner), ...shares.map((s) => String(s.sharedWith))];
}

/**
 * Sends a folder's item counts to the owner and every shared user, so home
 * page cards update live. Call after anything that changes the counts.
 */
export async function publishFolderProgress(folderId: Types.ObjectId | string): Promise<void> {
  if (!getClient()) return; // skip the queries when live updates are off
  try {
    const [audience, counts] = await Promise.all([folderAudience(folderId), countItems(new mongoose.Types.ObjectId(String(folderId)))]);
    const data: FolderProgressEvent = { folderId: String(folderId), itemCount: counts.total, doneCount: counts.done };
    await publishUserEvent(audience, EVENTS.folderProgress, data);
  } catch (err) {
    console.error("[realtime] progress failed", err);
  }
}

/** Tells one user a folder was shared with them (or they lost it), so their "Shared with me" refreshes. */
export function publishFolderAccess(userId: string, folderId: string, removed = false): Promise<void> {
  const data: FolderAccessEvent = { folderId, ...(removed && { removed: true }) };
  return publishUserEvent(userId, EVENTS.folderAccess, data);
}
