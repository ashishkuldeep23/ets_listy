"use client";

// Subscribes to a Pusher channel while the component is mounted and calls
// the matching handler for each event. Does nothing when live updates are
// off or `channelName` is null.

import { useEffect, useRef } from "react";
import { getPusherClient } from "@/lib/pusherClient";

export type ChannelHandlers = Record<string, (data: unknown) => void>;

export function useChannel(channelName: string | null, handlers: ChannelHandlers, onResubscribe?: () => void) {
  // Keep the latest handlers without re-subscribing on every render.
  const handlersRef = useRef(handlers);
  const resubscribeRef = useRef(onResubscribe);
  useEffect(() => {
    handlersRef.current = handlers;
    resubscribeRef.current = onResubscribe;
  });

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher || !channelName) return;

    const channel = pusher.subscribe(channelName);
    const onEvent = (event: string, data: unknown) => {
      if (event.startsWith("pusher:")) return; // internal events
      handlersRef.current[event]?.(data);
    };
    channel.bind_global(onEvent);

    // After the connection drops and comes back, events sent meanwhile were
    // missed: let the caller refetch once.
    let wasDisconnected = false;
    const onState = ({ current }: { current: string }) => {
      if (current === "connected" && wasDisconnected) resubscribeRef.current?.();
      wasDisconnected = current !== "connected";
    };
    pusher.connection.bind("state_change", onState);

    return () => {
      channel.unbind_global(onEvent);
      pusher.connection.unbind("state_change", onState);
      pusher.unsubscribe(channelName);
    };
  }, [channelName]);
}
