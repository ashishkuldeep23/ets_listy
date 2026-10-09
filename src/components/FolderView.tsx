"use client";

// Folder page body: the folder header, progress, its items grouped into
// sections (add, edit, tick, delete, rename a group), price totals, and
// "Add from saved" to reuse items from my profile.
// Loads the folder by the id in the URL; the API answers 404 for folders
// that don't exist or that I can't access, shown as "not found". What I may
// do (tick / edit / manage) comes from the API, not guessed here.
// Live: listens on the folder's Pusher channel, so changes made by anyone
// else show up without a refresh. The server is still the source of truth.

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  BookmarkPlus,
  CircleDashed,
  CloudOff,
  IndianRupee,
  Info,
  LogOut,
  SearchX,
  Share2,
  ShoppingBasket,
  Users,
} from "lucide-react";
import ErrorText from "@/components/ErrorText";
import GroupSection from "@/components/GroupSection";
import Loading from "@/components/Loading";
import ItemForm, { type ItemFormValues } from "@/components/ItemForm";
import ItemRow from "@/components/ItemRow";
import ProgressBar from "@/components/ProgressBar";
import SavedItemPicker from "@/components/SavedItemPicker";
import SharePanel from "@/components/SharePanel";
import StatusBadge from "@/components/StatusBadge";
import { useChannel } from "@/hooks/useChannel";
import { ApiError, apiFetch } from "@/lib/apiClient";
import { EVENTS, folderChannel } from "@/lib/channels";
import { formatRupees } from "@/lib/format";
import { computeTotals, groupItems } from "@/lib/totals";
import type { FolderDTO, FolderDetailDTO, ItemDTO, ItemListResponse, SavedItemDTO, SessionUser } from "@/types";

type LoadState = "loading" | "ready" | "notFound" | "error";

/** Adds a group name to a sorted suggestion list (no duplicates). */
const withGroup = (groups: string[], group: string | null) =>
  !group || groups.includes(group) ? groups : [...groups, group].sort((a, b) => a.localeCompare(b));

/** True if `incoming` is at least as new as `current` (drops late, out-of-order events). */
const isNewer = (incoming: ItemDTO, current: ItemDTO) =>
  new Date(incoming.updatedAt).getTime() >= new Date(current.updatedAt).getTime();

