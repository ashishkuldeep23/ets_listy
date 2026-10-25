import mongoose, { type Model, type Types } from "mongoose";
import { LIMITS } from "@/lib/limits";
import { DEFAULT_STATUS, STATUS_VALUES, type FolderStatus } from "@/lib/constants";
import type { FolderDTO } from "@/types";

// A folder groups a user's items (e.g. "Oct", "Market", "Home").

export interface IFolder {
  owner: Types.ObjectId;
  name: string;
  /** Missing on folders saved before statuses existed; read as DEFAULT_STATUS. */
  status?: FolderStatus;
  createdAt: Date;
  updatedAt: Date;
}

const folderSchema = new mongoose.Schema<IFolder>(
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

export const Folder: Model<IFolder> =
  (mongoose.models.Folder as Model<IFolder> | undefined) ?? mongoose.model<IFolder>("Folder", folderSchema);

/**
 * Mongo filter for one status. Folders created before statuses existed
 * have no `status` field and count as the default status.
 */
export function statusFilter(status: FolderStatus) {
  return status === DEFAULT_STATUS ? { status: { $in: [DEFAULT_STATUS, null] } } : { status };
}

/** A folder document as read from the DB (lean or hydrated). */
export type FolderDoc = IFolder & { _id: Types.ObjectId };

/** The shape the API sends to clients: no internal fields, `id` instead of `_id`. */
export function serializeFolder(folder: FolderDoc): FolderDTO {
  return {
    id: String(folder._id),
    name: folder.name,
    status: folder.status ?? DEFAULT_STATUS,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}
