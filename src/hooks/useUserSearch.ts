"use client";

// Finds Listy users by the start of their name or email, for the "Invite a
// person" box. Waits for a pause in typing and ignores answers to old queries.

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { LIMITS } from "@/lib/limits";
import type { UserSearchResponse, UserSearchResult } from "@/types";

const SEARCH_DELAY_MS = 250;

export function useUserSearch(query: string) {
  const q = query.trim();
  const active = q.length >= LIMITS.USER_SEARCH_MIN;
  const [result, setResult] = useState<{ q: string; users: UserSearchResult[]; error: string } | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      apiFetch<UserSearchResponse>(`/api/users/search?q=${encodeURIComponent(q)}`)
        .then((data) => !cancelled && setResult({ q, users: data.users, error: "" }))
        .catch((err: Error) => !cancelled && setResult({ q, users: [], error: err.message }));
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, active]);

  // Results for an older query are not shown (they'd flash the wrong people).
  const current = active && result?.q === q ? result : null;
  return {
    users: current?.users ?? [],
    error: current?.error ?? "",
    loading: active && !current,
  };
}
