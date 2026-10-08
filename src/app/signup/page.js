import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Sign up · Listy" };

// AuthForm reads ?next= from the URL, which Next.js requires to sit inside <Suspense>.
export default function SignupPage() {
  return (
    <Suspense>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
