"use client";

// Header pill for changes made offline: how many are still waiting to be
// sent, and the changes the server refused while syncing (with why). Also
// runs the sync itself, on every page with a header: now, when the
// connection returns, and on a timer (a request right after "online" can
// still fail, or hang on a weak signal). After a sync, keeps every list's
// offline copy fresh ("Keep all lists offline", lib/offlineAuto.ts).

import { useEffect, useState } from "react";
import { CloudUpload, TriangleAlert, X } from "lucide-react";
import { useOfflineVersion } from "@/hooks/useOfflineVersion";
import { refreshAllOffline } from "@/lib/offlineAuto";
import { clearSyncProblems, getSyncProblems } from "@/lib/offlineLists";
import { hasChangesToSync, pendingChangeCount, requestBackgroundSync, SYNC_MESSAGE, syncAllOffline } from "@/lib/offlineSync";

const SYNC_RETRY_MS = 15_000;

/** `loggedIn`: true only once the current user is known; until then only share-link ticks are sent. */
export default function OfflineStatus({ loggedIn }: { loggedIn: boolean }) {
  const version = useOfflineVersion();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      if (!navigator.onLine) return;
      const sending = hasChangesToSync(loggedIn) ? syncAllOffline(loggedIn) : Promise.resolve();
      // Copies are refreshed after my changes went out, so they include them. Throttled inside.
      if (loggedIn) void sending.then(() => refreshAllOffline());
    };
    sync();
    const timer = setInterval(sync, SYNC_RETRY_MS);
    window.addEventListener("online", sync);
    // The service worker leaves the sync to an open page.
    const onMessage = (e: MessageEvent) => e.data === SYNC_MESSAGE && sync();
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", sync);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [loggedIn]);

  // Changes are waiting: have the service worker send them when the
  // connection returns, even if this tab is closed by then.
  const hasWaiting = version >= 0 && pendingChangeCount() > 0;
  useEffect(() => {
    if (hasWaiting) void requestBackgroundSync();
  }, [hasWaiting, version]);

  // Nothing is read from storage on the server or while hydrating.
  if (version < 0) return null;
  const waiting = pendingChangeCount();
  const problems = getSyncProblems();
  if (waiting === 0 && problems.length === 0) return null;

  const label =
    problems.length > 0
      ? `${problems.length} offline ${problems.length === 1 ? "change" : "changes"} not saved`
      : `${waiting} offline ${waiting === 1 ? "change" : "changes"} waiting to sync`;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex animate-pop items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
          problems.length > 0 ? "border-danger/50 text-danger" : "border-primary/50 text-primary"
        }`}
        title={label}
        aria-expanded={open}
      >
        {problems.length > 0 ? (
          <TriangleAlert className="size-3.5" aria-hidden />
        ) : (
          <CloudUpload className="size-3.5" aria-hidden />
        )}
        {problems.length > 0 ? problems.length : waiting}
        <span className="sr-only">{label}</span>
      </button>
      {open && (
        <div className="card absolute top-full right-0 z-20 mt-2 w-72 animate-fade-up p-3 text-sm">
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="text-muted">
              {waiting > 0
                ? `${waiting} ${waiting === 1 ? "change" : "changes"} made offline will be sent when you're online.`
                : "All offline changes were sent."}
            </p>
            <button onClick={() => setOpen(false)} className="btn-ghost p-0.5" title="Close">
              <X className="size-4" aria-hidden />
              <span className="sr-only">Close</span>
            </button>
          </div>
          {problems.length > 0 && (
            <>
              <p className="mb-1 text-fg">These couldn&apos;t be saved:</p>
              <ul className="mb-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
                {problems.map((p) => (
                  <li key={p.id} className="flex gap-1.5 text-danger">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="wrap-break-word">{p.message}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  clearSyncProblems();
                  if (waiting === 0) setOpen(false);
                }}
                className="link text-xs"
              >
                Dismiss
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
