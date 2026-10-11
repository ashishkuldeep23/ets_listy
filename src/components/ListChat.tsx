"use client";

// Chat for one list: a round button in the bottom-right corner and a panel.
// Members (logged in) and guests on the share link can both use it.
//
// - "Who is here" comes from usePresence (shared with the viewers pill).
//   The chat opens only when 2 or more people are here and we're online.
// - Messages: history loads when the panel opens, then new ones arrive live
//   (members, via Pusher) and by a short poll (everyone, so guests and
//   Pusher-less setups work too). Repeats are dropped by id.
// - While the panel is closed, a dot shows there are unread messages.
//   On the list page itself there are no toasts (see ChatToasts).

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { LoaderCircle, MessageCircle, SendHorizontal, Users, WifiOff, X } from "lucide-react";
import Avatar from "@/components/Avatar";
import ErrorText from "@/components/ErrorText";
import { useChannel } from "@/hooks/useChannel";
import { useMe } from "@/hooks/useMe";
import { useOnline } from "@/hooks/useOnline";
import type { Presence } from "@/hooks/usePresence";
import { ApiError, apiFetch } from "@/lib/apiClient";
import { EVENTS, folderChannel } from "@/lib/channels";
import { CHAT_MIN_PEOPLE } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";
import type { ChatListResponse, ChatMessageDTO } from "@/types";

const POLL_MS = 4_000;

interface ListChatProps {
  /** API base: /api/folders/<id> for members, /api/share/<token> for guests. */
  base: string;
  /** The list id for live messages (members only); null for guests, who poll. */
  folderId: string | null;
  /** Who is here, shared with the viewers pill (see usePresence). */
  presence: Presence;
}

const time = (d: string | Date) => new Date(d).getTime();

/** Adds messages, dropping repeats, oldest first. */
function merge(prev: ChatMessageDTO[], incoming: ChatMessageDTO[]): ChatMessageDTO[] {
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, { ...m, mine: m.mine || (byId.get(m.id)?.mine ?? false) });
  return [...byId.values()].sort((a, b) => time(a.createdAt) - time(b.createdAt));
}

/** Last time I saw this list's chat, so a reload doesn't show old messages as unread. */
function readSeen(base: string): number {
  try {
    return Number(localStorage.getItem(`listy:chat-seen:${base}`)) || 0;
  } catch {
    return 0;
  }
}
function writeSeen(base: string, at: number) {
  try {
    localStorage.setItem(`listy:chat-seen:${base}`, String(at));
  } catch {}
}

