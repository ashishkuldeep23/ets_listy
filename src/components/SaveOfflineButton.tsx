"use client";

// "Save offline" on a list page (logged in or guest). Keeps a copy of the
// list on this device so the page still opens and can be ticked with no
// internet. While saved, the copy follows every change seen online, and
// ticks made offline are sent to the server (then `onSynced` reloads the
// list). Click again to remove the copy.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CloudCheck, Download, LoaderCircle } from "lucide-react";
import { getOfflineList, removeOfflineList, saveOfflineList, type OfflineSnapshot } from "@/lib/offlineLists";
import { cachePageForOffline, hasTicksToSync, syncOfflineTicks, uncachePage } from "@/lib/offlineSync";

const SYNC_RETRY_MS = 15_000;

interface SaveOfflineButtonProps extends OfflineSnapshot {
  /** Called after offline ticks reached the server, to reload the list. */
  onSynced: () => void;
}

export default function SaveOfflineButton({ path, name, status, items, toggleBase, onSynced }: SaveOfflineButtonProps) {
  // Only rendered after the list loaded in the browser, so reading storage here is safe.
  const [saved, setSaved] = useState(() => getOfflineList(path) !== null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const syncing = useRef(false);

  useEffect(() => {
    if (saved) saveOfflineList({ path, name, status, items, toggleBase });
  }, [saved, path, name, status, items, toggleBase]);

  // Re-save the page itself once per visit: the browser may have evicted it,
  // or it was saved by an older version of the app that kept less.
  const savedOnMount = useRef(saved);
  useEffect(() => {
    if (savedOnMount.current && navigator.onLine) {
      cachePageForOffline(path).catch((err: unknown) => console.error("Offline page cache failed", err));
    }
  }, [path]);

  // Send offline ticks now, when the connection returns, and on a timer
  // (a request right after "online" can still fail, or hang on a weak signal).
  useEffect(() => {
    const sync = () => {
      if (syncing.current || !navigator.onLine || !hasTicksToSync(path)) return;
      syncing.current = true;
      syncOfflineTicks(path)
        .then((changed) => changed && onSynced())
        .finally(() => {
          syncing.current = false;
        });
    };
    sync();
    const timer = setInterval(sync, SYNC_RETRY_MS);
    window.addEventListener("online", sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", sync);
    };
  }, [path, onSynced]);

  async function toggle() {
    setBusy(true);
    if (saved) {
      removeOfflineList(path);
      await uncachePage(path).catch(() => {});
      setSaved(false);
    } else {
      saveOfflineList({ path, name, status, items, toggleBase });
      // Without the page cache the list still shows offline in an open tab, just not after a reload.
      await cachePageForOffline(path).catch((err: unknown) => console.error("Offline page cache failed", err));
      // Re-request the page's data now that it is saved, so the service worker keeps a full copy of it.
      router.refresh();
      setSaved(true);
    }
    setBusy(false);
  }

  const label = saved ? "Saved offline" : "Save offline";
  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      className={`${saved ? "btn-secondary" : "btn-ghost"} text-sm`}
      title={saved ? "Available without internet. Click to remove the offline copy." : "Keep a copy on this device to view and tick without internet"}
    >
      {busy ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
      ) : saved ? (
        <CloudCheck className="size-4 animate-pop" aria-hidden />
      ) : (
        <Download className="icon-nudge" aria-hidden />
      )}
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </button>
  );
}
