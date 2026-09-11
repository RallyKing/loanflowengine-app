"use client";

import { APP_DISPLAY_NAME, APP_HOME_HREF, APP_MONOGRAM } from "@/lib/brandIdentity";

import {
  MAX_PLAINTEXT_PASSWORD_LENGTH,
  MIN_PLAINTEXT_PASSWORD_LENGTH,
  plaintextPasswordRequirementSummary,
  validatePlaintextPasswordPolicy,
} from "@/lib/auth/passwordPolicy";
import Link from "next/link";
import { FormEvent, useState } from "react";

export function LoginForm({
  next,
  defaultUsername = "",
  defaultPassword = "",
}: {
  next: string;
  /** Local `next dev` only — set via `LOGIN_DEV_PREFILL_*` in `.env.local`, never commit secrets. */
  defaultUsername?: string;
  defaultPassword?: string;
}) {
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState(defaultPassword);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCode(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, rememberMe }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
      };
      if (!res.ok || !data.ok) {
        setCode(data.code ?? null);
        if (data.code === "RATE_LIMITED") {
          setError("Too many attempts. Try again in a few minutes.");
        } else if (data.code === "ACCOUNT_LOCKED") {
          setError("This account is temporarily locked.");
        } else {
          setError(data.error ?? "Sign-in failed.");
        }
        setSubmitting(false);
        return;
      }
      window.location.href = next || APP_HOME_HREF;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-foreground shadow-sm ring-1 ring-brand-accent/40">
            {APP_MONOGRAM}
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            {APP_DISPLAY_NAME}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to continue.</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Username</span>
            <input
              type="text"
              name="username"
              autoComplete="username"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-2 focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">
              Password ({plaintextPasswordRequirementSummary()})
            </span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              minLength={MIN_PLAINTEXT_PASSWORD_LENGTH}
              maxLength={MAX_PLAINTEXT_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-2 focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="rounded border-border"
            />
            Remember me on this device
          </label>
          {error ? (
            <div
              role="alert"
              className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
            >
              {error}
              {code ? (
                <span className="mt-1 block text-xs opacity-80">Code: {code}</span>
              ) : null}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={
              submitting ||
              !username ||
              !password ||
              validatePlaintextPasswordPolicy(password) !== null
            }
            className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-foreground hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-center text-xs text-muted-foreground">
            <Link href="/signup" className="underline-offset-2 hover:underline">
              Create account
            </Link>
            <Link href="/forgot-password" className="underline-offset-2 hover:underline">
              Forgot password
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
