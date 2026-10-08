import type { Types } from "mongoose";
import { Item } from "@/models/Item";
import type { ItemFieldsInput } from "@/lib/validators";

// Item helpers shared by the item routes and the folder list.

/**
 * Turns validated fields into a Mongo update. `null` means "clear this
 * field", which must be an $unset (setting null would fail the schema's
 * type check for numbers and leave junk for strings).
 */
export function toItemUpdate(fields: ItemFieldsInput) {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ""> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === null) $unset[key] = "";
    else if (value !== undefined) $set[key] = value;
  }
  return { ...(Object.keys($set).length && { $set }), ...(Object.keys($unset).length && { $unset }) };
}

/** { total, done } item counts for one folder. */
export async function countItems(folderId: Types.ObjectId): Promise<{ total: number; done: number }> {
  const [total, done] = await Promise.all([
    Item.countDocuments({ folder: folderId }),
    Item.countDocuments({ folder: folderId, done: true }),
  ]);
  return { total, done };
}

/**
 * Item counts for many folders in ONE query (not one per folder).
 * Folders with no items are missing from the map; treat them as 0.
 */
export async function countItemsByFolder(
  folderIds: Types.ObjectId[]
): Promise<Map<string, { itemCount: number; doneCount: number }>> {
  if (folderIds.length === 0) return new Map();
  const rows = await Item.aggregate<{ _id: Types.ObjectId; itemCount: number; doneCount: number }>([
    { $match: { folder: { $in: folderIds } } },
    {
      $group: {
        _id: "$folder",
        itemCount: { $sum: 1 },
        doneCount: { $sum: { $cond: ["$done", 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), { itemCount: r.itemCount, doneCount: r.doneCount }]));
}
