"use client";

// Registers public/sw.js, which lets lists saved with "Save offline" open
// with no internet. Production only: in dev it would cache files that
// hot reload keeps changing.

import { useEffect } from "react";

export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err: unknown) => console.error("Service worker failed", err));
  }, []);
  return null;
}
