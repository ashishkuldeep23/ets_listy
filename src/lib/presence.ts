import { LIMITS } from "@/lib/limits";

// Who has a list open right now, for the chat ("opens when 2+ people are
// here"). Pages send a heartbeat every few seconds; anyone silent for longer
// than PRESENCE_TTL_MS counts as gone (closed tab, lost signal).
// In memory, like lib/rateLimit.ts: per server process only. Several
// instances would each see part of the people, so move this to a shared
// store (e.g. Redis) if the app ever runs on more than one.

export const PRESENCE_TTL_MS = 35_000;

export interface PresencePerson {
  name: string;
  /** null for guests. */
  email: string | null;
  guest: boolean;
}

interface Entry extends PresencePerson {
  seen: number;
}

// folderId → (person key → entry). Person key: "u:<userId>" or "g:<hash>",
// so the same person in two tabs counts once.
const rooms = new Map<string, Map<string, Entry>>();

function prune(folderId: string, now: number): Map<string, Entry> | undefined {
  const room = rooms.get(folderId);
  if (!room) return undefined;
  for (const [key, entry] of room) if (now - entry.seen > PRESENCE_TTL_MS) room.delete(key);
  if (room.size === 0) rooms.delete(folderId);
  return rooms.get(folderId);
}

/** Marks a person as here. Returns false when the list is full (flood of fake guests). */
export function touchPresence(folderId: string, key: string, person: PresencePerson, now = Date.now()): boolean {
  const room = prune(folderId, now) ?? new Map<string, Entry>();
  if (!room.has(key) && room.size >= LIMITS.PRESENCE_PER_FOLDER) return false;
  room.set(key, { ...person, seen: now });
  rooms.set(folderId, room);
  return true;
}

export function leavePresence(folderId: string, key: string): void {
  const room = rooms.get(folderId);
  room?.delete(key);
  if (room?.size === 0) rooms.delete(folderId);
}

/** Everyone here now, sorted by name so the list doesn't jump around. */
export function activePeople(folderId: string, now = Date.now()): (PresencePerson & { key: string })[] {
  const room = prune(folderId, now);
  if (!room) return [];
  return [...room]
    .map(([key, { name, email, guest }]) => ({ key, name, email, guest }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function resetPresenceForTests(): void {
  rooms.clear();
}
