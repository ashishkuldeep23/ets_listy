# Rules for every feature prompt

Every feature prompt in this folder says "Follow `prompts/_common.md`".
These rules apply to all of them.

## Before coding

1. Read `CLAUDE.md` and `AGENTS.md` in the project root and follow them,
   especially the security rules and the "keep it simple" rule.
2. Next.js here is v16. Check `node_modules/next/dist/docs/` before using a
   Next API you are not sure about (route `params` are async; `middleware`
   may be called `proxy`).
3. Read the feature's **Needs** line and check that those features exist in
   the code. If something is missing, stop and tell me instead of building it.
4. Reuse what exists: `connectDB` (`lib/db.js`), `jsonError`/`readJson`/
   `serverError` (`lib/http.js`), `lib/limits.js`, `lib/validators.js`, and
   once they exist `requireUser` (`lib/auth.js`), `getFolderAccess`
   (`lib/access.js`), `lib/rateLimit.js`, and the test helpers in `src/test/setup.js`.
5. Add only the dependencies the prompt names. Ask before adding anything else.

## While coding

- Every request body goes through a validator that copies only allowed fields.
- Every folder or item route decides access **only** through `getFolderAccess`.
  No access → 404. Has access but not this permission → 403.
- Comments: a short header comment on each new file, and "why" comments on
  non-obvious lines. No noise comments.
- UI: simple Tailwind, works on mobile, shows API error messages. Follow
  the **UI theme** section of `CLAUDE.md` (dark, golden primary, cyan
  accent, theme tokens and `btn-*`/`input`/`card` classes only).
  Hidden buttons are only for looks. The API must enforce every rule.

## Tests

- Unit tests for validators and pure helpers (`*.test.js` next to the file).
- API tests with `mongodb-memory-server`: call route handlers directly with
  `new Request(...)`. Always include "another user cannot do this" cases.

## Done when

1. `npm test && npm run lint && npm run build` all pass. Show the summary.
   If anything fails, fix it. Never call it done with failures.
2. If a dependency was added, run `npm audit --omit=dev` and report the result.
3. If `.env.local` has the needed vars, start `npm run dev`, smoke-test the
   feature with curl, then stop the server. If not, say the smoke test was skipped.
4. Update `CLAUDE.md` (project layout, plus any new rule or env var), and add
   every new env var with an empty value to `.env.example`.
5. Commit **only files inside the `listy/` folder** (run `git status` first,
   then `git add -- .` from inside `listy/`). Use the commit message given in
   the prompt. **Do not push.**
6. End with a **"Check it yourself"** list for me in simple Hinglish: the
   exact browser clicks to verify everything this feature added.
