@AGENTS.md

# Listy: agent guide

Listy is a simple list-making web app. It is one Next.js project: the UI and
the API live together, and data is stored in MongoDB.

Keep it simple. Do not add a new library, service or pattern unless the task
actually needs it. Ask the user first before adding anything heavy (state
managers, ORMs other than Mongoose, UI kits, queues, Docker, microservices).

## Stack

- Next.js 16 (App Router), React 19, **TypeScript** (strict; no plain `.js` source files)
- Tailwind CSS v4
- MongoDB + Mongoose
- Vitest for unit tests

Next.js 16 differs from older versions (for example, route `params` are
async). Read `node_modules/next/dist/docs/` before using a Next API you are
not sure about.

## Commands

```bash
npm run dev     # start dev server at http://localhost:3000
npm test        # unit + API tests once (API tests use an in-memory MongoDB)
npm run typecheck # tsc --noEmit (also covers tests)
npm run lint    # ESLint
npm run build   # production build (type-checks too): run before calling work done
```

Setup: copy `.env.example` to `.env.local` and set `MONGODB_URI` and
`SESSION_SECRET`.

Feature prompts for upcoming work live in `prompts/` (start with
`prompts/README.md` and `prompts/_common.md`).

## Project layout

```
src/
  types.ts                   # shared API types: SessionUser, FolderDTO, Result<T>, …
  proxy.ts                   # Next 16 "proxy" (was middleware): page redirects for login
  app/
    page.tsx                 # home page
    login/, signup/          # auth pages (use components/AuthForm.tsx)
    folders/[id]/page.tsx    # one folder (components/FolderView.tsx)
    api/auth/signup|login|logout|me/route.ts
    api/folders/route.ts     # GET ?scope=mine|shared&status= (+ counts, perms, progress), POST create
    api/folders/[id]/route.ts # GET (+ canCheck/canEdit/canManage), PATCH, DELETE (+ its items)
    api/folders/[id]/items/route.ts              # GET items + counts, POST (canEdit)
    api/folders/[id]/items/[itemId]/route.ts     # PATCH, DELETE (canEdit)
    api/folders/[id]/items/[itemId]/toggle/route.ts # POST { done } (canCheck)
    api/folders/[id]/groups/rename/route.ts      # POST { from, to } (canEdit)
    api/folders/[id]/shares/route.ts             # GET, POST { email, canCheck, canEdit } (canManage)
    api/folders/[id]/shares/[userId]/route.ts    # PATCH perms (canManage), DELETE (canManage, or self = leave)
    api/folders/[id]/share-link/route.ts         # GET, POST { canCheck, canEdit, enabled } (canManage)
    api/folders/[id]/share-link/reset/route.ts   # POST: new token (canManage)
    api/share/[token]/accept/route.ts            # POST: join via link (logged in, rate-limited)
    share/[token]/page.tsx   # opens a share link (components/AcceptShare.tsx)
    api/saved-items/route.ts                     # GET ?q= (my saved items), POST (upsert)
    api/saved-items/[id]/route.ts                # PATCH (409 on duplicate), DELETE
    profile/page.tsx         # my profile + saved items (components/ProfileView.tsx)
  components/
    Header.tsx               # top bar with user name + Logout
    AuthForm.tsx             # shared login/signup form
    FolderList.tsx           # home: tabs My folders / Shared with me (?tab=shared), status chips
    FolderView.tsx           # folder page body
    StatusBadge.tsx          # folder status label
    ProgressBar.tsx          # "3 / 10 done" bar
    ItemForm.tsx             # add / edit item (name required, rest optional)
    ItemRow.tsx              # one item: tick, details, edit, delete
    GroupSection.tsx         # collapsible group of items + rename
    SavedItemPicker.tsx      # "Add from saved" panel (Add / Edit & add)
    SharePanel.tsx           # owner: share by email, people + permissions
    PermissionCheckboxes.tsx # View (always) / Can tick / Can edit
    AcceptShare.tsx          # /share/[token] body
    ProfileView.tsx          # profile page body
  hooks/
    useSavedItems.ts         # debounced saved-items search, shared by picker + profile
  lib/
    db.ts          # cached Mongoose connection: always use connectDB()
    session.ts     # sign/verify session JWT (jose); no DB, used by proxy.ts
    auth.ts        # hashPassword, getSessionUser, requireUser, session cookie
    access.ts      # getFolderAccess() (one folder) + sharedWithUser() (bulk): the ONLY permission logic
    shares.ts      # listShares(), getShareLink(), serializeShareLink() for the owner view
    constants.ts   # FOLDER_STATUSES: add new statuses here only
    apiClient.ts   # apiFetch<T>() + ApiError: browser fetch wrapper, use for all UI calls
    items.ts       # toItemUpdate() (null → $unset), countItems(), countItemsByFolder()
    format.ts      # formatRupees()
    totals.ts      # computeTotals() (in paise), groupItems() (A–Z, ungrouped last)
    savedItems.ts  # upsertSavedItem() (no duplicates, limit), updateSavedItem(), escapeRegex()
    rateLimit.ts   # in-memory rate limiter (per process only)
    safeRedirect.ts # safeNextPath() for ?next= redirects
    limits.ts      # size limits shared by validators and schemas
    validators.ts  # request body validation
    http.ts        # jsonError / readJson / serverError / tooManyRequests
  models/
    User.ts        # passwordHash is select:false
    Folder.ts      # + serializeFolder(), statusFilter() (missing status = active)
    Item.ts        # + serializeItem(); populate DONE_BY_NAME for doneBy (name only)
    SavedItem.ts   # private per user; unique owner+nameKey+categoryKey (case-insensitive)
    Share.ts       # folder + sharedWith (unique), canCheck/canEdit; normalize/mergePermissions()
    ShareLink.ts   # one per folder; random 32-char token (newShareToken), enabled flag
  test/
    setup.ts       # setupTestDb(), makeRequest(), routeCtx(), json<T>(), createUserAndCookie()
```

