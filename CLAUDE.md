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
- lucide-react for icons
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
`SESSION_SECRET`. The four Pusher vars are optional: without them the app
works with no live updates. `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` add
Google login; `ONLY_LOGIN_WITH_GOOGLE=true` turns password login and signup off.
Reminder notifications need the three `VAPID` vars, `CRON_SECRET`, a production
build (the service worker) and a scheduler calling `/api/cron/reminders` every minute.

Offline: `public/sw.js` (service worker, production only) caches pages and,
via `public/sw-sync.js`, sends offline changes with Background Sync when no
tab is open. `sw-sync.js` is plain JS that repeats `syncAllOffline()` in
`src/lib/offlineSync.ts`: change both together (tests: `src/lib/swSync.test.ts`).

Instant UI: list and item changes on `FolderView`/`FolderList` are never awaited.
They go into the offline store first (same queue as offline use), then
`requestSyncNow()` makes `OfflineStatus` send them in the background. Failures stay
queued and retry; refusals are undone and shown in the header pill.

Feature prompts for upcoming work live in `prompts/` (start with
`prompts/README.md` and `prompts/_common.md`).

## Project layout

```
src/
  types.ts                   # shared API types: SessionUser, FolderDTO, Result<T>, …
  proxy.ts                   # Next 16 "proxy" (was middleware): page redirects for login
  app/
    manifest.ts              # PWA manifest (icons in public/icons/); public/sw.js makes it work offline
    page.tsx                 # home page
    login/, signup/          # auth pages (use components/AuthForm.tsx)
    folders/[id]/page.tsx    # one folder (components/FolderView.tsx)
    api/auth/signup|login|logout|me/route.ts  # me: GET, PATCH { name } (email can't change)
    api/auth/google/route.ts, google/callback/route.ts # Google login (state cookie, then session)
    api/folders/route.ts     # GET ?scope=mine|shared&status= (+ counts, perms, progress), POST create
    api/folders/[id]/route.ts # GET (+ canCheck/canEdit/canManage), PATCH, DELETE (+ its items)
    api/folders/[id]/reminder/route.ts           # GET, PUT { remindAt }, DELETE: MY reminder (any member)
    api/push/subscription/route.ts               # POST, DELETE { endpoint }: this device's notifications
    api/cron/reminders/route.ts                  # GET: sends due reminders (Bearer CRON_SECRET, not a user)
    api/folders/[id]/items/route.ts              # GET items + counts, POST (canEdit)
    api/folders/[id]/items/[itemId]/route.ts     # PATCH, DELETE (canEdit)
    api/folders/[id]/items/[itemId]/toggle/route.ts # POST { done } (canCheck)
    api/folders/[id]/groups/rename/route.ts      # POST { from, to } (canEdit); from: null = name the ungrouped items
    api/folders/[id]/shares/route.ts             # GET, POST { email, canCheck, canEdit } (canManage)
    api/folders/[id]/shares/[userId]/route.ts    # PATCH perms (canManage), DELETE (canManage, or self = leave)
    api/folders/[id]/share-link/route.ts         # GET, POST { canCheck, canEdit, enabled } (canManage)
    api/folders/[id]/share-link/reset/route.ts   # POST: new token (canManage)
    api/share/[token]/route.ts                   # GET: PUBLIC read-only view (no login, rate-limited, doneBy hidden)
    api/share/[token]/accept/route.ts            # POST: join via link (logged in, rate-limited)
    api/share/[token]/items/[itemId]/toggle/route.ts # POST { done }: tick via link, no login (link canCheck, rate-limited, live "by Guest")
    api/pusher/auth/route.ts                     # private channel auth (folder: getFolderAccess, user: self)
    api/folders/[id]/presence/route.ts           # POST heartbeat / { leave } → who has the list open (any member)
    api/folders/[id]/chat/route.ts               # GET ?after=, POST { text } (any member; send needs 2+ here)
    api/share/[token]/presence|chat/route.ts     # same for guests: no login, x-listy-guest header, rate-limited
    api/chat/recent/route.ts                     # GET ?after=: new messages in my lists (toast fallback without Pusher)
    share/[token]/page.tsx   # open to everyone: logged in → join; guest → PublicListView (read-only)
    api/saved-items/route.ts                     # GET ?q= (my saved items), POST (upsert)
    api/saved-items/[id]/route.ts                # PATCH (409 on duplicate), DELETE
    api/users/search/route.ts                    # GET ?q= (name/email prefix, max 8, not me; invite box)
    profile/page.tsx         # my profile + saved items (components/ProfileView.tsx)
  components/
    Header.tsx               # top bar: avatar + first name (→ profile), Logout, ChatToasts
    Avatar.tsx               # round initial "logo" (+ initialOf, firstNameOf)
    ReminderButton.tsx       # clock button + popup on a list: set / remove my reminder, add to calendar
    ListChat.tsx             # bottom-right chat button + panel on a list (members + guests), presence heartbeat
    ChatToasts.tsx           # toasts for new messages in my lists, except on that list's own page
    ViewersButton.tsx        # "N viewing" pill; tap → who is here (name + email for members, guests "Anonymous")
    AuthForm.tsx             # shared login/signup form (AuthPage.tsx: server part, reads the env)
    FolderList.tsx           # home: tabs My folders / Shared with me (?tab=shared), status chips, "Keep all lists offline";
                             #   offline: cached cards, new lists, rename/status/delete queued, ?list= opens a copy in place
    FolderView.tsx           # folder page body
    StatusBadge.tsx          # folder status label + icon (STATUS_ICONS, one per status)
    ErrorText.tsx            # red error line with alert icon (use for every error message)
    Loading.tsx              # spinner + "Loading…"
    ProgressBar.tsx          # "3 / 10 done" bar
    ItemForm.tsx             # add / edit item (name required, rest optional)
    ItemRow.tsx              # one item: tick, details, edit, delete
    GroupSection.tsx         # collapsible group of items + rename
    Combobox.tsx             # input + suggestion dropdown (groups, price units, people)
    SavedItemPicker.tsx      # "Add from saved" panel (Add / Edit & add)
    SharePanel.tsx           # owner: share by email, people + permissions
    PermissionCheckboxes.tsx # View (always) / Can tick / Can edit
    AcceptShare.tsx          # /share/[token] body (join, or read-only view for guests)
    PublicListView.tsx       # guest read-only list + Log in / Sign up prompt
    LiveDot.tsx              # header "Live" indicator (hidden if Pusher is off)
    SaveOfflineButton.tsx    # "Save offline" on a list (folder + share page); keeps the copy fresh, reloads after a sync;
                             #   just a label while "Keep all lists offline" is on
    OfflineListView.tsx      # a list with no internet (saved copy or made offline): add (also from saved), edit, delete,
                             #   tick, not found, rename group; auto-retry
    InstallButton.tsx        # header "Install app" (only when the browser offers it; manifest in app/manifest.ts)
    OfflineStatus.tsx        # header pill: offline changes waiting + sync problems; runs the sync (all pages)
    ServiceWorker.tsx        # registers public/sw.js (production only)
    ProfileView.tsx          # profile: avatar, Edit profile dialog (name; email locked), Shared lists, saved items
  hooks/
    useSavedItems.ts         # debounced saved-items search, shared by picker + profile
    useChannel.ts            # subscribe to a Pusher channel while mounted (+ refetch after reconnect)
    useMe.ts                 # current user (fetched per mount, no cache)
    usePresence.ts           # heartbeat + who has a list open, shared by ViewersButton and ListChat
    useOnline.ts             # navigator.onLine as a hook (a hint only; a failed fetch also means offline)
    useOfflineVersion.ts     # re-render when offline data in localStorage changes (-1 on the server)
  lib/
    db.ts          # cached Mongoose connection: always use connectDB()
    session.ts     # sign/verify session JWT (jose); no DB, used by proxy.ts
    google.ts      # Google login URLs + ID token check, isGoogleOnly(), isGoogleConfigured()
    reminders.ts   # sendDueReminders(): Web Push, checks access at send time
    pushClient.ts  # browser: enablePush() (permission + subscribe), disablePush() on logout
    pushValidators.ts # reminder + push subscription bodies; endpoints limited to known push services (SSRF)
    calendar.ts    # googleCalendarUrl(), icsContent(), toDateTimeLocal()
    auth.ts        # hashPassword, getSessionUser, requireUser, session cookie
    access.ts      # getFolderAccess() (one folder) + sharedWithUser() (bulk): the ONLY permission logic
    shares.ts      # listShares(), getShareLink(), serializeShareLink() for the owner view;
                   #   getPublicShare(): the ONLY data guests can read
    constants.ts   # FOLDER_STATUSES: add new statuses here only
    apiClient.ts   # apiFetch<T>() + ApiError: browser fetch wrapper, use for all UI calls
    items.ts       # toItemUpdate() (null → $unset), countItems(), countItemsByFolder()
    format.ts      # formatRupees()
    channels.ts    # Pusher channel + event names (shared by server and browser)
    realtime.ts    # server: publishFolderEvent / publishUserEvent / publishFolderProgress /
                   #   publishFolderAccess (never throw, no-op without keys)
    pusherClient.ts # browser: shared pusher-js client, getSocketId()
    totals.ts      # computeTotals() (in paise), groupItems() (A–Z, ungrouped last)
    savedItems.ts  # upsertSavedItem() (no duplicates, limit), updateSavedItem(), escapeRegex()
    duplicates.ts  # folderNameTaken() / itemNameTaken(): case-insensitive, routes answer 409
    rateLimit.ts   # in-memory rate limiter (per process only)
    offlineStore.ts # where offline data lives: IndexedDB (readable by the service worker) with a sync in-memory
                   #   copy + BroadcastChannel between tabs; localStorage fallback; moves old localStorage data once
    offlineLists.ts # offline copies in the offline store (by page path, or new:<id> for lists made offline) +
                   #   their offline changes, sync problems, claimOfflineData(); all cleared on logout
    offlineHome.ts # home page folder cards + my saved items kept for offline (same prefix, cleared with the lists)
    offlineFolders.ts # folder rename / status / delete made offline, queued by folder id
    offlineAuto.ts # browser only: "Keep all lists offline" (default on), refreshAllOffline() keeps every list's copy fresh
    offlineSync.ts # browser only: page cache for public/sw.js; syncAllOffline() sends offline changes when back online
                   #   (Web Lock "listy-sync", shared with the service worker); requestBackgroundSync()
    chat.ts        # list chat + presence handlers shared by member and guest routes; userChatter / guestChatter
    presence.ts    # in-memory "who has this list open" (per process, like rateLimit.ts)
    guestId.ts     # browser: random guest id in localStorage, sent as x-listy-guest
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
    Reminder.ts    # one per user + list; sentAt null until sent
    PushSubscription.ts # a device that gets my notifications; endpoint unique, moves to whoever logs in there
    ChatMessage.ts # list chat message; authorKey (never sent) marks "mine"; deleted with the folder
  test/
    setup.ts       # setupTestDb(), makeRequest(), routeCtx(), json<T>(), createUserAndCookie()
    memoryStorage.ts # in-memory localStorage for offline tests
    fakeBrowser.ts # stubBrowser() + fakeServer() for tests of the browser-side offline sync
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
  `btn-secondary`, `btn-ghost`, `input`, `card`, `link`, `link-danger`.
- Icons: `lucide-react`, always `aria-hidden` next to visible text (icon-only
  buttons need a `title` and an `sr-only` label). `icon-nudge` = size-4 icon
  that grows on hover. Motion tokens in `@theme`: `animate-pop`,
  `animate-fade-up`, `animate-wiggle`, `animate-float` (all disabled by
  prefers-reduced-motion). Keep motion small and quick.

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
7. **Every API route except `/api/auth/*`, `/api/cron/*` (checks `CRON_SECRET` instead) and the guest share routes (`GET /api/share/[token]`, its tick route, and `/api/share/[token]/presence|chat`) starts with `requireUser(request)`**
   and scopes its queries to that user. `src/proxy.ts` only redirects pages;
   it is not an API guard. The one public data route, `GET /api/share/[token]`,
   is read-only, needs an enabled share link, is rate-limited, and returns
   only `getPublicShare()` output (list name + status, items with `doneBy`
   null: no user names, emails or ids of people). Anything beyond reading
   needs login. Never return `passwordHash`, and keep auth
   failures vague ("Invalid email or password").
   Sharing is decided **only** inside `getFolderAccess()` (owner, or a Share
   row). Edit always includes tick: write permissions via
   `normalizePermissions()`. Only `UserRef` (id + name) is sent about other
   people; emails appear only in the owner's share list and in the viewers list
   (`…/presence`), which sends them to logged-in members of that list only, never to link guests.
   Folder and item routes decide access **only** via `getFolderAccess()`
   (null → 404, missing flag → 403). Item queries always filter by the
   folder from the URL too, so an item can't be reached through another folder. Send API data through `serialize*()`
   helpers so internal fields (like `owner`) don't leak.
8. **Realtime events** are published only AFTER a successful DB write, via
   `lib/realtime.ts`, and carry only what the UI shows (never emails or
   hashes). Only `private-` channels; `/api/pusher/auth` must check access
   with `getFolderAccess()`. `PUSHER_SECRET` is server-only. Tests mock the
   `pusher` module (see `withPusherEnv()` in `src/test/setup.ts`).
   Folder channel: item/group/folder/access/chat.message events (see `lib/channels.ts`).
   Guest chat routes need an enabled link, are rate-limited per IP, and know the
   guest only by a hashed random id (shown as "Guest XXXX"); chat messages carry
   names only. User channel `chat.notice` drives the message toasts.
   User channel: `folder.progress` (to owner + all shared users after item
   add/tick/delete and folder delete) and `folder.access` (to one user when
   they gain or lose a folder).
9. Run `npm audit --omit=dev` after adding dependencies and report any
   production vulnerabilities.
10. Security headers are set in `next.config.ts`. Do not remove them.

Before finishing any task that touches the API, re-read rules 1–6 against
the changed code.
