# Phase 4 · Feature 1: Pusher setup + private channel auth

Follow `prompts/_common.md`.

**Needs:** Phases 1–3.
**Commit message:** `listy: phase 4.1 - pusher setup`

## Goal

Set up Pusher so later features can push live updates. Only people with
access to a folder may listen to it. **If Pusher env vars are missing, the
app must work fully, just without live updates.**

## Dependencies

- `pusher` (server), `pusher-js` (browser)

## Env vars (add to `.env.example`, empty)

```
PUSHER_APP_ID=
PUSHER_SECRET=
NEXT_PUBLIC_PUSHER_KEY=
NEXT_PUBLIC_PUSHER_CLUSTER=
```

Comment: values come from pusher.com → Channels → your app → App Keys.
`PUSHER_SECRET` must never reach the client.

## Channels (private only)

- `private-folder-<folderId>`: everyone with access to that folder
- `private-user-<userId>`: one user

## Server: `src/lib/realtime.js`

- Lazily creates one Pusher client (`useTLS: true`). Missing env → logs once,
  and every publish becomes a no-op.
- `publishFolderEvent(folderId, event, data, socketId?)`
- `publishUserEvent(userId, event, data)`
- **Never throws**: catch and log, so a Pusher outage never fails a request.
- `getSocketId(request)` reads the `x-pusher-socket-id` header and validates
  its format (`^\d+\.\d+$`), so the sender doesn't get their own event back.

## Auth route: `POST /api/pusher/auth`

- Body is form-encoded: `socket_id`, `channel_name`.
- Logged out → 401.
- `channel_name` must match `^private-folder-[a-f0-9]{24}$` or
  `^private-user-[a-f0-9]{24}$`, otherwise 403.
- Folder channel → allowed only if `getFolderAccess` gives access.
  User channel → allowed only for your own id. Otherwise 403.
- Returns `pusher.authorizeChannel(socketId, channelName)`.
- Pusher not configured → 503.

## Client

- `src/lib/pusherClient.js`: one shared `pusher-js` instance, created on
  first use in the browser only, `channelAuthorization: { endpoint: "/api/pusher/auth" }`.
  Returns `null` when the public env vars are missing.
- `getSocketId()` helper.
- Hook `src/hooks/useChannel.js`: `useChannel(channelName, handlers)`
  subscribes on mount, unsubscribes on unmount, and does nothing when Pusher is off.
- A shared `apiFetch` wrapper (if one doesn't exist yet) that adds the
  `x-pusher-socket-id` header on every write request. Switch existing writes to it.
- Small "Live" dot in the header when connected.

## Tests (mock the `pusher` module, never call the real service)

- Auth route: logged out 401; bad names (`private-folder-xyz`,
  `presence-folder-…`, `private-user-<other id>`) 403; stranger on folder
  channel 403; owner and shared user 200; own user channel 200; no env 503.
- `realtime.js`: no env → no-op; thrown error is swallowed and logged;
  bad socket id ignored.
