"use client";

// Owner-only panel on the folder page: share by email with permissions,
// and see / change / remove the people it's shared with.

import { useEffect, useState, type FormEvent } from "react";
import PermissionCheckboxes, { type Permissions } from "@/components/PermissionCheckboxes";
import { apiFetch } from "@/lib/apiClient";
import type { ShareDTO, ShareListResponse } from "@/types";

interface SharePanelProps {
  folderId: string;
  onClose: () => void;
}

export default function SharePanel({ folderId, onClose }: SharePanelProps) {
  const base = `/api/folders/${folderId}/shares`;
  const [shares, setShares] = useState<ShareDTO[]>([]);
  const [email, setEmail] = useState("");
  const [perms, setPerms] = useState<Permissions>({ canCheck: true, canEdit: false });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ShareListResponse>(base)
      .then((data) => !cancelled && setShares(data.shares))
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
