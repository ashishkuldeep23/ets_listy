// Browser-side fetch wrapper for our own API: sends JSON, and turns
// { error } responses into thrown Errors with that message.
// All UI writes should go through this (Phase 4 adds a Pusher header here).

export async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { ...(options.body && { "Content-Type": "application/json" }), ...options.headers },
  });
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error ?? "Something went wrong");
    err.status = res.status;
    throw err;
  }
  return data;
}
