import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { Folder } from "@/models/Folder";

// THE ONLY PLACE that decides who can do what with a folder.
// Every folder and item route must call getFolderAccess() and check the
// flags it returns. Phase 3 (sharing) extends this function for users a
// folder is shared with; routes should not need other access checks.
//
//   canCheck  – tick / untick items
//   canEdit   – add, edit and delete items
//   canManage – rename, delete and share the folder itself

/**
 * Returns { folder, role, canCheck, canEdit, canManage } or null when the
 * user has no access. Routes answer 404 for null so they never reveal
 * that someone else's folder exists.
 */
export async function getFolderAccess(userId, folderId) {
  if (!mongoose.isValidObjectId(folderId)) return null;

  await connectDB();
  const folder = await Folder.findById(folderId).lean();
  if (!folder) return null;

  if (String(folder.owner) === String(userId)) {
    return { folder, role: "owner", canCheck: true, canEdit: true, canManage: true };
  }
  return null;
}
