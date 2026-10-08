import mongoose, { type Model, type Types } from "mongoose";

// One row per (folder, user it is shared with). The folder owner never has
// a Share row: owning a folder already gives full access.
// Permissions: viewing is always allowed; canEdit includes canCheck.

export type ShareVia = "email" | "link";

export interface IShare {
  folder: Types.ObjectId;
  /** The folder owner, who shared it (shown as "Shared by …"). */
  owner: Types.ObjectId;
  sharedWith: Types.ObjectId;
  /** May tick / untick items. */
  canCheck: boolean;
  /** May add, edit and delete items (always implies canCheck). */
  canEdit: boolean;
  via: ShareVia;
  createdAt: Date;
  updatedAt: Date;
}

const shareSchema = new mongoose.Schema<IShare>(
  {
    folder: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sharedWith: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    canCheck: { type: Boolean, default: false },
    canEdit: { type: Boolean, default: false },
    via: { type: String, enum: ["email", "link"], required: true },
  },
  { timestamps: true }
);

// A folder is shared with a user at most once; also the access lookup.
shareSchema.index({ folder: 1, sharedWith: 1 }, { unique: true });
// "Shared with me".
shareSchema.index({ sharedWith: 1 });

// Edit includes tick, so a share can never be "edit but not tick".
shareSchema.pre("save", function () {
  if (this.canEdit) this.canCheck = true;
});

export const Share: Model<IShare> =
  (mongoose.models.Share as Model<IShare> | undefined) ?? mongoose.model<IShare>("Share", shareSchema);

export interface PermissionFlags {
  canCheck: boolean;
  canEdit: boolean;
}

/** Edit includes tick. Use this whenever permissions are written. */
export function normalizePermissions(canCheck: boolean, canEdit: boolean): PermissionFlags {
  return { canCheck: canCheck || canEdit, canEdit };
}

/**
 * Applies a partial change to current flags. Turning tick off also turns
 * edit off (edit can't exist without tick); turning edit on turns tick on.
 */
export function mergePermissions(current: PermissionFlags, change: Partial<PermissionFlags>): PermissionFlags {
  if (change.canCheck === false) return { canCheck: false, canEdit: false };
  return normalizePermissions(change.canCheck ?? current.canCheck, change.canEdit ?? current.canEdit);
}
