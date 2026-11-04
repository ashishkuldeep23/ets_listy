"use client";

// "Save offline" on a list page (logged in or guest). Keeps a copy of the
// list on this device so the page still opens and can be used with no
// internet (OfflineListView). While saved, the copy follows every change
// seen online. Changes made offline are sent by OfflineStatus (in the
// header); `onSynced` then reloads the list. Click again to remove the copy.
// With "Keep all lists offline" on, my lists are always kept: the button
// then only says so (turn the setting off on the home page to choose).

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CloudCheck, Download, LoaderCircle } from "lucide-react";
import { useOfflineVersion } from "@/hooks/useOfflineVersion";
import { isAutoSaveOn } from "@/lib/offlineAuto";
import { getOfflineList, removeOfflineList, saveOfflineList, type OfflineSnapshot } from "@/lib/offlineLists";
import { cachePageForOffline, OFFLINE_SYNCED_EVENT, uncachePage, type OfflineSyncedDetail } from "@/lib/offlineSync";

interface SaveOfflineButtonProps extends OfflineSnapshot {
  /** Called after offline changes reached the server, to reload the list. */
  onSynced: () => void;
}

export default function SaveOfflineButton({ path, name, status, items, toggleBase, canEdit, onSynced }: SaveOfflineButtonProps) {
  // Read from the offline store on every change to it (nothing until it has been read).
  const ready = useOfflineVersion() >= 0;
  // Share links aren't "my lists": those are always saved by hand.
  const auto = ready && path.startsWith("/folders/") && isAutoSaveOn();
  const copy = ready ? getOfflineList(path) : null;
  const saved = ready && (auto || (copy !== null && !copy.auto));
  // With the setting off, an automatic copy only carries queued changes: it isn't "saved", but must stay fresh.
  const hasCopy = copy !== null;
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // A copy made here because of the setting counts as an automatic one.
    if (saved || hasCopy) saveOfflineList({ path, name, status, items, toggleBase, canEdit, ...(!getOfflineList(path) && { auto }) });
  }, [saved, hasCopy, auto, path, name, status, items, toggleBase, canEdit]);

  // Re-save the page itself once per visit: the browser may have evicted it,
  // or it was saved by an older version of the app that kept less.
  const pageCached = useRef(false);
  useEffect(() => {
    if (!saved || pageCached.current || !navigator.onLine) return;
    pageCached.current = true;
    cachePageForOffline(path).catch((err: unknown) => console.error("Offline page cache failed", err));
  }, [saved, path]);

  useEffect(() => {
    const onSync = (e: Event) => {
      if (e instanceof CustomEvent && (e.detail as OfflineSyncedDetail).path === path) onSynced();
    };
    window.addEventListener(OFFLINE_SYNCED_EVENT, onSync);
    return () => window.removeEventListener(OFFLINE_SYNCED_EVENT, onSync);
  }, [path, onSynced]);

  async function toggle() {
    setBusy(true);
    if (saved) {
      removeOfflineList(path);
      await uncachePage(path).catch(() => {});
    } else {
      pageCached.current = true;
      saveOfflineList({ path, name, status, items, toggleBase, canEdit, auto: false });
      // Without the page cache the list still shows offline in an open tab, just not after a reload.
      await cachePageForOffline(path).catch((err: unknown) => console.error("Offline page cache failed", err));
      // Re-request the page's data now that it is saved, so the service worker keeps a full copy of it.
      router.refresh();
    }
    setBusy(false);
  }

  const label = saved ? "Saved offline" : "Save offline";
  if (auto) {
    return (
      <span className="btn-secondary cursor-default text-sm" title='All your lists are kept offline ("Keep all lists offline" on the home page).'>
        <CloudCheck className="size-4" aria-hidden />
        <span className="hidden sm:inline">{label}</span>
        <span className="sr-only sm:hidden">{label}</span>
      </span>
    );
  }
  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      className={`${saved ? "btn-secondary" : "btn-ghost"} text-sm`}
      title={saved ? "Available without internet. Click to remove the offline copy." : "Keep a copy on this device to use without internet"}
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
