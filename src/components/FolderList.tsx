"use client";

// Home page body: two tabs, "My folders" (create, rename, change status,
// delete) and "Shared with me" (folders others shared, with who shared them
// and what I may do). Tab and status filter live in the URL
// (/?tab=shared&status=pending) so refresh and the Back button keep them.
// Live: listens on my user channel, so card progress updates as anyone
// ticks items, and the shared tab refreshes when I gain or lose a folder.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useChannel } from "@/hooks/useChannel";
import { useMe } from "@/hooks/useMe";
import { apiFetch } from "@/lib/apiClient";
import { EVENTS, userChannel } from "@/lib/channels";
import { DEFAULT_STATUS, FOLDER_STATUSES, isFolderStatus, type FolderStatus } from "@/lib/constants";
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

export default function FolderList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Ignore unknown values in the URL instead of showing an error.
  const rawStatus = searchParams.get("status");
  const filter: Filter = isFolderStatus(rawStatus) ? rawStatus : "all";
  const tab: FolderScope = searchParams.get("tab") === "shared" ? "shared" : "mine";

  const [folders, setFolders] = useState<FolderSummaryDTO[]>([]);
  const [counts, setCounts] = useState<FolderCounts | null>(null);
  const [name, setName] = useState("");
  const [newStatus, setNewStatus] = useState<FolderStatus>(DEFAULT_STATUS);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchFolders = useCallback(() => {
    const params = new URLSearchParams({ scope: tab });
    if (filter !== "all") params.set("status", filter);
    return apiFetch<FolderListResponse>(`/api/folders?${params}`);
  }, [tab, filter]);
  const show = (data: FolderListResponse) => {
    setFolders(data.folders);
    setCounts(data.counts);
  };

  // Load when the filter changes. `cancelled` drops a slow response for an
  // old filter so it can't overwrite the newer one.
  useEffect(() => {
    let cancelled = false;
    fetchFolders()
      .then((data) => !cancelled && show(data))
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchFolders]);

  // Reload quietly (no error banner): used for live events and reconnects.
  const refresh = useCallback(() => {
    fetchFolders()
      .then(show)
      .catch(() => {});
  }, [fetchFolders]);

  const me = useMe();
  useChannel(
    me ? userChannel(me.id) : null,
    {
      // Event data comes from our server (trust boundary, hence the cast).
      [EVENTS.folderProgress]: (data) => {
        const p = data as FolderProgressEvent;
        if (p.deleted) return refresh(); // card gone, counts change
        setFolders((prev) =>
          prev.map((f) => (f.id === p.folderId ? { ...f, itemCount: p.itemCount, doneCount: p.doneCount } : f))
        );
      },
      [EVENTS.folderAccess]: () => refresh(),
    },
    refresh
  );

  // Updates one URL param (null removes it), keeping the others.
  function setParam(key: "status" | "tab", value: string | null) {
    const params = new URLSearchParams(searchParams);
    if (value === null) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }
  const setFilter = (value: Filter) => setParam("status", value === "all" ? null : value);
  const setTab = (value: FolderScope) => setParam("tab", value === "mine" ? null : value);

  // Wraps a change: clears the old error, runs it, reloads so counts stay
  // right; returns true on success.
  async function mutate(fn: () => Promise<unknown>): Promise<boolean> {
    setError("");
    try {
      await fn();
      show(await fetchFolders());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    }
  }

  async function createFolder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    const ok = await mutate(() =>
      apiFetch("/api/folders", { method: "POST", body: JSON.stringify({ name, status: newStatus }) })
    );
    if (ok) setName("");
  }

  const updateFolder = (id: string, changes: Partial<Pick<FolderDTO, "name" | "status">>) =>
    mutate(() => apiFetch(`/api/folders/${id}`, { method: "PATCH", body: JSON.stringify(changes) }));

  function deleteFolder(folder: FolderDTO) {
    if (!confirm(`Delete "${folder.name}"? This cannot be undone.`)) return;
    mutate(() => apiFetch(`/api/folders/${folder.id}`, { method: "DELETE" }));
  }

  const chips: { value: Filter; label: string }[] = [{ value: "all", label: "All" }, ...FOLDER_STATUSES];

  const tabs: { value: FolderScope; label: string }[] = [
    { value: "mine", label: "My folders" },
    { value: "shared", label: "Shared with me" },
  ];

  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-border" role="tablist" aria-label="Folders">
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.value ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "mine" && (
        <form onSubmit={createFolder} className="mb-6 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New folder name (e.g. Market, Oct)"
            maxLength={60}
            className="input min-w-0 flex-1"
          />
          <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as FolderStatus)} className="input" aria-label="Status">
            {FOLDER_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button className="btn-primary">Add folder</button>
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
      </div>

      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      {loading && <p className="text-muted">Loading…</p>}
      {!loading && folders.length === 0 && (
        <p className="card text-muted">
          {filter !== "all"
            ? "No folders with this status."
            : tab === "mine"
              ? "No folders yet. Create your first one above."
              : "Nothing shared with you yet. When someone shares a folder with you, it shows up here."}
        </p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2">
        {folders.map((folder) => (
          <FolderCard
            key={folder.id}
            folder={folder}
            onUpdate={(changes) => updateFolder(folder.id, changes)}
            onDelete={() => deleteFolder(folder)}
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
}

function FolderCard({ folder, onUpdate, onDelete }: FolderCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (draft.trim() === folder.name) return setEditing(false);
    if (await onUpdate({ name: draft })) setEditing(false);
  }

  return (
    <li className="card flex flex-col gap-3">
      {editing ? (
        <form onSubmit={save} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={60}
            autoFocus
            className="input min-w-0 flex-1 py-1"
          />
          <button className="btn-secondary">Save</button>
          <button
            type="button"
            onClick={() => {
              setDraft(folder.name);
              setEditing(false);
            }}
            className="btn-ghost"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <Link href={`/folders/${folder.id}`} className="text-lg font-semibold wrap-break-word hover:text-primary">
            {folder.name}
          </Link>
          <StatusBadge status={folder.status} />
        </div>
      )}

      {folder.sharedBy && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">
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
          <span className="shrink-0 text-xs font-medium text-accent">All done ✓</span>
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
              <button onClick={() => setEditing(true)} className="link">
                Rename
              </button>
              <button onClick={onDelete} className="text-danger hover:underline">
                Delete
              </button>
            </div>
          )}
        </div>
      )}
      <span className="text-xs text-muted">Updated {new Date(folder.updatedAt).toLocaleDateString("en-IN")}</span>
    </li>
  );
}

/** Small View / Tick / Edit labels showing what I may do in a shared folder. */
function PermissionBadges({ canCheck, canEdit }: { canCheck: boolean; canEdit: boolean }) {
  const badges = ["View", ...(canCheck ? ["Tick"] : []), ...(canEdit ? ["Edit"] : [])];
  return (
    <span className="flex gap-1">
      {badges.map((b) => (
        <span key={b} className="rounded border border-border px-1.5 text-xs text-muted">
          {b}
        </span>
      ))}
    </span>
  );
}
