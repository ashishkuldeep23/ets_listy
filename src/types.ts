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

/** GET /api/folders/:id adds the caller's role. */
export interface FolderDetailDTO extends FolderDTO {
  role: "owner";
}

/** Count of my folders per status, plus "all". */
export type FolderCounts = Record<FolderStatus | "all", number>;

/** GET /api/folders */
export interface FolderListResponse {
  folders: FolderDTO[];
  counts: FolderCounts;
}

/** Result of a request-body validator: only allowed fields, or an error. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
