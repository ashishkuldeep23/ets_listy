import type { Types } from "mongoose";
import { Item } from "@/models/Item";
import { Folder, type FolderDoc } from "@/models/Folder";
import { CASE_INSENSITIVE } from "@/lib/duplicates";
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

/**
 * The folder's own spelling of `group` if it already has that group in any
 * case ("vegetables" → "Vegetables"), so one group never splits into two.
 * Items in `exceptGroup` (a group being renamed) or `exceptItemId` (the item
 * being edited) don't count, so a case-only change of your own is kept.
 */
export async function existingGroupName(
  folderId: Types.ObjectId,
  group: string,
  { exceptGroup, exceptItemId }: { exceptGroup?: string; exceptItemId?: string } = {}
): Promise<string> {
  const found = await Item.findOne({
    folder: folderId,
    group: exceptGroup === undefined ? group : { $eq: group, $ne: exceptGroup },
    ...(exceptItemId && { _id: { $ne: exceptItemId } }),
  })
    .collation(CASE_INSENSITIVE)
    .select("group")
    .lean();
  return found?.group ?? group;
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

/**
 * Moves the folder to "completed" once every item is done (ticked or not
 * found). Returns the updated folder, or null when nothing changed (not all
 * done, empty, or already completed), so callers publish only real changes.
 */
export async function completeFolderIfAllDone(folderId: Types.ObjectId): Promise<FolderDoc | null> {
  const { total, done } = await countItems(folderId);
  if (total === 0 || done < total) return null;
  return Folder.findOneAndUpdate(
    { _id: folderId, status: { $ne: "completed" } },
    { $set: { status: "completed" } },
    { returnDocument: "after" }
  ).lean<FolderDoc>();
}
