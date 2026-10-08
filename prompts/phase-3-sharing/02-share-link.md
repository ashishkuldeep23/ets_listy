# Phase 3 · Feature 2: Share by link

Follow `prompts/_common.md`.

**Needs:** Phase 3.1 (share by email).
**Commit message:** `listy: phase 3.2 - share link`

## Goal

The owner can create a share link for a folder. Any logged-in user who opens
it gets the folder in their "Shared with me", with the permissions set on the
link. The owner can turn the link off or reset it.

## Data model

`src/models/ShareLink.js`
- `folder`: ObjectId ref Folder, required, unique (one link per folder)
- `token`: string, required, unique. Generate with
  `crypto.randomBytes(24).toString("base64url")`. Never derive it from an id.
- `canCheck`, `canEdit`: same rule as Share (edit forces check)
- `enabled`: boolean, default true
- timestamps

## API

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/api/folders/[id]/share-link` | owner | Current link or `null`. Include it in the shares GET too. |
| POST | `/api/folders/[id]/share-link` | owner | Create or update `{ canCheck?, canEdit?, enabled? }`. Returns the full URL. |
| POST | `/api/folders/[id]/share-link/reset` | owner | New token, so the old link stops working. Existing shares stay. |
| POST | `/api/share/[token]/accept` | any logged-in user | Valid + enabled → create/update the caller's Share with the link's permissions, `via: "link"`, return `{ folderId }`. Owner using own link → just `{ folderId }`. Invalid/disabled → 404. Rate-limited (reuse `lib/rateLimit.js`). |

`DELETE /api/folders/[id]` also deletes the link.

## Pages

- `/share/[token]`:
  - Logged out → `/login?next=/share/<token>` (use `lib/safeRedirect.js`).
  - Logged in → accept, then redirect to `/folders/[id]`.
  - Invalid or disabled → friendly "This link is not valid or was turned off" page.
- Owner's Share panel gets a **Link** section: Copy link button, the two
  permission checkboxes, an on/off toggle, and Reset link (confirm first).

## Tests

- Token is long and URL-safe; two links never share a token.
- C accepts → gets exactly the link's permissions.
- Disabled link → 404; reset → old token 404, new one works.
- Logged-out accept → 401.
- Only the owner can create, change or reset the link (shared user → 403, stranger → 404).
