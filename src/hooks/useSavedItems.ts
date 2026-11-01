"use client";

// Loads my saved items, re-searching (with a short delay) as `query` changes.
// Shared by the "Add from saved" panel and the profile page.
// Offline: searches the copy kept from the last full load instead.

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/apiClient";
import { getCachedSavedItems, saveCachedSavedItems } from "@/lib/offlineHome";
import { whenOfflineReady } from "@/lib/offlineStore";
import type { SavedItemDTO, SavedItemListResponse } from "@/types";

const SEARCH_DELAY_MS = 250;

export function useSavedItems(query: string) {
  const [savedItems, setSavedItems] = useState<SavedItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchList = useCallback(async () => {
    try {
      const data = await apiFetch<SavedItemListResponse>(`/api/saved-items?q=${encodeURIComponent(query.trim())}`);
      if (!query.trim()) saveCachedSavedItems(data.savedItems);
      return data;
    } catch (err) {
      // No network (not a refusal from the server): use the kept copy, if there is one.
      if (!(err instanceof ApiError)) await whenOfflineReady();
      const cached = err instanceof ApiError ? null : getCachedSavedItems(query);
      if (!cached) throw err;
      return { savedItems: cached };
    }
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    // Wait until typing pauses, so we don't send one request per key press.
    const timer = setTimeout(() => {
      fetchList()
        .then((data) => {
          if (cancelled) return;
          setSavedItems(data.savedItems);
          setError("");
        })
        .catch((err: Error) => !cancelled && setError(err.message))
        .finally(() => !cancelled && setLoading(false));
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fetchList]);

  /** Reloads now (after an add / edit / delete). */
  const reload = useCallback(async () => {
    setSavedItems((await fetchList()).savedItems);
  }, [fetchList]);

  return { savedItems, loading, error, reload };
}
