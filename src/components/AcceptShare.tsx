"use client";

// Opens a share link. Logged in: asks the API to add the folder to my
// "Shared with me", then goes to it. Logged out (the API answers 401): shows
// the read-only public view instead, which offers Log in / Sign up.
// Offline: shows the copy saved with "Save offline" on this link, if any;
// SaveOfflineButton sends ticks made there once back online.

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Unlink, WifiOff } from "lucide-react";
import Loading from "@/components/Loading";
import OfflineListView from "@/components/OfflineListView";
import PublicListView from "@/components/PublicListView";
import { useOnline } from "@/hooks/useOnline";
import { ApiError, apiFetch } from "@/lib/apiClient";
import { getOfflineList } from "@/lib/offlineLists";
import type { AcceptShareResponse } from "@/types";

export default function AcceptShare() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState("");
  const [guest, setGuest] = useState(false);
  // The request failed for lack of network and a saved copy exists.
  const [offline, setOffline] = useState(false);
  const online = useOnline();
  const path = `/share/${token}`;
  // Bumped to try again while the offline copy is showing.
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  // Runs again when the connection comes back (or on a retry from the offline view).
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    apiFetch<AcceptShareResponse>(`/api/share/${encodeURIComponent(token)}/accept`, { method: "POST" })
      .then(({ folderId }) => !cancelled && router.replace(`/folders/${folderId}`))
      .catch((err: unknown) => {
        if (cancelled) return;
        setOffline(false);
        if (err instanceof ApiError && err.status === 401) {
          setGuest(true);
          return;
        }
        if (!(err instanceof ApiError) && getOfflineList(path)) {
          setOffline(true);
          return;
        }
        setError(err instanceof Error ? err.message : "Something went wrong");
      });
    return () => {
      cancelled = true;
    };
  }, [token, router, online, path, attempt]);

  if (offline || (!online && getOfflineList(path))) return <OfflineListView path={path} onRetry={retry} />;
  if (guest) return <PublicListView token={token} />;
  if (!online && !error) return <OfflineError />;
  if (!error) return <Loading label="Opening shared list…" />;

  return (
    <div className="card animate-fade-up">
      <h1 className="mb-2 flex items-center gap-2 text-xl font-semibold">
        <Unlink className="size-5 animate-pop text-danger" aria-hidden />
        Can&apos;t open this link
      </h1>
      <p className="mb-4 text-muted">{error}</p>
      <Link href="/" className="link">
        <ArrowLeft className="icon-nudge" aria-hidden />
        Go to your lists
      </Link>
    </div>
  );
}

function OfflineError() {
  return (
    <div className="card animate-fade-up">
      <h1 className="mb-2 flex items-center gap-2 text-xl font-semibold">
        <WifiOff className="size-5 animate-pop text-danger" aria-hidden />
        You&apos;re offline
      </h1>
      <p className="text-muted">This list wasn&apos;t saved for offline use. Connect to the internet to open it.</p>
    </div>
  );
}
