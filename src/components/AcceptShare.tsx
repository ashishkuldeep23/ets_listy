"use client";

// Opens a share link: asks the API to add the folder to my "Shared with
// me", then goes to it. Logged-out visitors never get here: src/proxy.ts
// sends them to /login?next=/share/<token> first.

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Unlink } from "lucide-react";
import Loading from "@/components/Loading";
import { ApiError, apiFetch } from "@/lib/apiClient";
import type { AcceptShareResponse } from "@/types";

export default function AcceptShare() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch<AcceptShareResponse>(`/api/share/${encodeURIComponent(token)}/accept`, { method: "POST" })
      .then(({ folderId }) => !cancelled && router.replace(`/folders/${folderId}`))
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(`/share/${token}`)}`);
          return;
        }
        setError(err instanceof Error ? err.message : "Something went wrong");
      });
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (!error) return <Loading label="Opening shared list…" />;

  return (
    <div className="card animate-fade-up">
      <h1 className="mb-2 flex items-center gap-2 text-xl font-semibold">
        <Unlink className="size-5 animate-pop text-danger" aria-hidden />
        Can&apos;t open this link
      </h1>
      <p className="mb-4 text-muted">{error}</p>
      <Link href="/" className="link">
        <ArrowLeft className="icon-nudge" aria-hidden />
        Go to your lists
      </Link>
    </div>
  );
}
