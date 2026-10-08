// App-wide constants shared by the server and the browser.

// Folder status labels. Add a new status here only: the schema, validators,
// filter chips and badges all read from this list.
// `badge` holds theme-token classes (see "UI theme" in CLAUDE.md).
export const FOLDER_STATUSES = [
  { value: "active", label: "Active", badge: "border-accent text-accent" },
  { value: "pending", label: "Pending", badge: "border-primary text-primary" },
  { value: "completed", label: "Completed", badge: "border-border text-muted" },
] as const;

export type FolderStatus = (typeof FOLDER_STATUSES)[number]["value"];
export type FolderStatusInfo = (typeof FOLDER_STATUSES)[number];

export const STATUS_VALUES: readonly FolderStatus[] = FOLDER_STATUSES.map((s) => s.value);
/** The first status in the list is the default for new (and old, unlabelled) folders. */
export const DEFAULT_STATUS: FolderStatus = FOLDER_STATUSES[0].value;

/** True for a known folder status (also narrows the type). */
export function isFolderStatus(value: unknown): value is FolderStatus {
  return typeof value === "string" && (STATUS_VALUES as readonly string[]).includes(value);
}

/** Looks up a status by value, falling back to the default for unknown/missing ones. */
export function getStatus(value: unknown): FolderStatusInfo {
  return FOLDER_STATUSES.find((s) => s.value === value) ?? FOLDER_STATUSES[0];
}
