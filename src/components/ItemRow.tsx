"use client";

// One item in a folder: tick box, details, and edit / delete.

import { useState } from "react";
import ItemForm, { type ItemFormValues } from "@/components/ItemForm";
import { formatRupees } from "@/lib/format";
import type { ItemDTO } from "@/types";

interface ItemRowProps {
  item: ItemDTO;
  canCheck: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onSave: (values: ItemFormValues) => Promise<boolean>;
  onDelete: () => void;
}

export default function ItemRow({ item, canCheck, canEdit, onToggle, onSave, onDelete }: ItemRowProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="card">
        <ItemForm
          initial={item}
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
    <li className="card flex items-start gap-3 py-3">
      <input
        type="checkbox"
        checked={item.done}
        onChange={onToggle}
        disabled={!canCheck}
        aria-label={`Mark ${item.name} as ${item.done ? "not done" : "done"}`}
        className="mt-1 size-4 shrink-0 accent-primary"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`wrap-break-word ${item.done ? "text-muted line-through" : ""}`}>{item.name}</span>
          {item.category && (
            <span className="rounded-full border border-accent/40 px-2 py-0.5 text-xs text-accent">{item.category}</span>
          )}
          {item.price !== null && <span className="text-sm font-medium text-primary">{formatRupees(item.price)}</span>}
        </div>
        {item.description && <p className="mt-1 text-sm wrap-break-word text-muted">{item.description}</p>}
      </div>

      {canEdit && (
        <div className="flex shrink-0 gap-3 text-sm">
          <button onClick={() => setEditing(true)} className="link">
            Edit
          </button>
          <button onClick={onDelete} className="text-danger hover:underline">
            Delete
          </button>
        </div>
      )}
    </li>
  );
}