export default function ListChat({ base, folderId, presence }: ListChatProps) {
  const online = useOnline();
  const me = useMe();
  const { people, headers: guestHeaders, refresh: heartbeat } = presence;
  // Newest message: from the heartbeat, or sooner from a live event.
  const [liveLastAt, setLiveLastAt] = useState(0);
  const lastMessageAt = Math.max(presence.lastMessageAt, liveLastAt);
  const [seenAt, setSeenAt] = useState(() => readSeen(base));
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const enoughPeople = people.length >= CHAT_MIN_PEOPLE;
  const canChat = online && enoughPeople;
  const unread = !open && lastMessageAt > seenAt;

  const call = useCallback(
    <T,>(path: string, init: RequestInit = {}) =>
      apiFetch<T>(`${base}${path}`, { ...init, headers: { ...guestHeaders, ...init.headers } }),
    [base, guestHeaders]
  );

  const newest = messages.at(-1)?.createdAt ?? null;

  // Fetch messages: all recent ones the first time, then only newer ones.
  const fetchMessages = useCallback(() => {
    const after = newest ? `?after=${encodeURIComponent(new Date(newest).toISOString())}` : "";
    return call<ChatListResponse>(`/chat${after}`).then(({ messages: got }) => {
      setMessages((prev) => merge(prev, got));
      setLoaded(true);
    });
  }, [call, newest]);

  // While the panel is open: load, then poll (guests have no live channel).
  useEffect(() => {
    if (!open || !online) return;
    const poll = () => document.visibilityState === "visible" && fetchMessages().catch(() => {});
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
    // fetchMessages changes with every new message; restarting the poll each time is fine.
  }, [open, online, fetchMessages]);

  // Members: new messages instantly. Our own tab never gets its own event back.
  useChannel(folderId ? folderChannel(folderId) : null, {
    [EVENTS.chatMessage]: (data) => {
      const msg = data as ChatMessageDTO;
      const mine = Boolean(me && msg.authorId === me.id);
      setLiveLastAt((t) => Math.max(t, time(msg.createdAt)));
      if (open) setMessages((prev) => merge(prev, [{ ...msg, mine }]));
    },
  });

  const latestAt = Math.max(lastMessageAt, newest ? time(newest) : 0);

  // While the panel is open everything counts as read (remembered for reloads).
  useEffect(() => {
    if (open && latestAt) writeSeen(base, latestAt);
  }, [open, latestAt, base]);

  function close() {
    setSeenAt((s) => Math.max(s, latestAt));
    setOpen(false);
  }

  // Keep the newest message in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, open]);

  // Hints disappear by themselves.
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(""), 3500);
    return () => clearTimeout(timer);
  }, [hint]);

  function toggleOpen() {
    if (open) return close();
    if (!online) return setHint("You're offline. Chat works when you're back online.");
    if (!enoughPeople) return setHint("Chat opens when someone else has this list open too.");
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending || !canChat) return;
    setSending(true);
    setError("");
    try {
      const msg = await call<ChatMessageDTO>("/chat", { method: "POST", body: JSON.stringify({ text }) });
      setMessages((prev) => merge(prev, [msg]));
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      // 409: the others just left; refresh who is here.
      if (err instanceof ApiError && err.status === 409) heartbeat();
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  // Enter sends, Shift+Enter makes a new line.
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
    if (e.key === "Escape") close();
  }

  const others = people.filter((p) => !p.me);
  const blockedReason = !online
    ? "You're offline. Messages will load when you're back."
    : !enoughPeople
      ? "Everyone else left. You can chat again when someone opens this list."
      : "";

  return (
    <>
      {open && (
        <section
          className="fixed inset-x-2 bottom-20 z-40 flex h-[min(30rem,70dvh)] animate-fade-up flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl sm:inset-x-auto sm:right-4 sm:w-96"
          aria-label="List chat"
        >
          <header className="flex items-center gap-2 border-b border-border px-3 py-2">
            <MessageCircle className="size-4 shrink-0 text-accent" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">List chat</h2>
              <p className="truncate text-xs text-muted" title={others.map((p) => p.name).join(", ")}>
                {others.length === 0 ? "Only you here" : `Here: ${others.map((p) => p.name).join(", ")}`}
              </p>
            </div>
            <button onClick={close} className="btn-ghost px-2 py-1" title="Close chat">
              <X className="icon-nudge" aria-hidden />
              <span className="sr-only">Close chat</span>
            </button>
          </header>

          <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3" aria-live="polite">
            {!loaded && online && <LoaderCircle className="mx-auto size-5 animate-spin text-muted" aria-hidden />}
            {loaded && messages.length === 0 && (
              <p className="m-auto text-center text-sm text-muted">No messages yet. Say hi!</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex items-end gap-2 ${m.mine ? "flex-row-reverse" : ""}`}>
                <Avatar name={m.authorName} size="sm" variant={m.mine ? "primary" : "accent"} />
                <div className={`max-w-[80%] ${m.mine ? "text-right" : ""}`}>
                  <p className="mb-0.5 text-xs text-muted">
                    {m.mine ? "You" : m.authorName} ·{" "}
                    {new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </p>
                  <p
                    className={`rounded-lg px-3 py-2 text-left text-sm whitespace-pre-wrap wrap-break-word ${
                      m.mine ? "bg-primary/15 text-fg" : "bg-surface-2 text-fg"
                    }`}
                  >
                    {m.text}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={send} className="flex flex-col gap-2 border-t border-border p-2">
            {blockedReason && (
              <p className="flex items-center gap-1.5 text-xs text-primary">
                {!online && <WifiOff className="size-3.5" aria-hidden />}
                {blockedReason}
              </p>
            )}
            <ErrorText message={error} />
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={LIMITS.CHAT_MESSAGE_MAX}
                disabled={!canChat}
                placeholder={canChat ? "Write a message…" : "Chat is paused"}
                aria-label="Message"
                className="input max-h-28 min-h-10 flex-1 resize-none py-2 text-sm disabled:opacity-60"
              />
              <button className="btn-primary px-3" disabled={!canChat || sending || !draft.trim()} title="Send">
                {sending ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <SendHorizontal className="icon-nudge" aria-hidden />
                )}
                <span className="sr-only">Send</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {hint && !open && (
        <p
          role="status"
          className="fixed right-4 bottom-20 z-40 max-w-[min(18rem,calc(100vw-2rem))] animate-fade-up rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted shadow-lg"
        >
          {hint}
        </p>
      )}

      <button
        onClick={toggleOpen}
        className={`fixed right-4 bottom-4 z-40 flex size-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 ${
          canChat || open ? "bg-primary text-on-primary" : "border border-border bg-surface-2 text-muted"
        }`}
        aria-expanded={open}
        title={
          canChat
            ? `Chat with ${others.length} ${others.length === 1 ? "person" : "people"} here`
            : online
              ? "Chat opens when 2 or more people have this list open"
              : "You're offline"
        }
      >
        {open ? <X className="size-6" aria-hidden /> : <MessageCircle className="size-6" aria-hidden />}
        <span className="sr-only">{open ? "Close chat" : "Open chat"}</span>
        {/* How many people are here (me included). */}
        {online && people.length > 0 && (
          <span className="absolute -top-1 -left-1 flex items-center gap-0.5 rounded-full border border-border bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-accent">
            <Users className="size-3" aria-hidden />
            {people.length}
          </span>
        )}
        {unread && (
          <span className="absolute -top-0.5 -right-0.5 size-3.5 animate-pop rounded-full border-2 border-bg bg-accent">
            <span className="sr-only">New messages</span>
          </span>
        )}
      </button>
    </>
  );
}
