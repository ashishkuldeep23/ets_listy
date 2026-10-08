# Phase 3 · Feature 1: Share a folder by email + permissions

Follow `prompts/_common.md`.

**Needs:** Phase 1 and Phase 2.
**Commit message:** `listy: phase 3.1 - share by email`

## Goal

The folder owner shares a folder with another Listy user by email and
picks permissions:

- **View**: always on (shown as a ticked, disabled checkbox)
- **Can tick items**
- **Can edit items** (add / edit / delete). Ticking this also ticks "Can tick items".

The owner can change permissions or remove a person. Only the owner can
rename, change status, delete or share the folder.

## Data model

`src/models/Share.js`
- `folder`: ObjectId ref Folder, required
- `owner`: ObjectId ref User, required (who shared it)
- `sharedWith`: ObjectId ref User, required
- `canCheck`: boolean, default false
- `canEdit`: boolean, default false. If true, `canCheck` is forced true.
- `via`: `"email"` | `"link"`
- timestamps
- unique `{ folder: 1, sharedWith: 1 }`, index `{ sharedWith: 1 }`

## Update `getFolderAccess`

- Owner → unchanged (`canManage: true`).
- Has a Share → `{ folder, role: "shared", canCheck, canEdit, canManage: false, sharedBy: { id, name } }`.
- Otherwise → `null`.

This is the **only** change needed for item routes, since they already check
`canCheck`/`canEdit`. Verify with tests that they do. Folder PATCH/DELETE
must require `canManage` (403 for shared users).

## API (all owner-only, `canManage`)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/folders/[id]/shares` | `[{ user: { id, name, email }, canCheck, canEdit, via }]` |
| POST | `/api/folders/[id]/shares` | `{ email, canCheck?, canEdit? }`. Unknown email → 404 "No Listy user with this email". Yourself → 400. Already shared → update permissions. Max 50 shares per folder. |
| PATCH | `/api/folders/[id]/shares/[userId]` | `{ canCheck?, canEdit? }` |
| DELETE | `/api/folders/[id]/shares/[userId]` | Remove. |

`DELETE /api/folders/[id]` also deletes its shares.

## UI

`/folders/[id]`, for the owner: a **Share** button opening a panel with:
- email input + the three checkboxes + Share button
- list of people with editable checkboxes and a Remove button

For a shared user the page shows only what they're allowed to use: no tick
boxes without `canCheck`; no add/edit/delete without `canEdit`; never
rename/status/delete/share.

## Tests

Users A (owner), B, C:
- View-only B: can GET folder + items; toggle → 403; add/edit/delete → 403.
- B with `canCheck`: toggle OK, add still 403.
- B with `canEdit`: add/edit/delete OK, and `canCheck` is stored as true.
- B can never rename, change status, delete, share or change permissions (403).
- C gets 404 everywhere.
- Removing B removes access immediately.
- Deleting the folder removes its shares.
