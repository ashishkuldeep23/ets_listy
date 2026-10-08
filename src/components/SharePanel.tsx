"use client";

// Owner-only panel on the folder page: share by email with permissions,
// see / change / remove the people it's shared with, and manage the
// folder's share link (copy, permissions, on/off, reset).

import { useEffect, useState, type FormEvent } from "react";
import PermissionCheckboxes, { type Permissions } from "@/components/PermissionCheckboxes";
import { apiFetch } from "@/lib/apiClient";
import type { ShareDTO, ShareLinkDTO, ShareLinkResponse, ShareListResponse } from "@/types";

interface SharePanelProps {
  folderId: string;
  onClose: () => void;
}

export default function SharePanel({ folderId, onClose }: SharePanelProps) {
  const base = `/api/folders/${folderId}/shares`;
  const [shares, setShares] = useState<ShareDTO[]>([]);
  const [link, setLink] = useState<ShareLinkDTO | null>(null);
  const [email, setEmail] = useState("");
  const [perms, setPerms] = useState<Permissions>({ canCheck: true, canEdit: false });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ShareListResponse>(base)
      .then((data) => {
        if (cancelled) return;
        setShares(data.shares);
        setLink(data.link);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [base]);

  // Runs a request that returns the updated share list.
  async function run(fn: () => Promise<ShareListResponse | null>, success?: string): Promise<boolean> {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const data = await fn();
      if (data) setShares(data.shares);
      if (success) setNotice(success);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function shareByEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    const ok = await run(
      () => apiFetch<ShareListResponse>(base, { method: "POST", body: JSON.stringify({ email, ...perms }) }),
      `Shared with ${email.trim()}`
    );
    if (ok) setEmail("");
  }

  const updatePerms = (s: ShareDTO, next: Permissions) =>
    run(() => apiFetch<ShareListResponse>(`${base}/${s.user.id}`, { method: "PATCH", body: JSON.stringify(next) }));

  // Link changes return { link }; reuse run() for errors and busy state.
  const linkUrl = `/api/folders/${folderId}/share-link`;
  const changeLink = (path: string, body?: object, success?: string) =>
    run(async () => {
      const data = await apiFetch<ShareLinkResponse>(path, {
        method: "POST",
        ...(body && { body: JSON.stringify(body) }),
      });
      setLink(data.link);
      return null;
    }, success);

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setNotice("Link copied");
    } catch {
      setError("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  const remove = (s: ShareDTO) => {
    if (!confirm(`Remove ${s.user.name}'s access to this folder?`)) return;
    void run(async () => {
      await apiFetch(`${base}/${s.user.id}`, { method: "DELETE" });
      setShares((prev) => prev.filter((x) => x.user.id !== s.user.id));
      return null;
    });
  };

  return (
    <div className="card mb-6 flex flex-col gap-4 border-primary/40">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-primary">Share this folder</h2>
        <button onClick={onClose} className="btn-ghost text-sm">
          Close
        </button>
      </div>

      <form onSubmit={shareByEmail} className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Their Listy email"
            required
            className="input min-w-0 flex-1"
          />
          <button disabled={busy} className="btn-primary">
            Share
          </button>
        </div>
        <PermissionCheckboxes value={perms} onChange={setPerms} />
      </form>

      {error && <p className="text-sm text-danger">{error}</p>}
      {notice && <p className="text-sm text-accent">{notice}</p>}

      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        <h3 className="text-sm font-semibold text-muted">Share link</h3>
        {!link ? (
          <button
            onClick={() => changeLink(linkUrl, {}, "Link created")}
            disabled={busy}
            className="btn-secondary self-start text-sm"
          >
            Create a share link
          </button>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <input
                readOnly
                value={link.url}
                onFocus={(e) => e.target.select()}
                aria-label="Share link"
                className={`input min-w-0 flex-1 text-sm ${link.enabled ? "" : "line-through opacity-50"}`}
              />
              <button onClick={copyLink} disabled={!link.enabled} className="btn-secondary text-sm">
                Copy
              </button>
            </div>
            <PermissionCheckboxes
              value={{ canCheck: link.canCheck, canEdit: link.canEdit }}
              onChange={(next) => changeLink(linkUrl, next)}
              disabled={busy}
            />
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={link.enabled}
                  disabled={busy}
                  onChange={(e) => changeLink(linkUrl, { enabled: e.target.checked })}
                  className="size-4 accent-primary"
                />
                Link is on
              </label>
              <button
                onClick={() => {
                  if (confirm("Make a new link? The current link will stop working. People who already joined keep access.")) {
                    void changeLink(`${linkUrl}/reset`, undefined, "New link created");
                  }
                }}
                disabled={busy}
                className="link"
              >
                Reset link
              </button>
            </div>
            <p className="text-xs text-muted">Anyone with a Listy account who opens this link joins with these permissions.</p>
          </>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted">People with access</h3>
        {shares.length === 0 ? (
          <p className="text-sm text-muted">Only you, so far.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shares.map((s) => (
              <li key={s.user.id} className="flex flex-col gap-1 rounded-md bg-surface-2 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.user.name}</span>
                  <span className="text-xs text-muted">{s.user.email}</span>
                  {s.via === "link" && <span className="text-xs text-accent">via link</span>}
                  <button onClick={() => remove(s)} className="ml-auto text-sm text-danger hover:underline">
                    Remove
                  </button>
                </div>
                <PermissionCheckboxes
                  value={{ canCheck: s.canCheck, canEdit: s.canEdit }}
                  onChange={(next) => updatePerms(s, next)}
                  disabled={busy}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
