"use client";

// Toasts for new chat messages in my lists, shown on every page EXCEPT the
// list the message belongs to (its chat button shows an unread dot there).
// Live via my user channel; when Pusher is off, a slow poll instead.
// Clicking a toast opens the list.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import Avatar from "@/components/Avatar";
import { useChannel } from "@/hooks/useChannel";
import { apiFetch } from "@/lib/apiClient";
import { EVENTS, userChannel } from "@/lib/channels";
import { getPusherClient } from "@/lib/pusherClient";
import type { ChatNoticeEvent, ChatNoticeResponse } from "@/types";

const SHOW_MS = 6_000;
const POLL_MS = 20_000;
const MAX_TOASTS = 3;

export default function ChatToasts({ userId }: { userId: string }) {
  const [toasts, setToasts] = useState<ChatNoticeEvent[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (notice: ChatNoticeEvent) => {
      // Already on that list: its chat shows the message.
      if (window.location.pathname === `/folders/${notice.folderId}`) return;
      setToasts((t) => (t.some((x) => x.id === notice.id) ? t : [...t, notice].slice(-MAX_TOASTS)));
      if (!timers.current.has(notice.id)) timers.current.set(notice.id, setTimeout(() => dismiss(notice.id), SHOW_MS));
    },
    [dismiss]
  );

  useChannel(userChannel(userId), {
    [EVENTS.chatNotice]: (data) => show(data as ChatNoticeEvent),
  });

  // No live updates configured: ask the server now and then.
  useEffect(() => {
    if (getPusherClient()) return;
    let after = new Date().toISOString();
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      apiFetch<ChatNoticeResponse>(`/api/chat/recent?after=${encodeURIComponent(after)}`)
        .then(({ notices }) => {
          const last = notices.at(-1);
          if (last) after = new Date(last.createdAt).toISOString();
          notices.forEach(show);
        })
        .catch(() => {});
    };
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [show]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-16 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="card flex animate-fade-up items-start gap-3 border-accent/40 p-3 shadow-2xl">
          <Avatar name={t.authorName} size="sm" variant="accent" />
          <Link href={`/folders/${t.folderId}`} onClick={() => dismiss(t.id)} className="min-w-0 flex-1 text-sm">
            <p className="flex items-center gap-1 text-xs text-muted">
              <MessageCircle className="size-3.5 text-accent" aria-hidden />
              <span className="truncate">
                <span className="text-fg">{t.authorName}</span> in <span className="text-accent">{t.folderName}</span>
              </span>
            </p>
            <p className="mt-0.5 line-clamp-2 wrap-break-word">{t.text}</p>
          </Link>
          <button onClick={() => dismiss(t.id)} className="text-muted hover:text-fg" title="Dismiss">
            <X className="size-4" aria-hidden />
            <span className="sr-only">Dismiss</span>
          </button>
        </div>
      ))}
    </div>
  );
}
