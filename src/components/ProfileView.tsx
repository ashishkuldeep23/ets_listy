"use client";

// Profile page body: my avatar, name and email (name editable in a
// dialog, email read-only), the lists shared with me, and my saved items
// library (search, add, edit, delete). Saved items are private to me.

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bookmark, BookmarkX, ChevronRight, Lock, Mail, Pencil, Search, Tag, Trash2, Users, X } from "lucide-react";
import Avatar from "@/components/Avatar";
import ErrorText from "@/components/ErrorText";
import ItemForm, { type ItemFormValues } from "@/components/ItemForm";
import Loading from "@/components/Loading";
import ProgressBar from "@/components/ProgressBar";
import StatusBadge from "@/components/StatusBadge";
import { useSavedItems } from "@/hooks/useSavedItems";
import { apiFetch } from "@/lib/apiClient";
import { ME_UPDATED_EVENT } from "@/lib/constants";
import { formatPriceLine } from "@/lib/format";
import { LIMITS } from "@/lib/limits";
import { lineTotal } from "@/lib/totals";
import type { FolderListResponse, FolderSummaryDTO, SavedItemDTO, SessionUser } from "@/types";

/** Saved items have no group, so send only their own fields. */
function toSavedBody({ name, category, price, priceUnit, quantity, description }: ItemFormValues) {
  return JSON.stringify({ name, category, price, priceUnit, quantity, description });
}

export default function ProfileView() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [editing, setEditing] = useState(false);
  // null = loading; an error shows in the section instead.
  const [shared, setShared] = useState<FolderSummaryDTO[] | null>(null);
  const [sharedError, setSharedError] = useState("");
  const [query, setQuery] = useState("");
  const [actionError, setActionError] = useState("");
  const { savedItems, loading, error, reload } = useSavedItems(query);

  useEffect(() => {
    apiFetch<SessionUser>("/api/auth/me")
      .then(setUser)
      .catch(() => {});
    apiFetch<FolderListResponse>("/api/folders?scope=shared")
      .then((data) => setShared(data.folders))
      .catch((err: unknown) => {
        setShared([]);
        setSharedError(err instanceof Error ? err.message : "Could not load shared lists");
      });
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
      <section className="card flex animate-fade-up flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:text-left">
        <Avatar name={user?.name ?? "?"} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold wrap-break-word text-primary">{user?.name ?? "Your profile"}</h1>
          {user && (
            <p className="flex items-center justify-center gap-1.5 text-muted sm:justify-start">
              <Mail className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 break-all">{user.email}</span>
            </p>
          )}
        </div>
        {user && (
          <button onClick={() => setEditing(true)} className="btn-secondary text-sm">
            <Pencil className="icon-nudge" aria-hidden />
            Edit profile
          </button>
        )}
      </section>

      {user && editing && (
        <EditProfileDialog
          user={user}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setUser(updated);
            setEditing(false);
            // Tell the header (it keeps its own copy of me).
            window.dispatchEvent(new CustomEvent(ME_UPDATED_EVENT, { detail: updated }));
          }}
        />
      )}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Users className="size-5 text-accent" aria-hidden />
            Shared lists
          </h2>
          <p className="text-sm text-muted">Lists other people shared with you. Tap one to open it.</p>
        </div>
        <ErrorText message={sharedError} />
        {shared === null ? (
          <Loading />
        ) : shared.length === 0 ? (
          !sharedError && (
            <div className="card flex animate-fade-up flex-col items-center gap-3 py-8 text-center text-muted">
              <Users className="size-8 animate-float text-accent/70" aria-hidden />
              <p>No lists are shared with you yet.</p>
            </div>
          )
        ) : (
          <ul className="flex flex-col gap-2">
            {shared.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/folders/${f.id}`}
                  className="card group flex animate-fade-up items-center gap-3 py-3 transition-colors hover:border-accent/60 hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium wrap-break-word">{f.name}</span>
                      <StatusBadge status={f.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Shared by <span className="text-accent">{f.sharedBy?.name ?? "someone"}</span>
                      {!f.canCheck && " · view only"}
                      {f.canCheck && !f.canEdit && " · you can tick items"}
                      {f.canEdit && " · you can edit items"}
                    </p>
                    <div className="mt-2">
                      <ProgressBar done={f.doneCount} total={f.itemCount} size="sm" />
                    </div>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-1" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
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

/** "Edit profile" dialog: the name can change; the email is shown but locked. */
function EditProfileDialog({
  user,
  onClose,
  onSaved,
}: {
  user: SessionUser;
  onClose: () => void;
  onSaved: (user: SessionUser) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // A real modal: focus stays inside, Esc closes, the page behind is inert.
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Please enter your name");
    if (trimmed === user.name) return ref.current?.close();
    setSaving(true);
    setError("");
    try {
      onSaved(await apiFetch<SessionUser>("/api/auth/me", { method: "PATCH", body: JSON.stringify({ name: trimmed }) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // A click on the dimmed backdrop (the dialog itself, outside the form) closes it.
      onClick={(e) => e.target === ref.current && ref.current.close()}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-fg backdrop:bg-bg/80"
      aria-labelledby="edit-profile-title"
    >
      <form onSubmit={save} className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h2 id="edit-profile-title" className="text-lg font-semibold">
            Edit profile
          </h2>
          <button type="button" onClick={() => ref.current?.close()} className="btn-ghost px-2 py-1" title="Close">
            <X className="icon-nudge" aria-hidden />
            <span className="sr-only">Close</span>
          </button>
        </div>

        {/* Live preview of the new initial. */}
        <div className="flex justify-center">
          <Avatar name={name.trim() || user.name} size="lg" />
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={LIMITS.USER_NAME_MAX}
            required
            autoFocus
            autoComplete="name"
            className="input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-1">
            Email
            <Lock className="size-3.5 text-muted" aria-hidden />
          </span>
          <input value={user.email} readOnly disabled className="input cursor-not-allowed opacity-70" />
          <span className="text-xs text-muted">Your email is your login, so it can&apos;t be changed.</span>
        </label>

        <ErrorText message={error} />

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => ref.current?.close()} className="btn-ghost text-sm">
            Cancel
          </button>
          <button className="btn-primary text-sm" disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
