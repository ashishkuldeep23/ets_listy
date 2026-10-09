import type { Types } from "mongoose";
import { Folder } from "@/models/Folder";
import { Item } from "@/models/Item";

// Duplicate-name checks: a user can't have two folders with the same name,
// and a folder can't hold two items with the same name. Case-insensitive,
// so "Milk" and "milk" count as the same.

// Collation compares without case (strength 2), so no regex or extra key field is needed.
const CASE_INSENSITIVE = { locale: "en", strength: 2 } as const;

type Id = string | Types.ObjectId;

/** True if `ownerId` already has a folder called `name` (other than `exceptId`). */
export async function folderNameTaken(ownerId: Id, name: string, exceptId?: Id): Promise<boolean> {
  const filter = { owner: ownerId, name: name.trim(), ...(exceptId && { _id: { $ne: exceptId } }) };
  return Boolean(await Folder.exists(filter).collation(CASE_INSENSITIVE));
}

/** True if folder `folderId` already has an item called `name` (other than `exceptId`). */
export async function itemNameTaken(folderId: Id, name: string, exceptId?: Id): Promise<boolean> {
  const filter = { folder: folderId, name: name.trim(), ...(exceptId && { _id: { $ne: exceptId } }) };
  return Boolean(await Item.exists(filter).collation(CASE_INSENSITIVE));
}

export const folderExistsMessage = (name: string) => `A list named "${name.trim()}" already exists`;
export const itemExistsMessage = (name: string) => `An item named "${name.trim()}" already exists in this list`;
