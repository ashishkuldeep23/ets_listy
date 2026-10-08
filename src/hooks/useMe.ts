"use client";

// The logged-in user (from /api/auth/me), or null while loading / if not
// logged in. Fetched per mount on purpose: a module-level cache would keep
// the old user after logging out and in as someone else.

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import type { SessionUser } from "@/types";

export function useMe(): SessionUser | null {
  const [me, setMe] = useState<SessionUser | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch<SessionUser>("/api/auth/me")
      .then((u) => !cancelled && setMe(u))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return me;
}
