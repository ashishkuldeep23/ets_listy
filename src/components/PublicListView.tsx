"use client";

// Read-only view of a shared list for visitors who are not logged in
// (/share/<token>). Shows the items, groups and totals. If the owner allowed
// ticking on the link, guests can tick too (the owner sees it live, "by
// Guest"); editing needs an account, so it offers Log in / Sign up.
// Guests can't join the private Pusher channel, so the list re-checks the
// server every few seconds while the tab is visible.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CircleDashed, Eye, IndianRupee, LogIn, ShoppingBasket, Unlink, UserPlus } from "lucide-react";
import ErrorText from "@/components/ErrorText";
import GroupSection from "@/components/GroupSection";
import ItemRow from "@/components/ItemRow";
import Loading from "@/components/Loading";
import ProgressBar from "@/components/ProgressBar";
import SaveOfflineButton from "@/components/SaveOfflineButton";
import StatusBadge from "@/components/StatusBadge";
import { ApiError, apiFetch } from "@/lib/apiClient";
import { formatRupees } from "@/lib/format";
import { computeTotals, groupItems } from "@/lib/totals";
import type { ItemDTO, PublicShareResponse } from "@/types";

const noop = () => {};
const cannotRename = async () => false;
const REFRESH_MS = 15_000;

export default function PublicListView({ token }: { token: string }) {
  const [data, setData] = useState<PublicShareResponse | null>(null);
  const [error, setError] = useState("");
  const [toggleError, setToggleError] = useState("");
  // Items with a tick request in flight: a refresh mustn't undo them mid-way.
  const [pending, setPending] = useState<string[]>([]);
  const base = `/api/share/${encodeURIComponent(token)}`;

  const load = useCallback(
    () =>
      apiFetch<PublicShareResponse>(base).then((fresh) =>
        setData((prev) => {
          if (!prev) return fresh;
          // Keep my own in-flight ticks; take everything else from the server.
          const mine = new Map(prev.items.map((i) => [i.id, i]));
          return { ...fresh, items: fresh.items.map((i) => (pending.includes(i.id) ? (mine.get(i.id) ?? i) : i)) };
        })
      ),
    [base, pending]
  );

  useEffect(() => {
    let cancelled = false;
    apiFetch<PublicShareResponse>(base)
      .then((d) => !cancelled && setData(d))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : "Something went wrong"));
    return () => {
      cancelled = true;
    };
  }, [base]);

  // Pick up changes the owner (or others) made, while this tab is on screen.
  useEffect(() => {
    if (!data) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      load().catch((err: unknown) => {
        // Link turned off / reset meanwhile: show why instead of stale items.
        if (err instanceof ApiError && err.status === 404) setError(err.message);
      });
    };
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [data, load]);

  // After offline ticks were sent: show the server's state right away.
  const refreshNow = useCallback(() => void load().catch(() => {}), [load]);

  // Optimistic tick; undone if the server says no.
  async function toggle(item: ItemDTO) {
    if (pending.includes(item.id)) return;
    const done = !item.done;
    const put = (next: ItemDTO) =>
      setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === next.id ? next : i)) } : d));
    setToggleError("");
    setPending((p) => [...p, item.id]);
    put({ ...item, done });
    try {
      put(
        await apiFetch<ItemDTO>(`${base}/items/${encodeURIComponent(item.id)}/toggle`, {
          method: "POST",
          body: JSON.stringify({ done }),
        })
      );
    } catch (err) {
      put(item);
      setToggleError(err instanceof Error ? err.message : "Something went wrong");
      if (err instanceof ApiError && err.status === 403) setData((d) => (d ? { ...d, canCheck: false } : d));
      if (err instanceof ApiError && err.status === 404) void load().catch(() => {});
    } finally {
      setPending((p) => p.filter((id) => id !== item.id));
    }
  }

  if (error) {
    return (
      <div className="card animate-fade-up">
        <h1 className="mb-2 flex items-center gap-2 text-xl font-semibold">
          <Unlink className="size-5 animate-pop text-danger" aria-hidden />
          Can&apos;t open this link
        </h1>
        <ErrorText message={error} />
      </div>
    );
  }
  if (!data) return <Loading label="Opening shared list…" />;

  const next = encodeURIComponent(`/share/${token}`);
  const { list, items, canCheck } = data;
  const totals = computeTotals(items);

  return (
    <div>
      {/* Phones: message on top, buttons full width below. sm+: one row. */}
      <div className="card mb-6 flex animate-fade-up flex-col gap-3 border-accent/40 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Eye className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
          <p className="text-sm text-muted">
            {canCheck ? (
              <>
                You can <span className="text-fg">tick items</span> without logging in. Log in to edit items or save them.
              </>
            ) : (
              <>
                You&apos;re viewing this list <span className="text-fg">read-only</span>. Log in to tick or edit items.
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href={`/login?next=${next}`} className="btn-primary flex-1 text-sm sm:flex-none">
            <LogIn className="icon-nudge" aria-hidden />
            Log in
          </Link>
          <Link href={`/signup?next=${next}`} className="btn-ghost flex-1 text-sm sm:flex-none">
            <UserPlus className="icon-nudge" aria-hidden />
            Sign up
          </Link>
        </div>
      </div>

      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold wrap-break-word text-primary">{list.name}</h1>
        <StatusBadge status={list.status} />
        <div className="ml-auto">
          <SaveOfflineButton
            path={`/share/${token}`}
            name={list.name}
            status={list.status}
            items={items}
            toggleBase={canCheck ? `${base}/items` : null}
            onSynced={refreshNow}
          />
        </div>
      </div>
      <div className="mt-2 mb-6">
        <ProgressBar done={items.filter((i) => i.done).length} total={items.length} />
      </div>
      <ErrorText message={toggleError} className="mb-4" />

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
              onRename={cannotRename}
            >
              {sectionItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  groups={[]}
                  canCheck={canCheck && !pending.includes(item.id)}
                  canEdit={false}
                  onToggle={() => void toggle(item)}
                  onSave={cannotRename}
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
