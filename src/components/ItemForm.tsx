"use client";

// Form for adding or editing an item (also used for saved items on the
// profile page). Only the name is required; the other fields show behind
// "More details" to keep quick adds fast.

import { useState, type FormEvent } from "react";
import {
   Bookmark,
   Check,
   FolderTree,
   LoaderCircle,
   Plus,
   SlidersHorizontal,
   X,
} from "lucide-react";
import Combobox, { type ComboboxOption } from "@/components/Combobox";
import ErrorText from "@/components/ErrorText";
import { formatRupees } from "@/lib/format";
import { LIMITS } from "@/lib/limits";
import { lineTotal } from "@/lib/totals";
import type { ItemDTO } from "@/types";

/** Suggestions that contain the typed text (any case); all of them while it's empty. */
function suggest(list: readonly string[], typed: string): ComboboxOption[] {
   const t = typed.trim().toLowerCase();
   return list
      .filter((s) => s.toLowerCase() !== t && s.toLowerCase().includes(t))
      .map((s) => ({ key: s, value: s }));
}

/** The existing spelling of `name` in `list`, if it's there in another case ("veg" → "Veg"). */
const matchCase = (list: readonly string[], name: string) =>
   list.find((s) => s.toLowerCase() === name.toLowerCase()) ?? name;

/** What the form sends. Empty optional fields are sent as null (= clear / not set). */
export interface ItemFormValues {
   name: string;
   category: string | null;
   price: number | null;
   /** The user's own label for what the price is for ("kg", "piece"…); null when there is no price. */
   priceUnit: string | null;
   /** null = 1. */
   quantity: number | null;
   description: string | null;
   group: string | null;
   /** Add mode only, when the checkbox is shown: also save to my profile. */
   saveToProfile?: boolean;
}

type Prefill = Partial<
   Pick<
      ItemDTO,
      | "name"
      | "category"
      | "price"
      | "priceUnit"
      | "quantity"
      | "description"
      | "group"
   >
>;

interface ItemFormProps {
   /** "add" clears the form after saving; "edit" keeps it (the parent closes it). */
   mode?: "add" | "edit";
   /** Starting values (the item being edited, or a saved item to add). */
   initial?: Prefill;
   /** Existing group names in this folder, offered as suggestions. */
   groups?: string[];
   /** Saved items have no group, so the profile page hides it. */
   showGroup?: boolean;
   /** Shows the "Save to my profile" checkbox (folder page, add mode). */
   showSaveToProfile?: boolean;
   submitLabel: string;
   /** Return true when saved, so the form can reset. */
   onSubmit: (values: ItemFormValues) => Promise<boolean>;
   onCancel?: () => void;
}

