// A random id for a guest (share link, not logged in), so the list chat can
// tell guests apart and know which messages are theirs. Kept in
// localStorage so it survives reloads; if storage is blocked it lasts for
// this tab only. It is not a login: it only names "Guest XXXX".

import { GUEST_ID_RE } from "@/lib/constants";

const KEY = "listy:guest-id";
let memoryId: string | null = null;

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  // base64url → 24 characters, matching GUEST_ID_RE.
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function getGuestId(): string {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && GUEST_ID_RE.test(stored)) return stored;
    const id = randomId();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    memoryId ??= randomId();
    return memoryId;
  }
}
