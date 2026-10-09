import type { Metadata } from "next";
import { Suspense } from "react";
import Header from "@/components/Header";
import Loading from "@/components/Loading";
import AcceptShare from "@/components/AcceptShare";

export const metadata: Metadata = { title: "Shared list · Listy" };

// /share/<token>: join a folder through its share link.
export default function SharePage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <Suspense fallback={<Loading label="Opening shared list…" />}>
          <AcceptShare />
        </Suspense>
      </main>
    </>
  );
}
