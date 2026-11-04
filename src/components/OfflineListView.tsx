"use client";

// A list kept on this device, used with no internet: the copy saved with
// "Save offline", or a list made offline. Items can be ticked and marked
// "not found", and (if I may edit the list) added (also from my saved
// items), edited and deleted, and groups renamed.
// Changes are kept on this device and sent to the server when back online
// (OfflineStatus in the header does that; a list I may not tick keeps its
// ticks here only). Re-reads the copy whenever it changes, so it shows the
// state after a sync too.
// With `onRetry`, calls it every few seconds and when the browser says it
// is back online, so the page returns to the live list by itself.

import { useEffect, useState } from "react";
import { ArrowLeft, BookmarkPlus, CircleDashed, CloudUpload, IndianRupee, RefreshCw, ShoppingBasket, WifiOff } from "lucide-react";
import ErrorText from "@/components/ErrorText";
import GroupSection from "@/components/GroupSection";
import ItemForm, { type ItemFormValues } from "@/components/ItemForm";
import ItemRow from "@/components/ItemRow";
import ProgressBar from "@/components/ProgressBar";
import SavedItemPicker from "@/components/SavedItemPicker";
import StatusBadge from "@/components/StatusBadge";
import { useOfflineVersion } from "@/hooks/useOfflineVersion";
import { formatRupees } from "@/lib/format";
import { getFolderChanges, withFolderChange } from "@/lib/offlineFolders";
import {
  addOfflineItem,
  deleteOfflineItem,
  editOfflineItem,
  getOfflineList,
  itemFields,
  itemsWithPending,
  pendingCount,
  renameOfflineGroup,
  setOfflineTick,
} from "@/lib/offlineLists";
import { computeTotals, groupItems } from "@/lib/totals";
import type { ItemDTO, Result, SavedItemDTO } from "@/types";

const RETRY_MS = 10_000;

const savedAtLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

interface OfflineListViewProps {
  path: string;
  /** Try loading the live list again (list pages). */
  onRetry?: () => void;
  /** Shows a back link (the home page, which opens lists in place while offline). */
  onBack?: () => void;
}

