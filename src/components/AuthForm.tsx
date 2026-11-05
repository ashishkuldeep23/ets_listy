"use client";

// Shared form for /login and /signup. Login goes on to the `?next=` path
// (checked by safeNextPath) or home; signup shows "check your email", since the
// account is made by the link in that email. Shows email + password and/or
// "Continue with Google", as ONLY_LOGIN_WITH_GOOGLE and the Google keys allow.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { CircleCheck, ListChecks, LoaderCircle, LockKeyhole, LogIn, Mail, MailCheck, RotateCw, UserPlus, UserRound } from "lucide-react";
import ErrorText from "@/components/ErrorText";
import PasswordInput from "@/components/PasswordInput";
import { LIMITS } from "@/lib/limits";
import { safeNextPath } from "@/lib/safeRedirect";

interface AuthFormProps {
  mode: "login" | "signup";
  passwordAllowed: boolean;
  googleAllowed: boolean;
}

export default function AuthForm({ mode, passwordAllowed, googleAllowed }: AuthFormProps) {
  const isSignup = mode === "signup";
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));

  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  /** The address an activation email went to: replaces the form with "check your email". */
  const [sentTo, setSentTo] = useState("");
  const [resent, setResent] = useState(false);
  // The callback route sends failures back as ?error=google.
  const [error, setError] = useState(searchParams.get("error") === "google" ? "Google login failed. Please try again." : "");
  const [busy, setBusy] = useState(false);

  const update = (field: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSignup && form.password !== form.confirmPassword) return setError("Passwords don't match");
    void send();
  }

  async function send() {
    setError("");
    setResent(false);
    setBusy(true);
    try {
      const body = isSignup ? { ...form, next } : { email: form.email, password: form.password };
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
      if (isSignup) {
        // No account yet: it is made when the link in the email is opened.
        setResent(Boolean(sentTo));
        setSentTo(form.email.trim());
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

  if (sentTo) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center p-6">
        <div className="card animate-fade-up">
          <h1 className="mb-2 flex items-center gap-2 text-xl font-semibold text-primary">
            <MailCheck className="size-6 animate-pop" aria-hidden />
            Check your email
          </h1>
          <p className="mb-2 text-sm wrap-anywhere">
            We sent an activation link to <strong>{sentTo}</strong>. Open it to finish signing up and log in.
          </p>
          <p className="mb-4 text-sm text-muted">
            It works for {LIMITS.ACTIVATION_LINK_HOURS} hours. Can&apos;t find it? Look in your spam folder too.
          </p>
          <ErrorText message={error} className="mb-3" />
          {resent && (
            <p className="mb-3 flex items-center gap-1.5 text-sm text-accent" role="status">
              <CircleCheck className="size-4 animate-pop" aria-hidden />
              Sent again. Only the newest link works.
            </p>
          )}
          <div className="flex flex-col gap-2">
            <button type="button" disabled={busy} onClick={() => void send()} className="btn-secondary justify-center">
              {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <RotateCw className="icon-nudge" aria-hidden />}
              {busy ? "Sending…" : "Send the email again"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSentTo("");
                setError("");
                setResent(false);
              }}
              className="btn-ghost justify-center text-sm"
            >
              Use a different email
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center p-6">
      <h1 className="mb-1 flex items-center gap-2 text-3xl font-bold text-primary">
        <ListChecks className="size-8 animate-float" aria-hidden />
        Listy
      </h1>
      <p className="mb-6 text-muted">{isSignup ? "Create your account" : "Log in to your account"}</p>

      {googleAllowed && (
        // A plain link, not next/link: this leaves the app for Google, and must never be prefetched.
        <a href={`/api/auth/google${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="btn-secondary text-red-600 border-red-600 font-semibold justify-center">
          <GoogleIcon />
          Continue with Google
        </a>
      )}
      {googleAllowed && passwordAllowed && (
        <p className="my-4 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-border" aria-hidden />
          or
          <span className="h-px flex-1 bg-border" aria-hidden />
        </p>
      )}
      {!passwordAllowed && <ErrorText message={googleAllowed ? error : "Login isn't available right now."} className="mt-3" />}

      {passwordAllowed && (
      <>
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
          <PasswordInput
            value={form.password}
            onChange={update("password")}
            placeholder={isSignup ? "Password (min 8 characters)" : "Password"}
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={isSignup ? 8 : undefined}
            required
            className="pl-9"
          />
        </Field>
        {isSignup && (
          <Field icon={<LockKeyhole />}>
            <PasswordInput
              value={form.confirmPassword}
              onChange={update("confirmPassword")}
              placeholder="Confirm password"
              autoComplete="new-password"
              required
              className="pl-9"
            />
          </Field>
        )}

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
      </>
      )}
    </main>
  );
}

/** Google's "G" in one colour: lucide has no brand icons, and the theme allows no raw colours. */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.18-1.79 4.13-1.15 1.15-2.94 2.4-6.05 2.4-4.83 0-8.6-3.89-8.6-8.72s3.77-8.72 8.6-8.72c2.6 0 4.5 1.03 5.9 2.34l2.31-2.31C18.75 1.37 16.13 0 12.48 0 5.87 0 .31 5.39.31 12s5.56 12 12.17 12c3.57 0 6.27-1.17 8.38-3.36 2.16-2.16 2.84-5.21 2.84-7.66 0-.76-.05-1.47-.17-2.06H12.48z" />
    </svg>
  );
}

/** An input with a small icon inside its left edge (the input needs `pl-9`). */
function Field({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 z-10 text-muted [&>svg]:size-4" >
        {icon}
      </span>
      {children}
    </div>
  );
}
