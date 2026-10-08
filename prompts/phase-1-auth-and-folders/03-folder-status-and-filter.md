# Phase 1 · Feature 3: Folder status label + filter

Follow `prompts/_common.md`.

**Needs:** Phase 1.2 (folders).
**Commit message:** `listy: phase 1.3 - folder status and filter`

## Goal

Every folder has a status label: **Active**, **Pending** or **Completed**.
The user can change it and filter the home page by status. More statuses
will be added later, so adding one must only need a change in one file.

## Changes

`src/lib/constants.ts`
```js
// Add a new status here only; validators, schema and UI all read from this.
// `badge` holds theme-token classes (see the UI theme section in CLAUDE.md).
export const FOLDER_STATUSES = [
  { value: "active", label: "Active", badge: "border-accent text-accent" },
  { value: "pending", label: "Pending", badge: "border-primary text-primary" },
  { value: "completed", label: "Completed", badge: "border-border text-muted" },
];
```

- `Folder` model: add `status` (string, enum from the constants, default `"active"`),
  and index `{ owner: 1, status: 1, updatedAt: -1 }`.
  Existing folders without a status must read as `"active"`.
- Validators: `status` optional on create and update, must be a known value.
- `GET /api/folders?status=pending`: optional filter, unknown value → 400.
- `POST /api/folders` and `PATCH /api/folders/[id]` accept `status`.

## UI

- Status badge (outlined, using the `badge` classes) on each folder card and on the folder page.
- Status select in the "New folder" form and a quick status changer on each card.
- Filter chips on home: **All / Active / Pending / Completed**, with a count
  on each. The chosen filter is kept in the URL (`/?status=pending`) so
  refresh and back button work.

## Tests

- Validators accept every status in the constants and reject others,
  including `{ "$ne": null }`.
- API: filter returns only matching folders, and only the user's own;
  unknown status → 400; default status is `"active"`.
