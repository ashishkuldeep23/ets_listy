import type { Metadata } from "next";
import { Suspense } from "react";
import AuthPage from "@/components/AuthPage";

export const metadata: Metadata = { title: "Sign up · Listy" };

// AuthForm reads ?next= from the URL, which Next.js requires to sit inside <Suspense>.
export default function SignupPage() {
  return (
    <Suspense>
      <AuthPage mode="signup" />
    </Suspense>
  );
}
