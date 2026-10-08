import mongoose, { type Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { LIMITS } from "@/lib/limits";
import { SavedItem, savedItemKeys, type ISavedItem } from "@/models/SavedItem";
import type { CreateSavedItemInput, SavedItemFieldsInput } from "@/lib/validators";

// Saving items to a user's profile without creating duplicates.

type SavedItemDoc = ISavedItem & { _id: Types.ObjectId };

/** Splits validated fields into $set / $unset (null = clear the field). */
function toUpdate(fields: SavedItemFieldsInput) {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ""> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === null) $unset[key] = "";
    else if (value !== undefined) $set[key] = value;
  }
  return { $set, $unset };
}

/**
 * Saves an item to `ownerId`'s profile. If they already have one with the
 * same name + category (any case), that one is updated instead of adding a
 * duplicate. Returns null when the library is full and this would be new.
 */
export async function upsertSavedItem(ownerId: string, fields: CreateSavedItemInput): Promise<SavedItemDoc | null> {
  await connectDB();
  const owner = new mongoose.Types.ObjectId(ownerId);
  const keys = savedItemKeys(fields.name, fields.category);
  const filter = { owner, ...keys };

  const exists = await SavedItem.exists(filter);
  if (!exists && (await SavedItem.countDocuments({ owner })) >= LIMITS.SAVED_ITEMS_PER_USER) return null;

  const { $set, $unset } = toUpdate(fields);
  return SavedItem.findOneAndUpdate(
    filter,
    { $set: { ...$set, ...keys }, ...(Object.keys($unset).length && { $unset }) },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true }
  ).lean<SavedItemDoc>();
}

/**
 * Applies an edit to one of `ownerId`'s saved items. Returns "notFound",
 * "duplicate" (the new name + category is already another saved item), or the item.
 */
export async function updateSavedItem(
  ownerId: string,
  id: unknown,
  fields: SavedItemFieldsInput
): Promise<SavedItemDoc | "notFound" | "duplicate"> {
  if (!mongoose.isValidObjectId(id)) return "notFound";
  await connectDB();
  const current = await SavedItem.findOne({ _id: id, owner: ownerId }).lean<SavedItemDoc>();
  if (!current) return "notFound";

  // Recompute the identity keys from the values after this edit.
  const name = fields.name ?? current.name;
  const category = fields.category === undefined ? current.category : fields.category;
  const keys = savedItemKeys(name, category);
  if (await SavedItem.exists({ owner: ownerId, ...keys, _id: { $ne: current._id } })) return "duplicate";

  const { $set, $unset } = toUpdate(fields);
  const updated = await SavedItem.findOneAndUpdate(
    { _id: current._id, owner: ownerId },
    { $set: { ...$set, ...keys }, ...(Object.keys($unset).length && { $unset }) },
    { returnDocument: "after", runValidators: true }
  ).lean<SavedItemDoc>();
  return updated ?? "notFound";
}

/** Escapes text for use inside a RegExp, so a search like ".*(" is matched literally. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
