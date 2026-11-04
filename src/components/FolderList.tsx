"use client";

// Home page body: two tabs, "My folders" (create, rename, change status,
// delete) and "Shared with me" (folders others shared, with who shared them
// and what I may do). Tab and status filter live in the URL
// (/?tab=shared&status=pending) so refresh and the Back button keep them.
// Live: listens on my user channel, so card progress updates as anyone
// ticks items, and the shared tab refreshes when I gain or lose a folder.
// Offline: shows the cards last loaded (kept by lib/offlineHome.ts). Lists
// saved offline, and lists made offline, open right here (?list=<path>,
// OfflineListView), since their own pages may not be cached; others can't
// be opened. New lists can be made offline, and my lists renamed, given a
// status or deleted; all of it is sent when back online (lib/offlineSync.ts).
// Online too, these changes are queued the same way: they show at once and
// go out in the background, so the page never waits for the server.
// "Keep all lists offline" (on by default, lib/offlineAuto.ts) keeps a copy
// of every list, so all of them open offline.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CalendarClock,
  Check,
  CloudCheck,
  ClipboardList,
  CloudOff,
  CloudUpload,
  Eye,
  Inbox,
  LayoutList,
  ListPlus,
  PartyPopper,
  Pencil,
  SquareCheck,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import ErrorText from "@/components/ErrorText";
import Loading from "@/components/Loading";
import OfflineListView from "@/components/OfflineListView";
import { useChannel } from "@/hooks/useChannel";
import { useMe } from "@/hooks/useMe";
import { useOfflineVersion } from "@/hooks/useOfflineVersion";
import { useOnline } from "@/hooks/useOnline";
import { ApiError, apiFetch } from "@/lib/apiClient";
import { EVENTS, userChannel } from "@/lib/channels";
import { FOLDER_STATUSES, STATUS_VALUES, isFolderStatus, type FolderStatus } from "@/lib/constants";
import { isAutoSaveOn, setAutoSave } from "@/lib/offlineAuto";
import { getFolderChanges, queueFolderChange, withFolderChange } from "@/lib/offlineFolders";
import { getCachedFolders, saveCachedFolders } from "@/lib/offlineHome";
import {
  createOfflineList,
  getOfflineList,
  isNewListPath,
  itemsWithPending,
  listOfflineLists,
  removeOfflineList,
  updateOfflineListInfo,
  type OfflineList,
} from "@/lib/offlineLists";
import { whenOfflineReady } from "@/lib/offlineStore";
import { cachePageForOffline, isPageCached, OFFLINE_SYNCED_EVENT, requestSyncNow, type OfflineSyncedDetail } from "@/lib/offlineSync";
import ProgressBar from "@/components/ProgressBar";
import StatusBadge from "@/components/StatusBadge";
import type {
  FolderCounts,
  FolderDTO,
  FolderListResponse,
  FolderProgressEvent,
  FolderScope,
  FolderSummaryDTO,
} from "@/types";

type Filter = FolderStatus | "all";

const RETRY_MS = 10_000;

/** A home card: the folder, plus how it opens when the page can't reach the server. */
interface Card {
  folder: FolderSummaryDTO;
  /** Offline copy to open in place, or null (not saved offline). */
  offlinePath: string | null;
  /** Made offline, not on the server yet. */
  local: OfflineList | null;
}

/** A list made offline, shown as a card like the others. */
function localCard(list: OfflineList): Card {
  const items = itemsWithPending(list);
  return {
    folder: {
      id: list.path,
      name: list.name,
      status: list.status,
      createdAt: list.savedAt,
      updatedAt: list.savedAt,
      role: "owner",
      canCheck: true,
      canEdit: true,
      canManage: true,
      sharedBy: null,
      itemCount: items.length,
      doneCount: items.filter((i) => i.done).length,
    },
    offlinePath: list.path,
    local: list,
  };
}

/** A server folder's card; offline, its progress comes from the saved copy (which has my offline ticks). */
function serverCard(folder: FolderSummaryDTO, offline: boolean): Card {
  // Online, cards link to the list's page: no need to read its copy.
  if (!offline) return { folder, offlinePath: null, local: null };
  const path = `/folders/${folder.id}`;
  const copy = getOfflineList(path);
  const items = copy ? itemsWithPending(copy) : null;
  return {
    folder: {
      ...folder,
      ...(items && { itemCount: items.length, doneCount: items.filter((i) => i.done).length }),
    },
    offlinePath: copy && path,
    local: null,
  };
}

