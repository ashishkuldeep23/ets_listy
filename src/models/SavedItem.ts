import mongoose, { type Model, type Types } from "mongoose";
import { LIMITS } from "@/lib/limits";
import type { SavedItemDTO } from "@/types";

// An item a user saved to their profile, to add again to any folder later.
// Private to its owner. No group: groups belong to folders.

export interface ISavedItem {
  owner: Types.ObjectId;
  name: string;
  category?: string;
  price?: number;
  description?: string;
  /**
   * Lower-cased name and category. Together with owner they identify a saved
   * item, so "Milk"/"Dairy" and "milk"/"dairy" are the same one (no duplicates).
   */
  nameKey: string;
  categoryKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const savedItemSchema = new mongoose.Schema<ISavedItem>(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: LIMITS.ITEM_NAME_MAX },
    category: { type: String, trim: true, maxlength: LIMITS.ITEM_CATEGORY_MAX },
    price: { type: Number, min: 0, max: LIMITS.ITEM_PRICE_MAX },
    description: { type: String, trim: true, maxlength: LIMITS.ITEM_DESCRIPTION_MAX },
    nameKey: { type: String, required: true },
    categoryKey: { type: String, default: "" },
  },
  { timestamps: true }
);

// One saved item per owner + name + category (case-insensitive); also the lookup for upserts.
savedItemSchema.index({ owner: 1, nameKey: 1, categoryKey: 1 }, { unique: true });
// The profile list: my saved items, most recently used first.
savedItemSchema.index({ owner: 1, updatedAt: -1 });

export const SavedItem: Model<ISavedItem> =
  (mongoose.models.SavedItem as Model<ISavedItem> | undefined) ??
  mongoose.model<ISavedItem>("SavedItem", savedItemSchema);

/** Keys used for "is this the same saved item?" */
export function savedItemKeys(name: string, category: string | null | undefined) {
  return { nameKey: name.trim().toLowerCase(), categoryKey: (category ?? "").trim().toLowerCase() };
}

export function serializeSavedItem(item: ISavedItem & { _id: Types.ObjectId }): SavedItemDTO {
  return {
    id: String(item._id),
    name: item.name,
    category: item.category ?? null,
    price: item.price ?? null,
    description: item.description ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
