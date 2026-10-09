"use client";

// Read-only view of a shared list for visitors who are not logged in
// (/share/<token>). Shows the items, groups and totals; ticking or editing
// needs an account, so it offers Log in / Sign up that come back here.

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleDashed, Eye, IndianRupee, LogIn, ShoppingBasket, Unlink, UserPlus } from "lucide-react";
import ErrorText from "@/components/ErrorText";
import GroupSection from "@/components/GroupSection";
import ItemRow from "@/components/ItemRow";
import Loading from "@/components/Loading";
import ProgressBar from "@/components/ProgressBar";
import StatusBadge from "@/components/StatusBadge";
import { apiFetch } from "@/lib/apiClient";
import { formatRupees } from "@/lib/format";
import { computeTotals, groupItems } from "@/lib/totals";
import type { PublicShareResponse } from "@/types";

const noop = () => {};
const cannotRename = async () => false;

export default function PublicListView({ token }: { token: string }) {
  const [data, setData] = useState<PublicShareResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch<PublicShareResponse>(`/api/share/${encodeURIComponent(token)}`)
      .then((d) => !cancelled && setData(d))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : "Something went wrong"));
    return () => {
      cancelled = true;
    };
  }, [token]);

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
  const { list, items } = data;
  const totals = computeTotals(items);

  return (
    <div>
      <div className="card mb-6 flex animate-fade-up flex-wrap items-center gap-3 border-accent/40">
        <Eye className="size-5 shrink-0 text-accent" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-muted">
          You&apos;re viewing this list <span className="text-fg">read-only</span>. Log in to tick or edit items.
        </p>
        <div className="flex gap-2">
          <Link href={`/login?next=${next}`} className="btn-primary text-sm">
            <LogIn className="icon-nudge" aria-hidden />
            Log in
          </Link>
          <Link href={`/signup?next=${next}`} className="btn-ghost text-sm">
            <UserPlus className="icon-nudge" aria-hidden />
            Sign up
          </Link>
        </div>
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
              onRename={cannotRename}
            >
              {sectionItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  groups={[]}
                  canCheck={false}
                  canEdit={false}
                  onToggle={noop}
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
