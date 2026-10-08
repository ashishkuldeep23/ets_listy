# Phase 1 · Feature 2: Folders CRUD

Follow `prompts/_common.md`.

**Needs:** Phase 1.1 (auth).
**Commit message:** `listy: phase 1.2 - folders`

## Goal

A logged-in user can create, rename, delete and see their own folders
(e.g. "Oct", "Market", "Home"). Folders will hold items in Phase 2.

## Data model

`src/models/Folder.ts`
- `owner`: ObjectId ref User, required
- `name`: string, required, trimmed, max 60
- timestamps
- index `{ owner: 1, updatedAt: -1 }`
- Max 200 folders per user (enforce in the create route). Limits go in `lib/limits.ts`.

## Access helper: `src/lib/access.ts`

`getFolderAccess(userId, folderId)`:
- invalid ObjectId or folder not found → `null`
- owner → `{ folder, role: "owner", canCheck: true, canEdit: true, canManage: true }`
- anyone else → `null`

Comment at the top that this is **the only place** that decides folder
access, and that Phase 3 (sharing) extends it.

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/folders` | Own folders, newest first. |
| POST | `/api/folders` | `{ name }` |
| GET | `/api/folders/[id]` | 404 if not found **or not yours**. |
| PATCH | `/api/folders/[id]` | `{ name }`, needs `canManage`. |
| DELETE | `/api/folders/[id]` | Needs `canManage`. Add a comment marking where later phases also delete the folder's items and shares. |

## Pages

- `/` (home): "New folder" form, folder cards in a grid (name, last updated).
  Each card: open, rename (inline), delete (confirm first).
- `/folders/[id]`: folder page shell with the name, a back link and a
  "Items coming in the next phase" placeholder. Not yours / not found → 404 page.

## Tests

- Validators for folder create/update.
- `getFolderAccess`: owner, stranger, bad id.
- API: CRUD works for owner; user B gets 404 on A's folder for GET, PATCH
  and DELETE; logged out → 401; invalid id → 404; folder limit enforced.
