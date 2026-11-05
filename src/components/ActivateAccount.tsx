"use client";

// /activate/<token> body: activates the account as soon as the page opens, then
// goes on logged in. A script does this rather than the page load itself, so a
// mail scanner that only fetches the link doesn't use it up.

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCw, Unlink } from "lucide-react";
import Loading from "@/components/Loading";
import { ApiError, apiFetch } from "@/lib/apiClient";
import { safeNextPath } from "@/lib/safeRedirect";
import type { ActivationResponse } from "@/types";

export default function ActivateAccount() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState("");
  /** The server never answered, so the link is still good: trying again makes sense. */
  const [canRetry, setCanRetry] = useState(false);

  const activate = useCallback(async () => {
    setError("");
    setCanRetry(false);
    try {
      const { next } = await apiFetch<ActivationResponse>("/api/auth/activate", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      // replace: Back must not return to a link that is now used up.
      router.replace(safeNextPath(next));
      router.refresh();
    } catch (err) {
      const reached = err instanceof ApiError;
      setCanRetry(!reached);
      setError(reached ? err.message : "Network error. Please check your connection.");
    }
  }, [token, router]);

  // Once only: in development React runs effects twice, and a second call would report "already used".
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void activate();
  }, [activate]);

  if (!error) return <Loading label="Activating your account…" />;

  return (
    <div className="card animate-fade-up">
      <h1 className="mb-2 flex items-center gap-2 text-xl font-semibold">
        <Unlink className="size-5 animate-pop text-danger" aria-hidden />
        Couldn&apos;t activate
      </h1>
      <p className="mb-4 text-muted">{error}</p>
      {canRetry ? (
        <button onClick={() => void activate()} className="btn-primary w-full">
          <RotateCw className="icon-nudge" aria-hidden />
          Try again
        </button>
      ) : (
        <p className="flex flex-wrap gap-4 text-sm">
          <Link href="/login" className="link">
            Log in
          </Link>
          <Link href="/signup" className="link">
            Sign up again
          </Link>
        </p>
      )}
    </div>
  );
}
