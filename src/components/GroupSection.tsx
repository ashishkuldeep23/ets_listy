"use client";

// One group of items on the folder page: a header (name, progress,
// collapse, rename) and its item rows.

import { useState, type FormEvent, type ReactNode } from "react";
import { Check, ChevronRight, Layers, Pencil, X } from "lucide-react";
import Combobox from "@/components/Combobox";
import { LIMITS } from "@/lib/limits";

interface GroupSectionProps {
  /** Group name, or null for "Ungrouped". */
  name: string | null;
  done: number;
  total: number;
  canEdit: boolean;
  /** All group names in the folder, offered when renaming (picking one merges into it). */
  groups?: string[];
  /** Return true when renamed. */
  onRename: (to: string | null) => Promise<boolean>;
  children: ReactNode;
}

export default function GroupSection({ name, done, total, canEdit, groups = [], onRename, children }: GroupSectionProps) {
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name ?? "");

  async function rename(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // An empty name moves the items to "Ungrouped".
    if (await onRename(draft.trim() || null)) setRenaming(false);
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-1">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-2 text-left font-semibold"
        >
          <ChevronRight
            className={`size-4 text-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`}
            aria-hidden
          />
          {name && <Layers className="size-4 text-accent" aria-hidden />}
          <span className={name ? "text-accent" : "text-muted"}>{name ?? "Ungrouped"}</span>
          <span className="text-xs font-normal text-muted">
            {done} / {total}
          </span>
        </button>

        {canEdit && name && !renaming && (
          <button onClick={() => setRenaming(true)} className="link ml-auto text-xs" title="Rename group">
            <Pencil className="size-3.5" aria-hidden />
            <span className="sr-only">Rename group</span>
          </button>
        )}
        {renaming && (
          <form onSubmit={rename} className="ml-auto flex gap-2">
            <Combobox
              value={draft}
              onChange={setDraft}
              options={groups
                .filter((g) => g !== name && g.toLowerCase().includes(draft.trim().toLowerCase()))
                .map((g) => ({ key: g, value: g, label: `Move into "${g}"` }))}
              maxLength={LIMITS.ITEM_GROUP_MAX}
              autoFocus
              aria-label="New group name"
              className="input w-full py-1 text-sm"
            />
            <button className="btn-secondary text-sm" title="Save">
              <Check className="icon-nudge" aria-hidden />
              <span className="sr-only">Save</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(name ?? "");
                setRenaming(false);
              }}
              className="btn-ghost text-sm"
              title="Cancel"
            >
              <X className="icon-nudge" aria-hidden />
              <span className="sr-only">Cancel</span>
            </button>
          </form>
        )}
      </div>

      {open && <ul className="flex animate-fade-up flex-col gap-2">{children}</ul>}
    </section>
  );
}
