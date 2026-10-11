"use client";

// True while the browser says it has a network connection. Only a hint (a
// device on Wi-Fi with no internet still says "online"), so pages also treat
// a failed fetch as offline.

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  // The server (and hydration) assume online, so the first render matches.
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
