import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Log in · Listy" };

// AuthForm reads ?next= from the URL, which Next.js requires to sit inside <Suspense>.
export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
