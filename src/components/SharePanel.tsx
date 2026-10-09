"use client";

// Owner-only panel on the folder page: share by email with permissions,
// see / change / remove the people it's shared with, and manage the
// folder's share link (copy, permissions, on/off, reset).

import { useEffect, useState, type FormEvent } from "react";
import { Check, CircleCheck, Copy, Link2, Mail, RefreshCw, Send, Share2, UserMinus, Users, X } from "lucide-react";
import ErrorText from "@/components/ErrorText";
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
  // Briefly swaps the Copy icon for a tick after copying.
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ShareListResponse>(base)
      .then(async (data) => {
        if (cancelled) return;
        setShares(data.shares);
        // Opening Share should hand the owner a URL straight away, so
        // create the link (view-only by default) if there isn't one yet.
        const current =
          data.link ?? (await apiFetch<ShareLinkResponse>(`/api/folders/${folderId}/share-link`, { method: "POST" })).link;
        if (!cancelled) setLink(current);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [base, folderId]);

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
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  const remove = (s: ShareDTO) => {
    if (!confirm(`Remove ${s.user.name}'s access to this list?`)) return;
    void run(async () => {
      await apiFetch(`${base}/${s.user.id}`, { method: "DELETE" });
      setShares((prev) => prev.filter((x) => x.user.id !== s.user.id));
      return null;
    });
  };

  return (
    <div className="card mb-6 flex animate-fade-up flex-col gap-4 border-primary/40">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-primary">
          <Share2 className="size-5" aria-hidden />
          Share this list
        </h2>
        <button onClick={onClose} className="btn-ghost text-sm" title="Close">
          <X className="icon-nudge" aria-hidden />
          <span className="sr-only">Close</span>
        </button>
      </div>

      <ErrorText message={error} />
      {notice && (
        <p key={notice} className="flex animate-fade-up items-center gap-1.5 text-sm text-accent">
          <CircleCheck className="size-4 animate-pop" aria-hidden />
          {notice}
        </p>
      )}

      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted">
          <Link2 className="size-4" aria-hidden />
          Public link
        </h3>
        {!link ? (
          <button
            onClick={() => changeLink(linkUrl, {}, "Link created")}
            disabled={busy}
            className="btn-secondary self-start text-sm"
          >
            <Link2 className="icon-nudge" aria-hidden />
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
              <button onClick={copyLink} disabled={!link.enabled} className="btn-secondary text-sm" title={copied ? "Copied" : "Copy"}>
                {copied ? <Check className="size-4 animate-pop" aria-hidden /> : <Copy className="icon-nudge" aria-hidden />}
                <span className="sr-only">{copied ? "Copied" : "Copy"}</span>
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
                className="link group"
                title="Reset link"
              >
                <RefreshCw className="size-4 transition-transform duration-500 group-hover:rotate-180" aria-hidden />
                <span className="sr-only">Reset link</span>
              </button>
            </div>
            <p className="text-xs text-muted">
              Anyone with this link can view the list, no login needed. To tick or edit, they log in and join with
              the permissions above.
            </p>
          </>
        )}
      </div>

      <form onSubmit={shareByEmail} className="flex flex-col gap-2 rounded-md border border-border p-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted">
          <Mail className="size-4" aria-hidden />
          Invite a person <span className="font-normal">(optional)</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1">
            <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Their Listy email"
              required
              className="input w-full pl-9"
            />
          </div>
          <button disabled={busy} className="btn-primary">
            <Send className="icon-nudge" aria-hidden />
            Share
          </button>
        </div>
        <PermissionCheckboxes value={perms} onChange={setPerms} />
      </form>

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted">
          <Users className="size-4" aria-hidden />
          People with access
        </h3>
        {shares.length === 0 ? (
          <p className="text-sm text-muted">Only you, so far.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shares.map((s) => (
              <li key={s.user.id} className="flex animate-fade-up flex-col gap-1 rounded-md bg-surface-2 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.user.name}</span>
                  <span className="text-xs text-muted">{s.user.email}</span>
                  {s.via === "link" && (
                    <span className="inline-flex items-center gap-1 text-xs text-accent">
                      <Link2 className="size-3" aria-hidden />
                      via link
                    </span>
                  )}
                  <button onClick={() => remove(s)} className="link-danger ml-auto text-sm" title="Remove">
                    <UserMinus className="icon-nudge" aria-hidden />
                    <span className="sr-only">Remove</span>
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
