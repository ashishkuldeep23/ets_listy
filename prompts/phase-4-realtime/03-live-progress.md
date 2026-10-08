# Phase 4 · Feature 3: Live progress on the home page

Follow `prompts/_common.md`.

**Needs:** Phase 4.2 (live folder updates).
**Commit message:** `listy: phase 4.3 - live progress`

## Goal

The owner (and every shared user) sees each folder's progress
("7 / 10 done") update live on the home page, without opening the folder.
That way the owner knows how much has been completed.

## Server

- `publishFolderProgress(folderId)` in `lib/realtime.ts`: computes
  `{ itemCount, doneCount }` with one query and sends
  `folder.progress` → `{ folderId, itemCount, doneCount }` on
  `private-user-<id>` to the owner **and** every shared user.
- Call it after item create, delete, toggle, and folder delete (send
  `itemCount: 0` with a `deleted: true` flag so cards disappear).
- When a folder is shared with or removed from someone, send them
  `folder.access` → `{ folderId, removed?: true }` on their user channel so
  their "Shared with me" tab adds or removes the card.

## Client: `/`

- Subscribe to `private-user-<myId>`.
- `folder.progress` → update that card's counts and progress bar.
  If `doneCount === itemCount > 0`, show a small "All done" tick on the card.
- `folder.access` → refetch the "Shared with me" list.
- Folder page progress bar also updates from item events (already there from 4.2).

## Tests (mock `pusher`)

- B toggles an item in A's folder → `folder.progress` sent to A and B with correct counts.
- Folder with 3 shared users → each gets the event; a stranger never does.
- Share added/removed → `folder.access` sent to that user only.
- Folder delete → `deleted: true` progress sent.
