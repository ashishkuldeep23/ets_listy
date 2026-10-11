"use client";

// Profile page body: my name/email and my saved items library
// (search, add, edit, delete). Saved items are private to me.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Bookmark, BookmarkX, Mail, Pencil, Search, Tag, Trash2, UserRound, Users } from "lucide-react";
import ErrorText from "@/components/ErrorText";
import ItemForm, { type ItemFormValues } from "@/components/ItemForm";
import Loading from "@/components/Loading";
import { useSavedItems } from "@/hooks/useSavedItems";
import { apiFetch } from "@/lib/apiClient";
import { formatPriceLine } from "@/lib/format";
import { lineTotal } from "@/lib/totals";
import type { FolderListResponse, SavedItemDTO, SessionUser } from "@/types";

/** Saved items have no group, so send only their own fields. */
function toSavedBody({ name, category, price, priceUnit, quantity, description }: ItemFormValues) {
  return JSON.stringify({ name, category, price, priceUnit, quantity, description });
}

export default function ProfileView() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sharedCount, setSharedCount] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [actionError, setActionError] = useState("");
  const { savedItems, loading, error, reload } = useSavedItems(query);

  useEffect(() => {
    apiFetch<SessionUser>("/api/auth/me")
      .then(setUser)
      .catch(() => {});
    apiFetch<FolderListResponse>("/api/folders?scope=shared")
      .then((data) => setSharedCount(data.counts.all))
      .catch(() => {});
  }, []);

  // Runs a change, reloads the list, and shows any error; true on success.
  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    setActionError("");
    try {
      await fn();
      await reload();
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    }
  }

  const create = (values: ItemFormValues) =>
    run(() => apiFetch("/api/saved-items", { method: "POST", body: toSavedBody(values) }));
  const update = (item: SavedItemDTO, values: ItemFormValues) =>
    run(() => apiFetch(`/api/saved-items/${item.id}`, { method: "PATCH", body: toSavedBody(values) }));
  const remove = (item: SavedItemDTO) => {
    if (!confirm(`Remove "${item.name}" from your saved items?`)) return;
    void run(() => apiFetch(`/api/saved-items/${item.id}`, { method: "DELETE" }));
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex animate-fade-up items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
          <UserRound className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold wrap-break-word text-primary">{user?.name ?? "Your profile"}</h1>
          {user && (
            <p className="flex items-center gap-1.5 text-muted">
              <Mail className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 break-all">{user.email}</span>
            </p>
          )}
          {sharedCount !== null && (
            <Link href="/?tab=shared" className="link group mt-2 text-sm">
              <Users className="size-4" aria-hidden />
              {sharedCount} {sharedCount === 1 ? "list" : "lists"} shared with you
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
            </Link>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Bookmark className="size-5 text-primary" aria-hidden />
            Saved items
          </h2>
          <p className="text-sm text-muted">Reuse these in any list with &ldquo;Add from saved&rdquo;. Only you can see them.</p>
        </div>

        <div className="card">
          <ItemForm submitLabel="Save" showGroup={false} onSubmit={create} />
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search saved items…"
            aria-label="Search saved items"
            className="input w-full pl-9"
          />
        </div>

        <ErrorText message={actionError || error} />
        {loading && <Loading />}
        {!loading && savedItems.length === 0 && (
          <div className="card flex animate-fade-up flex-col items-center gap-3 py-8 text-center text-muted">
            {query.trim() ? (
              <Search className="size-8 animate-float text-accent/70" aria-hidden />
            ) : (
              <BookmarkX className="size-8 animate-float text-primary/70" aria-hidden />
            )}
            <p>{query.trim() ? "No saved items match." : "No saved items yet."}</p>
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {savedItems.map((item) => (
            <SavedItemRow key={item.id} item={item} onSave={(values) => update(item, values)} onDelete={() => remove(item)} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function SavedItemRow({
  item,
  onSave,
  onDelete,
}: {
  item: SavedItemDTO;
  onSave: (values: ItemFormValues) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="card">
        <ItemForm
          mode="edit"
          initial={item}
          showGroup={false}
          submitLabel="Save"
          onSubmit={async (values) => {
            const ok = await onSave(values);
            if (ok) setEditing(false);
            return ok;
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="card flex animate-fade-up items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="wrap-break-word">{item.name}</span>
          {item.category && (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 px-2 py-0.5 text-xs text-accent">
              <Tag className="size-3" aria-hidden />
              {item.category}
            </span>
          )}
          {formatPriceLine(item, lineTotal(item)) && (
            <span className="text-sm font-medium text-primary">{formatPriceLine(item, lineTotal(item))}</span>
          )}
        </div>
        {item.description && <p className="mt-1 text-sm wrap-break-word text-muted">{item.description}</p>}
      </div>
      <div className="flex shrink-0 gap-3 text-sm">
        <button onClick={() => setEditing(true)} className="link" title="Edit">
          <Pencil className="icon-nudge" aria-hidden />
          <span className="sr-only">Edit</span>
        </button>
        <button onClick={onDelete} className="link-danger group" title="Delete">
          <Trash2 className="size-4 group-hover:animate-wiggle" aria-hidden />
          <span className="sr-only">Delete</span>
        </button>
      </div>
    </li>
  );
}
