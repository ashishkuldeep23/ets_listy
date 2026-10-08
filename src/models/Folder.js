import mongoose from "mongoose";
import { LIMITS } from "@/lib/limits";

// A folder groups a user's items (e.g. "Oct", "Market", "Home").
const folderSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: LIMITS.FOLDER_NAME_MAX },
  },
  { timestamps: true }
);

// Matches the home page query: my folders, newest first.
folderSchema.index({ owner: 1, updatedAt: -1 });

export const Folder = mongoose.models.Folder ?? mongoose.model("Folder", folderSchema);

/** The shape the API sends to clients: no internal fields, `id` instead of `_id`. */
export function serializeFolder(folder) {
  return {
    id: String(folder._id),
    name: folder.name,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}
