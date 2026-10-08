"use client";

// Top bar with the app name, the logged-in user's name and Logout.
// Pages are already protected by src/proxy.js; if /api/auth/me still says
// 401 (e.g. the account was deleted), send the user to login.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import LiveDot from "@/components/LiveDot";
import type { SessionUser } from "@/types";

export default function Header() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res): Promise<SessionUser> | null => {
        if (res.status === 401) {
          router.replace("/login");
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => data && setUser(data))
      .catch(() => {});
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-6">
      <Link href="/" className="text-xl font-bold text-primary">
        Listy
      </Link>
      <div className="flex items-center gap-3 text-sm">
        <LiveDot />
        {user && (
          <Link href="/profile" className="text-muted hover:text-fg" title="Profile and saved items">
            Hi, <span className="text-accent">{user.name}</span>
          </Link>
        )}
        <button onClick={logout} className="btn-ghost">
          Logout
        </button>
      </div>
    </header>
  );
}
