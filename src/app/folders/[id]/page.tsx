import type { Metadata } from "next";
import { Suspense } from "react";
import Header from "@/components/Header";
import FolderView from "@/components/FolderView";

export const metadata: Metadata = { title: "Folder · Listy" };

// One folder. FolderView reads the id from the URL, which Next.js wants
// inside <Suspense> so the rest of the page can render straight away.
export default function FolderPage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <FolderView />
        </Suspense>
      </main>
    </>
  );
}
