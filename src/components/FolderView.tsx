"use client";

// Folder page body: the folder header, progress, its items grouped into
// sections (add, edit, tick, delete, rename a group), price totals, and
// "Add from saved" to reuse items from my profile. Anyone who can see the
// list (even view-only) can bookmark an item into their own saved items.
// Loads the folder by the id in the URL; the API answers 404 for folders
// that don't exist or that I can't access, shown as "not found". What I may
// do (tick / edit / manage) comes from the API, not guessed here.
// Live: listens on the folder's Pusher channel, so changes made by anyone
// else show up without a refresh. The server is still the source of truth.
// Offline: if the list was saved with "Save offline", shows that copy
// (OfflineListView); SaveOfflineButton sends its ticks once back online.

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import ListChat from "@/components/ListChat";
import ViewersButton from "@/components/ViewersButton";
import OfflineListView from "@/components/OfflineListView";
import ProgressBar from "@/components/ProgressBar";
import SaveOfflineButton from "@/components/SaveOfflineButton";
import SavedItemPicker from "@/components/SavedItemPicker";
import SharePanel from "@/components/SharePanel";
import StatusBadge from "@/components/StatusBadge";
import { useChannel } from "@/hooks/useChannel";
import { useOnline } from "@/hooks/useOnline";
import { usePresence } from "@/hooks/usePresence";
import { useSavedItems } from "@/hooks/useSavedItems";
import { ApiError, apiFetch } from "@/lib/apiClient";
import { EVENTS, folderChannel } from "@/lib/channels";
import { formatRupees } from "@/lib/format";
import { getOfflineList } from "@/lib/offlineLists";
import { computeTotals, groupItems } from "@/lib/totals";
import type { FolderDTO, FolderDetailDTO, ItemDTO, ItemListResponse, SavedItemDTO, SessionUser } from "@/types";

// "offline": the load failed for lack of network and there is a saved copy to show.
type LoadState = "loading" | "ready" | "notFound" | "error" | "offline";

/** Same identity as the server uses for saved items: name + category, any case. */
const savedKey = (name: string, category: string | null) =>
  JSON.stringify([name.trim().toLowerCase(), (category ?? "").trim().toLowerCase()]);

/** True if `incoming` is at least as new as `current` (drops late, out-of-order events). */
const isNewer = (incoming: ItemDTO, current: ItemDTO) =>
  new Date(incoming.updatedAt).getTime() >= new Date(current.updatedAt).getTime();

