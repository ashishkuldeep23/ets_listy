"use client";

// Re-renders when anything kept offline changes (lists, changes, sync
// problems; also from another tab), so components can read it straight
// from the offline store. Returns -1 on the server, during hydration and
// until the stored data has been read: read nothing then.

import { useSyncExternalStore } from "react";
import { OFFLINE_CHANGED_EVENT, offlineVersion } from "@/lib/offlineStore";

function subscribe(onChange: () => void) {
  window.addEventListener(OFFLINE_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(OFFLINE_CHANGED_EVENT, onChange);
}

export function useOfflineVersion(): number {
  return useSyncExternalStore(subscribe, offlineVersion, () => -1);
}
