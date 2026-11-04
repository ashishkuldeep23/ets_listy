import type { Metadata } from "next";
import { Suspense } from "react";
import AuthPage from "@/components/AuthPage";

export const metadata: Metadata = { title: "Log in · Listy" };

// AuthForm reads ?next= from the URL, which Next.js requires to sit inside <Suspense>.
export default function LoginPage() {
  return (
    <Suspense>
      <AuthPage mode="login" />
    </Suspense>
  );
}
