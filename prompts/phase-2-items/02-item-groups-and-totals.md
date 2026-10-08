# Phase 2 · Feature 2: Group items + price totals

Follow `prompts/_common.md`.

**Needs:** Phase 2.1 (items).
**Commit message:** `listy: phase 2.2 - item groups and totals`

## Goal

Inside a folder, items can be put into groups (e.g. "Vegetables", "Dairy")
and shown group by group. The folder also shows price totals.

## Changes

- `Item` model: add `group` (string, optional, trimmed, max 40). Empty means "Ungrouped".
- Validators and item create/update routes accept `group`.
- `GET /api/folders/[id]/items` also returns `groups`: distinct group names
  in this folder, sorted.

## UI

`/folders/[id]`
- Items shown in sections by group, "Ungrouped" last. Each section header
  shows the group name, `done / total`, and can be collapsed.
- Add/edit item form: a **Group** input with suggestions from existing
  groups (`<datalist>` is enough).
- Move an item to another group from its edit form.
- Rename a group: changes `group` on all its items in one request.
  Add `POST /api/folders/[id]/groups/rename` `{ from, to }`, needs `canEdit`.
- Totals at the bottom: **Total** (all items with a price) and
  **Remaining** (unticked items). Items without a price are skipped and the
  UI says how many have no price.

## Tests

- Validators accept/reject group values.
- API: `groups` list is correct and only from this folder; group rename
  updates only this folder's items; user B cannot rename groups in A's folder (404).
- Pure helper for totals (`lib/totals.js`) with tests, including items without a price.
