"use client";

// One group of items on the folder page: a header (name, progress,
// collapse, rename) and its item rows.

import { useState, type FormEvent, type ReactNode } from "react";
import { LIMITS } from "@/lib/limits";

interface GroupSectionProps {
  /** Group name, or null for "Ungrouped". */
  name: string | null;
  done: number;
  total: number;
  canEdit: boolean;
  /** Return true when renamed. */
  onRename: (to: string | null) => Promise<boolean>;
  children: ReactNode;
}

export default function GroupSection({ name, done, total, canEdit, onRename, children }: GroupSectionProps) {
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
          <span className="text-muted">{open ? "▾" : "▸"}</span>
          <span className={name ? "text-accent" : "text-muted"}>{name ?? "Ungrouped"}</span>
          <span className="text-xs font-normal text-muted">
            {done} / {total}
          </span>
        </button>

        {canEdit && name && !renaming && (
          <button onClick={() => setRenaming(true)} className="link ml-auto text-xs">
            Rename group
          </button>
        )}
        {renaming && (
          <form onSubmit={rename} className="ml-auto flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={LIMITS.ITEM_GROUP_MAX}
              autoFocus
              aria-label="New group name"
              className="input py-1 text-sm"
            />
            <button className="btn-secondary text-sm">Save</button>
            <button
              type="button"
              onClick={() => {
                setDraft(name ?? "");
                setRenaming(false);
              }}
              className="btn-ghost text-sm"
            >
              Cancel
            </button>
          </form>
        )}
      </div>

      {open && <ul className="flex flex-col gap-2">{children}</ul>}
    </section>
  );
}
