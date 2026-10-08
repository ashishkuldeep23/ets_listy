import type { Metadata } from "next";
import { Suspense } from "react";
import Header from "@/components/Header";
import AcceptShare from "@/components/AcceptShare";

export const metadata: Metadata = { title: "Shared folder · Listy" };

// /share/<token>: join a folder through its share link.
export default function SharePage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <Suspense fallback={<p className="text-muted">Opening shared folder…</p>}>
          <AcceptShare />
        </Suspense>
      </main>
    </>
  );
}
