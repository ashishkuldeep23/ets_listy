"use client";

// Top bar with the app name, the logged-in user's name and Logout.
// Pages are already protected by src/proxy.js; if /api/auth/me still says
// 401 (e.g. the account was deleted), send the user to login, except on
// pages open to guests (`allowGuest`), which show a Log in button instead.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ListChecks, LogIn, LogOut, UserRound } from "lucide-react";
import LiveDot from "@/components/LiveDot";
import { clearOfflineLists } from "@/lib/offlineLists";
import { clearOfflineCache } from "@/lib/offlineSync";
import type { SessionUser } from "@/types";

export default function Header({ allowGuest = false }: { allowGuest?: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  // For a guest: the page to come back to after logging in (null = not a guest).
  // Read in the effect, not via usePathname, so pages can still be prerendered.
  const [guestNext, setGuestNext] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res): Promise<SessionUser> | null => {
        if (res.status === 401) {
          if (allowGuest) setGuestNext(window.location.pathname);
          else router.replace("/login");
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => data && setUser(data))
      .catch(() => {});
  }, [router, allowGuest]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Lists saved for offline use stay on the device otherwise; the next person here shouldn't see them.
    clearOfflineLists();
    await clearOfflineCache().catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  // On guest pages we don't know who this is until /api/auth/me answers:
  // show neither Logout nor Log in meanwhile, so a guest never sees Logout.
  const knownUser = !allowGuest || user !== null;

  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-6">
      <Link href="/" className="group flex items-center gap-2 text-xl font-bold text-primary">
        <ListChecks className="size-6 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" aria-hidden />
        Listy
      </Link>
      <div className="flex min-h-8.5 items-center gap-3 text-sm">
        {/* Guests can't join live channels (their list polls instead), so no "Live" dot for them. */}
        {knownUser && <LiveDot />}
        {user && (
          <Link href="/profile" className="flex items-center gap-1.5 text-muted hover:text-fg" title="Profile and saved items">
            <UserRound className="icon-nudge text-accent" aria-hidden />
            <span className="hidden sm:inline">Hi, </span>
            <span className="text-accent">{user.name}</span>
          </Link>
        )}
        {guestNext !== null ? (
          // Secondary, not golden: the page itself carries the main Log in / Sign up call to action.
          <Link href={`/login?next=${encodeURIComponent(guestNext)}`} className="btn-secondary text-sm">
            <LogIn className="icon-nudge" aria-hidden />
            Log in
          </Link>
        ) : (
          knownUser && (
            <button onClick={logout} className="btn-ghost" title="Log out">
              <LogOut className="icon-nudge" aria-hidden />
              <span className="sr-only">Logout</span>
            </button>
          )
        )}
      </div>
    </header>
  );
}
