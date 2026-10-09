"use client";

// Shared form for /login and /signup. On success it goes to the `?next=`
// path (checked by safeNextPath) or home.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { ListChecks, LoaderCircle, LockKeyhole, LogIn, Mail, UserPlus, UserRound } from "lucide-react";
import ErrorText from "@/components/ErrorText";
import { safeNextPath } from "@/lib/safeRedirect";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (field: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const body = isSignup ? form : { email: form.email, password: form.password };
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong");
        return;
      }
      // replace (not push) so Back doesn't return to the login form.
      router.replace(next);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Keep ?next= when switching between login and signup.
  const otherHref = `/${isSignup ? "login" : "signup"}${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center p-6">
      <h1 className="mb-1 flex items-center gap-2 text-3xl font-bold text-primary">
        <ListChecks className="size-8 animate-float" aria-hidden />
        Listy
      </h1>
      <p className="mb-6 text-muted">{isSignup ? "Create your account" : "Log in to your account"}</p>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {isSignup && (
          <Field icon={<UserRound />}>
            <input
              value={form.name}
              onChange={update("name")}
              placeholder="Your name"
              autoComplete="name"
              maxLength={60}
              required
              className="input w-full pl-9"
            />
          </Field>
        )}
        <Field icon={<Mail />}>
          <input
            type="email"
            value={form.email}
            onChange={update("email")}
            placeholder="Email"
            autoComplete="email"
            maxLength={254}
            required
            className="input w-full pl-9"
          />
        </Field>
        <Field icon={<LockKeyhole />}>
          <input
            type="password"
            value={form.password}
            onChange={update("password")}
            placeholder={isSignup ? "Password (min 8 characters)" : "Password"}
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={isSignup ? 8 : undefined}
            required
            className="input w-full pl-9"
          />
        </Field>

        <ErrorText message={error} />

        <button disabled={busy} className="btn-primary">
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : isSignup ? (
            <UserPlus className="icon-nudge" aria-hidden />
          ) : (
            <LogIn className="icon-nudge" aria-hidden />
          )}
          {busy ? "Please wait…" : isSignup ? "Sign up" : "Log in"}
        </button>
      </form>

      <p className="mt-4 text-sm text-muted">
        {isSignup ? "Already have an account? " : "New to Listy? "}
        <Link href={otherHref} className="link">
          {isSignup ? "Log in" : "Sign up"}
        </Link>
      </p>
    </main>
  );
}

/** An input with a small icon inside its left edge (the input needs `pl-9`). */
function Field({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted [&>svg]:size-4" aria-hidden>
        {icon}
      </span>
      {children}
    </div>
  );
}
