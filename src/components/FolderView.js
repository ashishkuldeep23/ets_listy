"use client";

// Folder page body. Loads the folder by the id in the URL; the API answers
// 404 for folders that don't exist or aren't mine, shown as "not found".

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import StatusBadge from "@/components/StatusBadge";

export default function FolderView() {
  const { id } = useParams();
  const [folder, setFolder] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | notFound | error

  useEffect(() => {
    fetch(`/api/folders/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (res.status === 404) return setState("notFound");
        if (!res.ok) return setState("error");
        setFolder(await res.json());
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [id]);

  if (state === "loading") return <p className="text-muted">Loading…</p>;

  if (state === "notFound" || state === "error") {
    return (
      <div className="card">
        <h1 className="mb-2 text-xl font-semibold">
          {state === "notFound" ? "Folder not found" : "Could not load this folder"}
        </h1>
        <p className="mb-4 text-muted">
          {state === "notFound"
            ? "It may have been deleted, or you don't have access to it."
            : "Please check your connection and try again."}
        </p>
        <Link href="/" className="link">
          ← Back to folders
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/" className="link text-sm">
        ← All folders
      </Link>
      <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold wrap-break-word text-primary">{folder.name}</h1>
        <StatusBadge status={folder.status} />
      </div>
      <p className="card text-muted">Items are coming in the next phase.</p>
    </div>
  );
}
