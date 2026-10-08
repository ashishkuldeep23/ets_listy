# Phase 3 · Feature 3: "Shared with me" + shared-by name

Follow `prompts/_common.md`.

**Needs:** Phase 3.1 and 3.2.
**Commit message:** `listy: phase 3.3 - shared with me`

## Goal

Users see folders others shared with them in a **Shared with me** section,
with **"Shared by <owner name>"** on each. Items show who ticked them.
A shared user can leave a folder.

## API

- `GET /api/folders?scope=shared`: folders shared with me, each with
  `sharedBy: { id, name }`, my `canCheck`/`canEdit`, and item counts.
  The status filter still works. Default scope stays `"mine"`; unknown scope → 400.
- `GET /api/folders/[id]`: for shared users include `sharedBy` and their permissions.
- `DELETE /api/folders/[id]/shares/[userId]`: also allowed when `userId` is
  the caller themselves ("Leave folder").
- Item responses include `doneBy: { id, name }` (populate only the name,
  never the email).

## UI

- Home: two tabs, **My folders** and **Shared with me** (kept in the URL,
  e.g. `/?tab=shared&status=active`). Shared cards show "Shared by <name>" and
  small badges: View / Tick / Edit.
- Folder page for shared users: "Shared by <name>" under the title and a
  **Leave folder** button (confirm first, then go home).
- `/profile`: a "Shared with me" count with a link to the tab.
- Item rows: when ticked by someone else, show "✓ by <name>".

## Tests

- `scope=shared` returns only folders shared with me, with the right
  `sharedBy.name`, and never folders I own.
- Status filter works together with `scope=shared`.
- Leaving removes access (then 404).
- `doneBy` has a name but no email.
