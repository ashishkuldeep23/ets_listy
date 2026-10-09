// Types shared by the API and the UI. These describe what the API sends
// over the wire (dates arrive as ISO strings in the browser).

import type { FolderStatus } from "@/lib/constants";

/** The logged-in user, as returned by /api/auth/me. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

/** A folder as the API returns it. */
export interface FolderDTO {
  id: string;
  name: string;
  status: FolderStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/** What the caller may do with a folder (see lib/access.ts). */
export interface FolderPermissions {
  role: "owner" | "shared";
  canCheck: boolean;
  canEdit: boolean;
  canManage: boolean;
  /** For shared folders: the owner who shared it. null for my own folders. */
  sharedBy: UserRef | null;
}

/** GET /api/folders/:id */
export interface FolderDetailDTO extends FolderDTO, FolderPermissions {}

/** Count of my folders per status, plus "all". */
export type FolderCounts = Record<FolderStatus | "all", number>;

/** Folder card on the home page: the folder, what I may do, and item progress. */
export interface FolderSummaryDTO extends FolderDTO, FolderPermissions {
  itemCount: number;
  doneCount: number;
}

/** Which folders the home page lists. */
export type FolderScope = "mine" | "shared";

/** GET /api/folders */
export interface FolderListResponse {
  folders: FolderSummaryDTO[];
  counts: FolderCounts;
}

/** A user shown next to something they did (e.g. who ticked an item). Never includes email. */
export interface UserRef {
  id: string;
  name: string;
}

/** One person a folder is shared with, as the owner sees it. */
export interface ShareDTO {
  /** Email is shown to the owner only, who typed it in to share. */
  user: UserRef & { email: string };
  canCheck: boolean;
  canEdit: boolean;
  via: "email" | "link";
}

/** A folder's share link, as the owner sees it. */
export interface ShareLinkDTO {
  url: string;
  canCheck: boolean;
  canEdit: boolean;
  enabled: boolean;
}

/** GET /api/folders/:id/shares */
export interface ShareListResponse {
  shares: ShareDTO[];
  link: ShareLinkDTO | null;
}

/** GET / POST /api/folders/:id/share-link */
export interface ShareLinkResponse {
  link: ShareLinkDTO | null;
}

/** POST /api/share/:token/accept */
export interface AcceptShareResponse {
  folderId: string;
}

/**
 * GET /api/share/:token: what anyone with the link sees, logged in or not.
 * Only the list's name and status plus its items, with `doneBy` always null
 * so no user names reach anonymous visitors.
 */
export interface PublicShareResponse {
  list: Pick<FolderDTO, "name" | "status">;
  items: ItemDTO[];
}

/** An item inside a folder. Optional fields are null when not set. */
export interface ItemDTO {
  id: string;
  folderId: string;
  name: string;
  category: string | null;
  /** Rupees. */
  price: number | null;
  description: string | null;
  /** Group name inside the folder (e.g. "Vegetables"); null = ungrouped. */
  group: string | null;
  done: boolean;
  doneBy: UserRef | null;
  doneAt: string | Date | null;
  position: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/** GET /api/folders/:id/items */
export interface ItemListResponse {
  items: ItemDTO[];
  total: number;
  done: number;
  /** Distinct group names in this folder, sorted. */
  groups: string[];
}

/** An item saved to the user's profile for reuse in any folder. Private to its owner. */
export interface SavedItemDTO {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  description: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/** GET /api/saved-items */
export interface SavedItemListResponse {
  savedItems: SavedItemDTO[];
}

/** folder.progress on a user channel: new counts for one folder card. */
export interface FolderProgressEvent {
  folderId: string;
  itemCount: number;
  doneCount: number;
  /** The folder was deleted: remove the card. */
  deleted?: true;
}

/** folder.access on a user channel: a folder was shared with me, or I lost it. */
export interface FolderAccessEvent {
  folderId: string;
  removed?: true;
}

/** Result of a request-body validator: only allowed fields, or an error. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
