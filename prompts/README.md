# Listy build prompts

Each phase is a folder. Each file inside a phase folder is **one feature**
and is a complete prompt: paste it into the coding agent (Claude Code,
opened in the `listy/` folder) and it builds, tests and commits that feature.

Run the features **in order** (by phase number, then by file number). Every
prompt starts with a **Needs** line, and the agent stops if a needed feature
is missing.

Shared rules for every prompt (tests, security, commit, "Check it yourself")
are in [`_common.md`](_common.md). The prompts tell the agent to read it, so
you don't need to paste it.

To add a feature later, copy any feature file into the right phase folder,
give it the next number, and change Goal / Data model / API / UI / Tests.

## Phases and features

**Phase 1: Login + Folders** (`phase-1-auth-and-folders/`)
1. `01-auth.md`: sign up, log in, log out, protected pages
2. `02-folders.md`: create / rename / delete / view folders
3. `03-folder-status-and-filter.md`: Active / Pending / Completed label + filter

**Phase 2: Items** (`phase-2-items/`)
1. `01-items-crud.md`: items in a folder (name, category, price, description), tick, progress
2. `02-item-groups-and-totals.md`: group items inside a folder, price totals
3. `03-saved-items.md`: "Save to my profile", "Add from saved", profile page

**Phase 3: Sharing** (`phase-3-sharing/`)
1. `01-share-by-email.md`: share with a user, View / Tick / Edit permissions
2. `02-share-link.md`: share by link, turn off / reset
3. `03-shared-with-me.md`: "Shared with me" tab, "Shared by <name>", leave folder

**Phase 4: Live updates** (`phase-4-realtime/`)
1. `01-pusher-setup.md`: Pusher keys, private channel auth, client hook
2. `02-live-folder-updates.md`: ticks/edits show instantly for everyone
3. `03-live-progress.md`: home page progress updates live for the owner

## Words used in these prompts

Your notes used "list" for two things, so the prompts use fixed names:

- **Folder**: Oct, Sept, Market, Home… Has a name and a status label.
- **Item**: the thing you add with name, category, price, description and a tick box. Lives inside a folder.
- **Group**: an optional name on an item to group items inside a folder (e.g. "Vegetables").
- **Saved item**: an item saved to your profile so you can reuse it in other folders.

## Decisions taken for you (edit the prompt before running if you disagree)

0. **TypeScript** (strict) for all code. Shared API types live in `src/types.ts`.
1. **Login** is email + password, built in-house with `bcryptjs` and `jose`. No Google login yet.
2. **Share permissions**: View is always on, plus two checkboxes: **Can tick items** and **Can edit items**. Edit includes tick.
3. **Share link**: opening it needs login. The opener gets the link's permissions. The owner can turn it off or reset it.
4. **Folder statuses**: Active, Pending, Completed, all in one constants file so more can be added.
5. **Price** is an optional number in rupees (₹), 0 or more.
6. The starter `List` model and `/api/lists` are removed in Phase 1.1.

## Before you start

- `MONGODB_URI` in `.env.local` (copy `.env.example`).
- Phase 1.1 adds `SESSION_SECRET`. The prompt shows how to generate it.
- Phase 4 needs a free Pusher Channels app (pusher.com). Put its keys in `.env.local` first.

## After each feature

The agent runs tests, lint and build, commits only `listy/` files, and
ends with a **"Check it yourself"** list. Walk through it in the browser
(locally with `npm run dev`, or on your deployed URL). The agent never
pushes. You push when you're happy.
