"use client";

// Profile page body: my name/email and my saved items library
// (search, add, edit, delete). Saved items are private to me.

import Link from "next/link";
import { useEffect, useState } from "react";
import ItemForm, { type ItemFormValues } from "@/components/ItemForm";
import { useSavedItems } from "@/hooks/useSavedItems";
import { apiFetch } from "@/lib/apiClient";
import { formatRupees } from "@/lib/format";
import type { FolderListResponse, SavedItemDTO, SessionUser } from "@/types";

/** Saved items have no group, so send only their own fields. */
function toSavedBody({ name, category, price, description }: ItemFormValues) {
  return JSON.stringify({ name, category, price, description });
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
      <section className="card">
        <h1 className="text-2xl font-semibold text-primary">{user?.name ?? "Your profile"}</h1>
        {user && <p className="text-muted">{user.email}</p>}
        {sharedCount !== null && (
          <Link href="/?tab=shared" className="link mt-2 inline-block text-sm">
            {sharedCount} {sharedCount === 1 ? "folder" : "folders"} shared with you →
          </Link>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-xl font-semibold">Saved items</h2>
          <p className="text-sm text-muted">Reuse these in any folder with &ldquo;Add from saved&rdquo;. Only you can see them.</p>
        </div>

        <div className="card">
          <ItemForm submitLabel="Save" showGroup={false} onSubmit={create} />
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search saved items…"
          aria-label="Search saved items"
          className="input"
        />

        {(error || actionError) && <p className="text-sm text-danger">{actionError || error}</p>}
        {loading && <p className="text-muted">Loading…</p>}
        {!loading && savedItems.length === 0 && (
          <p className="card text-muted">{query.trim() ? "No saved items match." : "No saved items yet."}</p>
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
    <li className="card flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="wrap-break-word">{item.name}</span>
          {item.category && (
            <span className="rounded-full border border-accent/40 px-2 py-0.5 text-xs text-accent">{item.category}</span>
          )}
          {item.price !== null && <span className="text-sm font-medium text-primary">{formatRupees(item.price)}</span>}
        </div>
        {item.description && <p className="mt-1 text-sm wrap-break-word text-muted">{item.description}</p>}
      </div>
      <div className="flex shrink-0 gap-3 text-sm">
        <button onClick={() => setEditing(true)} className="link">
          Edit
        </button>
        <button onClick={onDelete} className="text-danger hover:underline">
          Delete
        </button>
      </div>
    </li>
  );
}
