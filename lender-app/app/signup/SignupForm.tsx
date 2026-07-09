"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  MAX_PLAINTEXT_PASSWORD_LENGTH,
  MIN_PLAINTEXT_PASSWORD_LENGTH,
  plaintextPasswordRequirementSummary,
  validatePlaintextPasswordPolicy,
} from "@/lib/auth/passwordPolicy";

export function SignupForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCode(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          organizationName,
          email: email.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
      };
      if (!res.ok || !data.ok) {
        setCode(data.code ?? null);
        setError(data.error ?? "Sign-up failed.");
        setSubmitting(false);
        return;
      }
      window.location.href = "/login?next=/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Create account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Username is case-insensitive. You’ll get a new workspace.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Workspace name</span>
            <input
              required
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-2 focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Username</span>
            <input
              type="text"
              autoComplete="username"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-2 focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Email (optional)</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-2 focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">
              Password ({plaintextPasswordRequirementSummary()})
            </span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PLAINTEXT_PASSWORD_LENGTH}
              maxLength={MAX_PLAINTEXT_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-2 focus:ring-2 focus:ring-ring"
            />
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
              !organizationName ||
              validatePlaintextPasswordPolicy(password) !== null
            }
            className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-foreground hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create account"}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="underline-offset-2 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
