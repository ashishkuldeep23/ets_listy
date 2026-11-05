import type { Metadata } from "next";
import { Suspense } from "react";
import ActivateAccount from "@/components/ActivateAccount";
import Loading from "@/components/Loading";

export const metadata: Metadata = { title: "Activate account · Listy", robots: { index: false } };

// /activate/<token>: the link in a signup email. Open to everyone (see src/proxy.ts).
export default function ActivatePage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center p-6">
      <Suspense fallback={<Loading label="Activating your account…" />}>
        <ActivateAccount />
      </Suspense>
    </main>
  );
}
