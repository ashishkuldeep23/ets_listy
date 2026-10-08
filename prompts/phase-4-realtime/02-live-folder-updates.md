# Phase 4 · Feature 2: Live item and folder updates

Follow `prompts/_common.md`.

**Needs:** Phase 4.1 (Pusher setup).
**Commit message:** `listy: phase 4.2 - live folder updates`

## Goal

Everyone with a folder open sees changes **instantly, without refreshing**.
For example, B ticks "Milk" in A's shared folder, and A's screen shows it
ticked "✓ by B". The database stays the source of truth. Events only tell
open screens what changed.

## Events on `private-folder-<folderId>`

| Event | Payload | Sent after |
|---|---|---|
| `item.created` | `{ item }` | item create |
| `item.updated` | `{ item }` (with `doneBy: { id, name }`) | item edit, toggle, group rename (one event per item, or `items.updated` with a list) |
| `item.deleted` | `{ itemId }` | item delete |
| `folder.updated` | `{ folder }` | rename / status change |
| `folder.deleted` | `{ folderId }` | folder delete |
| `access.changed` | `{ userId }` | share permissions changed, user removed, user left |

Rules:
- Publish **only after** the DB write succeeds.
- Pass the request's socket id so the sender doesn't get its own event.
- Payloads never contain emails, password hashes or anything not shown in the UI.

## Client: `/folders/[id]`

- Subscribe with `useChannel`.
- Apply created/updated/deleted to local state. Ignore an `item.updated`
  older than what is shown (compare `updatedAt`).
- `folder.updated` → update title/status. `folder.deleted` → message, then go home.
- `access.changed` for me → refetch folder access, and if it's gone show
  "You no longer have access" and go home. If permissions changed, update
  which controls are visible.
- On reconnect after a drop, refetch items once so nothing is missed.

## Tests (mock `pusher`)

- Each route above publishes the right event and payload to the right channel, only on success.
- A failed (400/403/404) request publishes nothing.
- Toggle by shared user B publishes `item.updated` with `doneBy.name` and no email.
- Socket id from the header is passed through.
- A Pusher error does not change the API response.
