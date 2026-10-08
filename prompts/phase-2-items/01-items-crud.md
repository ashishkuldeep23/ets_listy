# Phase 2 · Feature 1: Items inside a folder

Follow `prompts/_common.md`.

**Needs:** Phase 1 (auth, folders, status).
**Commit message:** `listy: phase 2.1 - items`

## Goal

Inside a folder the user can add, edit, delete and tick items. Only the
name is required. Category, price and description are optional.

## Data model

`src/models/Item.js`
- `folder`: ObjectId ref Folder, required
- `name`: string, required, trimmed, max 100
- `category`: string, optional, trimmed, max 40
- `price`: number, optional, min 0, max 10,000,000 (rupees)
- `description`: string, optional, trimmed, max 500
- `done`: boolean, default false
- `doneBy`: ObjectId ref User, optional (who ticked it)
- `doneAt`: Date, optional
- `position`: number (sort order)
- `createdBy`: ObjectId ref User
- timestamps
- index `{ folder: 1, position: 1 }`
- Max 1000 items per folder (enforce in the create route).

## API

Every route uses `getFolderAccess`: reading needs any access, ticking needs
`canCheck`, add/edit/delete need `canEdit`. The item must belong to the
folder in the URL, otherwise 404.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/folders/[id]/items` | Sorted by `position`, plus `{ total, done }` counts. |
| POST | `/api/folders/[id]/items` | `{ name, category?, price?, description? }` |
| PATCH | `/api/folders/[id]/items/[itemId]` | Any of the same fields. |
| POST | `/api/folders/[id]/items/[itemId]/toggle` | `{ done: boolean }`. Sets/clears `doneBy` + `doneAt`. Kept separate so Phase 3 can grant "tick only". |
| DELETE | `/api/folders/[id]/items/[itemId]` | |

Also: `DELETE /api/folders/[id]` now deletes the folder's items too (update
the comment left there). `GET /api/folders` returns `itemCount` and
`doneCount` per folder, computed with **one** aggregation, not one query per folder.

## UI

`/folders/[id]`
- Progress "3 / 10 done" with a small bar.
- Item rows: tick box, name, category tag, price (₹ with
  `Intl.NumberFormat("en-IN")`), description in small text, edit and delete.
- **Add item** form: name (required), category, price, description.
- Ticking is optimistic. On failure roll back and show the error.

Home folder cards show `doneCount / itemCount`.

## Tests

- Validators: name required; limits; price must be a real number ≥ 0
  (reject `"12"`, `-1`, `NaN`, `Infinity`); operator objects rejected.
- API: CRUD in own folder; user B gets 404; item from folder A via folder
  B's URL → 404; toggle sets and clears `doneBy`/`doneAt`; deleting a
  folder deletes its items; folder counts correct; item limit enforced.