## How to write code

- Match the existing style: small functions, named exports, `.ts` for logic
  and `.tsx` only for files with JSX.
- TypeScript is strict. No `any` (use `unknown` and narrow it), no `@ts-ignore`,
  and avoid `as` casts except at a trust boundary (e.g. parsing an API
  response in the browser). Request bodies arrive as `unknown` and become
  typed only through a validator returning `Result<T>`.
- Types sent over the API (DTOs) live in `src/types.ts` and are used by both
  routes and components. Mongoose models declare an `I<Model>` interface and
  `new Schema<I<Model>>()`, and expose a `serialize<Model>()` that returns the DTO.
- Dynamic route handlers type their context as `RouteContext<"/api/…/[id]">`.
- Comments explain **why**, not what. Add a short comment at the top of each
  new file saying what it is for, and on any non-obvious line.
- API routes follow this order: parse JSON with `readJson` → validate →
  `connectDB()` → query → respond. Wrap DB work in `try/catch` and use
  `serverError(err)` for unexpected errors.
- Error responses are always `{ error: "message" }` with the correct status
  (400 bad input, 404 not found, 500 unexpected).
- New limits go in `lib/limits.ts` and are used by both the validator and
  the schema.

## UI theme

- Dark only. **Primary = golden** (main buttons, brand, key numbers),
  **accent = cyan** (links, focus rings, highlights, "live"/active states).
- All colours are tokens in `src/app/globals.css` (`@theme`). Use their
  classes: `bg-bg`, `bg-surface`, `bg-surface-2`, `border-border`, `text-fg`,
  `text-muted`, `bg-primary`/`text-primary`, `text-on-primary`,
  `text-accent`/`border-accent`, `text-danger`.
- Never use raw hex values or Tailwind palette colours (`zinc-500`,
  `red-600`, …) and never use `dark:` variants. Add a token instead.
- Reuse the component classes from `globals.css`: `btn-primary`,
  `btn-secondary`, `btn-ghost`, `input`, `card`, `link`.

## How to test

- Every new validator or pure helper in `src/lib/` gets a `*.test.ts` file
  next to it. Cover the happy path, each rejection, and bad-type input.
- API tests call route handlers directly. Use `setupTestDb()`, `makeRequest()`
  `routeCtx()`, `json<T>()` and `createUserAndCookie()` from `src/test/setup.ts` (see
  `src/app/api/auth/auth.test.ts`). Always test "another user can't do this".
- Run the full check once after a batch of changes, not after every edit:
  `npm run typecheck && npm test && npm run lint && npm run build`.
- Report results honestly: if anything fails, show the output and fix it
  before saying the task is done.

## Security rules (must follow)

1. **Validate every request body** with a function in `lib/validators.ts`.
   Copy only the allowed fields; never pass `request.json()` straight into
   Mongoose (`create`, `update`, `find`). This also blocks NoSQL injection
   like `{ "title": { "$gt": "" } }`.
2. **Check ids** with `mongoose.isValidObjectId` before querying.
3. **Never leak internals.** Clients get generic messages; real errors go to
   `console.error` on the server only. No stack traces, no DB messages.
4. **Secrets live in `.env.local` only.** Never hard-code or commit them,
   never log them, and never expose them through `NEXT_PUBLIC_*` vars.
   Add every new env var (with an empty value) to `.env.example`.
5. **No raw HTML from users.** Do not use `dangerouslySetInnerHTML` on user
   data. React escapes text by default, so keep it that way.
6. **Limit sizes** of every string and array (see `lib/limits.ts`). User text
   used in a `$regex` must go through `escapeRegex()` first.
7. **Every API route except `/api/auth/*` starts with `requireUser(request)`**
   and scopes its queries to that user. `src/proxy.ts` only redirects pages;
   it is not an API guard. Never return `passwordHash`, and keep auth
   failures vague ("Invalid email or password").
   Sharing is decided **only** inside `getFolderAccess()` (owner, or a Share
   row). Edit always includes tick: write permissions via
   `normalizePermissions()`. Only `UserRef` (id + name) is sent about other
   people; the owner's share list is the one place emails appear.
   Folder and item routes decide access **only** via `getFolderAccess()`
   (null → 404, missing flag → 403). Item queries always filter by the
   folder from the URL too, so an item can't be reached through another folder. Send API data through `serialize*()`
   helpers so internal fields (like `owner`) don't leak.
8. Run `npm audit --omit=dev` after adding dependencies and report any
   production vulnerabilities.
9. Security headers are set in `next.config.mjs`. Do not remove them.

Before finishing any task that touches the API, re-read rules 1–6 against
the changed code.
