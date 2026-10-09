import { Suspense } from "react";
import { LayoutList } from "lucide-react";
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
        <h1 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
          <LayoutList className="size-6 text-primary" aria-hidden />
          Your lists
        </h1>
        {/* FolderList reads ?status= from the URL, which needs <Suspense>. */}
        <Suspense fallback={<Loading />}>
          <FolderList />
        </Suspense>
      </main>
    </>
  );
}
