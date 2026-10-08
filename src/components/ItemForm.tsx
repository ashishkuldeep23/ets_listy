"use client";

// Form for adding or editing an item. Only the name is required; the other
// fields show behind "More details" to keep quick adds fast.

import { useState, type FormEvent } from "react";
import { LIMITS } from "@/lib/limits";
import type { ItemDTO } from "@/types";

/** What the form sends. Empty optional fields are sent as null (= clear / not set). */
export interface ItemFormValues {
  name: string;
  category: string | null;
  price: number | null;
  description: string | null;
}

interface ItemFormProps {
  /** Pre-fill for editing; omit for a new item. */
  initial?: Pick<ItemDTO, "name" | "category" | "price" | "description">;
  submitLabel: string;
  /** Return true when saved, so the form can reset. */
  onSubmit: (values: ItemFormValues) => Promise<boolean>;
  onCancel?: () => void;
}

export default function ItemForm({ initial, submitLabel, onSubmit, onCancel }: ItemFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  // Editing an item that already has details: show them straight away.
  const [showMore, setShowMore] = useState(Boolean(initial?.category || initial?.price != null || initial?.description));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;

    const priceNumber = price.trim() === "" ? null : Number(price);
    if (priceNumber !== null && (!Number.isFinite(priceNumber) || priceNumber < 0)) {
      setError("Price must be a number, 0 or more");
      return;
    }

    setError("");
    setBusy(true);
    const saved = await onSubmit({
      name,
      category: category.trim() || null,
      price: priceNumber,
      description: description.trim() || null,
    });
    setBusy(false);

    if (saved && !initial) {
      setName("");
      setCategory("");
      setPrice("");
      setDescription("");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Item name (e.g. Milk)"
          maxLength={LIMITS.ITEM_NAME_MAX}
          required
          autoFocus={Boolean(initial)}
          className="input min-w-0 flex-1"
        />
        <button disabled={busy} className="btn-primary">
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
        )}
      </div>

      {showMore ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category (optional)"
            maxLength={LIMITS.ITEM_CATEGORY_MAX}
            className="input"
          />
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Price ₹ (optional)"
            inputMode="decimal"
            type="number"
            min={0}
            max={LIMITS.ITEM_PRICE_MAX}
            step="0.01"
            className="input"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            maxLength={LIMITS.ITEM_DESCRIPTION_MAX}
            rows={2}
            className="input sm:col-span-2"
          />
        </div>
      ) : (
        <button type="button" onClick={() => setShowMore(true)} className="link self-start text-sm">
          + More details (category, price, description)
        </button>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
