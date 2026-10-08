# Phase 2 · Feature 3: Saved items in profile

Follow `prompts/_common.md`.

**Needs:** Phase 2.1 and 2.2 (items, groups).
**Commit message:** `listy: phase 2.3 - saved items`

## Goal

When adding an item, the user can tick **"Save to my profile"** so the item
also goes into their personal **saved items** library. Later, in any folder,
**"Add from saved"** shows the library. Clicking an item adds it straight
away, or **Edit & add** lets them change fields first.

## Data model

`src/models/SavedItem.js`
- `owner`: ObjectId ref User, required, indexed
- `name`, `category`, `price`, `description`: same rules as `Item` (reuse
  the same validator pieces)
- timestamps
- Max 500 per user.
- No exact duplicates: same owner + same name (case-insensitive) + same
  category → update the existing one instead of creating another.

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/saved-items?q=` | Own saved items, optional case-insensitive name search. **Escape regex special characters** in `q`. |
| POST | `/api/saved-items` | Create (from the profile page). |
| PATCH | `/api/saved-items/[id]` | Own only, else 404. |
| DELETE | `/api/saved-items/[id]` | Own only, else 404. |

`POST /api/folders/[id]/items` accepts `saveToProfile: boolean`. When true,
also upsert a SavedItem for **the current user** (not the folder owner).

## UI

- Add item form: **"Save to my profile"** checkbox.
- **Add from saved** button on the folder page: panel with search and the
  saved items. Each one has:
  - **Add**: adds it to this folder as-is (pick a group from a small select).
  - **Edit & add**: fills the add form so the user can change fields before
    adding. The saved item itself changes only if "Save to my profile" is ticked.
- `/profile` page (link in the header): name/email and a **Saved items**
  section with search, add, edit and delete.

## Tests

- API: `saveToProfile` creates a SavedItem; doing it twice doesn't duplicate;
  user B can't see/edit/delete A's saved items (404); search with
  `.*(` doesn't crash and doesn't match everything; limit enforced.
