"use client";

// "3 viewing" pill on a list page. Tap it to see who has the list open
// right now: name + email for members (emails are only sent to logged-in
// members of the list), "Anonymous" for guests on the share link.

import { useEffect, useRef, useState } from "react";
import { Eye, UserRound } from "lucide-react";
import Avatar from "@/components/Avatar";
import type { ActivePerson } from "@/types";

export default function ViewersButton({ people }: { people: ActivePerson[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on a click outside or Esc.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Nothing known yet (first heartbeat pending, or offline).
  if (people.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="btn-ghost text-sm"
        title="Who has this list open"
      >
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-accent" />
        </span>
        <Eye className="size-4 text-accent" aria-hidden />
        {people.length}
        <span className="sr-only sm:not-sr-only">viewing</span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] animate-fade-up rounded-lg border border-border bg-surface p-2 shadow-2xl">
          <p className="px-2 pb-1 text-xs text-muted">
            {people.length === 1 ? "Only you are here right now" : `${people.length} people here right now`}
          </p>
          <ul className="flex flex-col">
            {people.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                {p.guest ? (
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-muted">
                    <UserRound className="size-4" aria-hidden />
                  </span>
                ) : (
                  <Avatar name={p.name} size="sm" variant={p.me ? "primary" : "accent"} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {p.guest ? "Anonymous" : p.name}
                    {p.me && <span className="text-muted"> (you)</span>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {p.guest ? `${p.name} · via share link` : (p.email ?? "Member")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
