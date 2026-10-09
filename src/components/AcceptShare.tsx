"use client";

// Opens a share link. Logged in: asks the API to add the folder to my
// "Shared with me", then goes to it. Logged out (the API answers 401): shows
// the read-only public view instead, which offers Log in / Sign up.

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Unlink } from "lucide-react";
import Loading from "@/components/Loading";
import PublicListView from "@/components/PublicListView";
import { ApiError, apiFetch } from "@/lib/apiClient";
import type { AcceptShareResponse } from "@/types";

export default function AcceptShare() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState("");
  const [guest, setGuest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AcceptShareResponse>(`/api/share/${encodeURIComponent(token)}/accept`, { method: "POST" })
      .then(({ folderId }) => !cancelled && router.replace(`/folders/${folderId}`))
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setGuest(true);
          return;
        }
        setError(err instanceof Error ? err.message : "Something went wrong");
      });
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (guest) return <PublicListView token={token} />;
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
