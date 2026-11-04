// Server part of /login and /signup: reads which ways to log in are on and
// hands the answer to the form. connection() waits for a real request, so the
// env is read at run time instead of being frozen into the build.

import { connection } from "next/server";
import AuthForm from "@/components/AuthForm";
import { isGoogleConfigured, isGoogleOnly , showEnvValsOnConsole } from "@/lib/google";

export default async function AuthPage({ mode }: { mode: "login" | "signup" }) {
  await connection();
  showEnvValsOnConsole();
  return <AuthForm mode={mode} passwordAllowed={!isGoogleOnly()} googleAllowed={isGoogleConfigured()} />;
}
