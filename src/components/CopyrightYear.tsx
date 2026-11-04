"use client";

// The current year for the footer, so it never needs editing. Read in the
// browser only: the layout is prerendered (cacheComponents), where the clock
// isn't allowed and a year baked in at build time would go stale.

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export default function CopyrightYear() {
  const year = useSyncExternalStore(subscribe, () => new Date().getFullYear(), () => null);
  return <>{year}</>;
}
