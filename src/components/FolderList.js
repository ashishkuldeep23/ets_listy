"use client";

// Home page body: create a folder, filter by status, and rename / change
// status / delete my folders. The chosen filter lives in the URL
// (/?status=pending) so refresh and the Back button keep it.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { DEFAULT_STATUS, FOLDER_STATUSES, STATUS_VALUES } from "@/lib/constants";
import StatusBadge from "@/components/StatusBadge";

export default function FolderList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Ignore unknown values in the URL instead of showing an error.
  const rawStatus = searchParams.get("status");
  const filter = STATUS_VALUES.includes(rawStatus) ? rawStatus : "all";

  const [folders, setFolders] = useState([]);
  const [counts, setCounts] = useState(null);
  const [name, setName] = useState("");
  const [newStatus, setNewStatus] = useState(DEFAULT_STATUS);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchFolders = useCallback(
    () => apiFetch(filter === "all" ? "/api/folders" : `/api/folders?status=${filter}`),
    [filter]
  );
  const show = (data) => {
    setFolders(data.folders);
    setCounts(data.counts);
  };

  // Load when the filter changes. `cancelled` drops a slow response for an
  // old filter so it can't overwrite the newer one.
  useEffect(() => {
    let cancelled = false;
    fetchFolders()
      .then((data) => !cancelled && show(data))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchFolders]);

  function setFilter(value) {
    const params = new URLSearchParams(searchParams);
    if (value === "all") params.delete("status");
    else params.set("status", value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Wraps a change: clears the old error, runs it, reloads so counts stay
  // right; returns true on success.
  async function mutate(fn) {
    setError("");
    try {
      await fn();
      show(await fetchFolders());
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  async function createFolder(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const ok = await mutate(() =>
      apiFetch("/api/folders", { method: "POST", body: JSON.stringify({ name, status: newStatus }) })
    );
    if (ok) setName("");
  }

  const updateFolder = (id, changes) =>
    mutate(() => apiFetch(`/api/folders/${id}`, { method: "PATCH", body: JSON.stringify(changes) }));

  function deleteFolder(folder) {
    if (!confirm(`Delete "${folder.name}"? This cannot be undone.`)) return;
    mutate(() => apiFetch(`/api/folders/${folder.id}`, { method: "DELETE" }));
  }

  const chips = [{ value: "all", label: "All" }, ...FOLDER_STATUSES];

  return (
    <div>
      <form onSubmit={createFolder} className="mb-6 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New folder name (e.g. Market, Oct)"
          maxLength={60}
          className="input min-w-0 flex-1"
        />
        <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="input" aria-label="Status">
          {FOLDER_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button className="btn-primary">Add folder</button>
      </form>

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
          {filter === "all" ? "No folders yet. Create your first one above." : "No folders with this status."}
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

function FolderCard({ folder, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);

  async function save(e) {
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

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <select
          value={folder.status}
          onChange={(e) => onUpdate({ status: e.target.value })}
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
      <span className="text-xs text-muted">Updated {new Date(folder.updatedAt).toLocaleDateString("en-IN")}</span>
    </li>
  );
}
