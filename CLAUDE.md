@AGENTS.md

# Listy: agent guide

Listy is a simple list-making web app. It is one Next.js project: the UI and
the API live together, and data is stored in MongoDB.

Keep it simple. Do not add a new library, service or pattern unless the task
actually needs it. Ask the user first before adding anything heavy (state
managers, ORMs other than Mongoose, UI kits, queues, Docker, microservices).

## Stack

- Next.js 16 (App Router), React 19, JavaScript (no TypeScript)
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
npm run lint    # ESLint
npm run build   # production build: run before calling work done
```

Setup: copy `.env.example` to `.env.local` and set `MONGODB_URI` and
`SESSION_SECRET`.

Feature prompts for upcoming work live in `prompts/` (start with
`prompts/README.md` and `prompts/_common.md`).

## Project layout

```
src/
  proxy.js                   # Next 16 "proxy" (was middleware): page redirects for login
  app/
    page.js                  # home page
    login/, signup/          # auth pages (use components/AuthForm.js)
    folders/[id]/page.js     # one folder (components/FolderView.js)
    api/auth/signup|login|logout|me/route.js
    api/folders/route.js     # GET my folders, POST create
    api/folders/[id]/route.js # GET, PATCH (rename), DELETE
  components/
    Header.js                # top bar with user name + Logout
    AuthForm.js              # shared login/signup form
    FolderList.js            # home: create / rename / delete folders
    FolderView.js            # folder page body
  lib/
    db.js          # cached Mongoose connection: always use connectDB()
    session.js     # sign/verify session JWT (jose); no DB, used by proxy.js
    auth.js        # hashPassword, getSessionUser, requireUser, session cookie
    access.js      # getFolderAccess(): the ONLY folder permission check
    apiClient.js   # apiFetch(): browser fetch wrapper, use for all UI calls
    rateLimit.js   # in-memory rate limiter (per process only)
    safeRedirect.js # safeNextPath() for ?next= redirects
    limits.js      # size limits shared by validators and schemas
    validators.js  # request body validation
    http.js        # jsonError / readJson / serverError / tooManyRequests
  models/
    User.js        # passwordHash is select:false
    Folder.js      # + serializeFolder() for API responses
  test/
    setup.js       # setupTestDb(), makeRequest(), createUserAndCookie()
```

## How to write code

- Match the existing style: small functions, plain JavaScript, named exports.
- Comments explain **why**, not what. Add a short comment at the top of each
  new file saying what it is for, and on any non-obvious line.
- API routes follow this order: parse JSON with `readJson` → validate →
  `connectDB()` → query → respond. Wrap DB work in `try/catch` and use
  `serverError(err)` for unexpected errors.
- Error responses are always `{ error: "message" }` with the correct status
  (400 bad input, 404 not found, 500 unexpected).
- New limits go in `lib/limits.js` and are used by both the validator and
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

- Every new validator or pure helper in `src/lib/` gets a `*.test.js` file
  next to it. Cover the happy path, each rejection, and bad-type input.
- API tests call route handlers directly. Use `setupTestDb()`, `makeRequest()`
  and `createUserAndCookie()` from `src/test/setup.js` (see
  `src/app/api/auth/auth.test.js`). Always test "another user can't do this".
- Run the full check once after a batch of changes, not after every edit:
  `npm test && npm run lint && npm run build`.
- Report results honestly: if anything fails, show the output and fix it
  before saying the task is done.

## Security rules (must follow)

1. **Validate every request body** with a function in `lib/validators.js`.
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
6. **Limit sizes** of every string and array (see `lib/limits.js`).
7. **Every API route except `/api/auth/*` starts with `requireUser(request)`**
   and scopes its queries to that user. `src/proxy.js` only redirects pages;
   it is not an API guard. Never return `passwordHash`, and keep auth
   failures vague ("Invalid email or password").
   Folder and item routes decide access **only** via `getFolderAccess()`
   (null → 404, missing flag → 403). Send API data through `serialize*()`
   helpers so internal fields (like `owner`) don't leak.
8. Run `npm audit --omit=dev` after adding dependencies and report any
   production vulnerabilities.
9. Security headers are set in `next.config.mjs`. Do not remove them.

Before finishing any task that touches the API, re-read rules 1–6 against
the changed code.