export default function ItemForm({
   mode = "add",
   initial,
   groups = [],
   showGroup = true,
   showSaveToProfile = false,
   submitLabel,
   onSubmit,
   onCancel,
}: ItemFormProps) {
   const [name, setName] = useState(initial?.name ?? "");
   const [category, setCategory] = useState(initial?.category ?? "");
   const [price, setPrice] = useState(
      initial?.price != null ? String(initial.price) : "",
   );
   const [priceUnit, setPriceUnit] = useState(initial?.priceUnit ?? "");
   const [quantity, setQuantity] = useState(
      initial?.quantity != null ? String(initial.quantity) : "",
   );
   const [description, setDescription] = useState(initial?.description ?? "");
   const [group, setGroup] = useState(initial?.group ?? "");
   const [saveToProfile, setSaveToProfile] = useState(false);
   // Editing an item that already has details: show them straight away.
   const [showMore, setShowMore] = useState(
      Boolean(
         initial?.category ||
         initial?.price != null ||
         initial?.quantity != null ||
         initial?.description ||
         initial?.group,
      ),
   );
   const [error, setError] = useState("");
   const [busy, setBusy] = useState(false);

   // "= ₹80" next to the inputs: price × quantity, shown only while both make sense.
   const previewPrice = price.trim() === "" ? NaN : Number(price);
   const previewQty = quantity.trim() === "" ? 1 : Number(quantity);
   const preview =
      Number.isFinite(previewPrice) &&
      previewPrice >= 0 &&
      Number.isFinite(previewQty) &&
      previewQty > 0
         ? lineTotal({ price: previewPrice, quantity: previewQty })
         : null;

   async function submit(e: FormEvent<HTMLFormElement>) {
      e.preventDefault();
      if (!name.trim()) return;

      const priceNumber = price.trim() === "" ? null : Number(price);
      if (
         priceNumber !== null &&
         (!Number.isFinite(priceNumber) || priceNumber < 0)
      ) {
         setError("Price must be a number, 0 or more");
         return;
      }

      if (priceNumber !== null && priceNumber > LIMITS.ITEM_PRICE_MAX) {
         setError(`Price can be at most ${LIMITS.ITEM_PRICE_MAX}`);
         return;
      }
      const quantityNumber = quantity.trim() === "" ? null : Number(quantity);
      if (
         quantityNumber !== null &&
         (!Number.isFinite(quantityNumber) || quantityNumber <= 0)
      ) {
         setError("Quantity must be a number above 0");
         return;
      }
      if (
         quantityNumber !== null &&
         quantityNumber > LIMITS.ITEM_QUANTITY_MAX
      ) {
         setError(`Quantity can be at most ${LIMITS.ITEM_QUANTITY_MAX}`);
         return;
      }
      // "per kg" or "/kg" → "kg" (the row shows it as "₹40 / kg").
      const unit = priceUnit
         .trim()
         .replace(/^(\/|per\s+)/i, "")
         .trim();
      const groupName = group.trim();

      setError("");
      setBusy(true);
      const saved = await onSubmit({
         name,
         category: category.trim() || null,
         price: priceNumber,
         // A unit means nothing without a price.
         priceUnit: priceNumber !== null && unit ? unit : null,
         quantity: quantityNumber,
         description: description.trim() || null,
         // Reuse the folder's spelling, so "vegetables" joins "Vegetables" instead of making a 2nd group.
         group: showGroup && groupName ? matchCase(groups, groupName) : null,
         ...(showSaveToProfile && { saveToProfile }),
      });
      setBusy(false);

      if (saved && mode === "add") {
         setName("");
         setCategory("");
         setPrice("");
         setPriceUnit("");
         setQuantity("");
         setDescription("");
         // Keep the group: people usually add several items to the same group in a row.
      }
   }

   return (
      <form onSubmit={submit} className="flex flex-col gap-2">
         <div className="flex gap-2">
            <input
               value={name}
               onChange={(e) => setName(e.target.value)}
               placeholder="New item name (e.g. Milk)"
               maxLength={LIMITS.ITEM_NAME_MAX}
               required
               autoFocus={Boolean(initial)}
               className="input min-w-0 flex-1"
            />
            <button disabled={busy} className="btn-primary">
               {busy ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
               ) : mode === "edit" ? (
                  <Check className="icon-nudge" aria-hidden />
               ) : (
                  <Plus className="icon-nudge" aria-hidden />
               )}
               {submitLabel}
            </button>
            {onCancel && (
               <button
                  type="button"
                  onClick={onCancel}
                  className="btn-ghost"
                  title="Cancel">
                  <X className="icon-nudge" aria-hidden />
                  <span className="sr-only">Cancel</span>
               </button>
            )}
         </div>

         {showMore ? (
            <div className="grid animate-fade-up gap-2 sm:grid-cols-2">
               {showGroup && (
                  <Combobox
                     value={group}
                     onChange={setGroup}
                     options={suggest(groups, group)}
                     placeholder={
                        groups.length
                           ? "Group (pick one or type a new one)"
                           : "Group (optional, e.g. Vegetables)"
                     }
                     aria-label="Group"
                     maxLength={LIMITS.ITEM_GROUP_MAX}
                     className="input w-full pl-9"
                     leading={
                        <FolderTree
                           className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                           aria-hidden
                        />
                     }
                  />
               )}
               <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Category (optional)"
                  maxLength={LIMITS.ITEM_CATEGORY_MAX}
                  className="input"
               />
               <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                  <input
                     value={price}
                     onChange={(e) => setPrice(e.target.value)}
                     placeholder="Price ₹ (optional)"
                     aria-label="Price in rupees"
                     inputMode="decimal"
                     type="number"
                     min={0}
                     max={LIMITS.ITEM_PRICE_MAX}
                     step="0.01"
                     className="input min-w-0 flex-1 basis-32"
                  />
                  <span className="shrink-0 text-sm text-muted">per</span>
                  <input
                     value={priceUnit}
                     onChange={(e) => setPriceUnit(e.target.value)}
                     placeholder="label (kg, piece…)"
                     aria-label="Price per (your own label, e.g. kg or piece)"
                     title={
                        price.trim() === ""
                           ? "Enter a price first"
                           : "What the price is for: type anything, e.g. kg, piece, dozen"
                     }
                     disabled={price.trim() === ""}
                     maxLength={LIMITS.ITEM_PRICE_UNIT_MAX}
                     className="input w-32 shrink-0 disabled:opacity-50"
                  />
                  <span className="shrink-0 text-sm text-muted" aria-hidden>
                     ×
                  </span>
                  <input
                     value={quantity}
                     onChange={(e) => setQuantity(e.target.value)}
                     placeholder="qty"
                     aria-label="Quantity"
                     title="How many (decimals allowed, e.g. 2.5). Empty = 1"
                     inputMode="decimal"
                     type="number"
                     min={0.001}
                     max={LIMITS.ITEM_QUANTITY_MAX}
                     step="any"
                     className="input w-24 shrink-0"
                  />
                  {preview !== null && (
                     <span
                        className="shrink-0 text-sm font-medium text-primary"
                        aria-live="polite">
                        = {formatRupees(preview)}
                     </span>
                  )}
               </div>
               <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description (optional)"
                  maxLength={LIMITS.ITEM_DESCRIPTION_MAX}
                  rows={2}
                  className="input sm:col-span-2 max-h-40 min-h-12 overflow-y-auto "
               />
            </div>
         ) : (
            <button
               type="button"
               onClick={() => setShowMore(true)}
               className="link self-start text-sm">
               <SlidersHorizontal className="icon-nudge" aria-hidden />
               More details ({showGroup ? "group, " : ""}category, price,
               quantity, description)
            </button>
         )}

         {showSaveToProfile && (
            <label className="flex items-center gap-2 text-sm text-muted">
               <input
                  type="checkbox"
                  checked={saveToProfile}
                  onChange={(e) => setSaveToProfile(e.target.checked)}
                  className="size-4 accent-primary"
               />
               <Bookmark
                  className={`size-4 transition-colors ${saveToProfile ? "fill-primary text-primary" : ""}`}
                  aria-hidden
               />
               Save to my profile (reuse it in other lists)
            </label>
         )}

         <ErrorText message={error} />
      </form>
   );
}
