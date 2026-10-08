import mongoose, { type Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Folder, type IFolder } from "@/models/Folder";
import { Share } from "@/models/Share";
import { User } from "@/models/User";
import type { FolderPermissions } from "@/types";

// THE ONLY PLACE that decides who can do what with a folder.
// Every folder, item and share route must call getFolderAccess() and check
// the flags it returns; routes must not add their own ownership checks.
//
//   view      – always, for anyone who gets a non-null result
//   canCheck  – tick / untick items
//   canEdit   – add, edit and delete items (includes canCheck)
//   canManage – rename, change status, delete and share the folder (owner only)

export interface FolderAccess extends FolderPermissions {
  folder: IFolder & { _id: Types.ObjectId };
}

/**
 * Returns the folder and what `userId` may do with it, or null when they
 * have no access. Routes answer 404 for null so they never reveal that
 * someone else's folder exists.
 */
export async function getFolderAccess(userId: string, folderId: unknown): Promise<FolderAccess | null> {
  if (!mongoose.isValidObjectId(folderId) || !mongoose.isValidObjectId(userId)) return null;

  await connectDB();
  const folder = await Folder.findById(folderId).lean();
  if (!folder) return null;

  if (String(folder.owner) === String(userId)) {
    return { folder, role: "owner", canCheck: true, canEdit: true, canManage: true, sharedBy: null };
  }

  const share = await Share.findOne({ folder: folder._id, sharedWith: userId }).lean();
  if (!share) return null;

  const owner = await User.findById(folder.owner).select("name").lean();
  return {
    folder,
    role: "shared",
    // Edit always includes tick, even if an old row says otherwise.
    canCheck: share.canCheck || share.canEdit,
    canEdit: share.canEdit,
    canManage: false,
    sharedBy: owner ? { id: String(owner._id), name: owner.name } : null,
  };
}

/** Just the permission flags of an access result, for API responses. */
export function permissionsOf(access: FolderAccess): FolderPermissions {
  const { role, canCheck, canEdit, canManage, sharedBy } = access;
  return { role, canCheck, canEdit, canManage, sharedBy };
}
