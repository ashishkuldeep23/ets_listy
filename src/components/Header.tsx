"use client";

// Top bar with the app name, my avatar + first name (→ profile) and Logout.
// Also hosts the chat toasts for logged-in users, and the offline changes
// pill (OfflineStatus), which also sends those changes when back online.
// Pages are already protected by src/proxy.js; if /api/auth/me still says
// 401 (e.g. the account was deleted), send the user to login, except on
// pages open to guests (`allowGuest`), which show a Log in button instead.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ListChecks, LogIn, LogOut } from "lucide-react";
import Avatar, { firstNameOf } from "@/components/Avatar";
import ChatToasts from "@/components/ChatToasts";
import InstallButton from "@/components/InstallButton";
import LiveDot from "@/components/LiveDot";
import OfflineStatus from "@/components/OfflineStatus";
import { ME_UPDATED_EVENT } from "@/lib/constants";
import { claimOfflineData, clearOfflineLists } from "@/lib/offlineLists";
import { whenOfflineReady } from "@/lib/offlineStore";
import { clearOfflineCache, pendingChangeCount } from "@/lib/offlineSync";
import { disablePush } from "@/lib/pushClient";
import type { SessionUser } from "@/types";

export default function Header({ allowGuest = false }: { allowGuest?: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  // For a guest: the page to come back to after logging in (null = not a guest).
  // Read in the effect, not via usePathname, so pages can still be prerendered.
  const [guestNext, setGuestNext] = useState<string | null>(null);

  useEffect(() => {
    let known = false;
    const load = () => {
      if (known) return;
      fetch("/api/auth/me")
        .then((res): Promise<SessionUser> | null => {
          if (res.status === 401) {
            known = true;
            if (allowGuest) setGuestNext(window.location.pathname);
            else router.replace("/login");
            return null;
          }
          return res.ok ? res.json() : null;
        })
        .then(async (data) => {
          if (!data) return;
          known = true;
          // Before anything is synced as this user: drops another user's offline data.
          await whenOfflineReady();
          claimOfflineData(data.id);
          setUser(data);
        })
        .catch(() => {});
    };
    load();
    // Opened offline: find out who this is once the connection returns, so offline changes can be sent.
    window.addEventListener("online", load);
    return () => window.removeEventListener("online", load);
  }, [router, allowGuest]);

  // The profile page changed my name: show it without a reload.
  useEffect(() => {
    const onUpdate = (e: Event) => e instanceof CustomEvent && setUser(e.detail as SessionUser);
    window.addEventListener(ME_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(ME_UPDATED_EVENT, onUpdate);
  }, []);

  async function logout() {
    const unsent = pendingChangeCount();
    if (unsent > 0 && !confirm(`${unsent} offline ${unsent === 1 ? "change has" : "changes have"} not been sent yet and will be lost. Log out anyway?`)) {
      return;
    }
    // Before logging out: removing this device needs the session.
    await disablePush().catch(() => {});
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
        <OfflineStatus loggedIn={user !== null} />
        <InstallButton />
        {user && (
          <Link
            href="/profile"
            className="flex min-w-0 items-center gap-2 rounded-full py-0.5 pr-2 pl-0.5 text-fg hover:bg-surface-2"
            title="Profile and saved items"
          >
            <Avatar name={user.name} />
            {/* <span className="max-w-[7rem] truncate font-medium sm:max-w-[10rem]">{firstNameOf(user.name)}</span> */}
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
      {user && <ChatToasts userId={user.id} />}
    </header>
  );
}
