"use client";

// "Add from saved" panel on the folder page: search my saved items, then
// either add one straight away (into a chosen group) or "Edit & add" to
// change it first in the main add form.

import { useState } from "react";
import { BookmarkPlus, CircleCheck, PencilLine, Plus, Search, X } from "lucide-react";
import ErrorText from "@/components/ErrorText";
import Loading from "@/components/Loading";
import { useSavedItems } from "@/hooks/useSavedItems";
import { formatRupees } from "@/lib/format";
import type { SavedItemDTO } from "@/types";

interface SavedItemPickerProps {
  groups: string[];
  /** Adds the saved item as-is into `group` (null = ungrouped). Return true on success. */
  onAdd: (item: SavedItemDTO, group: string | null) => Promise<boolean>;
  /** Puts the saved item into the add form for editing first. */
  onEditAndAdd: (item: SavedItemDTO) => void;
  onClose: () => void;
}

export default function SavedItemPicker({ groups, onAdd, onEditAndAdd, onClose }: SavedItemPickerProps) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const { savedItems, loading, error } = useSavedItems(query);

  async function add(item: SavedItemDTO) {
    if (await onAdd(item, group || null)) setAddedIds((ids) => [...ids, item.id]);
  }

  return (
    <div className="card mb-6 flex animate-fade-up flex-col gap-3 border-accent/40">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-accent">
          <BookmarkPlus className="size-5" aria-hidden />
          Add from saved
        </h2>
        <button onClick={onClose} className="btn-ghost text-sm" title="Close">
          <X className="icon-nudge" aria-hidden />
          <span className="sr-only">Close</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search saved items…"
            aria-label="Search saved items"
            className="input w-full pl-9"
          />
        </div>
        <select value={group} onChange={(e) => setGroup(e.target.value)} className="input" aria-label="Add into group">
          <option value="">Into: Ungrouped</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              Into: {g}
            </option>
          ))}
        </select>
      </div>

      <ErrorText message={error} />
      {loading && <Loading className="text-sm" />}
      {!loading && savedItems.length === 0 && (
        <p className="text-sm text-muted">
          {query.trim()
            ? "No saved items match."
            : 'No saved items yet. Tick "Save to my profile" when adding an item, or add them on your Profile page.'}
        </p>
      )}

      <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {savedItems.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
            <div className="min-w-0 flex-1">
              <span className="wrap-break-word">{item.name}</span>
              {item.category && <span className="ml-2 text-xs text-accent">{item.category}</span>}
              {item.price !== null && <span className="ml-2 text-sm text-primary">{formatRupees(item.price)}</span>}
            </div>
            {addedIds.includes(item.id) && (
              <span className="flex animate-pop items-center gap-1 text-xs text-accent">
                <CircleCheck className="size-3.5" aria-hidden />
                Added
              </span>
            )}
            <button onClick={() => add(item)} className="btn-secondary text-sm" title="Add">
              <Plus className="icon-nudge" aria-hidden />
              <span className="sr-only">Add</span>
            </button>
            <button onClick={() => onEditAndAdd(item)} className="link text-sm" title="Edit & add">
              <PencilLine className="icon-nudge" aria-hidden />
              <span className="sr-only">Edit &amp; add</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