export default function FolderView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const online = useOnline();
  const path = `/folders/${id}`;
  // Bumped to load again while the offline copy is showing.
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const [folder, setFolder] = useState<FolderDetailDTO | null>(null);
  const [items, setItems] = useState<ItemDTO[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  // Who has this list open (viewers pill + chat); starts once the list loaded.
  const presence = usePresence(`/api/folders/${id}`, false, state === "ready");
  const [error, setError] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [showShare, setShowShare] = useState(false);
  // A saved item loaded into the add form by "Edit & add". `key` remounts the form with it.
  const [prefill, setPrefill] = useState<{ key: number; item: SavedItemDTO } | null>(null);
  // Banner for things other people did (folder deleted, access removed).
  const [notice, setNotice] = useState("");
  // My saved items, only to show which items here are already bookmarked.
  const { savedItems, reload: reloadSaved } = useSavedItems("");
  const savedKeys = useMemo(() => new Set(savedItems.map((s) => savedKey(s.name, s.category))), [savedItems]);

  const loadAll = useCallback(() => {
    const base = `/api/folders/${encodeURIComponent(id)}`;
    return Promise.all([apiFetch<FolderDetailDTO>(base), apiFetch<ItemListResponse>(`${base}/items`)]);
  }, [id]);

  // Runs again when the connection comes back (or on a retry from the offline view).
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    loadAll()
      .then(([f, list]) => {
        if (cancelled) return;
        setFolder(f);
        setItems(list.items);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) setState(err.status === 404 ? "notFound" : "error");
        else setState(getOfflineList(path) ? "offline" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [loadAll, online, path, attempt]);

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
      },
      [EVENTS.itemUpdated]: (data) => {
        const { item } = data as { item: ItemDTO };
        setItems((prev) => prev.map((i) => (i.id === item.id && isNewer(item, i) ? item : i)));
      },
      [EVENTS.itemDeleted]: (data) => {
        const { itemId } = data as { itemId: string };
        setItems((prev) => prev.filter((i) => i.id !== itemId));
      },
      [EVENTS.groupRenamed]: (data) => {
        const { from, to } = data as { from: string; to: string | null };
        setItems((prev) => prev.map((i) => (i.group === from ? { ...i, group: to } : i)));
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

  if (state === "offline" || (!online && getOfflineList(path))) return <OfflineListView path={path} onRetry={retry} />;
  // Offline with no saved copy: nothing will load, say so instead of spinning.
  if (state === "loading" && online) return <Loading />;

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
  // Group suggestions come from the items themselves, so a group disappears once its last item does.
  const groups = [...new Set(items.flatMap((i) => (i.group ? [i.group] : [])))].sort((a, b) => a.localeCompare(b));
  const replaceItem = (updated: ItemDTO) => setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));


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

  // The bookmark only reflects the server; a failed reload just leaves it as it was.
  const refreshSaved = () => reloadSaved().catch(() => {});

  const addItem = (values: ItemFormValues) =>
    run(async () => {
      const item = await apiFetch<ItemDTO>(itemsUrl, { method: "POST", body: JSON.stringify(values) });
      setItems((prev) => [...prev, item]);
      setPrefill(null);
      if (values.saveToProfile) void refreshSaved();
    });

  // "Add" in the saved-items panel: copy the saved item into this folder as-is.
  const addFromSaved = (saved: SavedItemDTO, group: string | null) =>
    addItem({
      name: saved.name,
      category: saved.category,
      price: saved.price,
      priceUnit: saved.priceUnit,
      quantity: saved.quantity,
      description: saved.description,
      group,
    });

  // Bookmark on an item: copy it into MY saved items (works on lists shared with me too).
  // Group is left out: it belongs to this list.
  const saveToProfile = (item: ItemDTO) =>
    run(async () => {
      const { name, category, price, priceUnit, quantity, description } = item;
      await apiFetch("/api/saved-items", {
        method: "POST",
        body: JSON.stringify({ name, category, price, priceUnit, quantity, description }),
      });
      await refreshSaved();
    });

  const saveItem = (item: ItemDTO, values: ItemFormValues) =>
    run(async () => {
      const updated = await apiFetch<ItemDTO>(`${itemsUrl}/${item.id}`, { method: "PATCH", body: JSON.stringify(values) });
      replaceItem(updated);
    });

  // Renames a group on the server, then mirrors it locally (no refetch needed).
  const renameGroup = (from: string, typed: string | null) =>
    run(async () => {
      // Renaming onto another group in a different case merges into it (the server does the same).
      const to = typed && (groups.find((g) => g !== from && g.toLowerCase() === typed.toLowerCase()) ?? typed);
      await apiFetch(`/api/folders/${folder.id}/groups/rename`, { method: "POST", body: JSON.stringify({ from, to }) });
      setItems((prev) => prev.map((i) => (i.group === from ? { ...i, group: to } : i)));
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
    // Bottom padding keeps the last card clear of the chat button.
    <div className="pb-20">
      <Link href="/" className="link group text-sm">
        <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-1" aria-hidden />
        All lists
      </Link>
      <div className="mt-2 mb-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold wrap-break-word text-primary">{folder.name}</h1>
        <StatusBadge status={folder.status} />
        <div className="ml-auto flex gap-2">
          <ViewersButton people={presence.people} />
          <SaveOfflineButton
            path={path}
            name={folder.name}
            status={folder.status}
            items={items}
            toggleBase={folder.canCheck ? itemsUrl : null}
            onSynced={refetch}
          />
          {folder.canManage && !showShare && (
            <button onClick={() => setShowShare(true)} className="btn-secondary text-sm" title="Share">
              <Share2 className="icon-nudge" aria-hidden />
              <span className="sr-only">Share</span>
            </button>
          )}
        </div>
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
              // submitLabel="Add"
              submitLabel=""
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
              groups={groups}
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
                  onSaveToProfile={() => saveToProfile(item)}
                  saved={savedKeys.has(savedKey(item.name, item.category))}
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

      <ListChat base={`/api/folders/${folder.id}`} folderId={folder.id} presence={presence} />
    </div>
  );
}
