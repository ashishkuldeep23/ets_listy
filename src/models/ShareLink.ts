import { randomBytes } from "node:crypto";
import mongoose, { type Model, type Types } from "mongoose";

// A folder's share link (at most one per folder). Anyone logged in who
// opens /share/<token> while it is enabled joins the folder with the
// link's permissions. Resetting the token kills the old URL.

export interface IShareLink {
  folder: Types.ObjectId;
  /** Random, unguessable, URL-safe. Never derived from an id. */
  token: string;
  canCheck: boolean;
  canEdit: boolean;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const shareLinkSchema = new mongoose.Schema<IShareLink>(
  {
    folder: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", required: true, unique: true },
    token: { type: String, required: true, unique: true },
    canCheck: { type: Boolean, default: false },
    canEdit: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const ShareLink: Model<IShareLink> =
  (mongoose.models.ShareLink as Model<IShareLink> | undefined) ??
  mongoose.model<IShareLink>("ShareLink", shareLinkSchema);

/** 24 random bytes → 32 URL-safe characters (192 bits: not guessable). */
export function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Shape check before any DB lookup, so junk tokens are rejected cheaply. */
export function isShareTokenShape(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{32}$/.test(token);
}
