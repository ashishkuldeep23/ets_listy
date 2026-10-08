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

/** GET /api/folders/:id adds what the caller may do (see lib/access.ts). */
export interface FolderDetailDTO extends FolderDTO {
  role: "owner";
  canCheck: boolean;
  canEdit: boolean;
  canManage: boolean;
}

/** Count of my folders per status, plus "all". */
export type FolderCounts = Record<FolderStatus | "all", number>;

/** Folder card on the home page: the folder plus item progress. */
export interface FolderSummaryDTO extends FolderDTO {
  itemCount: number;
  doneCount: number;
}

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

/** Result of a request-body validator: only allowed fields, or an error. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
