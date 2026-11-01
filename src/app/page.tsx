import { Suspense } from "react";
import Header from "@/components/Header";
import Loading from "@/components/Loading";
import FolderList from "@/components/FolderList";

// Home page: my folders. Logged-out visitors never reach it, because
// src/proxy.js redirects them to /login.
export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        {/* FolderList reads ?status= from the URL, which needs <Suspense>. It also owns the heading:
            a list opened in place (offline) replaces it. */}
        <Suspense fallback={<Loading />}>
          <FolderList />
        </Suspense>
      </main>
    </>
  );
}
