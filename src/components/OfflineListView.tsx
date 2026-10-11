"use client";

// A list page with no internet: shows the copy saved with "Save offline".
// Items can still be ticked; ticks are kept on this device and sent to the
// server when the page loads online again (if the list allows ticking).
// Nothing else can change offline. Calls `onRetry` every few seconds and
// when the browser says it is back online, so the page returns to the live
// list by itself.

import { useEffect, useState } from "react";
import { CircleDashed, IndianRupee, RefreshCw, ShoppingBasket, WifiOff } from "lucide-react";
import GroupSection from "@/components/GroupSection";
import ItemRow from "@/components/ItemRow";
import ProgressBar from "@/components/ProgressBar";
import StatusBadge from "@/components/StatusBadge";
import { formatRupees } from "@/lib/format";
import { getOfflineList, itemsWithPending, setOfflineTick } from "@/lib/offlineLists";
import { computeTotals, groupItems } from "@/lib/totals";

const noop = () => {};
const cannotEdit = async () => false;
const RETRY_MS = 10_000;

const savedAtLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function OfflineListView({ path, onRetry }: { path: string; onRetry: () => void }) {
  // Only rendered in the browser after a failed load, so reading storage here is safe.
  const [list, setList] = useState(() => getOfflineList(path));

  // "online" can fire a moment before requests work again, so keep trying on a timer too.
  useEffect(() => {
    const retry = () => document.visibilityState === "visible" && onRetry();
    const timer = setInterval(retry, RETRY_MS);
    window.addEventListener("online", retry);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", retry);
    };
  }, [onRetry]);

  if (!list) return null;

  const items = itemsWithPending(list);
  const totals = computeTotals(items);
  const pendingCount = Object.keys(list.pending).length;

  return (
    <div>
      <div className="card mb-6 flex animate-fade-up flex-col gap-3 border-primary/40 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <WifiOff className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p className="text-sm text-muted">
            <span className="text-fg">You&apos;re offline.</span> Showing the copy saved {savedAtLabel(list.savedAt)}.{" "}
            {list.toggleBase
              ? "Ticks are kept on this device and sent when you're back online."
              : "Ticks are kept on this device only."}
            {pendingCount > 0 && <span className="text-primary"> {pendingCount} not sent yet.</span>}
          </p>
        </div>
        <button onClick={onRetry} className="btn-ghost shrink-0 text-sm">
          <RefreshCw className="icon-nudge" aria-hidden />
          Try again
        </button>
      </div>

      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold wrap-break-word text-primary">{list.name}</h1>
        <StatusBadge status={list.status} />
      </div>
      <div className="mt-2 mb-6">
        <ProgressBar done={items.filter((i) => i.done).length} total={items.length} />
      </div>

      {items.length === 0 ? (
        <div className="card flex animate-fade-up flex-col items-center gap-3 py-10 text-center text-muted">
          <ShoppingBasket className="size-10 animate-float text-primary/70" aria-hidden />
          <p>No items yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groupItems(items).map(([key, sectionItems]) => (
            <GroupSection
              key={key || "__ungrouped"}
              name={key || null}
              done={sectionItems.filter((i) => i.done).length}
              total={sectionItems.length}
              canEdit={false}
              onRename={cannotEdit}
            >
              {sectionItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  groups={[]}
                  canCheck
                  canEdit={false}
                  onToggle={() => setList(setOfflineTick(path, item.id, !item.done))}
                  onSave={cannotEdit}
                  onDelete={noop}
                />
              ))}
            </GroupSection>
          ))}

          <div className="card flex flex-wrap justify-between gap-4">
            <div>
              <p className="flex items-center gap-1 text-sm text-muted">
                <IndianRupee className="size-3.5" aria-hidden />
                Total
              </p>
              <p className="text-xl font-semibold text-primary">{formatRupees(totals.total)}</p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-sm text-muted">
                <CircleDashed className="size-3.5" aria-hidden />
                Remaining (not ticked)
              </p>
              <p className="text-xl font-semibold text-accent">{formatRupees(totals.remaining)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
