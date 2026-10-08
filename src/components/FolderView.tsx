"use client";

// Folder page body: the folder header, progress, its items grouped into
// sections (add, edit, tick, delete, rename a group), price totals, and
// "Add from saved" to reuse items from my profile. Loads the folder by the id in the URL; the API answers 404
// for folders that don't exist or aren't mine, shown as "not found".
// What the user may do (tick / edit) comes from the API, not guessed here.

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import GroupSection from "@/components/GroupSection";
import ItemForm, { type ItemFormValues } from "@/components/ItemForm";
import ItemRow from "@/components/ItemRow";
import ProgressBar from "@/components/ProgressBar";
import SavedItemPicker from "@/components/SavedItemPicker";
import SharePanel from "@/components/SharePanel";
import StatusBadge from "@/components/StatusBadge";
import { ApiError, apiFetch } from "@/lib/apiClient";
import { formatRupees } from "@/lib/format";
import { computeTotals, groupItems } from "@/lib/totals";
import type { FolderDetailDTO, ItemDTO, ItemListResponse, SavedItemDTO, SessionUser } from "@/types";

type LoadState = "loading" | "ready" | "notFound" | "error";

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

  useEffect(() => {
    let cancelled = false;
    const base = `/api/folders/${encodeURIComponent(id)}`;
    Promise.all([apiFetch<FolderDetailDTO>(base), apiFetch<ItemListResponse>(`${base}/items`)])
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
  }, [id]);

  if (state === "loading") return <p className="text-muted">Loading…</p>;

  if (state !== "ready" || !folder) {
    return (
      <div className="card">
        <h1 className="mb-2 text-xl font-semibold">
          {state === "notFound" ? "Folder not found" : "Could not load this folder"}
        </h1>
        <p className="mb-4 text-muted">
          {state === "notFound"
            ? "It may have been deleted, or you don't have access to it."
            : "Please check your connection and try again."}
        </p>
        <Link href="/" className="link">
          ← Back to folders
        </Link>
      </div>
    );
  }

  const itemsUrl = `/api/folders/${folder.id}/items`;
  const replaceItem = (updated: ItemDTO) => setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));

  // Keeps group suggestions in sync after an add / edit / rename.
  const rememberGroup = (group: string | null) => {
    if (group) setGroups((prev) => (prev.includes(group) ? prev : [...prev, group].sort((a, b) => a.localeCompare(b))));
  };

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

  // A shared user removes their own access ("Leave folder").
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
      <Link href="/" className="link text-sm">
        ← All folders
      </Link>
      <div className="mt-2 mb-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold wrap-break-word text-primary">{folder.name}</h1>
        <StatusBadge status={folder.status} />
        {folder.canManage && !showShare && (
          <button onClick={() => setShowShare(true)} className="btn-secondary ml-auto text-sm">
            Share
          </button>
        )}
      </div>
      {folder.role === "shared" && (
        <div className="mb-2 flex flex-wrap items-center gap-3 text-sm text-muted">
          <span>
            Shared by <span className="text-accent">{folder.sharedBy?.name ?? "someone"}</span>
            {!folder.canCheck && " · view only"}
            {folder.canCheck && !folder.canEdit && " · you can tick items"}
            {folder.canEdit && " · you can edit items"}
          </span>
          <button onClick={leaveFolder} className="ml-auto text-danger hover:underline">
            Leave folder
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
              + Add from saved
            </button>
          )}
        </>
      )}

      {error && <p className="mb-4 text-sm text-danger">{error}</p>}

      {items.length === 0 ? (
        <p className="card text-muted">No items yet.{folder.canEdit && " Add your first one above."}</p>
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
              <p className="text-sm text-muted">Total</p>
              <p className="text-xl font-semibold text-primary">{formatRupees(totals.total)}</p>
            </div>
            <div>
              <p className="text-sm text-muted">Remaining (not ticked)</p>
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
