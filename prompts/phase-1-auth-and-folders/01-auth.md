# Phase 1 · Feature 1: Sign up, log in, log out

Follow `prompts/_common.md`.

**Needs:** nothing (first feature).
**Commit message:** `listy: phase 1.1 - auth`

## Goal

Users can create an account, log in and log out. Pages are protected: logged-out users go to `/login`.

## Remove the starter code

Delete the starter `List` model, `src/app/api/lists/**`, their validators and
tests, and the list UI in `src/app/page.tsx`. Keep `lib/db.ts`, `lib/http.ts`
and `lib/limits.ts`.

## Dependencies

- `bcryptjs`: password hashing
- `jose`: sign/verify the session token
- `mongodb-memory-server` (dev): in-memory MongoDB for API tests

## Data model

`src/models/User.ts`
- `name`: string, required, trimmed, max 60
- `email`: string, required, unique, lowercased, trimmed, max 254
- `passwordHash`: string, required, `select: false`
- timestamps

## Auth helpers: `src/lib/auth.ts`

- `hashPassword`, `verifyPassword` (bcryptjs, cost 12)
- `createSessionToken(userId)` / `verifySessionToken(token)` with `jose`
  HS256, 7-day expiry, secret `process.env.SESSION_SECRET`. Throw a clear
  error if it is missing or shorter than 32 characters.
- `getSessionUser(request)`: reads the `listy_session` cookie **from the
  `request` object** (not `next/headers`) so handlers are testable with a
  plain `Request`. Returns `{ id, name, email }` or `null`.
- `requireUser(request)`: returns the user, or a 401 `jsonError`.
- Cookie: `listy_session`, `httpOnly`, `sameSite: "lax"`, `path: "/"`,
  `secure` in production, `maxAge` 7 days.

`src/lib/rateLimit.ts`: simple in-memory limiter (e.g. 10 attempts per IP
per 15 min). Add a comment that it is per-process only and must move to a
shared store before scaling out.

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/signup` | `{ name, email, password }`, password 8–72 chars. 409 if email taken. Sets cookie, returns user. Rate-limited. |
| POST | `/api/auth/login` | `{ email, password }`. Sets cookie. Always "Invalid email or password" on failure (don't reveal whether the email exists). Rate-limited. |
| POST | `/api/auth/logout` | Clears cookie. |
| GET | `/api/auth/me` | Current user or 401. |

## Pages

- `/signup`, `/login`: forms with errors. On success redirect to `/`.
  Support a `?next=` param but only allow same-site paths that start with a
  single `/` (reject `//…`, `http…`, `javascript:`). Put this check in
  `lib/safeRedirect.ts` with tests.
- `/`: logged out → redirect to `/login` (server-side). Logged in → header
  with the user's name and a Logout button, plus a placeholder "Your folders
  will appear here".
- Shared header component in `src/components/Header.tsx`.

## Tests

- Validators: signup/login, including bad types and `{ "$gt": "" }`.
- `auth.ts`: hash/verify, token round-trip, expired or garbage token → `null`.
- `safeRedirect`: allowed and rejected values.
- API: signup sets cookie; duplicate email 409; wrong password 401; `/me`
  without cookie 401; rate limit kicks in.
- Create `src/test/setup.ts` (start/stop memory server, `createUserAndCookie()`
  helper) for all later features to reuse.

## Extra housekeeping

- `.env.example`: add `SESSION_SECRET=` with a comment on how to generate it:
  `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- `CLAUDE.md`: update security rule 7. Auth now exists, and every API route
  except auth must call `requireUser`.
