import type { Metadata } from "next";
import Header from "@/components/Header";
import ProfileView from "@/components/ProfileView";

export const metadata: Metadata = { title: "Profile · Listy" };

// My profile and saved items. Logged-out visitors are redirected by src/proxy.ts.
export default function ProfilePage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <ProfileView />
      </main>
    </>
  );
}
