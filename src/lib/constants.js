// App-wide constants shared by the server and the browser.

// Folder status labels. Add a new status here only: the schema, validators,
// filter chips and badges all read from this list.
// `badge` holds theme-token classes (see "UI theme" in CLAUDE.md).
export const FOLDER_STATUSES = [
  { value: "active", label: "Active", badge: "border-accent text-accent" },
  { value: "pending", label: "Pending", badge: "border-primary text-primary" },
  { value: "completed", label: "Completed", badge: "border-border text-muted" },
];

export const STATUS_VALUES = FOLDER_STATUSES.map((s) => s.value);
export const DEFAULT_STATUS = "active";

/** Looks up a status by value, falling back to the default for unknown/missing ones. */
export function getStatus(value) {
  return FOLDER_STATUSES.find((s) => s.value === value) ?? FOLDER_STATUSES.find((s) => s.value === DEFAULT_STATUS);
}