export default function OfflineListView({ path, onRetry, onBack }: OfflineListViewProps) {
  const version = useOfflineVersion();
  const [error, setError] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  // A saved item loaded into the add form by "Edit & add". `key` remounts the form with it.
  const [prefill, setPrefill] = useState<{ key: number; item: SavedItemDTO } | null>(null);

  // "online" can fire a moment before requests work again, so keep trying on a timer too.
  useEffect(() => {
    if (!onRetry) return;
    const retry = () => document.visibilityState === "visible" && onRetry();
    const timer = setInterval(retry, RETRY_MS);
    window.addEventListener("online", retry);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", retry);
    };
  }, [onRetry]);

  // Nothing is read from storage on the server or while hydrating.
  const stored = version < 0 ? null : getOfflineList(path);
  if (!stored) return null;
  // A rename / status change made offline on the home page shows here too.
  const list = withFolderChange(stored, getFolderChanges()[path.replace(/^\/folders\//, "")]);

  const items = itemsWithPending(list);
  const totals = computeTotals(items);
  const waiting = pendingCount(list);
  const groups = [...new Set(items.flatMap((i) => (i.group ? [i.group] : [])))].sort((a, b) => a.localeCompare(b));

  /** Shows the error of a failed change; true when it worked (so a form can reset). */
  function show(result: Result<unknown>): boolean {
    setError(result.ok ? "" : result.error);
    return result.ok;
  }

  async function addItem(values: ItemFormValues) {
    const ok = show(addOfflineItem(path, itemFields(values)));
    if (ok) setPrefill(null);
    return ok;
  }
  const addFromSaved = async (saved: SavedItemDTO, group: string | null) =>
    show(addOfflineItem(path, itemFields({ ...saved, group })));
  const renameGroup = async (from: string | null, to: string | null) => show(renameOfflineGroup(path, from, to));
  const saveItem = async (item: ItemDTO, values: ItemFormValues) => show(editOfflineItem(path, item.id, itemFields(values)));

  function deleteItem(item: ItemDTO) {
    if (!confirm(`Delete "${item.name}"?`)) return;
    setError("");
    deleteOfflineItem(path, item.id);
  }

  // Same rules as the live list: ticking a "not found" item marks it found (done), not undone.
  const toggleItem = (item: ItemDTO) => setOfflineTick(path, item.id, { done: item.notFound || !item.done, notFound: false });
  const toggleNotFound = (item: ItemDTO) =>
    setOfflineTick(path, item.id, { done: !item.notFound, notFound: !item.notFound });

  return (
    <div>
      {onBack && (
        <button onClick={onBack} className="link group mb-2 text-sm">
          <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-1" aria-hidden />
          All lists
        </button>
      )}
      <div className="card mb-6 flex animate-fade-up flex-col gap-3 border-primary/40 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {list.created ? (
            <CloudUpload className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          ) : (
            <WifiOff className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          )}
          <p className="text-sm text-muted">
            {list.created ? (
              <>
                <span className="text-fg">Not saved yet.</span> It will be saved to your account as soon as you&apos;re
                online.
              </>
            ) : (
              <>
                <span className="text-fg">You&apos;re offline.</span> Showing the copy saved {savedAtLabel(list.savedAt)}.{" "}
                {list.toggleBase
                  ? "Changes are kept on this device and sent when you're back online."
                  : "Ticks are kept on this device only."}
              </>
            )}
            {waiting > 0 && (list.toggleBase !== null || list.created) && (
              <span className="text-primary"> {waiting} not sent yet.</span>
            )}
          </p>
        </div>
        {onRetry && (
          <button onClick={onRetry} className="btn-ghost shrink-0 text-sm">
            <RefreshCw className="icon-nudge" aria-hidden />
            Try again
          </button>
        )}
      </div>
      <ErrorText message={list.syncError ?? ""} className="mb-4" />

      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold wrap-break-word text-primary">{list.name}</h1>
        <StatusBadge status={list.status} />
      </div>
      <div className="mt-2 mb-6">
        <ProgressBar done={items.filter((i) => i.done).length} total={items.length} />
      </div>

      {list.canEdit && (
        <>
          <div className="card mb-3">
            <ItemForm key={prefill?.key ?? "new"} initial={prefill?.item} submitLabel="" groups={groups} onSubmit={addItem} />
          </div>
          {showPicker ? (
            <SavedItemPicker
              groups={groups}
              onAdd={addFromSaved}
              onEditAndAdd={(item) => {
                setPrefill({ key: Date.now(), item });
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              onClose={() => setShowPicker(false)}
            />
          ) : (
            <button onClick={() => setShowPicker(true)} className="btn-secondary mb-6 text-sm">
              <BookmarkPlus className="icon-nudge" aria-hidden />
              Add from saved
            </button>
          )}
        </>
      )}
      <ErrorText message={error} className="mb-4" />

      {items.length === 0 ? (
        <div className="card flex animate-fade-up flex-col items-center gap-3 py-10 text-center text-muted">
          <ShoppingBasket className="size-10 animate-float text-primary/70" aria-hidden />
          <p>No items yet.{list.canEdit && " Add your first one above."}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groupItems(items).map(([key, sectionItems]) => (
            <GroupSection
              key={key || "__ungrouped"}
              name={key || null}
              done={sectionItems.filter((i) => i.done).length}
              total={sectionItems.length}
              canEdit={list.canEdit}
              groups={groups}
              onRename={(to) => renameGroup(key || null, to)}
            >
              {sectionItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  groups={groups}
                  canCheck
                  canEdit={list.canEdit}
                  onToggle={() => toggleItem(item)}
                  onToggleNotFound={() => toggleNotFound(item)}
                  onSave={(values) => saveItem(item, values)}
                  onDelete={() => deleteItem(item)}
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
