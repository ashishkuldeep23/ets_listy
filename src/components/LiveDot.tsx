"use client";

// Small "Live" dot in the header: cyan when the live-update connection is
// up. Hidden entirely when live updates aren't configured.

import { useEffect, useState } from "react";
import { getPusherClient } from "@/lib/pusherClient";

export default function LiveDot() {
  const [state, setState] = useState<"off" | "connecting" | "connected">("off");

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;
    const update = () => setState(pusher.connection.state === "connected" ? "connected" : "connecting");
    // Set from the callback, not directly in the effect body.
    const timer = setTimeout(update, 0);
    pusher.connection.bind("state_change", update);
    return () => {
      clearTimeout(timer);
      pusher.connection.unbind("state_change", update);
    };
  }, []);

  if (state === "off") return null;
  const live = state === "connected";
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" title={live ? "Live updates on" : "Connecting…"}>
      <span className={`size-2 rounded-full ${live ? "bg-accent" : "bg-border"}`} />
      {live ? "Live" : "…"}
    </span>
  );
}
