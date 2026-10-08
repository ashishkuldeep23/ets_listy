import mongoose, { type Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Folder, type IFolder } from "@/models/Folder";
import { Share, type IShare } from "@/models/Share";
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

/** Permissions for a folder I own. */
export const OWNER_PERMISSIONS: FolderPermissions = {
  role: "owner",
  canCheck: true,
  canEdit: true,
  canManage: true,
  sharedBy: null,
};

/** What a Share row allows. Edit always includes tick, even if an old row says otherwise. */
function sharePermissions(share: Pick<IShare, "owner" | "canCheck" | "canEdit">, ownerName?: string): FolderPermissions {
  return {
    role: "shared",
    canCheck: share.canCheck || share.canEdit,
    canEdit: share.canEdit,
    canManage: false,
    sharedBy: ownerName ? { id: String(share.owner), name: ownerName } : null,
  };
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

  if (String(folder.owner) === String(userId)) return { folder, ...OWNER_PERMISSIONS };

  const share = await Share.findOne({ folder: folder._id, sharedWith: userId }).lean();
  if (!share) return null;

  const owner = await User.findById(folder.owner).select("name").lean();
  return { folder, ...sharePermissions(share, owner?.name) };
}

/** Just the permission flags of an access result, for API responses. */
export function permissionsOf(access: FolderAccess): FolderPermissions {
  const { role, canCheck, canEdit, canManage, sharedBy } = access;
  return { role, canCheck, canEdit, canManage, sharedBy };
}

/**
 * Every folder shared with `userId` and what they may do with each, for the
 * "Shared with me" list. Same rules as getFolderAccess(), done in bulk.
 * Keyed by folder id.
 */
export async function sharedWithUser(userId: string): Promise<Map<string, FolderPermissions>> {
  if (!mongoose.isValidObjectId(userId)) return new Map();
  await connectDB();
  const shares = await Share.find({ sharedWith: userId }).lean();
  const owners = await User.find({ _id: { $in: shares.map((s) => s.owner) } })
    .select("name")
    .lean();
  const ownerName = new Map(owners.map((o) => [String(o._id), o.name]));

  return new Map(shares.map((s) => [String(s.folder), sharePermissions(s, ownerName.get(String(s.owner)))]));
}
