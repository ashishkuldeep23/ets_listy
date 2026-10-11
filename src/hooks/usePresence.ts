"use client";

// "Who has this list open right now", for the viewers pill and the chat.
// Sends a heartbeat every few seconds while the page is on screen and
// online, and says goodbye when it hides or closes, so the others' list
// drops me at once instead of after a timeout. One per list page: the
// viewers pill and ListChat share it.

import { useCallback, useEffect, useState } from "react";
import { useOnline } from "@/hooks/useOnline";
import { apiFetch } from "@/lib/apiClient";
import { GUEST_ID_HEADER } from "@/lib/constants";
import { getGuestId } from "@/lib/guestId";
import type { ActivePerson, PresenceResponse } from "@/types";

const HEARTBEAT_MS = 10_000;

export interface Presence {
  /** Everyone here, me included. Empty while offline or before the first answer. */
  people: ActivePerson[];
  /** Newest chat message time (ms), 0 if none. */
  lastMessageAt: number;
  /** Headers for this list's chat/presence requests (a guest's id; empty for members). */
  headers: Record<string, string>;
  /** Ask again now (e.g. after the server said not enough people). */
  refresh: () => void;
}

/**
 * `base`: /api/folders/<id> (member) or /api/share/<token> (guest).
 * `enabled`: false until the list itself loaded, so a missing list isn't pinged.
 */
export function usePresence(base: string, guest: boolean, enabled: boolean): Presence {
  const online = useOnline();
  const [headers] = useState(() => {
    const h: Record<string, string> = {};
    if (guest) h[GUEST_ID_HEADER] = getGuestId();
    return h;
  });
  const [heard, setHeard] = useState<ActivePerson[]>([]);
  const [lastMessageAt, setLastMessageAt] = useState(0);
  const active = enabled && online;

  const refresh = useCallback(() => {
    if (document.visibilityState !== "visible" || !navigator.onLine) return;
    apiFetch<PresenceResponse>(`${base}/presence`, { method: "POST", headers })
      .then((p) => {
        setHeard(p.people);
        setLastMessageAt(p.lastMessageAt ? new Date(p.lastMessageAt).getTime() : 0);
      })
      .catch(() => {});
  }, [base, headers]);

  useEffect(() => {
    if (!active) return;
    const leave = () =>
      void fetch(`${base}/presence`, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ leave: true }),
      }).catch(() => {});
    const onVisibility = () => (document.visibilityState === "visible" ? refresh() : leave());
    refresh();
    const timer = setInterval(refresh, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [active, base, headers, refresh]);

  // Offline (or not loaded), the last answer is stale: nobody counts as here.
  return { people: active ? heard : [], lastMessageAt, headers, refresh };
}