function countByStatus(folders: FolderSummaryDTO[]): FolderCounts {
  const counts = Object.fromEntries([...STATUS_VALUES, "all"].map((s) => [s, 0])) as FolderCounts;
  for (const f of folders) counts[f.status] += 1;
  counts.all = folders.length;
  return counts;
}

/** Changes the URL without asking the server for the page, so tabs and in-place lists work offline too. */
function pushParams(params: URLSearchParams, replace = false): void {
  const qs = params.toString();
  const url = qs ? `/?${qs}` : "/";
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
}

export default function FolderList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const online = useOnline();
  const offlineVersion = useOfflineVersion();
  // Ignore unknown values in the URL instead of showing an error.
  const rawStatus = searchParams.get("status");
  const filter: Filter = isFolderStatus(rawStatus) ? rawStatus : "all";
  const tab: FolderScope = searchParams.get("tab") === "shared" ? "shared" : "mine";
  // A list opened in place (offline copy, or a list made offline).
  const openPath = searchParams.get("list");

  // Server data for the current tab: every folder in it; the status filter is applied here.
  const [data, setData] = useState<FolderListResponse | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  // The last load failed for lack of network (the browser may still say "online").
  const [unreachable, setUnreachable] = useState(false);
  const offline = !online || unreachable;

  const fetchFolders = useCallback(() => apiFetch<FolderListResponse>(`/api/folders?scope=${tab}`), [tab]);
  const show = useCallback(
    (res: FolderListResponse) => {
      setData(res);
      setUnreachable(false);
      saveCachedFolders(tab, res.folders);
    },
    [tab]
  );

  // Load when the tab changes, and again when the connection comes back.
  // `cancelled` drops a slow response for an old tab so it can't overwrite the newer one.
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    fetchFolders()
      .then((res) => !cancelled && show(res))
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) setError(err.message);
        else setUnreachable(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchFolders, show, online]);

  // Keep the home page itself for offline use (the service worker refreshes it on later visits).
  useEffect(() => {
    if (!data) return;
    isPageCached("/")
      .then((cached) => (cached ? undefined : cachePageForOffline("/")))
      .catch((err: unknown) => console.error("Offline page cache failed", err));
  }, [data]);

  // Reload quietly (no error banner): used for live events, reconnects and syncs.
  const refresh = useCallback(() => {
    fetchFolders()
      .then(show)
      .catch(() => {});
  }, [fetchFolders, show]);

  // The browser said "online" but the server couldn't be reached: keep trying.
  useEffect(() => {
    if (!unreachable) return;
    const timer = setInterval(refresh, RETRY_MS);
    return () => clearInterval(timer);
  }, [unreachable, refresh]);

  const me = useMe();
  useChannel(
    me ? userChannel(me.id) : null,
    {
      // Event data comes from our server (trust boundary, hence the cast).
      [EVENTS.folderProgress]: (event) => {
        const p = event as FolderProgressEvent;
        if (p.deleted) return refresh(); // card gone, counts change
        // All done: the server moved it to "completed", so its badge, filter and tab counts change.
        if (p.itemCount > 0 && p.doneCount === p.itemCount) return refresh();
        setData((prev) =>
          prev && {
            ...prev,
            folders: prev.folders.map((f) =>
              f.id === p.folderId ? { ...f, itemCount: p.itemCount, doneCount: p.doneCount } : f
            ),
          }
        );
      },
      [EVENTS.folderAccess]: () => refresh(),
    },
    refresh
  );

  // Offline changes reached the server: reload the cards. A list made offline
  // that is open here now exists on the server, so follow it to its new path.
  useEffect(() => {
    const onSync = (e: Event) => {
      if (!(e instanceof CustomEvent)) return;
      const { path, from } = e.detail as OfflineSyncedDetail;
      if (from && new URLSearchParams(window.location.search).get("list") === from) {
        const params = new URLSearchParams(window.location.search);
        params.set("list", path);
        pushParams(params, true);
      }
      // A new list stops being a local card now: keep its card until the reload brings the real one.
      const created = from && tab === "mine" ? getOfflineList(path) : null;
      if (created) {
        const id = path.slice("/folders/".length);
        const { folder } = localCard(created);
        setData((prev) => prev && { ...prev, folders: [{ ...folder, id }, ...prev.folders.filter((f) => f.id !== id)] });
      }
      refresh();
    };
    window.addEventListener(OFFLINE_SYNCED_EVENT, onSync);
    return () => window.removeEventListener(OFFLINE_SYNCED_EVENT, onSync);
  }, [refresh, tab]);

  // Online, a saved list opens on its own page (live, with everything); only lists made offline stay here.
  useEffect(() => {
    if (openPath && !offline && openPath.startsWith("/folders/")) router.replace(openPath);
  }, [openPath, offline, router]);

  // Updates one URL param (null removes it), keeping the others.
  function setParam(key: "status" | "tab" | "list", value: string | null) {
    const params = new URLSearchParams(searchParams);
    if (value === null) params.delete(key);
    else params.set(key, value);
    pushParams(params);
  }
  const setFilter = (value: Filter) => setParam("status", value === "all" ? null : value);
  const setTab = (value: FolderScope) => setParam("tab", value === "mine" ? null : value);

  // Nothing is read from storage on the server or while hydrating.
  const localLists = offlineVersion < 0 ? [] : listOfflineLists().filter((l) => l.created);
  const serverFolders = offline ? (offlineVersion < 0 ? null : getCachedFolders(tab)?.folders ?? null) : (data?.folders ?? null);
  // Folder changes made offline show until they are sent.
  const folderChanges = offlineVersion < 0 ? {} : getFolderChanges();
  const cards: Card[] = [
    ...(tab === "mine" ? localLists.map(localCard) : []),
    ...(serverFolders ?? [])
      .filter((f) => !folderChanges[f.id]?.deleted)
      .map((f) => serverCard(withFolderChange(f, folderChanges[f.id]), offline)),
  ];
  const autoOn = offlineVersion >= 0 && isAutoSaveOn();
  const visible = filter === "all" ? cards : cards.filter((c) => c.folder.status === filter);
  // Counted from the cards (every folder in this tab), so queued changes count at once.
  const counts = serverFolders || localLists.length > 0 ? countByStatus(cards.map((c) => c.folder)) : null;

  /** True if another list on "My lists" has this name (any case, like the server). Only my own lists are renamed / created. */
  const nameTaken = (typed: string, exceptId?: string) =>
    cards.some((c) => c.folder.id !== exceptId && c.folder.name.trim().toLowerCase() === typed.trim().toLowerCase());

  async function createFolder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    if (nameTaken(name)) return setError(`A list named "${name.trim()}" already exists`);
    setError("");
    const typed = name;
    setName("");
    // Queued writes need the stored data to be read first.
    await whenOfflineReady();
    createOfflineList(typed);
    requestSyncNow();
  }

  // Sending a change drops it from the queue: `data` must already show it by then.
  function patchFolder(id: string, changes: Partial<Pick<FolderDTO, "name" | "status">> | null) {
    setData(
      (prev) =>
        prev && {
          ...prev,
          folders: changes
            ? prev.folders.map((f) => (f.id === id ? { ...f, ...changes } : f))
            : prev.folders.filter((f) => f.id !== id),
        }
    );
  }

  async function updateFolder({ folder, local }: Card, changes: Partial<Pick<FolderDTO, "name" | "status">>) {
    if (changes.name !== undefined) {
      if (!changes.name.trim()) return false;
      if (nameTaken(changes.name, folder.id)) {
        setError(`A list named "${changes.name.trim()}" already exists`);
        return false;
      }
      changes = { ...changes, name: changes.name.trim() };
    }
    setError("");
    if (local) {
      // Not on the server yet: the change goes along when it is created.
      updateOfflineListInfo(local.path, changes);
    } else {
      queueFolderChange(folder.id, changes);
      updateOfflineListInfo(`/folders/${folder.id}`, changes);
      patchFolder(folder.id, changes);
    }
    requestSyncNow();
    return true;
  }

  function deleteFolder({ folder, local }: Card) {
    if (local) {
      if (!confirm(`Delete "${local.name}"? It was made offline and isn't saved anywhere else.`)) return;
      removeOfflineList(local.path);
    } else {
      const warning = offline ? "It will be deleted when you're back online." : "This cannot be undone.";
      if (!confirm(`Delete "${folder.name}"? ${warning}`)) return;
      queueFolderChange(folder.id, { deleted: true });
      removeOfflineList(`/folders/${folder.id}`);
      patchFolder(folder.id, null);
      requestSyncNow();
    }
  }

  // A list opened in place: offline (any saved copy) or a list made offline that isn't synced yet.
  if (openPath && offlineVersion >= 0 && getOfflineList(openPath) && (offline || isNewListPath(openPath))) {
    return <OfflineListView path={openPath} onBack={() => setParam("list", null)} />;
  }

  const chips: { value: Filter; label: string }[] = [{ value: "all", label: "All" }, ...FOLDER_STATUSES];

  const tabs: { value: FolderScope; label: string; icon: LucideIcon }[] = [
    { value: "mine", label: "My lists", icon: LayoutList },
    { value: "shared", label: "Shared with me", icon: Users },
  ];

  const savedAt = offline && offlineVersion >= 0 ? getCachedFolders(tab)?.savedAt : undefined;

  return (
    <div>
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
        <LayoutList className="size-6 text-primary" aria-hidden />
        Your lists
      </h1>
      <div className="mb-6 flex gap-1 border-b border-border" role="tablist" aria-label="Lists">
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.value ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            <t.icon className="icon-nudge" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {offline && (
        <div className="card mb-6 flex animate-fade-up items-start gap-3 border-primary/40">
          <CloudOff className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p className="text-sm text-muted">
            <span className="text-fg">You&apos;re offline.</span>{" "}
            {savedAt
              ? `Showing your lists as of ${new Date(savedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.`
              : "Your lists haven't been loaded on this device yet."}{" "}
            Lists saved offline can be opened; new lists are saved when you&apos;re back online.
          </p>
        </div>
      )}

      {tab === "mine" && (
        <form onSubmit={createFolder} className="mb-6 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New list name (e.g. Market, Oct)"
            maxLength={60}
            className="input min-w-0 flex-1"
          />
          <button className="btn-primary w-full sm:w-auto">
            <ListPlus className="icon-nudge font-bold" aria-hidden />
            Add List
          </button>
        </form>
      )}

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {chips.map((chip) => {
          const active = filter === chip.value;
          return (
            <button
              key={chip.value}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(chip.value)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                active ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-fg"
              }`}
            >
              {chip.label}
              {counts && <span className="ml-1.5 opacity-70">{counts[chip.value] ?? 0}</span>}
            </button>
          );
        })}
        <button
          onClick={() => setAutoSave(!autoOn)}
          aria-pressed={autoOn}
          className={`ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
            autoOn ? "border-accent/50 text-accent" : "border-border text-muted hover:text-fg"
          }`}
          title={
            autoOn
              ? "Every list is kept on this device, so it opens without internet. Click to stop."
              : "Keep a copy of every list on this device, so all of them open without internet"
          }
        >
          {autoOn ? <CloudCheck className="size-4" aria-hidden /> : <CloudOff className="size-4" aria-hidden />}
          Keep all lists offline
        </button>
      </div>

      <ErrorText message={error} className="mb-4" />
      {loading && !offline && !data && !error && <Loading />}
      {(data || offline) && visible.length === 0 && (
        <div className="card flex animate-fade-up flex-col items-center gap-3 py-10 text-center text-muted">
          {tab === "mine" ? (
            <ClipboardList className="size-10 animate-float text-primary/70" aria-hidden />
          ) : (
            <Inbox className="size-10 animate-float text-accent/70" aria-hidden />
          )}
          <p>
            {filter !== "all"
              ? "No lists with this status."
              : tab === "mine"
                ? "No lists yet. Create your first one above."
                : "Nothing shared with you yet. When someone shares a list with you, it shows up here."}
          </p>
        </div>
      )}

      <ul className="grid gap-4 sm:grid-cols-2">
        {visible.map((card) => (
          <FolderCard
            key={card.folder.id}
            folder={card.folder}
            onUpdate={(changes) => updateFolder(card, changes)}
            onDelete={() => deleteFolder(card)}
            // Offline (or not on the server yet): open the saved copy here; nothing to open without one.
            open={offline || card.local ? (card.offlinePath ? () => setParam("list", card.offlinePath) : null) : undefined}
            local={card.local !== null}
            offline={offline}
            syncError={card.local?.syncError ?? null}
          />
        ))}
      </ul>
    </div>
  );
}

interface FolderCardProps {
  folder: FolderSummaryDTO;
  onUpdate: (changes: Partial<Pick<FolderDTO, "name" | "status">>) => Promise<boolean>;
  onDelete: () => void;
  /** Left out: a link to the list's page. A function: opens the offline copy here. null: can't be opened offline. */
  open?: (() => void) | null;
  /** Made offline and not on the server yet. */
  local?: boolean;
  offline?: boolean;
  syncError?: string | null;
}

function FolderCard({ folder, onUpdate, onDelete, open, local = false, offline = false, syncError = null }: FolderCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);

  const titleClass = "group flex min-w-0 items-center gap-2 text-lg font-semibold wrap-break-word hover:text-primary";
  const title = (
    <>
      <ClipboardList className="size-5 shrink-0 text-primary transition-transform duration-200 group-hover:-rotate-6" aria-hidden />
      <span className="min-w-0">{folder.name}</span>
    </>
  );

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (draft.trim() === folder.name) return setEditing(false);
    if (await onUpdate({ name: draft })) setEditing(false);
  }

  return (
    <li className="card flex animate-fade-up flex-col gap-3 transition-[translate,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/40">
      {editing ? (
        <form onSubmit={save} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={60}
            autoFocus
            className="input min-w-0 flex-1 py-1"
          />
          <button className="btn-secondary" title="Save">
            <Check className="icon-nudge" aria-hidden />
            <span className="sr-only">Save</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(folder.name);
              setEditing(false);
            }}
            className="btn-ghost"
            title="Cancel"
          >
            <X className="icon-nudge" aria-hidden />
            <span className="sr-only">Cancel</span>
          </button>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-2">
          {open === undefined ? (
            <Link href={`/folders/${folder.id}`} className={titleClass}>
              {title}
            </Link>
          ) : open ? (
            <button onClick={open} className={`${titleClass} text-left`}>
              {title}
            </button>
          ) : (
            <span className="flex min-w-0 items-center gap-2 text-lg font-semibold wrap-break-word text-muted">
              <ClipboardList className="size-5 shrink-0" aria-hidden />
              <span className="min-w-0">{folder.name}</span>
            </span>
          )}
          <StatusBadge status={folder.status} />
        </div>
      )}

      {open === null && (
        <p className="flex items-center gap-1 text-xs text-muted">
          <CloudOff className="size-3.5" aria-hidden />
          Not saved offline: connect to open it.
        </p>
      )}
      {local && (
        <span className="flex items-center gap-1 text-xs text-primary">
          <CloudUpload className="size-3.5" aria-hidden />
          {offline ? "Not synced yet" : "Saving…"}
        </span>
      )}
      {syncError && <ErrorText message={syncError} />}

      {folder.sharedBy && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex items-center gap-1 text-muted">
            <Users className="size-3.5" aria-hidden />
            Shared by <span className="text-accent">{folder.sharedBy.name}</span>
          </span>
          <PermissionBadges canCheck={folder.canCheck} canEdit={folder.canEdit} />
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <ProgressBar done={folder.doneCount} total={folder.itemCount} size="sm" />
        </div>
        {folder.itemCount > 0 && folder.doneCount === folder.itemCount && (
          <span className="flex shrink-0 animate-pop items-center gap-1 text-xs font-medium text-accent">
            <PartyPopper className="size-3.5" aria-hidden />
            All done
          </span>
        )}
      </div>

      {/* Only the owner can rename, change status or delete. */}
      {folder.canManage && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <select
            value={folder.status}
            onChange={(e) => onUpdate({ status: e.target.value as FolderStatus })}
            className="input py-1 text-sm"
            aria-label={`Status of ${folder.name}`}
          >
            {FOLDER_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {!editing && (
            <div className="flex gap-3">
              <button onClick={() => setEditing(true)} className="link" title="Rename">
                <Pencil className="icon-nudge" aria-hidden />
                <span className="sr-only">Rename</span>
              </button>
              <button onClick={onDelete} className="link-danger group" title="Delete">
                <Trash2 className="size-4 group-hover:animate-wiggle" aria-hidden />
                <span className="sr-only">Delete</span>
              </button>
            </div>
          )}
        </div>
      )}
      <span className="flex items-center gap-1 text-xs text-muted">
        <CalendarClock className="size-3.5" aria-hidden />
        Updated {new Date(folder.updatedAt).toLocaleDateString("en-IN")}</span>
    </li>
  );
}

/** Small View / Tick / Edit labels showing what I may do in a shared folder. */
function PermissionBadges({ canCheck, canEdit }: { canCheck: boolean; canEdit: boolean }) {
  const badges: { label: string; icon: LucideIcon }[] = [
    { label: "View", icon: Eye },
    ...(canCheck ? [{ label: "Tick", icon: SquareCheck }] : []),
    ...(canEdit ? [{ label: "Edit", icon: Pencil }] : []),
  ];
  return (
    <span className="flex gap-1">
      {badges.map((b) => (
        <span key={b.label} className="inline-flex items-center gap-1 rounded border border-border px-1.5 text-xs text-muted">
          <b.icon className="size-3" aria-hidden />
          {b.label}
        </span>
      ))}
    </span>
  );
}
