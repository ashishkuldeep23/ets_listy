import mongoose from "mongoose";
import { LIMITS } from "@/lib/limits";
import { DEFAULT_STATUS, STATUS_VALUES } from "@/lib/constants";

// A folder groups a user's items (e.g. "Oct", "Market", "Home").
const folderSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: LIMITS.FOLDER_NAME_MAX },
    status: { type: String, enum: STATUS_VALUES, default: DEFAULT_STATUS },
  },
  { timestamps: true }
);

// Match the home page queries: my folders newest first, optionally by status.
folderSchema.index({ owner: 1, updatedAt: -1 });
folderSchema.index({ owner: 1, status: 1, updatedAt: -1 });

export const Folder = mongoose.models.Folder ?? mongoose.model("Folder", folderSchema);

/**
 * Mongo filter for one status. Folders created before statuses existed
 * have no `status` field and count as the default status.
 */
export function statusFilter(status) {
  return status === DEFAULT_STATUS ? { status: { $in: [DEFAULT_STATUS, null] } } : { status };
}

/** The shape the API sends to clients: no internal fields, `id` instead of `_id`. */
export function serializeFolder(folder) {
  return {
    id: String(folder._id),
    name: folder.name,
    status: folder.status ?? DEFAULT_STATUS,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}
