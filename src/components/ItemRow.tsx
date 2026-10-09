"use client";

// One item in a folder: tick box, details, and edit / delete.

import { useState } from "react";
import { Check, Pencil, Tag, Trash2, UserCheck } from "lucide-react";
import ItemForm, { type ItemFormValues } from "@/components/ItemForm";
import { formatRupees } from "@/lib/format";
import type { ItemDTO } from "@/types";

interface ItemRowProps {
  item: ItemDTO;
  /** Group suggestions for the edit form. */
  groups: string[];
  canCheck: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onSave: (values: ItemFormValues) => Promise<boolean>;
  onDelete: () => void;
}

export default function ItemRow({ item, groups, canCheck, canEdit, onToggle, onSave, onDelete }: ItemRowProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="card">
        <ItemForm
          mode="edit"
          initial={item}
          groups={groups}
          submitLabel="Save"
          onSubmit={async (values) => {
            const ok = await onSave(values);
            if (ok) setEditing(false);
            return ok;
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="card flex animate-fade-up items-start gap-3 py-3">
      {/* A real checkbox (keyboard + screen readers), drawn as a round golden tick that pops in. */}
      <span className="relative mt-0.5 flex size-5 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={item.done}
          onChange={onToggle}
          disabled={!canCheck}
          aria-label={`Mark ${item.name} as ${item.done ? "not done" : "done"}`}
          className="peer size-5 cursor-pointer appearance-none rounded-full border-2 border-border transition-colors outline-none checked:border-primary checked:bg-primary hover:border-primary focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
        />
        <Check
          className="pointer-events-none absolute size-3.5 scale-0 text-on-primary transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] peer-checked:scale-100"
          strokeWidth={3}
          aria-hidden
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`wrap-break-word transition-colors ${item.done ? "text-muted line-through" : ""}`}>{item.name}</span>
          {item.category && (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 px-2 py-0.5 text-xs text-accent">
              <Tag className="size-3" aria-hidden />
              {item.category}
            </span>
          )}
          {item.price !== null && <span className="text-sm font-medium text-primary">{formatRupees(item.price)}</span>}
        </div>
        {item.description && <p className="mt-1 text-sm wrap-break-word text-muted">{item.description}</p>}
        {item.done && item.doneBy && (
          <p className="mt-1 flex animate-fade-up items-center gap-1 text-xs text-accent">
            <UserCheck className="size-3.5" aria-hidden />
            by {item.doneBy.name}
          </p>
        )}
      </div>

      {canEdit && (
        <div className="flex shrink-0 gap-3 text-sm">
          <button onClick={() => setEditing(true)} className="link" title="Edit">
            <Pencil className="icon-nudge" aria-hidden />
            <span className="sr-only">Edit</span>
          </button>
          <button onClick={onDelete} className="link-danger group" title="Delete">
            <Trash2 className="size-4 group-hover:animate-wiggle" aria-hidden />
            <span className="sr-only">Delete</span>
          </button>
        </div>
      )}
    </li>
  );
}
