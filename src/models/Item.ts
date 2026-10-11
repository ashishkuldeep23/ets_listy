import mongoose, { type Model, type Types } from "mongoose";
import { LIMITS } from "@/lib/limits";
import type { ItemDTO, UserRef } from "@/types";

// An item inside a folder (e.g. "Milk", ₹60, category "Dairy").
// Only `name` is required; the optional fields are left unset when empty.

export interface IItem {
  folder: Types.ObjectId;
  name: string;
  category?: string;
  price?: number;
  /** What the price is for (e.g. "kg"); only kept while there is a price. */
  priceUnit?: string;
  /** How many; unset = 1. */
  quantity?: number;
  description?: string;
  /** Group name inside the folder; unset = ungrouped. */
  group?: string;
  done: boolean;
  /** Who ticked it; cleared when unticked. */
  doneBy?: Types.ObjectId;
  /** Ticked by someone with the share link who wasn't logged in. */
  doneByGuest?: boolean;
  doneAt?: Date;
  /** Sort order inside the folder (new items go last). */
  position: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const itemSchema = new mongoose.Schema<IItem>(
  {
    folder: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", required: true },
    name: { type: String, required: true, trim: true, maxlength: LIMITS.ITEM_NAME_MAX },
    category: { type: String, trim: true, maxlength: LIMITS.ITEM_CATEGORY_MAX },
    price: { type: Number, min: 0, max: LIMITS.ITEM_PRICE_MAX },
    priceUnit: { type: String, trim: true, maxlength: LIMITS.ITEM_PRICE_UNIT_MAX },
    quantity: { type: Number, min: 0, max: LIMITS.ITEM_QUANTITY_MAX },
    description: { type: String, trim: true, maxlength: LIMITS.ITEM_DESCRIPTION_MAX },
    group: { type: String, trim: true, maxlength: LIMITS.ITEM_GROUP_MAX },
    done: { type: Boolean, default: false },
    doneBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    doneByGuest: { type: Boolean },
    doneAt: { type: Date },
    position: { type: Number, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Matches the folder page query: a folder's items in order.
itemSchema.index({ folder: 1, position: 1 });

export const Item: Model<IItem> =
  (mongoose.models.Item as Model<IItem> | undefined) ?? mongoose.model<IItem>("Item", itemSchema);

/** An item as read from the DB, with `doneBy` optionally populated to { _id, name }. */
export type ItemDoc = Omit<IItem, "doneBy"> & {
  _id: Types.ObjectId;
  doneBy?: Types.ObjectId | { _id: Types.ObjectId; name: string } | null;
};

/** Populate options that load only the name of whoever ticked an item (never the email). */
export const DONE_BY_NAME = { path: "doneBy", select: "name" } as const;

function toUserRef(doneBy: ItemDoc["doneBy"]): UserRef | null {
  if (!doneBy || !("name" in doneBy)) return null;
  return { id: String(doneBy._id), name: doneBy.name };
}

/** Shown as "by Guest" for ticks made through the share link without logging in. */
export const GUEST_USER: UserRef = { id: "guest", name: "Guest" };

/** The shape the API sends to clients. */
export function serializeItem(item: ItemDoc): ItemDTO {
  return {
    id: String(item._id),
    folderId: String(item.folder),
    name: item.name,
    category: item.category ?? null,
    price: item.price ?? null,
    priceUnit: item.price != null ? (item.priceUnit ?? null) : null,
    quantity: item.quantity ?? null,
    description: item.description ?? null,
    group: item.group ?? null,
    done: item.done,
    doneBy: toUserRef(item.doneBy) ?? (item.done && item.doneByGuest ? GUEST_USER : null),
    doneAt: item.doneAt ?? null,
    position: item.position,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
