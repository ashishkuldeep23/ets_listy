"use client";

// Folder page body: the folder header, progress, and its items (add, edit,
// tick, delete). Loads the folder by the id in the URL; the API answers 404
// for folders that don't exist or aren't mine, shown as "not found".
// What the user may do (tick / edit) comes from the API, not guessed here.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ItemForm, { type ItemFormValues } from "@/components/ItemForm";
import ItemRow from "@/components/ItemRow";
import ProgressBar from "@/components/ProgressBar";
import StatusBadge from "@/components/StatusBadge";
import { ApiError, apiFetch } from "@/lib/apiClient";
import type { FolderDetailDTO, ItemDTO, ItemListResponse } from "@/types";

type LoadState = "loading" | "ready" | "notFound" | "error";

export default function FolderView() {
  const { id } = useParams<{ id: string }>();
  const [folder, setFolder] = useState<FolderDetailDTO | null>(null);
  const [items, setItems] = useState<ItemDTO[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const base = `/api/folders/${encodeURIComponent(id)}`;
    Promise.all([apiFetch<FolderDetailDTO>(base), apiFetch<ItemListResponse>(`${base}/items`)])
      .then(([f, list]) => {
        if (cancelled) return;
        setFolder(f);
        setItems(list.items);
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
    });

  const saveItem = (item: ItemDTO, values: ItemFormValues) =>
    run(async () => {
      replaceItem(await apiFetch<ItemDTO>(`${itemsUrl}/${item.id}`, { method: "PATCH", body: JSON.stringify(values) }));
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

  const doneCount = items.filter((i) => i.done).length;

  return (
    <div>
      <Link href="/" className="link text-sm">
        ← All folders
      </Link>
      <div className="mt-2 mb-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold wrap-break-word text-primary">{folder.name}</h1>
        <StatusBadge status={folder.status} />
      </div>
      <div className="mb-6">
        <ProgressBar done={doneCount} total={items.length} />
      </div>

      {folder.canEdit && (
        <div className="card mb-6">
          <ItemForm submitLabel="Add" onSubmit={addItem} />
        </div>
      )}

      {error && <p className="mb-4 text-sm text-danger">{error}</p>}

      {items.length === 0 ? (
        <p className="card text-muted">No items yet.{folder.canEdit && " Add your first one above."}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              canCheck={folder.canCheck}
              canEdit={folder.canEdit}
              onToggle={() => toggleItem(item)}
              onSave={(values) => saveItem(item, values)}
              onDelete={() => deleteItem(item)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