export default function FolderView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [folder, setFolder] = useState<FolderDetailDTO | null>(null);
  const [items, setItems] = useState<ItemDTO[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [showShare, setShowShare] = useState(false);
  // A saved item loaded into the add form by "Edit & add". `key` remounts the form with it.
  const [prefill, setPrefill] = useState<{ key: number; item: SavedItemDTO } | null>(null);
  // Banner for things other people did (folder deleted, access removed).
  const [notice, setNotice] = useState("");

  const loadAll = useCallback(() => {
    const base = `/api/folders/${encodeURIComponent(id)}`;
    return Promise.all([apiFetch<FolderDetailDTO>(base), apiFetch<ItemListResponse>(`${base}/items`)]);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    loadAll()
      .then(([f, list]) => {
        if (cancelled) return;
        setFolder(f);
        setItems(list.items);
        setGroups(list.groups);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (!cancelled) setState(err instanceof ApiError && err.status === 404 ? "notFound" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  // Shows a message, then goes home (used when the folder is gone for me).
  const leaveWithNotice = useCallback(
    (message: string) => {
      setNotice(message);
      setTimeout(() => router.replace("/"), 2000);
    },
    [router]
  );

  // Reload everything: after a reconnect (events may have been missed) or
  // when my access may have changed. A 404 means my access is gone.
  const refetch = useCallback(() => {
    loadAll()
      .then(([f, list]) => {
        setFolder(f);
        setItems(list.items);
        setGroups(list.groups);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) leaveWithNotice("You no longer have access to this list.");
      });
  }, [loadAll, leaveWithNotice]);

  // Events carry the same DTOs the API returns (server → us: a trust boundary, hence the casts).
  useChannel(
    state === "ready" ? folderChannel(id) : null,
    {
      [EVENTS.itemCreated]: (data) => {
        const { item } = data as { item: ItemDTO };
        setItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]));
        setGroups((prev) => withGroup(prev, item.group));
      },
      [EVENTS.itemUpdated]: (data) => {
        const { item } = data as { item: ItemDTO };
        setItems((prev) => prev.map((i) => (i.id === item.id && isNewer(item, i) ? item : i)));
        setGroups((prev) => withGroup(prev, item.group));
      },
      [EVENTS.itemDeleted]: (data) => {
        const { itemId } = data as { itemId: string };
        setItems((prev) => prev.filter((i) => i.id !== itemId));
      },
      [EVENTS.groupRenamed]: (data) => {
        const { from, to } = data as { from: string; to: string | null };
        setItems((prev) => prev.map((i) => (i.group === from ? { ...i, group: to } : i)));
        setGroups((prev) => withGroup(prev.filter((g) => g !== from), to));
      },
      [EVENTS.folderUpdated]: (data) => {
        const { folder: f } = data as { folder: FolderDTO };
        // Keep my permissions; only the folder's own fields changed.
        setFolder((prev) => (prev ? { ...prev, name: f.name, status: f.status, updatedAt: f.updatedAt } : prev));
      },
      [EVENTS.folderDeleted]: () => leaveWithNotice("This list was deleted by its owner."),
      // Someone's permissions changed or they were removed: re-check mine.
      [EVENTS.accessChanged]: () => refetch(),
    },
    refetch
  );

  if (notice) {
    return (
      <div className="card animate-fade-up border-primary/40">
        <p className="mb-3 flex items-center gap-2 text-primary">
          <Info className="size-5 shrink-0 animate-pop" aria-hidden />
          {notice}
        </p>
        <Link href="/" className="link">
          <ArrowLeft className="icon-nudge" aria-hidden />
          Back to lists
        </Link>
      </div>
    );
  }

  if (state === "loading") return <Loading />;

  if (state !== "ready" || !folder) {
    return (
      <div className="card animate-fade-up">
        <h1 className="mb-2 flex items-center gap-2 text-xl font-semibold">
          {state === "notFound" ? (
            <SearchX className="size-6 animate-pop text-muted" aria-hidden />
          ) : (
            <CloudOff className="size-6 animate-pop text-danger" aria-hidden />
          )}
          {state === "notFound" ? "List not found" : "Could not load this list"}
        </h1>
        <p className="mb-4 text-muted">
          {state === "notFound"
            ? "It may have been deleted, or you don't have access to it."
            : "Please check your connection and try again."}
        </p>
        <Link href="/" className="link">
          <ArrowLeft className="icon-nudge" aria-hidden />
          Back to lists
        </Link>
      </div>
    );
  }

  const itemsUrl = `/api/folders/${folder.id}/items`;
  const replaceItem = (updated: ItemDTO) => setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));

  // Keeps group suggestions in sync after an add / edit / rename.
  const rememberGroup = (group: string | null) => setGroups((prev) => withGroup(prev, group));

  // Runs a request and shows its error message; returns true on success.
  async function run(fn: () => Promise<void>): Promise<boolean> {
    setError("");
    try {
      await fn();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    }
  }

  const addItem = (values: ItemFormValues) =>
    run(async () => {
      const item = await apiFetch<ItemDTO>(itemsUrl, { method: "POST", body: JSON.stringify(values) });
      setItems((prev) => [...prev, item]);
      rememberGroup(item.group);
      setPrefill(null);
    });

  // "Add" in the saved-items panel: copy the saved item into this folder as-is.
  const addFromSaved = (saved: SavedItemDTO, group: string | null) =>
    addItem({ name: saved.name, category: saved.category, price: saved.price, description: saved.description, group });

  const saveItem = (item: ItemDTO, values: ItemFormValues) =>
    run(async () => {
      const updated = await apiFetch<ItemDTO>(`${itemsUrl}/${item.id}`, { method: "PATCH", body: JSON.stringify(values) });
      replaceItem(updated);
      rememberGroup(updated.group);
    });

  // Renames a group on the server, then mirrors it locally (no refetch needed).
  const renameGroup = (from: string, to: string | null) =>
    run(async () => {
      await apiFetch(`/api/folders/${folder.id}/groups/rename`, { method: "POST", body: JSON.stringify({ from, to }) });
      setItems((prev) => prev.map((i) => (i.group === from ? { ...i, group: to } : i)));
      setGroups((prev) => prev.filter((g) => g !== from));
      rememberGroup(to);
    });

  // Optimistic: flip the tick at once, then undo it if the server says no.
  async function toggleItem(item: ItemDTO) {
    const done = !item.done;
    replaceItem({ ...item, done });
    const ok = await run(async () => {
      replaceItem(
        await apiFetch<ItemDTO>(`${itemsUrl}/${item.id}/toggle`, { method: "POST", body: JSON.stringify({ done }) })
      );
    });
    if (!ok) replaceItem(item);
  }

  async function deleteItem(item: ItemDTO) {
    if (!confirm(`Delete "${item.name}"?`)) return;
    await run(async () => {
      await apiFetch(`${itemsUrl}/${item.id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    });
  }

  // A shared user removes their own access ("Leave list").
  async function leaveFolder() {
    if (!confirm(`Leave "${folder?.name}"? It will disappear from your "Shared with me".`)) return;
    const ok = await run(async () => {
      const me = await apiFetch<SessionUser>("/api/auth/me");
      await apiFetch(`/api/folders/${id}/shares/${me.id}`, { method: "DELETE" });
    });
    if (ok) router.replace("/?tab=shared");
  }

  const doneCount = items.filter((i) => i.done).length;
  const totals = computeTotals(items);
  const sections = groupItems(items);

  return (
    <div>
      <Link href="/" className="link group text-sm">
        <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-1" aria-hidden />
        All lists
      </Link>
      <div className="mt-2 mb-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold wrap-break-word text-primary">{folder.name}</h1>
        <StatusBadge status={folder.status} />
        {folder.canManage && !showShare && (
          <button onClick={() => setShowShare(true)} className="btn-secondary ml-auto text-sm" title="Share">
            <Share2 className="icon-nudge" aria-hidden />
            <span className="sr-only">Share</span>
          </button>
        )}
      </div>
      {folder.role === "shared" && (
        <div className="mb-2 flex flex-wrap items-center gap-3 text-sm text-muted">
          <span className="flex items-center gap-1">
            <Users className="size-4" aria-hidden />
            Shared by <span className="text-accent">{folder.sharedBy?.name ?? "someone"}</span>
            {!folder.canCheck && " · view only"}
            {folder.canCheck && !folder.canEdit && " · you can tick items"}
            {folder.canEdit && " · you can edit items"}
          </span>
          <button onClick={leaveFolder} className="link-danger ml-auto" title="Leave list">
            <LogOut className="icon-nudge" aria-hidden />
            <span className="sr-only">Leave list</span>
          </button>
        </div>
      )}
      <div className="mt-2 mb-6">
        <ProgressBar done={doneCount} total={items.length} />
      </div>

      {showShare && <SharePanel folderId={folder.id} onClose={() => setShowShare(false)} />}

      {folder.canEdit && (
        <>
          <div className="card mb-3">
            <ItemForm
              key={prefill?.key ?? "new"}
              initial={prefill?.item}
              submitLabel="Add"
              groups={groups}
              showSaveToProfile
              onSubmit={addItem}
            />
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
          <p>No items yet.{folder.canEdit && " Add your first one above."}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map(([key, sectionItems]) => (
            <GroupSection
              key={key || "__ungrouped"}
              name={key || null}
              done={sectionItems.filter((i) => i.done).length}
              total={sectionItems.length}
              canEdit={folder.canEdit}
              onRename={(to) => renameGroup(key, to)}
            >
              {sectionItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  groups={groups}
                  canCheck={folder.canCheck}
                  canEdit={folder.canEdit}
                  onToggle={() => toggleItem(item)}
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
            {totals.unpriced > 0 && (
              <p className="w-full text-xs text-muted">
                {totals.unpriced} {totals.unpriced === 1 ? "item has" : "items have"} no price and {totals.unpriced === 1 ? "is" : "are"} not counted.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
