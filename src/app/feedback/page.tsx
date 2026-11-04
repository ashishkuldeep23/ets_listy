import type { Metadata } from "next";
import FeedbackView from "@/components/FeedbackView";
import Header from "@/components/Header";

export const metadata: Metadata = { title: "Feedback · Listy" };

// Leave feedback and read everyone's. Logged-out visitors are redirected by src/proxy.ts.
export default function FeedbackPage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
        <FeedbackView />
      </main>
    </>
  );
}
